import { useEffect, useRef, useState } from 'react';
import { music } from '../../fx';
import { BEATS_PROMPT } from '../../phrases';
import { countOptions } from '../Counting';
import { NUMBERS, praise, retry, say, setTask, type GameProps } from '../common';
import { burstAt } from '../juice';
import { wait } from './timing';
import './music.css';

const STEP = 0.6;

const nextCount = (max: number, prev?: number) => {
  const pool = Array.from({ length: max }, (_, i) => i + 1).filter((n) => n !== prev);
  return pool[Math.floor(Math.random() * pool.length)]!;
};

/** Сколько звуков: барабан ударяет несколько раз — ребёнок выбирает число. */
export function Beats({ spec, phrases, onFinish }: GameProps<'beats'>) {
  const [round, setRound] = useState(0);
  const [answer, setAnswer] = useState(() => nextCount(spec.max));
  const [hit, setHit] = useState(0);
  const [ready, setReady] = useState(false);
  const [wrong, setWrong] = useState<number[]>([]);
  const [solved, setSolved] = useState(false);
  const options = countOptions(answer, spec.max, Math.min(3, spec.max));
  const buttons = useRef<Record<number, HTMLButtonElement | null>>({});
  const alive = useRef(true);
  useEffect(
    () => () => {
      alive.current = false;
    },
    [],
  );

  const play = async () => {
    setReady(false);
    for (let i = 0; i < answer; i++) {
      music.drum(i * STEP);
      setTimeout(() => alive.current && setHit((h) => h + 1), i * STEP * 1000);
    }
    await wait(answer * STEP * 1000 + 300);
    if (alive.current) setReady(true);
  };

  const ask = async () => {
    await say(BEATS_PROMPT);
    if (alive.current) await play();
  };

  useEffect(() => {
    void ask();
    setTask(() => void ask());
    // eslint-disable-next-line react-hooks/exhaustive-deps -- раунд начинается один раз
  }, [round]);

  const choose = (n: number) => {
    if (!ready || solved || wrong.includes(n)) return;
    if (n !== answer) {
      setWrong([...wrong, n]);
      void retry(phrases).then(() => {
        if (alive.current) void play();
      });
      return;
    }
    setSolved(true);
    burstAt(buttons.current[n] ?? null, 16);
    void say(`${NUMBERS[n]}!`).then(() => praise(phrases));
    setTimeout(() => {
      if (!alive.current) return;
      if (round + 1 >= spec.rounds) return onFinish();
      setRound(round + 1);
      setAnswer(nextCount(spec.max, answer));
      setWrong([]);
      setSolved(false);
    }, 2200);
  };

  return (
    <div className="game music-beats" data-testid="game-beats" data-answer={answer}>
      <div key={hit} className={hit ? 'music-drum hit' : 'music-drum'} aria-hidden="true">
        🥁
      </div>
      <div className="music-numbers">
        {options.map((n) => (
          <button
            key={n}
            type="button"
            ref={(el) => {
              buttons.current[n] = el;
            }}
            className={[
              'music-number',
              wrong.includes(n) && 'off',
              solved && n === answer && 'picked',
            ]
              .filter(Boolean)
              .join(' ')}
            data-testid="beats-option"
            data-value={n}
            data-hint={ready && !solved && n === answer ? '' : undefined}
            onClick={() => choose(n)}
          >
            <b>{n}</b>
            <span aria-hidden="true">{'●'.repeat(n)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
