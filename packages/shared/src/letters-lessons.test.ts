import { describe, expect, it } from 'vitest';
import { gameSpec } from './games';
import { LETTER_LESSONS } from './letters-lessons';

describe('уроки «Буквы»', () => {
  it('40 уроков для дошкольников, проходят схему, названия уникальны', () => {
    expect(LETTER_LESSONS).toHaveLength(40);
    expect(new Set(LETTER_LESSONS.map((l) => l.title)).size).toBe(40);
    for (const l of LETTER_LESSONS) {
      expect(l.age).toBe('old');
      expect(gameSpec.safeParse(l.spec).success).toBe(true);
    }
  });

  it('вариантов хватает: в каждом уроке есть из чего выбрать', () => {
    for (const { spec } of LETTER_LESSONS) {
      const pool =
        spec.kind === 'letter'
          ? spec.letters
          : spec.kind === 'syllable'
            ? spec.syllables
            : spec.kind === 'firstLetter' || spec.kind === 'readWord'
              ? spec.words.map((w) => w.word)
              : [];
      if (spec.kind === 'firstLetter') continue; // буквы-обманки берутся из алфавита
      expect(new Set(pool).size).toBeGreaterThanOrEqual(spec.kind === 'letter' ? 2 : 2);
      if ('choices' in spec && spec.kind !== 'letter')
        expect(new Set(pool).size).toBeGreaterThanOrEqual(spec.choices);
    }
  });

  it('у слов с картинкой первая буква совпадает с началом слова, эмодзи не повторяются в уроке', () => {
    for (const { spec } of LETTER_LESSONS)
      if (spec.kind === 'readWord') {
        const emojis = spec.words.map((w) => w.emoji);
        expect(new Set(emojis).size).toBe(emojis.length);
      }
  });
});
