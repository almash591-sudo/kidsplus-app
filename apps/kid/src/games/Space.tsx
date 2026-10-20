// «Космос по порядку» (этап 36): совёнок в ракете облетает планеты по порядку — цифры или буквы.
// Нажал следующую — ракета летит к ней и оставляет след; не ту — «попробуй ещё». На уровнях выше —
// больше планет, счёт через одну и с конца.
import { SPACE_LETTERS } from '@kidsplus/shared/games';
import { useEffect, useRef, useState } from 'react';
import { isLetter, SPACE_BACK, SPACE_BY_TWO, SPACE_PROMPT, spaceStart } from '../phrases';
import {
  ask,
  NUMBERS,
  nice,
  praise,
  retry,
  say,
  setTask,
  type GameProps,
  type SpecOf,
} from './common';
import { burstAt } from './juice';

type SpaceSpec = Pick<SpecOf<'space'>, 'order' | 'count' | 'step' | 'reverse'>;

/** Что написано на планетах — в том порядке, в каком их облетать. */
export function spaceValues(spec: SpaceSpec): string[] {
  const values =
    spec.order === 'letters'
      ? SPACE_LETTERS.slice(0, spec.count)
      : Array.from({ length: spec.count }, (_, i) => String((i + 1) * spec.step));
  return spec.reverse ? [...values].reverse() : [...values];
}

/** Где ракета на старте (левый нижний угол поля, %). */
export const LAUNCH = { x: 8, y: 92 };

/**
 * Места планет (центры, % поля): по одной в клетке сетки cols × rows, клетка у старта ракеты
 * свободна; внутри клетки — немного вразброс, чтобы не было ровных рядов.
 */
export function spaceLayout(count: number, cols: number, rows: number, rnd = Math.random) {
  const cells: [number, number][] = [];
  for (let c = 0; c < cols; c++)
    for (let r = 0; r < rows; r++) if (!(c === 0 && r === rows - 1)) cells.push([c, r]);
  for (let i = cells.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [cells[i], cells[j]] = [cells[j]!, cells[i]!];
  }
  return cells.slice(0, count).map(([c, r]) => ({
    x: ((c + 0.5 + (rnd() - 0.5) * 0.3) / cols) * 100,
    y: ((r + 0.5 + (rnd() - 0.5) * 0.3) / rows) * 100,
  }));
}

/**
 * Ракета носом к цели: картинка смотрит вверх-вправо (−45°), влево — отражённая (вверх-влево).
 * Наклон не больше, чем чтобы совёнок не висел вниз головой.
 */
export function rocketPose(dx: number, dy: number) {
  const left = dx < 0;
  const dir = (Math.atan2(dy, left ? -dx : dx) * 180) / Math.PI; // −90…90, как будто вправо
  const angle = Math.max(-45, Math.min(60, dir + 45));
  return { angle: left ? -angle : angle, left };
}

/** Как назвать значение вслух: «семь» или «Буква К!». */
const spoken = (v: string, letters: boolean) => (letters ? isLetter(v) : NUMBERS[Number(v)]!);

const newRound = (spec: SpaceSpec) => {
  const landscape = window.innerWidth > window.innerHeight;
  const values = spaceValues(spec);
  const spots = spaceLayout(values.length, landscape ? 4 : 3, landscape ? 3 : 4);
  return values.map((value, i) => ({ value, ...spots[i]!, hue: (i * 47) % 360 }));
};

export function Space({ spec, phrases, onFinish }: GameProps<'space'>) {
  const letters = spec.order === 'letters';
  const [round, setRound] = useState(0);
  const [planets, setPlanets] = useState(() => newRound(spec));
  /** Сколько планет уже облетели. */
  const [done, setDone] = useState(0);
  const field = useRef<HTMLDivElement>(null);
  /** Поворот ракеты: наклон и смотрит ли влево. */
  const [pose, setPose] = useState({ angle: 0, left: false });

  useEffect(() => {
    // Задание — в начале каждого раунда.
    const first = planets[0]!.value;
    void ask(
      SPACE_PROMPT,
      ...(spec.reverse ? [SPACE_BACK] : !letters && spec.step === 2 ? [SPACE_BY_TWO] : []),
      spaceStart(letters ? first : NUMBERS[Number(first)]!, letters),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round]);

  const at = done ? planets[done - 1]! : LAUNCH;

  const tap = (i: number, el: HTMLElement) => {
    if (done >= planets.length || i < done) return;
    if (i !== done) return void retry(phrases);
    const p = planets[i]!;
    const box = field.current?.getBoundingClientRect();
    if (box)
      setPose(rocketPose(((p.x - at.x) / 100) * box.width, ((p.y - at.y) / 100) * box.height));
    nice(el);
    setDone(i + 1);
    const next = planets[i + 1];
    if (next) {
      void say(spoken(p.value, letters));
      setTask(() => say(spoken(next.value, letters)));
      return;
    }
    setTimeout(() => {
      burstAt(el, 24);
      void praise(phrases);
    }, 600);
    setTimeout(() => {
      if (round + 1 >= spec.rounds) return onFinish();
      setPlanets(newRound(spec));
      setDone(0);
      setPose({ angle: 0, left: false });
      setRound(round + 1);
    }, 2600);
  };

  const trail = [LAUNCH, ...planets.slice(0, done)];

  return (
    <div
      className="game space"
      data-testid="game-space"
      data-order={planets.map((p) => p.value).join(',')}
      data-done={done}
    >
      <div className="space-field" ref={field}>
        <svg className="space-trail" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
          <polyline points={trail.map((p) => `${p.x},${p.y}`).join(' ')} />
        </svg>
        {planets.map((p, i) => (
          <button
            key={`${round}-${p.value}`}
            type="button"
            className={i < done ? 'space-planet visited' : 'space-planet'}
            style={
              { left: `${p.x}%`, top: `${p.y}%`, '--hue': `${p.hue}deg` } as React.CSSProperties
            }
            onClick={(e) => tap(i, e.currentTarget)}
            data-testid="space-planet"
            data-value={p.value}
            aria-label={p.value}
          >
            <img src="/games/space-planet.webp" alt="" draggable={false} />
            <span>{p.value}</span>
          </button>
        ))}
        <img
          className="space-rocket"
          src="/games/space-rocket.webp"
          alt=""
          draggable={false}
          style={{
            left: `${at.x}%`,
            top: `${at.y}%`,
            transform: `translate(-50%, -50%) rotate(${pose.angle}deg) scaleX(${pose.left ? -1 : 1})`,
          }}
        />
      </div>
    </div>
  );
}
