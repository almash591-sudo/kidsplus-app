import { useEffect, useRef, useState } from 'react';
import {
  SOUND_PLACES,
  soundPlace,
  syllablesIn,
  wordScheme,
  type SchemeChip,
} from '@kidsplus/shared/sounds';
import {
  findLetter,
  findSyllable,
  firstLetterAsk,
  firstLetterIs,
  GAME_INTRO,
  isLetter,
  PICK_WORD,
  READ_PHRASE,
  READ_WORD,
  sayWord,
  schemeAsk,
  schemeIs,
  soundAsk,
  soundIs,
  syllablesAre,
  syllablesAsk,
} from '../../phrases';
import { ask, praise, retry, say, shuffled, type GameProps, type SpecOf } from '../common';
import { burstAt } from '../juice';
import './letters.css';

type Kind =
  | 'letter'
  | 'syllable'
  | 'firstLetter'
  | 'readWord'
  | 'syllableCount'
  | 'soundPlace'
  | 'wordScheme'
  | 'pickWord'
  | 'readPhrase';
type Spec = SpecOf<Kind>;

const ALPHABET = [...'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЭЮЯ'];
/** Игры на слух (этап 49): в первом раунде совёнок сначала объясняет, как играть. */
const WITH_INTRO: Kind[] = ['syllableCount', 'soundPlace', 'wordScheme'];

/** Клетка схемы на кнопке: место звука (on/off) или фишка звука (v — гласный, c — согласный). */
export interface SchemeCell {
  cls: 'on' | 'off' | SchemeChip;
  text?: string;
}

