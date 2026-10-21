import type { Speech } from '@kidsplus/shared/api';
import { useEffect, useRef, useState } from 'react';
import { playSequence } from '../audio';
import { fx } from '../fx';
import {
  EXTRA_SYLLABLES,
  sayWord as syllableSay,
  SYLLABLE_WORD_PROMPT,
  syllableWhole,
  WORD_PROMPT,
} from '../phrases';
import { askSpeech, bump, nice, praise, ru, shuffled, type GameProps } from './common';
import { DragItem, Pic } from './DragItem';
import { cheer } from './juice';
import { inside } from './useDrag';

const ALPHABET = {
  // Лишние буквы — без Й, Ъ, Ы, Ь: с них слова не начинаются, малышей они только путают.
  ru: 'АБВГДЕЁЖЗИКЛМНОПРСТУФХЦЧШЩЭЮЯ',
  en: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
} as const;

/** Буквы для раунда: буквы слова и extra лишних (которых в слове нет), перемешаны. */
export function wordTiles(word: string, lang: 'ru' | 'en', extra: number, rnd = Math.random) {
  const pool = [...ALPHABET[lang]].filter((l) => !word.includes(l));
  const add = Array.from(
    { length: extra },
    () => pool.splice(Math.floor(rnd() * pool.length), 1)[0]!,
  );
  return shuffled([...word, ...add]);
}

/** Слоги для раунда (этап 41): слоги слова и extra лишних (не из слова), перемешаны. */
export function syllableTiles(parts: string[], extra: number, rnd = Math.random) {
  const pool = EXTRA_SYLLABLES.filter((s) => !parts.includes(s));
  const add = Array.from(
    { length: extra },
    () => pool.splice(Math.floor(rnd() * pool.length), 1)[0]!,
  );
  return shuffled([...parts, ...add]);
}

/** Собери слово: буквы перетащить (или нажать по порядку) в слово под картинкой. */
export function Word({ spec, phrases, onFinish }: GameProps<'word'>) {
  const [round, setRound] = useState(0);
  const w = spec.words[round]!;
  const { lang } = spec;
  const speech = (text: string): Speech => ({ text, lang, audioUrl: null });
  return (
    <WordRound
      key={round}
      kind="word"
      imageId={w.imageId}
      word={w.word}
      parts={[...w.word]}
      tiles={() => wordTiles(w.word, lang, spec.extra)}
      prompt={[ru(WORD_PROMPT), speech(w.word.toLowerCase())]}
      part={(l) => speech(l)}
      whole={speech(w.word.toLowerCase())}
      onSolved={() => {
        void praise(phrases);
        setTimeout(() => {
          if (round + 1 < spec.words.length) setRound(round + 1);
          else onFinish();
        }, 2000);
      }}
    />
  );
}

/**
 * Слово из слогов (этап 41): «МА-ШИ-НА» — слоги перетащить (или нажать по порядку) под картинку;
 * каждый слог звучит, в конце — всё слово.
 */
export function SyllableWord({ spec, phrases, onFinish }: GameProps<'syllableWord'>) {
  const [round, setRound] = useState(0);
  const w = spec.words[round]!;
  const parts = w.word.split('-');
  return (
    <WordRound
      key={round}
      kind="syllableWord"
      imageId={w.imageId}
      word={w.word}
      parts={parts}
      tiles={() => syllableTiles(parts, spec.extra)}
      prompt={[ru(SYLLABLE_WORD_PROMPT), ru(syllableWhole(w.word))]}
      part={(s) => ru(syllableSay(s))}
      whole={ru(syllableWhole(w.word))}
      onSolved={() => {
        void praise(phrases);
        setTimeout(() => {
          if (round + 1 < spec.words.length) setRound(round + 1);
          else onFinish();
        }, 2000);
      }}
    />
  );
}

function WordRound(props: {
  kind: 'word' | 'syllableWord';
  imageId: string;
  word: string;
  /** Что ставить по местам: буквы или слоги. */
  parts: string[];
  tiles: () => string[];
  prompt: Speech[];
  part: (p: string) => Speech;
  whole: Speech;
  onSolved: () => void;
}) {
  const { word, parts } = props;
  const sayWord = () => playSequence([props.whole]);
  const [tiles] = useState(() => props.tiles().map((letter, k) => ({ letter, k })));
  /** Заполненные места и использованные плитки. */
  const [filled, setFilled] = useState<Set<number>>(new Set());
  const [used, setUsed] = useState<Set<number>>(new Set());
  const slots = useRef<(HTMLDivElement | null)[]>([]);
  const solved = filled.size === parts.length;

  useEffect(() => {
    void askSpeech(props.prompt);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- задание звучит один раз при показе
  }, []);

  const put = (k: number, slot: number) => {
    const next = new Set(filled).add(slot);
    nice(slots.current[slot]);
    void playSequence([props.part(parts[slot]!)]);
    setFilled(next);
    setUsed(new Set(used).add(k));
    if (next.size === parts.length) setTimeout(() => void sayWord().then(props.onSolved), 500);
  };

  const miss = () => {
    // Слоги — задача на чтение: промах считается для уровня (буквы — как раньше).
    if (props.kind === 'syllableWord') bump();
    else fx.soft();
    cheer('oops');
  };

  const drop = (k: number, letter: string, p: { x: number; y: number }) => {
    const slot = slots.current.findIndex((el, i) => !filled.has(i) && inside(el, p));
    if (slot < 0) return false;
    if (parts[slot] !== letter) {
      miss();
      return false;
    }
    put(k, slot);
    return true;
  };

  /** Касание буквы — она встаёт на первое пустое место, если подходит туда. */
  const tap = (k: number, letter: string) => {
    const slot = parts.findIndex((_, i) => !filled.has(i));
    if (slot < 0) return;
    if (parts[slot] !== letter) return miss();
    put(k, slot);
  };

  /** Подсказка: какую букву взять и куда положить. */
  const hintSlot = parts.findIndex((_, i) => !filled.has(i));
  const hint = tiles.find((t) => !used.has(t.k) && t.letter === parts[hintSlot]);
  const syl = props.kind === 'syllableWord';

  return (
    <div
      className={syl ? 'game word syllables' : 'game word'}
      data-testid={`game-${props.kind}`}
      data-word={word}
    >
      <button
        type="button"
        className={solved ? 'word-picture solved' : 'word-picture'}
        aria-label="Слово"
        onClick={() => void sayWord()}
      >
        <Pic id={props.imageId} />
      </button>
      <div className="word-slots">
        {parts.map((l, i) => (
          <div
            key={i}
            ref={(el) => {
              slots.current[i] = el;
            }}
            className={filled.has(i) ? 'word-slot filled' : 'word-slot'}
            data-testid="word-slot"
            data-letter={l}
            data-hint-target={i === hintSlot ? '' : undefined}
          >
            <span className={filled.has(i) ? 'word-letter' : 'word-ghost'}>{l}</span>
          </div>
        ))}
      </div>
      <div className="word-tiles">
        {tiles
          .filter((t) => !used.has(t.k))
          .map((t, i) => (
            <DragItem
              key={t.k}
              className="word-tile appear"
              testId="word-tile"
              data={{ letter: t.letter, ...(t === hint && { hint: '' }) }}
              style={{ '--i': i } as React.CSSProperties}
              onTap={() => tap(t.k, t.letter)}
              onDrop={(p) => drop(t.k, t.letter, p)}
            >
              {t.letter}
            </DragItem>
          ))}
      </div>
    </div>
  );
}
