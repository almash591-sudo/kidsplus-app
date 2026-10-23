import { describe, expect, it } from 'vitest';
import { gameSpec, type GameSpec } from './games';
import { gameLevels, MAX_LEVEL, specAtLevel, startLevel } from './levels';

const ID = '00000000-0000-4000-8000-000000000001';
const ID2 = '00000000-0000-4000-8000-000000000002';
const ID3 = '00000000-0000-4000-8000-000000000003';
const ID4 = '00000000-0000-4000-8000-000000000004';

/** Игры с минимальными параметрами — у них есть что усложнять. */
const SPECS = [
  { kind: 'counting', max: 5, rounds: 3, imageIds: [ID] },
  { kind: 'arithmetic', ops: ['plus'], max: 5, rounds: 3, imageIds: [ID] },
  { kind: 'compare', mode: 'numbers', ask: 'more', max: 5, rounds: 3 },
  { kind: 'puzzle', imageIds: [ID], cols: 2, rows: 2 },
  { kind: 'maze', heroId: ID, goalId: ID2, size: 5, rounds: 2 },
  { kind: 'balloons', count: 6, target: null },
  { kind: 'moles', imageIds: [ID], target: null, prompt: null, count: 6, speed: 'slow' },
  { kind: 'pattern', imageIds: [ID, ID2], patterns: ['AB'], rounds: 3 },
  { kind: 'shapes', shapes: ['circle', 'square'], rotate: false },
  { kind: 'shadows', imageIds: [ID, ID2, ID3], perRound: 2 },
  { kind: 'size', imageIds: [ID], count: 3 },
  { kind: 'melody', bells: 3, start: 1, goal: 3 },
  { kind: 'word', lang: 'ru', words: [{ imageId: ID, word: 'КОТ' }], extra: 0 },
  { kind: 'pitch', gap: 24, rounds: 4 },
  { kind: 'direction', notes: 3, rounds: 4 },
  { kind: 'beats', max: 3, rounds: 4 },
  { kind: 'rhythm', beats: 2, timing: false, rounds: 4 },
  { kind: 'piano', mode: 'find', keys: 3, rounds: 4 },
  { kind: 'staff', keys: 3, rounds: 4 },
  { kind: 'orchestra', players: 3, rounds: 4 },
  { kind: 'letter', letters: ['А', 'О'], choices: 2, rounds: 4 },
  { kind: 'syllable', syllables: ['МА', 'ПА'], choices: 2, rounds: 4 },
  { kind: 'clock', half: false, choices: 3, rounds: 3 },
  { kind: 'shop', imageIds: [ID], max: 5, coins: [1], rounds: 3 },
  { kind: 'robot', size: 4, steps: 3, rocks: false, rounds: 2 },
  { kind: 'space', order: 'numbers', count: 5, step: 1, reverse: false, rounds: 2 },
  { kind: 'space', order: 'letters', count: 5, step: 1, reverse: false, rounds: 2 },
  { kind: 'fishing', mode: 'numbers', max: 5, fish: 3, speed: 'slow', rounds: 4 },
  { kind: 'flight', stars: 5, clouds: 'none', speed: 'slow' },
  { kind: 'builder', height: 3, blocks: 3, hide: false, rounds: 2 },
  { kind: 'syllableWord', words: [{ imageId: ID, word: 'МА-ШИ-НА' }], extra: 0 },
  {
    kind: 'riddle',
    riddles: [
      { text: 'Кто мяукает?', name: 'кошка', imageId: ID },
      { text: 'Кто лает?', name: 'собака', imageId: ID2 },
    ],
    choices: 2,
    rounds: 2,
  },
  { kind: 'sudoku', imageIds: [ID, ID2, ID3, ID4], size: 3, blanks: 3, rounds: 2 },
  { kind: 'dots', pictures: ['star', 'fish'], hint: true },
  { kind: 'tangram', figures: ['house'], outline: true },
  { kind: 'colorNumbers', pictures: ['sun'], hint: true },
  { kind: 'dive', task: 'colors', max: 5, jellies: 'few', speed: 'slow', rounds: 3 },
  { kind: 'rocket', parts: 3, memory: false, quiz: 'sums', max: 5, asteroids: 'few', rounds: 2 },
] as const;