export interface LetterRound {
  /** Чем раунд отличается от прошлого (слово, буква) — чтобы не повторять его подряд. */
  key: string;
  /** Что показать сверху: эмодзи-картинку или написанное слово; null — только голос. */
  show: { emoji?: string; text?: string } | null;
  /** Варианты: буква, слог, слово, эмодзи, хлопки или схема из клеток. */
  options: { id: string; label: string; emoji?: boolean; scheme?: SchemeCell[] }[];
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

/** Сначала похожие, а не хватит — другие из урока. */
function withSimilar(
  answer: string,
  similar: readonly string[],
  pool: readonly string[],
  choices: number,
): string[] {
  const near = shuffled(similar.filter((x) => x !== answer)).slice(0, choices - 1);
  const rest = shuffled(pool.filter((x) => x !== answer && !near.includes(x)));
  return shuffled([answer, ...near, ...rest].slice(0, choices));
}

/** Схемы той же длины, что ответ, — с одной-двумя фишками другого цвета. */
export function schemeDistractors(answer: readonly SchemeChip[]): string[] {
  const flip = (s: SchemeChip[], i: number) =>
    s.map((c, j) => (j === i ? (c === 'v' ? 'c' : 'v') : c));
  const out = new Set<string>();
  answer.forEach((_, i) => {
    out.add(flip([...answer], i).join(''));
    for (let j = i + 1; j < answer.length; j++) out.add(flip(flip([...answer], i), j).join(''));
  });
  out.delete(answer.join(''));
  return shuffled([...out]);
}

const claps = (n: number) => '👏'.repeat(n);

export function makeRound(spec: Spec, prevKey?: string): LetterRound {
  switch (spec.kind) {
    case 'letter': {
      const a = pick(spec.letters, prevKey);
      const pool = spec.letters.length >= spec.choices ? spec.letters : ALPHABET;
      return {
        key: a,
        show: null,
        options: withDistractors(a, pool, spec.choices).map((l) => ({ id: l, label: l })),
        answer: a,
        askText: findLetter(a),
        rightText: isLetter(a),
      };
    }
    case 'syllable': {
      const a = pick(spec.syllables, prevKey);
      return {
        key: a,
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
        spec.words.find((x) => x.word === prevKey),
      );
      const a = w.word[0]!;
      const pool = [...spec.words.map((x) => x.word[0]!), ...ALPHABET];
      return {
        key: w.word,
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
        spec.words.find((x) => x.word === prevKey),
      );
      const emojis = withDistractors(
        w.emoji,
        spec.words.map((x) => x.emoji),
        spec.choices,
      );
      return {
        key: w.word,
        show: { text: w.word },
        options: emojis.map((e) => ({ id: e, label: e, emoji: true })),
        answer: w.emoji,
        askText: READ_WORD,
        rightText: sayWord(w.word),
      };
    }
    case 'syllableCount': {
      const w = pick(
        spec.words,
        spec.words.find((x) => x.word === prevKey),
      );
      const n = syllablesIn(w.word);
      // Сначала числа слогов из урока, не хватит — до четырёх; кнопки по порядку: 👏, 👏👏…
      const inLesson = [...new Set(spec.words.map((x) => syllablesIn(x.word)))];
      const pool = [...inLesson, ...[1, 2, 3, 4].filter((x) => !inLesson.includes(x))];
      const others = shuffled(inLesson.filter((x) => x !== n))
        .concat(pool.slice(inLesson.length))
        .slice(0, spec.choices - 1);
      return {
        key: w.word,
        show: { emoji: w.emoji },
        options: [n, ...others]
          .sort((a, b) => a - b)
          .map((x) => ({ id: String(x), label: claps(x), emoji: true })),
        answer: String(n),
        askText: syllablesAsk(w.word),
        rightText: syllablesAre(w.word, n),
      };
    }
    case 'soundPlace': {
      const w = pick(
        spec.words,
        spec.words.find((x) => x.word === prevKey),
      );
      const place = soundPlace(w.word, spec.sound) ?? 'start';
      return {
        key: w.word,
        show: { emoji: w.emoji },
        options: SOUND_PLACES.map((p) => ({
          id: p,
          label: '',
          scheme: SOUND_PLACES.map((q) =>
            q === p ? { cls: 'on' as const, text: spec.sound } : { cls: 'off' as const },
          ),
        })),
        answer: place,
        askText: soundAsk(spec.sound, w.word),
        rightText: soundIs(spec.sound, w.word, place),
      };
    }
    case 'wordScheme': {
      const w = pick(
        spec.words,
        spec.words.find((x) => x.word === prevKey),
      );
      const chips = wordScheme(w.word) ?? [];
      const answer = chips.join('');
      const ids = shuffled([answer, ...schemeDistractors(chips).slice(0, spec.choices - 1)]);
      return {
        key: w.word,
        show: { emoji: w.emoji },
        options: ids.map((id) => ({
          id,
          label: '',
          scheme: [...id].map((c) => ({ cls: c as SchemeChip })),
        })),
        answer,
        askText: schemeAsk(w.word),
        rightText: schemeIs(w.word, chips),
      };
    }
    case 'pickWord': {
      const item = pick(
        spec.items,
        spec.items.find((x) => x.word === prevKey),
      );
      const words = withSimilar(
        item.word,
        item.similar,
        spec.items.map((x) => x.word),
        spec.choices,
      );
      return {
        key: item.word,
        show: { emoji: item.emoji },
        options: words.map((x) => ({ id: x, label: x })),
        answer: item.word,
        askText: PICK_WORD,
        rightText: sayWord(item.word),
      };
    }
    case 'readPhrase': {
      const item = pick(
        spec.items,
        spec.items.find((x) => x.text === prevKey),
      );
      const emojis = withSimilar(
        item.emoji,
        item.similar,
        spec.items.map((x) => x.emoji),
        spec.choices,
      );
      return {
        key: item.text,
        show: { text: item.text },
        options: emojis.map((e) => ({ id: e, label: e, emoji: true })),
        answer: item.emoji,
        askText: READ_PHRASE,
        rightText: sayWord(item.text),
      };
    }
  }
}

/**
 * Буквы: найти букву, слог, первую букву слова, картинку к прочитанному слову или фразе,
 * слово к картинке; сосчитать слоги, найти место звука и звуковую схему слова.
 */
export function LetterGame({ spec, phrases, onFinish }: GameProps<Kind>) {
  const [round, setRound] = useState(0);
  const [r, setR] = useState(() => makeRound(spec));
  const [wrong, setWrong] = useState<string[]>([]);
  const [solved, setSolved] = useState(false);
  const buttons = useRef<Record<string, HTMLButtonElement | null>>({});

  useEffect(() => {
    if (round === 0 && WITH_INTRO.includes(spec.kind)) void ask(GAME_INTRO[spec.kind], r.askText);
    else void ask(r.askText);
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
      setR(makeRound(spec, r.key));
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
              o.scheme && 'scheme',
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
            {o.scheme
              ? o.scheme.map((c, j) => (
                  <span key={j} className={`letters-cell ${c.cls}`}>
                    {c.text}
                  </span>
                ))
              : o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
