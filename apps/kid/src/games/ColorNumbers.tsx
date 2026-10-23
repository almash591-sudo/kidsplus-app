import type { ColoringPicture } from '@kidsplus/shared/games';
import { useEffect, useMemo, useState } from 'react';
import { fx } from '../fx';
import { COLOR_NUMBERS_DONE, COLOR_NUMBERS_PROMPT, colorNumberWrong } from '../phrases';
import {
  afterSpeech,
  ask,
  paint,
  praise,
  retry,
  say,
  type GameProps,
  type PaintId,
} from './common';
import { splash } from './juice';
import { PICTURES } from './pictures';
import { NUMBER_SPOTS } from './shapes42';

/** Цифры картинки: каждому цвету областей — свой номер по порядку появления. */
export function colorNumbers(picture: ColoringPicture): {
  colors: PaintId[];
  of: Record<string, number>;
} {
  const colors: PaintId[] = [];
  const of: Record<string, number> = {};
  for (const r of PICTURES[picture].regions) {
    if (!colors.includes(r.target)) colors.push(r.target);
    of[r.id] = colors.indexOf(r.target) + 1;
  }
  return { colors, of };
}

/**
 * Раскраска по цифрам (этап 42): у каждой области цифра, у каждой краски — тоже. Взял краску —
 * нажимай на области с её цифрой; не та цифра — совёнок подсказывает, какая краска нужна.
 */
export function ColorNumbers({ spec, phrases, onFinish }: GameProps<'colorNumbers'>) {
  const [round, setRound] = useState(0);
  useEffect(() => {
    void ask(COLOR_NUMBERS_PROMPT);
  }, []);
  return (
    <NumbersRound
      key={round}
      picture={spec.pictures[round]!}
      hint={spec.hint}
      onWrong={(n) => {
        void retry(phrases).then(() => say(colorNumberWrong(n)));
      }}
      onSolved={() => {
        void afterSpeech(praise(phrases, undefined, [COLOR_NUMBERS_DONE]), 1800).then(() => {
          if (round + 1 < spec.pictures.length) setRound(round + 1);
          else onFinish();
        });
      }}
    />
  );
}

function NumbersRound(props: {
  picture: ColoringPicture;
  hint: boolean;
  onWrong: (n: number) => void;
  onSolved: () => void;
}) {
  const picture = PICTURES[props.picture];
  const { colors, of } = useMemo(() => colorNumbers(props.picture), [props.picture]);
  const [color, setColor] = useState<number | null>(null);
  const [filled, setFilled] = useState<Set<string>>(new Set());

  const onRegion = (id: string) => {
    if (filled.has(id)) return;
    if (color === null) return void ask(COLOR_NUMBERS_PROMPT);
    if (of[id] !== color) return props.onWrong(of[id]!);
    const hex = paint(colors[color - 1]!).hex;
    fx.drop();
    splash(hex);
    const next = new Set(filled).add(id);
    setFilled(next);
    if (next.size === picture.regions.length) props.onSolved();
  };

  return (
    <div className="game color-numbers" data-testid="game-colorNumbers">
      <svg viewBox="0 0 400 400" className="coloring-svg" data-testid="picture">
        {picture.regions.map((r) => {
          const hex = paint(r.target).hex;
          const on = filled.has(r.id);
          const paths = r.parts.map((d, i) => <path key={i} d={d} />);
          return (
            <g
              key={r.id}
              data-region={r.id}
              data-n={of[r.id]}
              className="region"
              fill={on || props.hint ? hex : '#fff'}
              fillOpacity={on ? 1 : props.hint ? 0.22 : 1}
              stroke="#333"
              strokeWidth={4}
              strokeLinejoin="round"
              onPointerDown={() => onRegion(r.id)}
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
        <g className="number-spots" pointerEvents="none">
          {picture.regions
            .filter((r) => !filled.has(r.id))
            .flatMap((r) =>
              (NUMBER_SPOTS[props.picture][r.id] ?? []).map(([x, y], i) => (
                <g key={`${r.id}-${i}`} data-testid="number-spot">
                  <circle cx={x} cy={y} r={17} />
                  <text x={x} y={y + 8}>
                    {of[r.id]}
                  </text>
                </g>
              )),
            )}
        </g>
      </svg>
      <div className="palette" data-testid="palette">
        {colors.map((id, i) => {
          const p = paint(id);
          return (
            <button
              key={id}
              type="button"
              className={color === i + 1 ? 'paint numbered on' : 'paint numbered'}
              style={{ background: p.hex }}
              aria-label={p.name}
              data-paint={id}
              data-n={i + 1}
              onClick={() => {
                setColor(i + 1);
                void say(p.name);
              }}
            >
              <span>{i + 1}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
