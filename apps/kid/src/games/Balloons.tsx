import type { BalloonColor } from '@kidsplus/shared/games';
import { useEffect, useState } from 'react';
import { fx } from '../fx';
import { balloonsPrompt, balloonsWrong } from '../phrases';
import { NUMBERS, praise, say, type GameProps } from './common';

const COLORS: Record<BalloonColor, { hex: string }> = {
  red: { hex: '#E8453C' },
  yellow: { hex: '#FACC15' },
  blue: { hex: '#3B82F6' },
  green: { hex: '#22A55B' },
};
const ALL = Object.keys(COLORS) as BalloonColor[];
/** Шариков на экране одновременно. */
const ON_SCREEN = 5;
/** Счётчик id шариков (общий — id нужны только для ключей React). */
let seq = 0;

interface Balloon {
  id: number;
  color: BalloonColor;
  /** Положение по горизонтали, доли ширины. */
  x: number;
  /** Время подъёма, с. */
  duration: number;
  popped: boolean;
}

/** Лопни шарики: шарики плывут вверх, касание лопает; считаем вслух. target — только этот цвет. */
export function Balloons({ spec, phrases, onFinish }: GameProps<'balloons'>) {
  const make = (): Balloon => {
    const color =
      spec.target && Math.random() < 0.45
        ? spec.target
        : ALL[Math.floor(Math.random() * ALL.length)]!;
    return {
      id: seq++,
      color,
      x: 0.08 + Math.random() * 0.74,
      duration: 6 + Math.random() * 4,
      popped: false,
    };
  };
  const [balloons, setBalloons] = useState<Balloon[]>(() =>
    Array.from({ length: ON_SCREEN }, make),
  );
  const [score, setScore] = useState(0);
  const finished = score >= spec.count;
  const prompt = () => say(balloonsPrompt(spec.target));

  useEffect(() => {
    void prompt();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- задание звучит один раз при показе
  }, []);

  const replace = (id: number) =>
    setBalloons((list) => list.map((b) => (b.id === id ? make() : b)));

  const pop = (b: Balloon) => {
    if (b.popped || finished) return;
    if (spec.target && b.color !== spec.target) {
      fx.soft();
      void say(balloonsWrong(b.color, spec.target));
      return;
    }
    fx.pop();
    setBalloons((list) => list.map((x) => (x.id === b.id ? { ...x, popped: true } : x)));
    setTimeout(() => replace(b.id), 350);
    const n = score + 1;
    setScore(n);
    if (n >= spec.count) {
      void say(`${NUMBERS[n] ?? n}!`).then(() => praise(phrases));
      setTimeout(onFinish, 2200);
    } else void say(`${NUMBERS[n] ?? n}!`);
  };

  return (
    <div className="game balloons" data-testid="game-balloons">
      {balloons.map((b) => (
        <button
          key={b.id}
          type="button"
          className={b.popped ? 'balloon popped' : 'balloon'}
          data-testid="balloon"
          data-color={b.color}
          aria-label="Шарик"
          style={{ left: `${b.x * 100}%`, animationDuration: `${b.duration}s` }}
          data-silent
          onPointerDown={() => pop(b)}
          onAnimationEnd={(e) => e.animationName === 'float-up' && replace(b.id)}
        >
          <svg viewBox="0 0 60 100" aria-hidden="true">
            <path d="M30,70 q-4,12 2,30" stroke="#777" strokeWidth="2" fill="none" />
            <ellipse cx="30" cy="34" rx="26" ry="32" fill={COLORS[b.color].hex} />
            <path d="M26,66 h8 l-4,6 Z" fill={COLORS[b.color].hex} />
            <ellipse cx="20" cy="22" rx="6" ry="10" fill="#fff" opacity="0.45" />
          </svg>
        </button>
      ))}
      <div className="balloon-score" aria-hidden="true">
        {Array.from({ length: spec.count }, (_, i) => (
          <span key={i} className={i < score ? 'on' : ''} />
        ))}
      </div>
      <button
        type="button"
        className="corner-button ear"
        aria-label="Повторить задание"
        onClick={() => void prompt()}
      >
        👂
      </button>
    </div>
  );
}
