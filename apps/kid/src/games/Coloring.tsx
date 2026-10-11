import { useEffect, useState } from 'react';
import { fx } from '../fx';
import { splash } from './juice';
import { paint, praise, say, type GameProps, type PaintId } from './common';
import { Palette } from './Palette';
import { coloringTask, needColor } from '../phrases';
import { PICTURES, type Picture } from './pictures';

/** Картинка раскраски; onRegion — касание области. Без onRegion — превью для плитки. */
export function PictureSvg({
  picture,
  fills,
  highlight,
  onRegion,
}: {
  picture: Picture;
  fills: Record<string, string>;
  highlight?: string | null;
  onRegion?: (id: string) => void;
}) {
  return (
    <svg viewBox="0 0 400 400" className="coloring-svg" data-testid="picture">
      {picture.regions.map((r) => {
        const paths = r.parts.map((d, i) => <path key={i} d={d} />);
        return (
          <g
            key={r.id}
            data-region={r.id}
            className={highlight === r.id ? 'region hint' : 'region'}
            fill={fills[r.id] ?? '#fff'}
            stroke="#333"
            strokeWidth={4}
            strokeLinejoin="round"
            onPointerDown={onRegion ? () => onRegion(r.id) : undefined}
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
  const current = spec.tasks ? picture.regions[step] : undefined;
  const task = (i: number) => coloringTask(spec.picture, i);

  useEffect(() => {
    if (spec.tasks) void say(coloringTask(spec.picture, 0));
  }, [spec.picture, spec.tasks]);

  const onRegion = (id: string) => {
    if (!current) {
      fx.drop();
      splash(paint(color).hex);
      setFills((f) => ({ ...f, [id]: paint(color).hex }));
      return;
    }
    if (id !== current.id) return void say(task(step));
    if (color !== current.target) {
      fx.soft();
      return void say(needColor(current.target), task(step));
    }
    fx.drop();
    splash(paint(color).hex);
    setFills((f) => ({ ...f, [id]: paint(color).hex }));
    const next = step + 1;
    setStep(next);
    if (next >= picture.regions.length) {
      void praise(phrases);
      setTimeout(onFinish, 1200);
    } else void praise(phrases).then(() => say(task(next)));
  };

  return (
    <div className="game coloring" data-testid="game-coloring">
      <div className="coloring-board">
        <PictureSvg picture={picture} fills={fills} highlight={current?.id} onRegion={onRegion} />
      </div>
      <div className="coloring-tools">
        <Palette value={color} onChange={setColor} />
        {!spec.tasks && (
          <button
            type="button"
            className="tool done"
            aria-label="Готово"
            data-testid="game-done"
            onClick={onFinish}
          >
            ✔
          </button>
        )}
      </div>
      {current && (
        <button
          type="button"
          className="corner-button ear"
          aria-label="Повторить задание"
          onClick={() => void say(task(step))}
        >
          👂
        </button>
      )}
    </div>
  );
}
