import { useEffect, useRef, useState } from 'react';
import { fx } from '../fx';
import { MELODY_LISTEN, MELODY_AGAIN, MELODY_YOU } from '../phrases';
import { praise, say, setTask, type GameProps } from './common';
import { burstAt, cheer } from './juice';

const BELL_COLORS = ['#E8453C', '#F59E0B', '#22A55B', '#3B82F6', '#9B5DE5'];
/** Пауза между нотами мелодии, мс. */
const BEAT = 650;

/** Следующая нота — не такая же, как предыдущая (так мелодию легче запомнить). */
export const nextNote = (bells: number, prev?: number, rnd: () => number = Math.random) => {
  const pool = Array.from({ length: bells }, (_, i) => i).filter((i) => i !== prev);
  return pool[Math.floor(rnd() * pool.length)]!;
};

type Phase = 'listen' | 'play' | 'done';

/** Повтори мелодию: колокольчики играют — ребёнок повторяет; каждый раз на ноту длиннее. */
export function Melody({ spec, phrases, onFinish }: GameProps<'melody'>) {
  const [tune, setTune] = useState<number[]>(() => {
    const t: number[] = [];
    for (let i = 0; i < spec.start; i++) t.push(nextNote(spec.bells, t.at(-1)));
    return t;
  });
  const [phase, setPhase] = useState<Phase>('listen');
  const [ringing, setRinging] = useState<number | null>(null);
  const [pos, setPos] = useState(0);
  const [again, setAgain] = useState(false);
  const bells = useRef<(HTMLButtonElement | null)[]>([]);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const ring = (i: number) => {
    fx.bell(i);
    setRinging(i);
    timers.current.push(setTimeout(() => setRinging((r) => (r === i ? null : r)), 380));
  };

  // Колокольчики играют мелодию, потом — очередь ребёнка.
  useEffect(() => {
    if (phase !== 'listen') return;
    let cancelled = false;
    void say(again ? MELODY_AGAIN : MELODY_LISTEN).then(() => {
      if (cancelled) return;
      tune.forEach((n, k) => timers.current.push(setTimeout(() => ring(n), 300 + k * BEAT)));
      timers.current.push(
        setTimeout(
          () => {
            setPos(0);
            setPhase('play');
            void say(MELODY_YOU);
          },
          300 + tune.length * BEAT,
        ),
      );
    });
    return () => {
      cancelled = true;
    };
  }, [phase, tune, again]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  // «Ушко» в очереди ребёнка — сыграть мелодию ещё раз.
  useEffect(() => {
    setTask(
      phase === 'play'
        ? () => {
            setAgain(true);
            setPhase('listen');
          }
        : null,
    );
  }, [phase]);

  const tap = (i: number) => {
    if (phase !== 'play') return;
    ring(i);
    if (i !== tune[pos]) {
      cheer('oops');
      fx.soft();
      setAgain(true);
      setPhase('listen');
      return;
    }
    if (pos + 1 < tune.length) return setPos(pos + 1);
    burstAt(bells.current[i] ?? null, 16);
    void praise(phrases);
    if (tune.length >= spec.goal) {
      setPhase('done');
      setTimeout(onFinish, 1600);
      return;
    }
    setPhase('done');
    timers.current.push(
      setTimeout(() => {
        setAgain(false);
        setTune([...tune, nextNote(spec.bells, tune.at(-1))]);
        setPhase('listen');
      }, 1600),
    );
  };

  return (
    <div className="game melody" data-testid="game-melody" data-phase={phase}>
      <div className="melody-progress" aria-hidden="true">
        {Array.from({ length: spec.goal }, (_, i) => (
          <span
            key={i}
            className={i < tune.length ? (i < pos || phase === 'done' ? 'on' : 'now') : ''}
          />
        ))}
      </div>
      <div className="bells">
        {Array.from({ length: spec.bells }, (_, i) => (
          <button
            key={i}
            type="button"
            ref={(el) => {
              bells.current[i] = el;
            }}
            className={ringing === i ? 'bell ringing' : 'bell'}
            data-testid="bell"
            data-bell={i}
            data-hint={phase === 'play' && i === tune[pos] ? '' : undefined}
            data-silent
            aria-label={`Колокольчик ${i + 1}`}
            style={{ '--bell': BELL_COLORS[i], '--i': i } as React.CSSProperties}
            onPointerDown={() => tap(i)}
          >
            <svg viewBox="0 0 100 110" aria-hidden="true">
              <path d="M50,4 v10" stroke="#8B5A2B" strokeWidth="6" strokeLinecap="round" />
              <path
                d="M50,14 C26,14 20,40 20,62 C20,76 12,82 8,88 H92 C88,82 80,76 80,62 C80,40 74,14 50,14 Z"
                fill="var(--bell)"
              />
              <path
                d="M32,30 C28,40 27,52 28,64"
                stroke="#fff"
                strokeWidth="6"
                opacity="0.4"
                fill="none"
                strokeLinecap="round"
              />
              <circle cx="50" cy="96" r="9" fill="#FACC15" />
            </svg>
          </button>
        ))}
      </div>
      <span className="melody-tune" data-testid="melody-tune" hidden>
        {tune.join(',')}
      </span>
    </div>
  );
}
