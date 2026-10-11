import { NOTE_NAMES } from '@kidsplus/shared/games';
import { useEffect, useRef, useState } from 'react';
import { music, NOTE_FREQ } from '../../fx';
import { STAFF_PROMPT } from '../../phrases';
import { praise, retry, say, setTask, shuffled, type GameProps } from '../common';
import { burstAt } from '../juice';
import { NOTE_COLORS } from './Piano';
import './music.css';

/** Расстояние между линейками стана (viewBox). */
const GAP = 16;
/** Нижняя линейка — «ми» первой октавы. */
const BOTTOM = 112;
/** Положение ноты: шаги от нижней линейки («до» — −2, на добавочной линейке). */
const noteY = (i: number) => BOTTOM - ((i - 2) * GAP) / 2;

/** Три варианта названия: верный и два других (без повторов «до»). */
export function staffOptions(keys: number, target: number, rnd: () => number = Math.random) {
  const names = [...new Set(NOTE_NAMES.slice(0, keys))];
  const right = NOTE_NAMES[target]!;
  const others = names.filter((n) => n !== right);
  const two = [...others].sort(() => rnd() - 0.5).slice(0, 2);
  return shuffled([right, ...two]);
}

const pick = (keys: number, prev?: number) => {
  const pool = Array.from({ length: keys }, (_, i) => i).filter((i) => i !== prev);
  return pool[Math.floor(Math.random() * pool.length)]!;
};

/** Нотный стан: на линейках нота — ребёнок выбирает её название. */
export function Staff({ spec, phrases, onFinish }: GameProps<'staff'>) {
  const [round, setRound] = useState(0);
  const [target, setTarget] = useState(() => pick(spec.keys));
  const [options, setOptions] = useState(() => staffOptions(spec.keys, target));
  const [wrong, setWrong] = useState<string[]>([]);
  const [solved, setSolved] = useState(false);
  const buttons = useRef<Record<string, HTMLButtonElement | null>>({});
  const alive = useRef(true);
  useEffect(
    () => () => {
      alive.current = false;
    },
    [],
  );

  const ask = async () => {
    await say(STAFF_PROMPT);
    if (alive.current) music.note(NOTE_FREQ[target]!, 0, 0.9);
  };

  useEffect(() => {
    void ask();
    setTask(() => void ask());
    // eslint-disable-next-line react-hooks/exhaustive-deps -- раунд начинается один раз
  }, [round]);

  const right = NOTE_NAMES[target]!;
  const choose = (name: string) => {
    if (solved || wrong.includes(name)) return;
    if (name !== right) {
      setWrong([...wrong, name]);
      void retry(phrases);
      return;
    }
    setSolved(true);
    music.note(NOTE_FREQ[target]!, 0, 0.9);
    burstAt(buttons.current[name] ?? null, 16);
    void say(`${name}!`).then(() => praise(phrases));
    setTimeout(() => {
      if (!alive.current) return;
      if (round + 1 >= spec.rounds) return onFinish();
      const t = pick(spec.keys, target);
      setRound(round + 1);
      setTarget(t);
      setOptions(staffOptions(spec.keys, t));
      setWrong([]);
      setSolved(false);
    }, 2200);
  };

  const y = noteY(target);
  return (
    <div className="game staff" data-testid="game-staff" data-answer={right}>
      <svg className="staff-svg" viewBox="0 0 240 150" aria-hidden="true">
        {[0, 1, 2, 3, 4].map((l) => (
          <line key={l} x1="10" x2="230" y1={BOTTOM - l * GAP} y2={BOTTOM - l * GAP} />
        ))}
        {/* «До» живёт на добавочной линейке под станом. */}
        {target === 0 && <line className="ledger" x1="102" x2="142" y1={y} y2={y} />}
        <g key={round} className={solved ? 'staff-note solved' : 'staff-note'}>
          <ellipse
            cx="122"
            cy={y}
            rx="11"
            ry="8"
            transform={`rotate(-20 122 ${y})`}
            style={{ fill: solved ? NOTE_COLORS[target] : undefined }}
          />
          <line x1="132" x2="132" y1={y} y2={y - 46} />
        </g>
      </svg>
      <div className="staff-options">
        {options.map((name) => {
          const i = NOTE_NAMES.indexOf(name as (typeof NOTE_NAMES)[number]);
          return (
            <button
              key={name}
              type="button"
              ref={(el) => {
                buttons.current[name] = el;
              }}
              className={[
                'staff-option',
                wrong.includes(name) && 'off',
                solved && name === right && 'picked',
              ]
                .filter(Boolean)
                .join(' ')}
              style={{ '--k': NOTE_COLORS[i] } as React.CSSProperties}
              data-testid="staff-option"
              data-name={name}
              data-hint={!solved && name === right ? '' : undefined}
              onClick={() => choose(name)}
            >
              {name}
            </button>
          );
        })}
      </div>
    </div>
  );
}
