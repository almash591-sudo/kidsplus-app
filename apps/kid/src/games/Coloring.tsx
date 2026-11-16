import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { fx } from '../fx';
import { mascotStore, splash } from './juice';
import { ask, paint, praise, say, type GameProps, type PaintId } from './common';
import { Palette } from './Palette';
import { coloringTask, GAME_INTRO, needColor } from '../phrases';
import { PICTURES, type Picture } from './pictures';
import { Icon } from '../ui/icons';

/** Картинка раскраски; onRegion — касание области. Без onRegion — превью для плитки. */
export function PictureSvg({
  picture,
  fills,
  highlight,
  painted,
  onRegion,
}: {
  picture: Picture;
  fills: Record<string, string>;
  highlight?: string | null;
  painted?: string | null;
  onRegion?: (id: string) => void;
}) {
  return (
    <svg
      viewBox="0 0 400 400"
      className="coloring-svg"
      data-testid="picture"
      role={onRegion ? 'group' : 'img'}
      aria-label="Картинка для раскрашивания"
    >
      {picture.regions.map((r) => {
        const paths = r.parts.map((d, i) => <path key={i} d={d} />);
        return (
          <g
            key={r.id}
            data-region={r.id}
            className={`region${highlight === r.id ? ' hint' : ''}${painted === r.id ? ' just-painted' : ''}`}
            fill={fills[r.id] ?? '#fff'}
            stroke="#333"
            strokeWidth={4}
            strokeLinejoin="round"
            role={onRegion ? 'button' : undefined}
            tabIndex={onRegion ? 0 : undefined}
            aria-label={onRegion ? `Раскрасить ${r.name}` : undefined}
            aria-pressed={onRegion ? Boolean(fills[r.id]) : undefined}
            onClick={onRegion ? () => onRegion(r.id) : undefined}
            onKeyDown={
              onRegion
                ? (event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      onRegion(r.id);
                    }
                  }
                : undefined
            }
          >
            {paths}
            {r.mirror && <g transform="translate(400,0) scale(-1,1)">{paths}</g>}
          </g>
        );
      })}
      <g stroke="#333" strokeWidth={4} strokeLinecap="round" pointerEvents="none">
        {picture.details.map((d, i) => (
          <path key={i} d={d.d} fill={d.fill ?? 'none'} />
        ))}
      </g>
    </svg>
  );
}

/**
 * Раскраска. Свободный режим: любая область — любым цветом, «Готово» — когда захочется.
 * Режим заданий: по очереди «Раскрась крышу красным»; не тот цвет — подсказка.
 */
