import { NOTE_NAMES } from '@kidsplus/shared/games';
import { useEffect, useRef, useState } from 'react';
import { music, NOTE_FREQ } from '../../fx';
import { PIANO_EAR, PIANO_FREE, pianoFind, thisNote } from '../../phrases';
import { praise, retry, say, setTask, type GameProps } from '../common';
import { burstAt } from '../juice';
import { wait } from './timing';
import './music.css';

/** Цвета нот — как у детских колокольчиков: до — красная, ре — оранжевая… */
export const NOTE_COLORS = [
  '#e8453c',
  '#f59e0b',
  '#facc15',
  '#22a55b',
  '#38bdf8',
  '#2563eb',
  '#9b5de5',
  '#f472b6',
];

/** Свободная игра: столько касаний на «раунд». */
const FREE_TAPS = 6;

const pick = (keys: number, prev?: number) => {
  const pool = Array.from({ length: keys }, (_, i) => i).filter(
    (i) => prev === undefined || NOTE_NAMES[i] !== NOTE_NAMES[prev],
  );
  return pool[Math.floor(Math.random() * pool.length)]!;
};

/** Клавиши пианино; одинаковые названия («до» внизу и вверху) — обе верны. */
export function Keys(props: {
  keys: number;
  pressed: number | null;
  hint: number | null;
  onKey: (i: number, el: HTMLButtonElement) => void;
}) {
  return (
    <div className="piano-keys">
      {Array.from({ length: props.keys }, (_, i) => (
        <button
          key={i}
          type="button"
          className={props.pressed === i ? 'piano-key down' : 'piano-key'}
          style={{ '--k': NOTE_COLORS[i] } as React.CSSProperties}
          data-testid="piano-key"
          data-key={i}
          data-silent
          data-hint={
            props.hint !== null && NOTE_NAMES[i] === NOTE_NAMES[props.hint] ? '' : undefined
          }
          onPointerDown={(e) => props.onKey(i, e.currentTarget)}
        >
          <span>{NOTE_NAMES[i]}</span>
        </button>
      ))}
    </div>
  );
}

/** Пианино: свободно поиграть, найти ноту по названию или узнать на слух. */
export function Piano({ spec, phrases, onFinish }: GameProps<'piano'>) {
  const [round, setRound] = useState(0);
  const [target, setTarget] = useState(() => pick(spec.keys));
  const [pressed, setPressed] = useState<number | null>(null);
  const [ready, setReady] = useState(spec.mode === 'free');
  const [solved, setSolved] = useState(false);
  const [taps, setTaps] = useState(0);
  const alive = useRef(true);
  useEffect(
    () => () => {
      alive.current = false;
    },
    [],
  );

  const press = (i: number) => {
    music.note(NOTE_FREQ[i]!, 0, 0.7);
    setPressed(i);
    setTimeout(() => alive.current && setPressed((p) => (p === i ? null : p)), 250);
  };

  const ask = async () => {
    setReady(false);
    if (spec.mode === 'find') {
      await say(pianoFind(NOTE_NAMES[target]!));
    } else if (spec.mode === 'ear') {
      await say(PIANO_EAR);
      if (!alive.current) return;
      music.note(NOTE_FREQ[target]!, 0, 0.9);
      await wait(900);
    }
    if (alive.current) setReady(true);
  };

  // Начало: «до, ре, ми…» — каждая клавиша звучит и называется; потом задание.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (round === 0) {
        if (spec.mode === 'free') await say(PIANO_FREE);
        for (let i = 0; i < spec.keys && !cancelled; i++) {
          press(i);
          await wait(spec.mode === 'free' ? 380 : 650);
        }
        if (cancelled) return;
      }
      if (spec.mode !== 'free') await ask();
    })();
    setTask(spec.mode === 'free' ? null : () => void ask());
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- раунд начинается один раз
  }, [round]);

  const next = () =>
    setTimeout(() => {
      if (!alive.current) return;
      if (round + 1 >= spec.rounds) return onFinish();
      setReady(false);
      setRound(round + 1);
      setTarget(pick(spec.keys, target));
      setSolved(false);
    }, 2000);

  const onKey = (i: number, el: HTMLButtonElement) => {
    press(i);
    if (spec.mode === 'free') {
      void say(NOTE_NAMES[i]!);
      const n = taps + 1;
      setTaps(n);
      if (n % FREE_TAPS === 0) {
        burstAt(el, 14);
        if (n / FREE_TAPS >= spec.rounds) setTimeout(() => alive.current && onFinish(), 900);
      }
      return;
    }
    if (!ready || solved) return;
    if (NOTE_NAMES[i] !== NOTE_NAMES[target]) {
      void say(thisNote(NOTE_NAMES[i]!)).then(() => retry(phrases));
      return;
    }
    setSolved(true);
    burstAt(el, 16);
    void say(`${NOTE_NAMES[i]}!`).then(() => praise(phrases));
    next();
  };

  return (
    <div
      className="game piano"
      data-testid="game-piano"
      data-mode={spec.mode}
      data-answer={target}
      data-ready={ready && !solved}
    >
      {spec.mode === 'find' && (
        <div className="piano-ask" aria-hidden="true" style={{ color: NOTE_COLORS[target] }}>
          {NOTE_NAMES[target]}
        </div>
      )}
      {spec.mode === 'ear' && (
        <div className="music-ear" aria-hidden="true">
          👂
        </div>
      )}
      <Keys
        keys={spec.keys}
        pressed={pressed}
        hint={spec.mode !== 'free' && ready && !solved ? target : null}
        onKey={onKey}
      />
    </div>
  );
}
