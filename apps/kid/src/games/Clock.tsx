// «Который час?» (этап 34): звучит время — «три часа» или «половина пятого», — ребёнок находит
// часы со стрелками среди нескольких. Часовая стрелка на половине стоит между цифрами, как в жизни.
import { useEffect, useRef, useState } from 'react';
import { clockFind } from '../phrases';
import { ask, praise, retry, shuffled, type GameProps } from './common';
import { burstAt } from './juice';

type Time = { h: number; half: boolean };
const same = (a: Time, b: Time) => a.h === b.h && a.half === b.half;

/** Циферблат со стрелками. */
export function ClockFace({ h, half }: Time) {
  const hourAngle = ((h % 12) + (half ? 0.5 : 0)) * 30;
  const minuteAngle = half ? 180 : 0;
  return (
    <svg viewBox="0 0 100 100" className="clock-face" aria-hidden="true">
      <circle cx="50" cy="50" r="46" fill="#fff" stroke="#3a3a3c" strokeWidth="4" />
      {Array.from({ length: 12 }, (_, i) => {
        const n = i + 1;
        const a = (n * 30 * Math.PI) / 180;
        return (
          <text
            key={n}
            x={50 + 35 * Math.sin(a)}
            y={50 - 35 * Math.cos(a) + 4}
            textAnchor="middle"
            fontSize="11"
            fontWeight="800"
            fill={n % 3 === 0 ? '#1c1c1e' : '#8e8e93'}
          >
            {n}
          </text>
        );
      })}
      <line
        x1="50"
        y1="50"
        x2="50"
        y2="16"
        stroke="#007aff"
        strokeWidth="3.5"
        strokeLinecap="round"
        transform={`rotate(${minuteAngle} 50 50)`}
      />
      <line
        x1="50"
        y1="50"
        x2="50"
        y2="28"
        stroke="#ff3b30"
        strokeWidth="6"
        strokeLinecap="round"
        transform={`rotate(${hourAngle} 50 50)`}
      />
      <circle cx="50" cy="50" r="4" fill="#1c1c1e" />
    </svg>
  );
}

/** Время раунда и варианты (разные). */
export function clockRound(spec: { half: boolean; choices: number }, rnd = Math.random) {
  const pick = (): Time => ({
    h: 1 + Math.floor(rnd() * 12),
    half: spec.half && rnd() < 0.5,
  });
  const target = pick();
  const options: Time[] = [target];
  while (options.length < spec.choices) {
    const t = pick();
    if (!options.some((o) => same(o, t))) options.push(t);
  }
  return { target, options: shuffled(options) };
}

export function Clock({ spec, phrases, onFinish }: GameProps<'clock'>) {
  const [round, setRound] = useState(0);
  const [r, setR] = useState(() => clockRound(spec));
  const [wrong, setWrong] = useState<number | null>(null);
  const [solved, setSolved] = useState(false);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    void ask(clockFind(r.target.h, r.target.half));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- задание звучит в начале раунда
  }, [round]);

  const choose = (i: number) => {
    if (solved) return;
    if (!same(r.options[i]!, r.target)) {
      setWrong(i);
      setTimeout(() => setWrong(null), 500);
      void retry(phrases);
      return;
    }
    setSolved(true);
    burstAt(buttons.current[i] ?? null, 16);
    void praise(phrases);
    setTimeout(() => {
      if (round + 1 >= spec.rounds) return onFinish();
      setRound(round + 1);
      setR(clockRound(spec));
      setSolved(false);
    }, 2200);
  };

  const answer = r.options.findIndex((o) => same(o, r.target));
  return (
    <div className="game clock-game" data-testid="game-clock" data-answer={answer}>
      {r.options.map((t, i) => (
        <button
          key={`${round}-${i}`}
          type="button"
          ref={(el) => {
            buttons.current[i] = el;
          }}
          className={[
            'clock-option appear',
            wrong === i && 'off',
            solved && i === answer && 'picked',
          ]
            .filter(Boolean)
            .join(' ')}
          style={{ '--i': i } as React.CSSProperties}
          data-testid="clock-option"
          data-hint={!solved && i === answer ? '' : undefined}
          onClick={() => choose(i)}
          aria-label={`Часы ${i + 1}`}
        >
          <ClockFace h={t.h} half={t.half} />
        </button>
      ))}
    </div>
  );
}
