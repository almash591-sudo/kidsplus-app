import { NOTE_NAMES } from '@kidsplus/shared/games';
import { SONGS } from '@kidsplus/shared/songs';
import { useEffect, useRef, useState } from 'react';
import { music, NOTE_FREQ } from '../../fx';
import { SONG_LISTEN, SONG_TAP, songIntro } from '../../phrases';
import { praise, say, setTask, type GameProps } from '../common';
import { burstAt } from '../juice';
import { NOTE_COLORS } from './Piano';
import { wait } from './timing';
import './music.css';

/** Доля при повторе всей песенки, с. */
const BEAT = 0.42;

type Phase = 'intro' | 'play' | 'replay' | 'done';

/**
 * Сыграй песенку: светится нужная клавиша — ребёнок нажимает и играет знакомую мелодию.
 * Ошибиться нельзя: «не та» клавиша просто звучит, а светится всё та же. В конце песенка
 * звучит целиком — «вот что у тебя получилось!».
 */
export function Song({ spec, phrases, onFinish }: GameProps<'song'>) {
  const [round, setRound] = useState(0);
  const [pos, setPos] = useState(0);
  const [phase, setPhase] = useState<Phase>('intro');
  const [lit, setLit] = useState<number | null>(null);
  const keysRef = useRef<(HTMLButtonElement | null)[]>([]);
  const alive = useRef(true);
  useEffect(
    () => () => {
      alive.current = false;
    },
    [],
  );
  const song = SONGS[spec.songs[round]!];
  const notes = song.notes;
  const keys = Math.max(5, ...notes.map((x) => x.n + 1));
  const target = phase === 'play' ? notes[pos]!.n : null;

  const flash = (i: number, ms = 220) => {
    setLit(i);
    setTimeout(() => alive.current && setLit((l) => (l === i ? null : l)), ms);
  };

  useEffect(() => {
    let cancelled = false;
    const intro = async () => {
      setPhase('intro');
      await say(songIntro(song.title), SONG_TAP);
      if (!cancelled) setPhase('play');
    };
    void intro();
    setTask(() => void say(SONG_TAP));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- песенка начинается один раз
  }, [round]);

  /** Песенка целиком: клавиши подсвечиваются в такт. */
  const replay = async () => {
    setPhase('replay');
    await say(SONG_LISTEN);
    let t = 0;
    for (const x of notes) {
      music.note(NOTE_FREQ[x.n]!, t, x.d * BEAT * 1.4);
      const at = t;
      setTimeout(() => alive.current && flash(x.n, x.d * BEAT * 900), at * 1000);
      t += x.d * BEAT;
    }
    await wait(t * 1000 + 300);
    if (!alive.current) return;
    setPhase('done');
    burstAt(keysRef.current[notes.at(-1)!.n] ?? null, 22);
    await praise(phrases);
    if (!alive.current) return;
    if (round + 1 >= spec.songs.length) return onFinish();
    setPos(0);
    setRound(round + 1);
  };

  const tap = (i: number) => {
    if (phase !== 'play') return;
    const right = i === target;
    music.note(NOTE_FREQ[i]!, 0, right ? notes[pos]!.d * 0.5 : 0.3, right ? 0.6 : 0.3);
    flash(i);
    if (!right) return;
    if (pos + 1 < notes.length) return setPos(pos + 1);
    burstAt(keysRef.current[i] ?? null, 14);
    void replay();
  };

  return (
    <div
      className="game piano song"
      data-testid="game-song"
      data-phase={phase}
      data-answer={target ?? ''}
    >
      <div className="song-head" aria-hidden="true">
        <span className="song-emoji">{song.emoji}</span>
        <div className="song-dots">
          {notes.map((x, k) => (
            <span
              key={`${round}-${k}`}
              className={k < pos || phase === 'replay' || phase === 'done' ? 'on' : ''}
              style={{ '--k': NOTE_COLORS[x.n] } as React.CSSProperties}
            />
          ))}
        </div>
      </div>
      <div className="piano-keys">
        {Array.from({ length: keys }, (_, i) => (
          <button
            key={i}
            type="button"
            ref={(el) => {
              keysRef.current[i] = el;
            }}
            className={['piano-key', lit === i && 'down', target === i && 'guide']
              .filter(Boolean)
              .join(' ')}
            style={{ '--k': NOTE_COLORS[i] } as React.CSSProperties}
            data-testid="song-key"
            data-key={i}
            data-silent
            data-hint={target === i ? '' : undefined}
            aria-label={NOTE_NAMES[i]}
            onPointerDown={() => tap(i)}
          >
            <span>{NOTE_NAMES[i]}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
