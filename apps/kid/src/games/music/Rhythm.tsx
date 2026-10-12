import { useEffect, useRef, useState } from 'react';
import { music } from '../../fx';
import { RHYTHM_AGAIN, RHYTHM_EASY, RHYTHM_LISTEN, RHYTHM_YOU } from '../../phrases';
import { praise, say, setTask, type GameProps } from '../common';
import { burstAt, cheer } from '../juice';
import { rhythmMatches, rhythmPattern, wait } from './timing';
import './music.css';

/** Длина доли, с: «та» — 0,6 с, «ти» — 0,3 с. */
const UNIT = 0.6;
/** Ребёнок замолчал так надолго — попытка сбрасывается. */
const GIVE_UP_MS = 3000;
/** После стольких ошибок в раунде — проще, чтобы ребёнок не застревал. */
export const EASY_AFTER = 2;

type Phase = 'listen' | 'play' | 'done';

/** Повтори ритм: барабан стучит — ребёнок стучит так же. Ноты-плашки: «та» длинная, «ти» короткая. */
export function Rhythm({ spec, phrases, onFinish }: GameProps<'rhythm'>) {
  const [round, setRound] = useState(0);
  const [gaps, setGaps] = useState(() => rhythmPattern(spec.beats, spec.timing));
  const [phase, setPhase] = useState<Phase>('listen');
  const [lit, setLit] = useState<number | null>(null);
  const [taps, setTaps] = useState<number[]>([]);
  const [again, setAgain] = useState(false);
  /** Ошибки в этом раунде: после EASY_AFTER засчитываем верное число ударов, без «та» и «ти». */
  const [misses, setMisses] = useState(0);
  const easy = misses >= EASY_AFTER;
  const drum = useRef<HTMLButtonElement>(null);
  const alive = useRef(true);
  const giveUp = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(
    () => () => {
      alive.current = false;
      clearTimeout(giveUp.current);
    },
    [],
  );

  /** Длительности плашек: промежуток до следующего удара, у последнего — «та». */
  const lengths = [...gaps, 1];

  /** Барабан играет образец (фаза listen и пустые касания выставляет тот, кто вызывает). */
  const listen = async (first: boolean, simpler = false) => {
    await say(first ? RHYTHM_LISTEN : RHYTHM_AGAIN);
    if (!alive.current) return;
    let t = 0;
    lengths.forEach((len, i) => {
      music.drum(t * UNIT);
      setTimeout(() => alive.current && setLit(i), t * UNIT * 1000);
      t += len;
    });
    await wait(t * UNIT * 1000);
    if (!alive.current) return;
    setLit(null);
    setPhase('play');
    void say(simpler ? RHYTHM_EASY : RHYTHM_YOU);
  };

  useEffect(() => {
    void listen(!again);
    setTask(() => {
      setAgain(true);
      setPhase('listen');
      setTaps([]);
      void listen(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- раунд начинается один раз
  }, [round]);

  const tap = () => {
    if (phase !== 'play') return;
    music.drum();
    const now = performance.now();
    const next = [...taps, now];
    setTaps(next);
    setLit(next.length - 1);
    clearTimeout(giveUp.current);
    if (next.length < lengths.length) {
      giveUp.current = setTimeout(() => {
        if (!alive.current) return;
        setTaps([]);
        setLit(null);
      }, GIVE_UP_MS);
      return;
    }
    const tapped = next.slice(1).map((t, i) => (t - next[i]!) / 1000);
    if (!spec.timing || easy || rhythmMatches(gaps, tapped)) {
      setPhase('done');
      burstAt(drum.current, 18);
      void praise(phrases);
      setTimeout(() => {
        if (!alive.current) return;
        if (round + 1 >= spec.rounds) return onFinish();
        setAgain(false);
        setMisses(0);
        setGaps(rhythmPattern(spec.beats, spec.timing));
        setPhase('listen');
        setTaps([]);
        setRound(round + 1);
      }, 2000);
    } else {
      cheer('oops');
      const m = misses + 1;
      setMisses(m);
      setPhase('listen');
      setTimeout(() => {
        if (!alive.current) return;
        setTaps([]);
        void listen(false, m >= EASY_AFTER);
      }, 700);
    }
  };

  return (
    <div
      className="game music-rhythm"
      data-testid="game-rhythm"
      data-phase={phase}
      data-beats={lengths.length}
    >
      <div className="rhythm-notes" aria-hidden="true">
        {lengths.map((len, i) => (
          <span
            key={`${round}-${i}`}
            className={[
              len < 1 ? 'ti' : 'ta',
              (phase === 'listen' ? lit === i : i < taps.length) && 'on',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            {len < 1 ? 'ти' : 'та'}
          </span>
        ))}
      </div>
      <button
        ref={drum}
        type="button"
        className={phase === 'play' ? 'rhythm-drum ready' : 'rhythm-drum'}
        data-testid="rhythm-drum"
        data-silent
        data-hint={phase === 'play' ? '' : undefined}
        aria-label="Барабан"
        onPointerDown={tap}
      >
        <span key={taps.length}>🥁</span>
      </button>
    </div>
  );
}