export function Coloring({ spec, phrases, onFinish }: GameProps<'coloring'>) {
  const picture = PICTURES[spec.picture];
  const [color, setColor] = useState<PaintId>(spec.tasks ? 'white' : 'red');
  const [fills, setFills] = useState<Record<string, string>>({});
  const [step, setStep] = useState(0);
  const [history, setHistory] = useState<Record<string, string>[]>([]);
  const [painted, setPainted] = useState<string | null>(null);
  const [hint, setHint] = useState<'color' | 'place' | null>(null);
  const { mood } = useSyncExternalStore(mascotStore.subscribe, mascotStore.get);
  const finished = useRef(false);
  const active = useRef(true);
  const latestStep = useRef(0);
  const finishTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const current = spec.tasks ? picture.regions[step] : undefined;
  const task = (i: number) => coloringTask(spec.picture, i);

  useEffect(() => {
    if (spec.tasks) void ask(coloringTask(spec.picture, 0));
  }, [spec.picture, spec.tasks]);

  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      clearTimeout(finishTimer.current);
    };
  }, []);

  const finish = () => {
    if (finished.current) return;
    finished.current = true;
    onFinish();
  };

  const onRegion = (id: string) => {
    if (finished.current) return;
    if (!current) {
      if (spec.tasks) return;
      fx.drop();
      splash(paint(color).hex);
      if (fills[id] !== paint(color).hex) setHistory((h) => [...h, fills]);
      setFills((f) => ({ ...f, [id]: paint(color).hex }));
      setPainted(id);
      return;
    }
    if (id !== current.id) {
      setHint('place');
      return void ask(task(step));
    }
    if (color !== current.target) {
      setHint('color');
      fx.soft();
      return void say(needColor(current.target), task(step));
    }
    setHint(null);
    fx.drop();
    splash(paint(color).hex);
    setFills((f) => ({ ...f, [id]: paint(color).hex }));
    setPainted(id);
    const next = step + 1;
    latestStep.current = next;
    setStep(next);
    if (next >= picture.regions.length) {
      finished.current = true;
      void praise(phrases);
      finishTimer.current = setTimeout(onFinish, 1200);
    } else
      void praise(phrases).then(() => {
        if (active.current && latestStep.current === next) return ask(task(next));
      });
  };

  const repeat = () => {
    fx.soft();
    if (current) void ask(task(step));
    else void say(GAME_INTRO.coloring);
  };
  const targetColor = current ? paint(current.target) : null;
  const complete = spec.tasks && step >= picture.regions.length;

  return (
    <div
      className="game coloring fairy-coloring"
      data-testid="game-coloring"
      data-mode={spec.tasks ? 'guided' : 'free'}
    >
      <header className="coloring-heading">
        <img src="/games/icon-coloring.webp" alt="" draggable={false} />
        <h1>Раскраска</h1>
      </header>
      <button
        type="button"
        className={`coloring-guide${mood === 'happy' || mood === 'wow' || complete ? ' is-happy' : ''}${hint ? ' is-helping' : ''}`}
        data-testid="ear"
        aria-label="Совёнок: повторить задание"
        onClick={repeat}
      >
        <span className="coloring-owl" aria-hidden="true">
          <img
            src={`/playroom/${mood === 'happy' || mood === 'wow' || complete ? 'owl-wave' : 'owl'}.webp`}
            alt=""
            draggable={false}
          />
          <img
            className="coloring-owl-blink"
            src="/playroom/owl-blink.webp"
            alt=""
            draggable={false}
          />
        </span>
        <span className="coloring-guide-content">
          <span className="coloring-prompt" aria-live="polite" data-testid="coloring-prompt">
            {complete
              ? 'Получилось!'
              : current
                ? hint === 'color'
                  ? `Нужен ${targetColor!.name}`
                  : hint === 'place'
                    ? `Найди ${current.name}`
                    : `Раскрась ${current.name}`
                : 'Выбери краску и раскрась'}
          </span>
          {spec.tasks ? (
            <span
              className="coloring-progress"
              role="progressbar"
              aria-label="Раскрашено частей"
              aria-valuemin={0}
              aria-valuemax={picture.regions.length}
              aria-valuenow={step}
            >
              {picture.regions.map((region, i) => (
                <img
                  key={region.id}
                  src="/games/robot-star.webp"
                  alt=""
                  className={i < step ? 'is-done' : ''}
                />
              ))}
            </span>
          ) : (
            <span className="coloring-guide-caption">Совёнок подскажет</span>
          )}
        </span>
        {targetColor ? (
          <span
            className="coloring-target"
            style={{ background: targetColor.hex }}
            aria-label={`Образец: ${targetColor.name}`}
          >
            <Icon name="ear" size={24} />
          </span>
        ) : (
          <Icon name="ear" size={26} />
        )}
      </button>
      <div className="coloring-board">
        <div className="coloring-paper">
          <PictureSvg
            picture={picture}
            fills={fills}
            highlight={current?.id}
            painted={painted}
            onRegion={onRegion}
          />
        </div>
      </div>
      <div className="coloring-tools">
        <Palette
          value={color}
          marked
          hintColor={hint === 'color' ? current?.target : undefined}
          onChange={(next) => {
            setColor(next);
            setHint(null);
          }}
        />
        {!spec.tasks && (
          <div className="coloring-actions">
            <button
              type="button"
              className="coloring-undo"
              aria-label="Отменить последнее закрашивание"
              data-testid="coloring-undo"
              disabled={!history.length}
              onClick={() => {
                const previous = history.at(-1);
                if (!previous) return;
                fx.soft();
                setFills(previous);
                setHistory((h) => h.slice(0, -1));
                setPainted(null);
              }}
            >
              <Icon name="retry" size={26} />
            </button>
            <span className="coloring-selected" aria-live="polite">
              <img src="/games/paints-brush.webp" alt="" draggable={false} />
              {paint(color).name}
            </span>
            <button
              type="button"
              className="tool done"
              aria-label="Готово"
              data-testid="game-done"
              disabled={!Object.keys(fills).length}
              onClick={finish}
            >
              <Icon name="check" size={28} />
              <span>Готово</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
