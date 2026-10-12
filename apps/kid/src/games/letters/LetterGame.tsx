import { useEffect, useRef, useState } from 'react';
import {
  findLetter,
  findSyllable,
  firstLetterAsk,
  firstLetterIs,
  isLetter,
  READ_WORD,
  sayWord,
} from '../../phrases';
import { ask, praise, retry, say, shuffled, type GameProps, type SpecOf } from '../common';
import { burstAt } from '../juice';
import './letters.css';

type Kind = 'letter' | 'syllable' | 'firstLetter' | 'readWord';
type Spec = SpecOf<Kind>;

const ALPHABET = [...'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЭЮЯ'];

export interface LetterRound {
  /** Что показать сверху: эмодзи-картинку или написанное слово; null — только голос. */
  show: { emoji?: string; text?: string } | null;
  /** Варианты: буква, слог или эмодзи. */
  options: { id: string; label: string; emoji?: boolean }[];
  answer: string;
  askText: string;
  rightText: string;
}

function pick<T>(xs: readonly T[], prev?: T): T {
  const pool = xs.length > 1 ? xs.filter((x) => x !== prev) : xs;
  return pool[Math.floor(Math.random() * pool.length)]!;
}

/** Ответ и (choices − 1) других вариантов, перемешанные. */
function withDistractors(answer: string, pool: readonly string[], choices: number): string[] {
  const others = shuffled([...new Set(pool)].filter((x) => x !== answer)).slice(0, choices - 1);
  return shuffled([answer, ...others]);
}

export function makeRound(spec: Spec, prevAnswer?: string): LetterRound {
  switch (spec.kind) {
    case 'letter': {
      const a = pick(spec.letters, prevAnswer);
      const pool = spec.letters.length >= spec.choices ? spec.letters : ALPHABET;
      return {
        show: null,
        options: withDistractors(a, pool, spec.choices).map((l) => ({ id: l, label: l })),
        answer: a,
        askText: findLetter(a),
        rightText: isLetter(a),
      };
    }
    case 'syllable': {
      const a = pick(spec.syllables, prevAnswer);
      return {
        show: null,
        options: withDistractors(a, spec.syllables, spec.choices).map((s) => ({
          id: s,
          label: s,
        })),
        answer: a,
        askText: findSyllable(a),
        rightText: sayWord(a),
      };
    }
    case 'firstLetter': {
      const w = pick(
        spec.words,
        spec.words.find((x) => x.word === prevAnswer),
      );
      const a = w.word[0]!;
      const pool = [...spec.words.map((x) => x.word[0]!), ...ALPHABET];
      return {
        show: { emoji: w.emoji },
        options: withDistractors(a, pool, spec.choices).map((l) => ({ id: l, label: l })),
        answer: a,
        askText: firstLetterAsk(w.word),
        rightText: firstLetterIs(w.word),
      };
    }
    case 'readWord': {
      const w = pick(
        spec.words,
        spec.words.find((x) => x.word === prevAnswer),
      );
      const emojis = withDistractors(
        w.emoji,
        spec.words.map((x) => x.emoji),
        spec.choices,
      );
      return {
        show: { text: w.word },
        options: emojis.map((e) => ({ id: e, label: e, emoji: true })),
        answer: w.emoji,
        askText: READ_WORD,
        rightText: sayWord(w.word),
      };
    }
  }
}

/** Буквы: найти букву, слог, первую букву слова или картинку к прочитанному слову. */
export function LetterGame({ spec, phrases, onFinish }: GameProps<Kind>) {
  const [round, setRound] = useState(0);
  const [r, setR] = useState(() => makeRound(spec));
  const [wrong, setWrong] = useState<string[]>([]);
  const [solved, setSolved] = useState(false);
  const buttons = useRef<Record<string, HTMLButtonElement | null>>({});

  useEffect(() => {
    void ask(r.askText);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- задание звучит в начале раунда
  }, [round]);

  const choose = (id: string) => {
    if (solved || wrong.includes(id)) return;
    if (id !== r.answer) {
      setWrong([...wrong, id]);
      void retry(phrases).then(() => say(r.askText));
      return;
    }
    setSolved(true);
    burstAt(buttons.current[id] ?? null, 16);
    void say(r.rightText).then(() => praise(phrases));
    setTimeout(() => {
      if (round + 1 >= spec.rounds) return onFinish();
      setR(makeRound(spec, r.answer));
      setRound(round + 1);
      setWrong([]);
      setSolved(false);
    }, 2300);
  };

  return (
    <div className={`game letters ${spec.kind}`} data-testid="game-letters" data-answer={r.answer}>
      {r.show?.emoji && (
        <div className="letters-pic" aria-hidden="true">
          {r.show.emoji}
        </div>
      )}
      {r.show?.text && <div className="letters-word">{r.show.text}</div>}
      <div className="letters-options" key={round}>
        {r.options.map((o, i) => (
          <button
            key={o.id}
            type="button"
            ref={(el) => {
              buttons.current[o.id] = el;
            }}
            className={[
              'letters-option appear',
              o.emoji && 'emoji',
              wrong.includes(o.id) && 'off',
              solved && o.id === r.answer && 'picked',
            ]
              .filter(Boolean)
              .join(' ')}
            style={{ '--i': i } as React.CSSProperties}
            data-testid="letters-option"
            data-value={o.id}
            data-hint={!solved && o.id === r.answer ? '' : undefined}
            onClick={() => choose(o.id)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
