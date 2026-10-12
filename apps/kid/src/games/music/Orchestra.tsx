import { useEffect, useRef, useState } from 'react';
import { fx, music, NOTE_FREQ } from '../../fx';
import { ORCHESTRA_INTRO, orchestraNow, PLAYER_NAMES } from '../../phrases';
import { praise, say, setTask, type GameProps } from '../common';
import { burstAt } from '../juice';
import './music.css';

/** Музыканты: зверёк и его инструмент; как его зовут в задании — PLAYER_NAMES (тот же порядок). */
const PLAYERS: { emoji: string; play: (note: number) => void }[] = [
  { emoji: '🐻', play: () => music.drum(0, 0.8) },
  { emoji: '🐰', play: (n) => fx.bell(n) },
  { emoji: '🐸', play: (n) => music.flute(NOTE_FREQ[n]!) },
  { emoji: '🐘', play: (n) => music.tuba(NOTE_FREQ[n]!) },
  { emoji: '🐱', play: (n) => music.xylo(NOTE_FREQ[n]!) },
  { emoji: '🐦', play: (n) => music.whistle(NOTE_FREQ[n]!) },
];
/** Ноты пентатоники — в любом порядке звучит без фальши. */
const PENTA = [0, 1, 2, 4, 5, 7];
/** Столько раз сыграть тому, кто светится. */
const TAPS = 4;

const pickPlayer = (players: number, prev: number | null) => {
  const pool = Array.from({ length: players }, (_, i) => i).filter((i) => i !== prev);
  return pool[Math.floor(Math.random() * pool.length)]!;
};

/**
 * Звериный оркестр: у каждого зверька свой инструмент, тихо идёт ритм. Дирижёр зовёт того,
 * кто светится, — ребёнок играет на нём; остальные тоже звучат, ошибок нет.
 */
export function Orchestra({ spec, phrases, onFinish }: GameProps<'orchestra'>) {
  const [round, setRound] = useState(0);
  const [solo, setSolo] = useState(() => pickPlayer(spec.players, null));
  const [count, setCount] = useState(0);
  const [ready, setReady] = useState(false);
  const [hit, setHit] = useState<number | null>(null);
  const note = useRef(0);
  const alive = useRef(true);
  const els = useRef<(HTMLButtonElement | null)[]>([]);
  useEffect(
    () => () => {
      alive.current = false;
    },
    [],
  );

  // Тихий ритм, пока играет оркестр.
  useEffect(() => {
    const t = setInterval(() => alive.current && music.shaker(), 500);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    // ready уже false: в начале игры и после того, как прошлый солист доиграл.
    let cancelled = false;
    const call = PLAYER_NAMES[solo]!;
    void (round === 0 ? say(ORCHESTRA_INTRO, orchestraNow(call)) : say(orchestraNow(call))).then(
      () => !cancelled && setReady(true),
    );
    setTask(() => void say(orchestraNow(call)));
    return () => {
      cancelled = true;
    };
  }, [round, solo]);

  const tap = (i: number) => {
    const n = PENTA[note.current++ % PENTA.length]!;
    PLAYERS[i]!.play(n);
    setHit(i);
    setTimeout(() => alive.current && setHit((h) => (h === i ? null : h)), 260);
    if (!ready || i !== solo) return;
    const c = count + 1;
    setCount(c);
    if (c < TAPS) return;
    setReady(false);
    burstAt(els.current[i] ?? null, 18);
    void praise(phrases).then(() => {
      if (!alive.current) return;
      if (round + 1 >= spec.rounds) {
        // Финал: весь оркестр вместе.
        PLAYERS.slice(0, spec.players).forEach((p, k) => p.play(PENTA[k % PENTA.length]!));
        setTimeout(() => alive.current && onFinish(), 900);
        return;
      }
      setCount(0);
      setSolo(pickPlayer(spec.players, i));
      setRound(round + 1);
    });
  };

  return (
    <div className="game orchestra" data-testid="game-orchestra" data-solo={ready ? solo : ''}>
      <div className="orchestra-notes" aria-hidden="true">
        {Array.from({ length: TAPS }, (_, k) => (
          <span key={k} className={k < count ? 'on' : ''}>
            ♪
          </span>
        ))}
      </div>
      <div className="orchestra-stage" style={{ '--n': spec.players } as React.CSSProperties}>
        {PLAYERS.slice(0, spec.players).map((p, i) => (
          <button
            key={p.emoji}
            type="button"
            ref={(el) => {
              els.current[i] = el;
            }}
            className={['player', hit === i && 'hit', ready && solo === i && 'solo']
              .filter(Boolean)
              .join(' ')}
            style={{ '--i': i } as React.CSSProperties}
            data-testid="player"
            data-player={i}
            data-silent
            data-hint={ready && solo === i ? '' : undefined}
            aria-label={PLAYER_NAMES[i]}
            onPointerDown={() => tap(i)}
          >
            <span>{p.emoji}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
