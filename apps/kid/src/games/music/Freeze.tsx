import { useEffect, useRef, useState } from 'react';
import { music, NOTE_FREQ } from '../../fx';
import { FREEZE_DANCE, FREEZE_GO, FREEZE_MOVED, FREEZE_STOP } from '../../phrases';
import { clayUrl, praise, say, setTask, type GameProps } from '../common';
import { burstAt } from '../juice';
import './music.css';

/** Весёлая полька: ноты по шагам (до–до), шаг — STEP мс; барабан — на каждый второй шаг. */
const TUNE = [0, 2, 4, 2, 0, 2, 4, 2, 3, 5, 7, 5, 4, 2, 1, 0];
const STEP = 230;
/** Сколько звучит музыка до «Замри!», мс (каждый раз по-разному, чтобы было неожиданно). */
const danceMs = () => 3500 + Math.random() * 2500;
/** Сколько стоим замерев, мс. */
const FREEZE_MS = 3000;

const DANCERS = ['animal-bear', 'animal-rabbit', 'animal-frog'];

type Phase = 'dance' | 'freeze' | 'done';

/** «Замри!»: под музыку танцуем и хлопаем по зверятам, музыка стихла — замираем. */
export function Freeze({ spec, phrases, onFinish }: GameProps<'freeze'>) {
  const [round, setRound] = useState(0);
  const [phase, setPhase] = useState<Phase>('dance');
  const [jump, setJump] = useState<number | null>(null);
  const moved = useRef(false);
  const alive = useRef(true);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const dancers = useRef<(HTMLButtonElement | null)[]>([]);
  useEffect(
    () => () => {
      alive.current = false;
      timers.current.forEach(clearTimeout);
    },
    [],
  );
  const later = (fn: () => void, ms: number) =>
    timers.current.push(setTimeout(() => alive.current && fn(), ms));

  useEffect(() => {
    setTask(() => void say(phase === 'freeze' ? FREEZE_STOP : FREEZE_DANCE));
  }, [phase]);

  // Раунд: музыка играет, потом «Замри!», потом «Отомри!» — и снова.
  useEffect(() => {
    let step = 0;
    let playing = true;
    void say(round === 0 ? FREEZE_DANCE : FREEZE_GO);
    const beat = setInterval(() => {
      if (!playing || !alive.current) return;
      music.note(NOTE_FREQ[TUNE[step % TUNE.length]!]!, 0, 0.22, 0.45);
      if (step % 2 === 0) music.drum(0, 0.5);
      step++;
    }, STEP);
    const stop = setTimeout(() => {
      playing = false;
      clearInterval(beat);
      if (!alive.current) return;
      moved.current = false;
      setPhase('freeze');
      void say(FREEZE_STOP);
      later(() => {
        if (round + 1 >= spec.rounds) {
          setPhase('done');
          burstAt(dancers.current[1] ?? null, 24);
          void praise(phrases).then(() => alive.current && onFinish());
          return;
        }
        setPhase('dance');
        setRound((r) => r + 1);
      }, FREEZE_MS);
    }, danceMs());
    return () => {
      playing = false;
      clearInterval(beat);
      clearTimeout(stop);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- раунд начинается один раз
  }, [round]);

  const tap = (i: number) => {
    if (phase === 'dance') {
      music.note(NOTE_FREQ[(i * 2 + 4) % 8]!, 0, 0.3, 0.5);
      setJump(i);
      later(() => setJump((j) => (j === i ? null : j)), 350);
      burstAt(dancers.current[i] ?? null, 8);
      return;
    }
    // Пошевелился — не страшно, просто напомним (один раз за остановку).
    if (phase === 'freeze' && !moved.current) {
      moved.current = true;
      void say(FREEZE_MOVED);
    }
  };

  return (
    <div className="game freeze" data-testid="game-freeze" data-phase={phase} data-round={round}>
      <div className="freeze-stage">
        {DANCERS.map((d, i) => (
          <button
            key={d}
            type="button"
            ref={(el) => {
              dancers.current[i] = el;
            }}
            className={jump === i ? 'dancer jump' : 'dancer'}
            style={{ '--i': i } as React.CSSProperties}
            data-testid="dancer"
            data-silent
            aria-label="Зверёк танцует"
            onPointerDown={() => tap(i)}
          >
            <span>
              <img className="clay-em" src={clayUrl(d)} alt="" draggable={false} />
            </span>
          </button>
        ))}
      </div>
      {phase === 'freeze' && (
        <div className="freeze-ice" aria-hidden="true">
          <img className="clay-em" src={clayUrl('snowflake')} alt="" draggable={false} />
        </div>
      )}
    </div>
  );
}
