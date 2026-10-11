import type { Speech } from '@kidsplus/shared/api';
import { useEffect, useRef, useState } from 'react';
import { playSequence } from '../audio';
import { fx } from '../fx';
import { WORD_PROMPT } from '../phrases';
import { nice, praise, ru, shuffled, type GameProps } from './common';
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

/** Собери слово: буквы перетащить (или нажать по порядку) в слово под картинкой. */
export function Word({ spec, phrases, onFinish }: GameProps<'word'>) {
  const [round, setRound] = useState(0);
  const w = spec.words[round]!;
  return (
    <WordRound
      key={round}
      imageId={w.imageId}
      word={w.word}
      lang={spec.lang}
      extra={spec.extra}
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
  imageId: string;
  word: string;
  lang: 'ru' | 'en';
  extra: number;
  onSolved: () => void;
}) {
  const { word, lang } = props;
  const speech = (text: string): Speech => ({ text, lang, audioUrl: null });
  const sayWord = () => playSequence([speech(word.toLowerCase())]);
  const [tiles] = useState(() =>
    wordTiles(word, lang, props.extra).map((letter, k) => ({ letter, k })),
  );
  /** Заполненные места и использованные плитки. */
  const [filled, setFilled] = useState<Set<number>>(new Set());
  const [used, setUsed] = useState<Set<number>>(new Set());
  const slots = useRef<(HTMLDivElement | null)[]>([]);
  const solved = filled.size === word.length;

  useEffect(() => {
    void playSequence([ru(WORD_PROMPT), speech(word.toLowerCase())]);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- задание звучит один раз при показе
  }, []);

  const put = (k: number, slot: number) => {
    const next = new Set(filled).add(slot);
    nice(slots.current[slot]);
    void playSequence([speech(word[slot]!)]);
    setFilled(next);
    setUsed(new Set(used).add(k));
    if (next.size === word.length) setTimeout(() => void sayWord().then(props.onSolved), 500);
  };

  const miss = () => {
    fx.soft();
    cheer('oops');
  };

  const drop = (k: number, letter: string, p: { x: number; y: number }) => {
    const slot = slots.current.findIndex((el, i) => !filled.has(i) && inside(el, p));
    if (slot < 0) return false;
    if (word[slot] !== letter) {
      miss();
      return false;
    }
    put(k, slot);
    return true;
  };

  /** Касание буквы — она встаёт на первое пустое место, если подходит туда. */
  const tap = (k: number, letter: string) => {
    const slot = [...word].findIndex((_, i) => !filled.has(i));
    if (slot < 0) return;
    if (word[slot] !== letter) return miss();
    put(k, slot);
  };

  return (
    <div className="game word" data-testid="game-word" data-word={word}>
      <button
        type="button"
        className={solved ? 'word-picture solved' : 'word-picture'}
        aria-label="Слово"
        onClick={() => void sayWord()}
      >
        <Pic id={props.imageId} />
      </button>
      <div className="word-slots">
        {[...word].map((l, i) => (
          <div
            key={i}
            ref={(el) => {
              slots.current[i] = el;
            }}
            className={filled.has(i) ? 'word-slot filled' : 'word-slot'}
            data-testid="word-slot"
            data-letter={l}
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
              data={{ letter: t.letter }}
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
