// Этап 49: «Буквы» — звуки и чтение: раунды, варианты и всё, что озвучивается заранее.
import { gameSpec } from '@kidsplus/shared/games';
import { LETTER_LESSONS } from '@kidsplus/shared/letters-lessons';
import { specAtLevel } from '@kidsplus/shared/levels';
import { describe, expect, it } from 'vitest';
import { gamePhrases } from '../phrases';
import type { SpecOf } from './common';
import { makeRound, schemeDistractors } from './letters/LetterGame';

type Kind = 'syllableCount' | 'soundPlace' | 'wordScheme' | 'pickWord' | 'readPhrase';
const spec = <K extends Kind>(s: object) => gameSpec.parse(s) as SpecOf<K>;
const school = LETTER_LESSONS.slice(40).map((l) => l.spec as SpecOf<Kind>);

/** Раунды подряд, как в игре: каждый следующий не повторяет прошлое слово. */
function rounds(s: SpecOf<Kind>, n = 30) {
  const out = [makeRound(s)];
  while (out.length < n) out.push(makeRound(s, out.at(-1)!.key));
  return out;
}

describe('раунды игр на звуки и чтение', () => {
  it('в каждом раунде ответ среди вариантов, варианты разные, слово не повторяется подряд', () => {
    for (const s of school)
      for (const lvl of [1, 2, 3, 4]) {
        const at = specAtLevel(s, lvl) as SpecOf<Kind>;
        const rs = rounds(at);
        rs.forEach((r, i) => {
          const ids = r.options.map((o) => o.id);
          expect(ids).toContain(r.answer);
          expect(new Set(ids).size).toBe(ids.length);
          expect(ids).toHaveLength(at.kind === 'soundPlace' ? 3 : at.choices);
          if (i > 0) expect(r.key).not.toBe(rs[i - 1]!.key);
        });
      }
  });

  it('«Сколько слогов?»: хлопки по порядку, сначала числа слогов из урока', () => {
    const s = spec<'syllableCount'>({
      kind: 'syllableCount',
      words: [
        { emoji: '🐱', word: 'КОТ' },
        { emoji: '🌙', word: 'ЛУНА' },
      ],
      choices: 2,
      rounds: 4,
    });
    for (const r of rounds(s, 10)) {
      expect(r.options.map((o) => o.id)).toEqual(['1', '2']);
      expect(r.options.map((o) => o.label)).toEqual(['👏', '👏👏']);
      expect(r.answer).toBe(r.key === 'КОТ' ? '1' : '2');
    }
    const r = makeRound({ ...s, choices: 4 });
    expect(r.options.map((o) => o.id)).toEqual(['1', '2', '3', '4']);
    expect(r.rightText).toMatch(/^(кот — один слог|луна — два слога)!$/);
  });

  it('«Где звук?»: три схемы, буква — в своей клетке, ответ — место звука', () => {
    const s = spec<'soundPlace'>({
      kind: 'soundPlace',
      sound: 'С',
      words: [
        { emoji: '🧃', word: 'СОК' },
        { emoji: '🦊', word: 'ЛИСА' },
        { emoji: '👃', word: 'НОС' },
      ],
      rounds: 6,
    });
    const want: Record<string, string> = { СОК: 'start', ЛИСА: 'middle', НОС: 'end' };
    for (const r of rounds(s, 12)) {
      expect(r.answer).toBe(want[r.key]);
      expect(r.options.map((o) => o.id)).toEqual(['start', 'middle', 'end']);
      r.options.forEach((o, i) =>
        expect(o.scheme!.map((c) => c.cls)).toEqual(['off', 'off', 'off'].with(i, 'on')),
      );
      expect(r.askText).toBe(`Где звук ссс в слове ${r.key.toLowerCase()}?`);
    }
  });

  it('«Звуковая схема»: обманки той же длины, отличаются одной-двумя фишками', () => {
    const d = schemeDistractors(['c', 'v', 'c']);
    expect(d.sort()).toEqual(['ccc', 'ccv', 'cvv', 'vcc', 'vvc', 'vvv']);
    const s = spec<'wordScheme'>({
      kind: 'wordScheme',
      words: [
        { emoji: '🐱', word: 'КОТ' },
        { emoji: '🦆', word: 'УТКА' },
      ],
      choices: 3,
      rounds: 4,
    });
    for (const r of rounds(s, 10)) {
      expect(r.answer).toBe(r.key === 'КОТ' ? 'cvc' : 'vccv');
      for (const o of r.options) expect(o.scheme).toHaveLength(r.key.length);
    }
  });

  it('«Какое слово?» и «Прочитай фразу»: сначала похожие, не хватит — другие из урока', () => {
    const words = spec<'pickWord'>({
      kind: 'pickWord',
      items: [
        { emoji: '🧃', word: 'СОК', similar: ['СОН'] },
        { emoji: '🐱', word: 'КОТ', similar: ['КИТ'] },
      ],
      choices: 3,
      rounds: 4,
    });
    for (const r of rounds(words, 10)) {
      const ids = r.options.map((o) => o.id).sort();
      expect(ids).toEqual((r.key === 'СОК' ? ['СОК', 'СОН', 'КОТ'] : ['КОТ', 'КИТ', 'СОК']).sort());
    }
    const phrase = spec<'readPhrase'>({
      kind: 'readPhrase',
      items: [
        { text: 'ДВА ГРИБА', emoji: '🍄🍄', similar: ['🍄🍄🍄', '🍄'] },
        { text: 'КОТ И МЯЧ', emoji: '🐱⚽', similar: ['🐱🎈', '🐶⚽'] },
      ],
      choices: 3,
      rounds: 4,
    });
    for (const r of rounds(phrase, 10)) {
      expect(r.show?.text).toBe(r.key);
      expect(r.options.map((o) => o.id).sort()).toEqual(
        (r.key === 'ДВА ГРИБА' ? ['🍄🍄', '🍄🍄🍄', '🍄'] : ['🐱⚽', '🐱🎈', '🐶⚽']).sort(),
      );
      expect(r.rightText).toBe(`${r.key.toLowerCase()}!`);
    }
  });

  it('всё, что скажет совёнок, есть в озвучке заранее', () => {
    for (const s of school) {
      const all = new Set(gamePhrases(s));
      for (const r of rounds(s, 40)) {
        expect(all.has(r.askText), r.askText).toBe(true);
        expect(all.has(r.rightText), r.rightText).toBe(true);
      }
    }
  });
});
