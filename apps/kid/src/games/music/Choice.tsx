import { useEffect, useRef, useState } from 'react';
import { music, NOTE_FREQ } from '../../fx';
import { MUSIC_CHOICE, type MusicChoiceKind } from '../../phrases';
import { clayUrl, praise, retry, say, setTask, type GameProps, type SpecOf } from '../common';
import { burstAt } from '../juice';
import { wait } from './timing';
import './music.css';

type Side = 'a' | 'b';

/** Картинки сторон (глиняные, /games): ребёнок не читает — выбирает зверька или стрелку. */
const PICS: Record<MusicChoiceKind, Record<Side, string>> = {
  pitch: { a: 'animal-bird', b: 'animal-bear' },
  loudness: { a: 'animal-elephant', b: 'animal-mouse' },
  tempo: { a: 'animal-rabbit', b: 'animal-turtle' },
  duration: { a: 'animal-train', b: 'animal-chick' },
  direction: { a: 'arrow-up', b: 'arrow-down' },
};

type Spec = SpecOf<MusicChoiceKind>;

/**
 * Сыграть звук стороны; возвращает длительность, мс.
 * a — высоко / громко / быстро / долго / вверх; b — наоборот.
 */
export function playSide(spec: Spec, side: Side, start = 0): number {
  const A = side === 'a';
  switch (spec.kind) {
    case 'pitch': {
      // Высокая и низкая ноты — на gap полутонов друг от друга, вокруг «ля».
      const f = 440 * 2 ** ((A ? 1 : -1) * (spec.gap / 24));
      for (let i = 0; i < 3; i++) music.note(f, i * 0.45, 0.4);
      return 1400;
    }
    case 'loudness': {
      const g = A ? 0.95 : 0.07;
      [0, 2, 4].forEach((n, i) => music.note(NOTE_FREQ[n]!, i * 0.45, 0.45, g));
      return 1400;
    }
    case 'tempo': {
      const step = A ? 0.2 : 0.7;
      for (let i = 0; i < 6; i++) music.drum(i * step);
      return Math.round(5 * step * 1000 + 400);
    }
    case 'duration':
      if (A) music.long(NOTE_FREQ[4]!, 0, 1.8);
      else music.note(NOTE_FREQ[4]! * 2, 0, 0.14);
      return A ? 1900 : 400;
    case 'direction': {
      const n = spec.notes;
      const steps = Array.from({ length: n }, (_, i) => start + i);
      (A ? steps : steps.reverse()).forEach((k, i) => music.note(NOTE_FREQ[k]!, i * 0.42, 0.4));
      return n * 420 + 300;
    }
  }
}

type Phase = 'intro' | 'listen' | 'answer' | 'solved';

/** «Что ты слышишь»: звучит звук — ребёнок выбирает одну из двух картинок. */
export function MusicChoice({ spec, phrases, onFinish }: GameProps<MusicChoiceKind>) {
  const text = MUSIC_CHOICE[spec.kind];
  const [round, setRound] = useState(0);
  const [answer, setAnswer] = useState<Side>(() => (Math.random() < 0.5 ? 'a' : 'b'));
  /** Начальная нота мелодии «вверх или вниз». */
  const [start, setStart] = useState(() => randomStart(spec));
  const [phase, setPhase] = useState<Phase>(round === 0 ? 'intro' : 'listen');
  const [wrong, setWrong] = useState<Side | null>(null);
  const [sounding, setSounding] = useState<Side | 'q' | null>(null);
  const buttons = useRef<Record<Side, HTMLButtonElement | null>>({ a: null, b: null });
  const alive = useRef(true);
  useEffect(
    () => () => {
      alive.current = false;
    },
    [],
  );

  /** Сыграть звук и подсветить, чей он (q — вопрос). */
  const play = async (side: Side, who: Side | 'q') => {
    setSounding(who);
    await wait(playSide(spec, side, start));
    if (alive.current) setSounding(null);
  };

  const ask = async () => {
    setPhase('listen');
    await say(text.prompt);
    if (!alive.current) return;
    await play(answer, 'q');
    if (alive.current) setPhase('answer');
  };

  // Первый раунд — показ: «Птичка поёт высоко» (звук), «Мишка поёт низко» (звук); потом вопрос.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (phase === 'intro') {
        for (const side of ['a', 'b'] as const) {
          await say(text[side].demo);
          if (cancelled) return;
          await play(side, side);
          if (cancelled) return;
        }
      }
      if (!cancelled) await ask();
    })();
    setTask(() => void ask());
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- раунд начинается один раз
  }, [round]);

  const choose = (side: Side) => {
    if (phase !== 'answer') return;
    if (side !== answer) {
      setWrong(side);
      setTimeout(() => setWrong(null), 600);
      void retry(phrases).then(() => {
        if (alive.current) void play(answer, 'q');
      });
      return;
    }
    setPhase('solved');
    burstAt(buttons.current[side], 16);
    void say(text[side].name).then(() => praise(phrases));
    setTimeout(() => {
      if (!alive.current) return;
      if (round + 1 >= spec.rounds) return onFinish();
      setRound(round + 1);
      setAnswer(Math.random() < 0.5 ? 'a' : 'b');
      setStart(randomStart(spec));
      setPhase('listen');
    }, 2600);
  };

  return (
    <div
      className="game music-choice"
      data-testid="game-music-choice"
      data-answer={answer}
      data-phase={phase}
    >
      <div className={sounding === 'q' ? 'music-ear on' : 'music-ear'} aria-hidden="true">
        <img className="clay-em" src={clayUrl('music-note')} alt="" draggable={false} />
      </div>
      <div className="music-sides">
        {(['a', 'b'] as const).map((side) => (
          <button
            key={side}
            type="button"
            ref={(el) => {
              buttons.current[side] = el;
            }}
            className={[
              'music-side',
              sounding === side && 'sounding',
              wrong === side && 'shake',
              phase === 'solved' && side === answer && 'picked',
            ]
              .filter(Boolean)
              .join(' ')}
            data-testid="music-side"
            data-side={side}
            data-hint={phase === 'answer' && side === answer ? '' : undefined}
            aria-label={text[side].name}
            onClick={() => choose(side)}
          >
            <span className="music-pic">
              <img
                className="clay-em"
                src={clayUrl(PICS[spec.kind][side])}
                alt=""
                draggable={false}
              />
            </span>
            <span className="music-word">{text[side].name.replace('!', '')}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

const randomStart = (spec: Spec) =>
  spec.kind === 'direction' ? Math.floor(Math.random() * (9 - spec.notes)) : 0;