describe('уровни сложности (этап 34)', () => {
  it.each(SPECS.map((s) => [s.kind, s] as const))(
    '%s: на всех уровнях параметры в пределах схемы, уровень 1 — как задал родитель',
    (_, raw) => {
      const spec = gameSpec.parse(raw) as GameSpec;
      expect(specAtLevel(spec, 1)).toEqual(spec);
      for (let l = 2; l <= MAX_LEVEL; l++) {
        const harder = specAtLevel(spec, l);
        expect(gameSpec.safeParse(harder).success, `${spec.kind} уровень ${l}`).toBe(true);
      }
      expect(specAtLevel(spec, MAX_LEVEL)).not.toEqual(spec);
    },
  );

  it('счёт: до 5 → до 7 → до 9 → до 10', () => {
    const spec = gameSpec.parse(SPECS[0]) as GameSpec & { kind: 'counting' };
    expect([1, 2, 3, 4].map((l) => (specAtLevel(spec, l) as typeof spec).max)).toEqual([
      5, 7, 9, 10,
    ]);
  });

  it('уровень растёт после двух игр без ошибок, падает после многих ошибок', () => {
    const at = (m: number) => new Date(2026, 9, 20, 10, m);
    const p = (mistakes: number | null, m: number) => ({
      kind: 'counting' as const,
      mistakes,
      at: at(m),
    });
    expect(gameLevels([p(0, 1), p(0, 2)], 1)).toEqual({ counting: 2 });
    expect(gameLevels([p(0, 1), p(1, 2), p(0, 3)], 1)).toEqual({ counting: 1 });
    expect(gameLevels([p(0, 1), p(0, 2), p(0, 3), p(0, 4)], 1)).toEqual({ counting: 3 });
    expect(gameLevels([p(5, 1)], 2)).toEqual({ counting: 1 });
    // Старые прохождения без счёта ошибок не влияют.
    expect(gameLevels([p(null, 1), p(null, 2)], 2)).toEqual({});
  });

  it('старт: с 5 лет — второй уровень', () => {
    expect(startLevel(3)).toBe(1);
    expect(startLevel(5)).toBe(2);
  });
});

describe('игры этапа 41', () => {
  it('слово из слогов: только слоги через дефис', () => {
    const ok = (word: string) =>
      gameSpec.safeParse({ kind: 'syllableWord', words: [{ imageId: ID, word }] }).success;
    expect(ok('ма-ши-на')).toBe(true);
    expect(ok('МАШИНА')).toBe(false);
    expect(ok('МА--НА')).toBe(false);
  });

  it('судоку: картинок не меньше, чем клеток в строке; 4 × 4 — только с 4 картинками', () => {
    const base = { kind: 'sudoku', blanks: 3, rounds: 1 } as const;
    expect(gameSpec.safeParse({ ...base, imageIds: [ID, ID2, ID3], size: 4 }).success).toBe(false);
    const three = gameSpec.parse({ ...base, imageIds: [ID, ID2, ID3], size: 3 }) as GameSpec;
    expect(specAtLevel(three, MAX_LEVEL)).toMatchObject({ size: 3, blanks: 6 });
  });

  it('этап 42: со второго уровня — без подсказок и без контуров деталей', () => {
    const dots = gameSpec.parse({ kind: 'dots', pictures: ['star'] }) as GameSpec;
    expect(dots).toMatchObject({ hint: true });
    expect(specAtLevel(dots, 2)).toMatchObject({ hint: false });
    const tangram = gameSpec.parse({ kind: 'tangram', figures: ['car'] }) as GameSpec;
    expect(specAtLevel(tangram, 2)).toMatchObject({ outline: false });
    expect(gameSpec.safeParse({ kind: 'colorNumbers', pictures: [] }).success).toBe(false);
  });

  it('подводное плавание (этап 43): цифры до большего, медуз больше, потом вперемешку', () => {
    const dive = gameSpec.parse({ kind: 'dive', max: 5, rounds: 3 }) as GameSpec;
    expect(dive).toMatchObject({ task: 'colors', jellies: 'few', speed: 'slow' });
    expect(specAtLevel(dive, 2)).toMatchObject({ max: 7, jellies: 'many', task: 'colors' });
    expect(specAtLevel(dive, 3)).toMatchObject({ max: 9, task: 'mixed', speed: 'normal' });
    expect(gameSpec.safeParse({ kind: 'dive', max: 11, rounds: 3 }).success).toBe(false);
  });

  it('ракета (этап 43): больше деталей, со второго шага — по памяти', () => {
    const rocket = gameSpec.parse({ kind: 'rocket', parts: 3, max: 5, rounds: 2 }) as GameSpec;
    expect(rocket).toMatchObject({ memory: false, quiz: 'numbers', asteroids: 'few' });
    expect(specAtLevel(rocket, 2)).toMatchObject({ parts: 4, memory: false, max: 7 });
    expect(specAtLevel(rocket, 3)).toMatchObject({ parts: 5, memory: true, max: 9, rounds: 4 });
    expect(gameSpec.safeParse({ kind: 'rocket', parts: 6, max: 5, rounds: 2 }).success).toBe(false);
  });
});
