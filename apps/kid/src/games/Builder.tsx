// «Строитель» (этап 36): совёнок-строитель показывает образец — башню из деталей. Ребёнок ставит
// детали снизу вверх, нажимая их внизу; не та — «попробуй ещё». На уровнях выше башня выше, деталей
// больше, а образец прячется, как только начали строить, — по памяти (подсмотреть можно касанием).
import { BUILDER_BLOCKS, type BuilderBlock } from '@kidsplus/shared/games';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { BLOCK_NAMES, BUILDER_PROMPT, BUILDER_REMEMBER } from '../phrases';
import { ask, nice, praise, retry, say, setTask, type GameProps, type SpecOf } from './common';
import { burstAt } from './juice';

type BuilderSpec = Pick<SpecOf<'builder'>, 'height' | 'blocks'>;

/** Ширина детали в «шагах» башни и пропорции картинки (ширина / высота). */
const SHAPE: Record<BuilderBlock, { w: number; aspect: number }> = {
  cube: { w: 1, aspect: 364 / 310 },
  bar: { w: 1.6, aspect: 400 / 204 },
  roof: { w: 1.15, aspect: 400 / 309 },
  arch: { w: 1.4, aspect: 400 / 254 },
  drum: { w: 0.85, aspect: 291 / 326 },
};
/** Самая высокая деталь — в шагах (для расчёта, влезет ли башня). */
const TALLEST = Math.max(...BUILDER_BLOCKS.map((b) => SHAPE[b].w / SHAPE[b].aspect));

/** Образец: детали снизу вверх; одинаковые не подряд, крыша — только наверху. */
export function builderTower(spec: BuilderSpec, rnd = Math.random): BuilderBlock[] {
  const kinds = BUILDER_BLOCKS.slice(0, spec.blocks);
  const tower: BuilderBlock[] = [];
  for (let i = 0; i < spec.height; i++) {
    const top = i === spec.height - 1;
    const can = kinds.filter((k) => k !== tower.at(-1) && (top || k !== 'roof'));
    tower.push(can[Math.floor(rnd() * can.length)]!);
  }
  return tower;
}

/** Размер блока на экране, чтобы следить, сколько места под башню. */
function useBox(ref: React.RefObject<HTMLElement | null>) {
  const [box, setBox] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return box;
}

/** Шаг башни (px), чтобы height деталей влезли в коробку. */
const unitFor = (box: { w: number; h: number }, height: number) =>
  Math.max(16, Math.min(box.h / (height * TALLEST + 0.2), box.w / 1.8, 120));

function Tower({
  blocks,
  unit,
  testId,
}: {
  blocks: BuilderBlock[];
  unit: number;
  testId?: string;
}) {
  return (
    <div className="builder-tower" data-testid={testId}>
      {blocks.map((b, i) => (
        <img
          key={i}
          src={`/games/builder-${b}.webp`}
          alt=""
          draggable={false}
          data-kind={b}
          style={{ width: unit * SHAPE[b].w, height: (unit * SHAPE[b].w) / SHAPE[b].aspect }}
        />
      ))}
    </div>
  );
}

export function Builder({ spec, phrases, onFinish }: GameProps<'builder'>) {
  const [round, setRound] = useState(0);
  const [tower, setTower] = useState(() => builderTower(spec));
  const [built, setBuilt] = useState<BuilderBlock[]>([]);
  /** Образец спрятан (по памяти); peek — подсмотреть на миг. */
  const [hidden, setHidden] = useState(false);
  const [peek, setPeek] = useState(false);
  const modelBox = useRef<HTMLButtonElement>(null);
  const siteBox = useRef<HTMLDivElement>(null);
  const model = useBox(modelBox);
  const site = useBox(siteBox);
  const complete = built.length === tower.length;

  useEffect(() => {
    void ask(BUILDER_PROMPT, ...(spec.hide ? [BUILDER_REMEMBER] : []));
    if (!spec.hide) return;
    // Образец прячется сам через несколько секунд (или как только начали строить).
    const t = setTimeout(() => setHidden(true), 3000 + tower.length * 800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round]);

  useEffect(() => {
    if (!peek) return;
    const t = setTimeout(() => setPeek(false), 1500);
    return () => clearTimeout(t);
  }, [peek]);

  const place = (kind: BuilderBlock, el: HTMLElement) => {
    if (complete) return;
    if (spec.hide) setHidden(true);
    if (kind !== tower[built.length]) return void retry(phrases);
    const next = [...built, kind];
    setBuilt(next);
    nice(el);
    if (next.length < tower.length) {
      void say(BLOCK_NAMES[kind]);
      setTask(() => say(BUILDER_PROMPT));
      return;
    }
    // Готово: образец снова виден — сравнить; похвала и следующая башня.
    setHidden(false);
    setTimeout(() => {
      burstAt(siteBox.current, 24);
      void praise(phrases);
    }, 400);
    setTimeout(() => {
      if (round + 1 >= spec.rounds) return onFinish();
      setTower(builderTower(spec));
      setBuilt([]);
      setRound(round + 1);
    }, 2800);
  };

  const covered = hidden && !peek && !complete;
  return (
    <div
      className="game builder"
      data-testid="game-builder"
      data-model={tower.join(',')}
      data-built={built.length}
      data-round={round}
    >
      <div className="builder-head">
        <button
          type="button"
          className={covered ? 'builder-model covered' : 'builder-model'}
          ref={modelBox}
          onClick={() => covered && setPeek(true)}
          data-testid="builder-model"
          data-hidden={covered || undefined}
          aria-label="Образец"
        >
          <Tower blocks={tower} unit={unitFor(model, tower.length) * 0.9} />
          {covered && <span className="builder-cover">?</span>}
        </button>
        <img className="builder-owl" src="/games/builder-owl.webp" alt="" draggable={false} />
      </div>
      <div className="builder-site" ref={siteBox}>
        <Tower blocks={built} unit={unitFor(site, tower.length)} testId="builder-built" />
      </div>
      <div className="builder-tray">
        {BUILDER_BLOCKS.slice(0, spec.blocks).map((b) => (
          <button
            key={b}
            type="button"
            className="builder-part"
            onClick={(e) => place(b, e.currentTarget)}
            data-testid="builder-part"
            data-kind={b}
            data-hint={b === tower[built.length] && !covered ? '' : undefined}
            aria-label={BLOCK_NAMES[b]}
          >
            <img src={`/games/builder-${b}.webp`} alt="" draggable={false} />
          </button>
        ))}
      </div>
    </div>
  );
}
