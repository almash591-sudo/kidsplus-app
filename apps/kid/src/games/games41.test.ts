import { RIDDLE_SETS, SYLLABLE_WORD_SETS } from '@kidsplus/shared/game-presets';
import { gameSpec, SYLLABLE_WORD_RE } from '@kidsplus/shared/games';
import { describe, expect, it } from 'vitest';
import { gamePhrases, riddleAnswer, syllableWhole } from '../phrases';
import { riddleRounds } from './Riddle';
import { countSolutions, latinSquare, makeSudoku, maxBlanks } from './sudokuGen';
import { syllableTiles } from './Word';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

describe('судоку-малыш (этап 41)', () => {
  it('латинский квадрат: в каждой строке и столбце все картинки по разу', () => {
    for (const size of [3, 4]) {
      const sq = latinSquare(size);
      for (let k = 0; k < size; k++) {
        expect(new Set(sq[k]).size).toBe(size);
        expect(new Set(sq.map((row) => row[k])).size).toBe(size);
      }
    }
  });

  it('пустые клетки — так, чтобы решение было одно', () => {
    for (let t = 0; t < 30; t++) {
      for (const size of [3, 4]) {
        const s = makeSudoku(size, maxBlanks(size));
        expect(s.holes.size).toBeGreaterThan(0);
        expect(s.holes.size).toBeLessThanOrEqual(maxBlanks(size));
        const grid = s.solution.map((row, r) =>
          row.map((v, c) => (s.holes.has(r * size + c) ? -1 : v)),
        );
        expect(countSolutions(grid)).toBe(1);
      }
    }
  });

  it('просили 3 пустые — их 3', () => {
    expect(makeSudoku(3, 3).holes.size).toBe(3);
    expect(makeSudoku(4, 5).holes.size).toBe(5);
  });
});

describe('слово из слогов (этап 41)', () => {
  it('слоги слова и лишние, которых в слове нет', () => {
    const tiles = syllableTiles(['МА', 'ШИ', 'НА'], 2);
    expect(tiles).toHaveLength(5);
    expect(tiles).toEqual(expect.arrayContaining(['МА', 'ШИ', 'НА']));
    expect(tiles.filter((t) => t === 'МА')).toHaveLength(1);
  });

  it('звучит слог и всё слово; всё озвучено заранее', () => {
    expect(syllableWhole('МА-ШИ-НА')).toBe('машина!');
    const phrases = gamePhrases(
      gameSpec.parse({ kind: 'syllableWord', words: [{ imageId: id(1), word: 'МА-ШИ-НА' }] }),
    );
    expect(phrases).toEqual(expect.arrayContaining(['машина!', 'ма!', 'ши!', 'на!']));
  });

  it('готовые слова проходят схему', () => {
    for (const set of SYLLABLE_WORD_SETS)
      for (const w of set.words) expect(SYLLABLE_WORD_RE.test(w.word), w.word).toBe(true);
  });
});

describe('загадки (этап 41)', () => {
  const riddles = [1, 2, 3, 4, 5].map((n) => ({
    text: `загадка ${n}`,
    name: `отгадка ${n}`,
    imageId: id(n),
  }));

  it('разные загадки; среди вариантов — отгадка, все варианты разные', () => {
    const rounds = riddleRounds(riddles, 4, 3);
    expect(rounds).toHaveLength(4);
    expect(new Set(rounds.map((r) => r.riddle.imageId)).size).toBe(4);
    for (const r of rounds) {
      expect(r.options).toHaveLength(3);
      expect(r.options).toContain(r.riddle.imageId);
      expect(new Set(r.options).size).toBe(3);
    }
    expect(riddleRounds(riddles, 12, 4)).toHaveLength(5);
  });

  it('загадка и «Это …!» озвучены заранее', () => {
    const phrases = gamePhrases(
      gameSpec.parse({ kind: 'riddle', riddles: riddles.slice(0, 2), rounds: 2 }),
    );
    expect(phrases).toEqual(expect.arrayContaining(['загадка 1', riddleAnswer('отгадка 2')]));
  });

  it('готовые загадки проходят схему; отгадки в теме не повторяются', () => {
    for (const set of RIDDLE_SETS) {
      const spec = gameSpec.safeParse({
        kind: 'riddle',
        riddles: set.riddles.map((r, i) => ({ text: r.text, name: r.name, imageId: id(i + 1) })),
        rounds: 5,
      });
      expect(spec.success, set.title).toBe(true);
      expect(new Set(set.riddles.map((r) => r.code)).size).toBe(set.riddles.length);
    }
  });
});
