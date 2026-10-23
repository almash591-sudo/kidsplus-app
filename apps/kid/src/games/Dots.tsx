import type { DotPicture } from '@kidsplus/shared/games';
import { useEffect, useRef, useState } from 'react';
import { fx } from '../fx';
import { DOT_NAMES, DOTS_PROMPT, itIs } from '../phrases';
import { afterSpeech, ask, NUMBERS, praise, retry, say, svgPoint, type GameProps } from './common';
import { DOTS } from './shapes42';

/** Палец ближе этого (в единицах поля 100 × 100) — попал в точку. */
const HIT = 7;

/**
 * Соедини точки (этап 42): нажимать (или вести пальцем) по точкам 1, 2, 3… — линия тянется
 * за пальцем; после последней точки контур замыкается и заливается — «Это рыбка!».
 */
export function Dots({ spec, phrases, onFinish }: GameProps<'dots'>) {
  const [round, setRound] = useState(0);
  useEffect(() => {
    void ask(DOTS_PROMPT);
  }, []);
  const picture = spec.pictures[round]!;
  return (
    <DotsRound
      key={round}
      picture={picture}
      hint={spec.hint}
      onWrong={() => void retry(phrases)}
      onSolved={() => {
        void afterSpeech(praise(phrases, undefined, [itIs(DOT_NAMES[picture])]), 1800).then(() => {
          if (round + 1 < spec.pictures.length) setRound(round + 1);
          else onFinish();
        });
      }}
    />
  );
}

function DotsRound(props: {
  picture: DotPicture;
  hint: boolean;
  onWrong: () => void;
  onSolved: () => void;
}) {
  const { points, color } = DOTS[props.picture];
  /** Сколько точек уже соединено. */
  const [done, setDone] = useState(0);
  const doneRef = useRef(0);
  const svg = useRef<SVGSVGElement>(null);
  const closed = done === points.length;

  const nearest = (e: { clientX: number; clientY: number }) => {
    const p = svgPoint(svg.current!, e);
    let best = -1;
    let dist = HIT;
    points.forEach(([x, y], i) => {
      const d = Math.hypot(x - p.x, y - p.y);
      if (d < dist) {
        dist = d;
        best = i;
      }
    });
    return best;
  };

  /** tap — касание (неверная точка — ошибка); при ведении пальцем чужие точки не считаются. */
  const touch = (e: React.PointerEvent, tap: boolean) => {
    if (doneRef.current === points.length) return;
    const i = nearest(e);
    if (i < 0 || i < doneRef.current) return;
    if (i > doneRef.current) {
      if (tap) props.onWrong();
      return;
    }
    const next = i + 1;
    doneRef.current = next;
    setDone(next);
    fx.snap();
    if (next === points.length) props.onSolved();
    else void say(NUMBERS[next]!);
  };

  const line = points
    .slice(0, done)
    .map(([x, y]) => `${x},${y}`)
    .join(' ');
  return (
    <div className="game dots" data-testid="game-dots">
      <svg
        ref={svg}
        className="dots-svg"
        viewBox="-4 -4 108 108"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture?.(e.pointerId);
          touch(e, true);
        }}
        onPointerMove={(e) => e.buttons && touch(e, false)}
      >
        {closed ? (
          <polygon className="dots-fill" points={line} fill={color} />
        ) : (
          <polyline className="dots-line" points={line} />
        )}
        {points.map(([x, y], i) => (
          <g
            key={i}
            className={['dot', i < done && 'on', props.hint && i === done && !closed && 'next']
              .filter(Boolean)
              .join(' ')}
            data-testid="dot"
            data-n={i + 1}
          >
            <circle cx={x} cy={y} r={HIT} className="dot-hit" />
            <circle cx={x} cy={y} r={2.6} />
            {!closed && (
              <text x={x + (x > 50 ? 4 : -4)} y={y - 3.5} textAnchor={x > 50 ? 'start' : 'end'}>
                {i + 1}
              </text>
            )}
          </g>
        ))}
      </svg>
    </div>
  );
}
