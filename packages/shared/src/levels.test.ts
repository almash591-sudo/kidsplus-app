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
  { kind: 'balloons', count: 6, letters: { find: 'О', others: ['А', 'У'], lower: false } },
  { kind: 'tracing', shapes: ['О', 'о'], guides: ['dots'] },
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
  { kind: 'letter', letters: ['А', 'О'], choices: 2, rounds: 4, letterCase: 'lower' },
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
  { kind: 'race', quiz: 'numbers', max: 5, gates: 4, rivals: true, cones: 'few', speed: 'slow' },
  { kind: 'differences', scenes: ['sea'], count: 3, rounds: 2, hint: true },
  { kind: 'paints', colors: ['orange'], tubes: 'needed', guess: false, rounds: 3 },
  { kind: 'train', task: 'tickets', look: 'dots', max: 3, wagons: 3, rounds: 3 },
  { kind: 'scales', tasks: ['compare'], look: 'cubes', max: 5, rounds: 4 },
  { kind: 'dress', weathers: ['rain', 'sun'], items: 1, tasks: ['dress'], rounds: 3 },
  { kind: 'figure', figures: ['house', 'fish'], pieces: 2, outlines: true, turn: false, rounds: 3 },
  { kind: 'bot', tasks: ['go'], steps: 2, turns: 0, blocks: false, rounds: 3 },
  { kind: 'cuckoo', tasks: ['read'], half: false, rounds: 3 },
  { kind: 'gears', tasks: ['build'], gaps: 2, sizes: false, rounds: 3 },
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

  it('гонки (этап 43): ответы до большего, ворот и конусов больше, потом быстрее', () => {
    const race = gameSpec.parse({ kind: 'race', max: 3, gates: 4 }) as GameSpec;
    expect(race).toMatchObject({ quiz: 'colors', rivals: true, cones: 'few', speed: 'slow' });
    expect(specAtLevel(race, 2)).toMatchObject({ max: 5, gates: 5, cones: 'many', speed: 'slow' });
    expect(specAtLevel(race, 3)).toMatchObject({ max: 7, gates: 6, speed: 'normal' });
    expect(gameSpec.safeParse({ kind: 'race', max: 5, gates: 11 }).success).toBe(false);
  });

  it('найди отличия (этап 43): больше отличий, потом без лупы и больше картинок', () => {
    const diff = gameSpec.parse({ kind: 'differences', count: 3, rounds: 1 }) as GameSpec;
    expect(diff).toMatchObject({ scenes: ['meadow', 'forest', 'sea', 'space'], hint: true });
    expect(specAtLevel(diff, 2)).toMatchObject({ count: 4, hint: false, rounds: 1 });
    expect(specAtLevel(diff, 4)).toMatchObject({ count: 6, rounds: 3 });
    expect(gameSpec.safeParse({ kind: 'differences', count: 8, rounds: 1 }).success).toBe(false);
    expect(
      gameSpec.safeParse({ kind: 'differences', scenes: [], count: 3, rounds: 1 }).success,
    ).toBe(false);
  });

  it('краски (этап 57): все основные тюбики → оттенки с белым и «угадай» → все четыре и коричневый', () => {
    const paints = gameSpec.parse({ kind: 'paints', rounds: 3 }) as GameSpec;
    expect(paints).toMatchObject({
      colors: ['orange', 'green', 'purple'],
      tubes: 'needed',
      guess: false,
    });
    expect(specAtLevel(paints, 2)).toMatchObject({ tubes: 'primary', guess: false, rounds: 4 });
    expect(specAtLevel(paints, 3)).toMatchObject({
      tubes: 'primary',
      guess: true,
      colors: ['orange', 'green', 'purple', 'pink', 'lightblue'],
    });
    expect(specAtLevel(paints, 4)).toMatchObject({
      tubes: 'all',
      colors: ['orange', 'green', 'purple', 'pink', 'lightblue', 'brown'],
      rounds: 6,
    });
    // Родитель уже поставил все тюбики — легче не становится.
    const all = gameSpec.parse({ kind: 'paints', tubes: 'all', rounds: 2 }) as GameSpec;
    expect(specAtLevel(all, 2)).toMatchObject({ tubes: 'all' });
    expect(gameSpec.safeParse({ kind: 'paints', colors: [], rounds: 3 }).success).toBe(false);
    expect(gameSpec.safeParse({ kind: 'paints', rounds: 9 }).success).toBe(false);
  });

  it('поезд (этап 57): точки → цифры → посчитай; вагонов больше; «потерялся вагон»; до десяти', () => {
    const train = gameSpec.parse({ kind: 'train', rounds: 3 }) as GameSpec;
    expect(train).toMatchObject({ task: 'tickets', look: 'dots', max: 3, wagons: 3 });
    expect(specAtLevel(train, 2)).toMatchObject({ look: 'digits', max: 5, wagons: 4 });
    expect(specAtLevel(train, 3)).toMatchObject({
      look: 'count',
      max: 7,
      wagons: 5,
      task: 'mixed',
    });
    expect(specAtLevel(train, 4)).toMatchObject({ look: 'count', max: 10, wagons: 5 });
    // Только «потерялся вагон» — так и остаётся.
    const lost = gameSpec.parse({ kind: 'train', task: 'missing', rounds: 2 }) as GameSpec;
    expect(specAtLevel(lost, 3)).toMatchObject({ task: 'missing' });
    expect(gameSpec.safeParse({ kind: 'train', wagons: 6, rounds: 3 }).success).toBe(false);
    expect(gameSpec.safeParse({ kind: 'train', rounds: 7 }).success).toBe(false);
  });

  it('весы (этап 57): кубики → точки → цифры; «уравновесь», потом «сложи»; до десяти', () => {
    const scales = gameSpec.parse({ kind: 'scales', rounds: 4 }) as GameSpec;
    expect(scales).toMatchObject({ tasks: ['compare'], look: 'cubes', max: 5 });
    expect(specAtLevel(scales, 2)).toMatchObject({
      tasks: ['compare', 'balance'],
      look: 'dots',
      max: 6,
    });
    expect(specAtLevel(scales, 3)).toMatchObject({
      tasks: ['compare', 'balance', 'sum'],
      look: 'digits',
      max: 7,
    });
    expect(specAtLevel(scales, 4)).toMatchObject({ look: 'digits', max: 10 });
    // Только «сложи» — к нему добавляются остальные по порядку.
    const sum = gameSpec.parse({ kind: 'scales', tasks: ['sum'], rounds: 3 }) as GameSpec;
    expect(specAtLevel(sum, 2)).toMatchObject({ tasks: ['balance', 'sum'] });
    expect(gameSpec.safeParse({ kind: 'scales', tasks: [], rounds: 3 }).success).toBe(false);
    expect(gameSpec.safeParse({ kind: 'scales', max: 11, rounds: 3 }).success).toBe(false);
    expect(gameSpec.safeParse({ kind: 'scales', rounds: 9 }).success).toBe(false);
  });

  it('шестерёнки (этап 57): больше шестерёнок, разного размера, потом «в какую сторону»', () => {
    const gears = gameSpec.parse({ kind: 'gears', rounds: 3 }) as GameSpec;
    expect(gears).toMatchObject({ tasks: ['build'], gaps: 2, sizes: false });
    expect(specAtLevel(gears, 2)).toMatchObject({ tasks: ['build'], gaps: 3, sizes: false });
    expect(specAtLevel(gears, 3)).toMatchObject({ gaps: 3, sizes: true });
    expect(specAtLevel(gears, 4)).toMatchObject({
      tasks: ['build', 'direction'],
      gaps: 4,
      sizes: true,
    });
    const one = gameSpec.parse({ kind: 'gears', gaps: 1, rounds: 2 }) as GameSpec;
    expect(specAtLevel(one, 4)).toMatchObject({ gaps: 3 });
    const dir = gameSpec.parse({ kind: 'gears', tasks: ['direction'], rounds: 2 }) as GameSpec;
    expect(specAtLevel(dir, 4)).toMatchObject({ tasks: ['direction'] });
    expect(gameSpec.safeParse({ kind: 'gears', tasks: [], rounds: 3 }).success).toBe(false);
    expect(gameSpec.safeParse({ kind: 'gears', gaps: 5, rounds: 3 }).success).toBe(false);
    expect(gameSpec.safeParse({ kind: 'gears', rounds: 7 }).success).toBe(false);
  });

  it('одень мишку (этап 58): одна вещь → две → всё по погоде → и «Что не так?»', () => {
    const dress = gameSpec.parse({ kind: 'dress', rounds: 4 }) as GameSpec;
    expect(dress).toMatchObject({
      weathers: ['rain', 'snow', 'sun', 'wind'],
      items: 1,
      tasks: ['dress'],
    });
    expect(specAtLevel(dress, 2)).toMatchObject({ items: 2, tasks: ['dress'] });
    expect(specAtLevel(dress, 3)).toMatchObject({ items: 4, tasks: ['dress'] });
    expect(specAtLevel(dress, 4)).toMatchObject({ items: 4, tasks: ['dress', 'odd'] });
    // Погоду уровни не трогают; только «что не так» — им и остаётся.
    const odd = gameSpec.parse({
      kind: 'dress',
      weathers: ['snow'],
      tasks: ['odd'],
      rounds: 2,
    }) as GameSpec;
    expect(specAtLevel(odd, 4)).toMatchObject({ weathers: ['snow'], tasks: ['odd'] });
    expect(gameSpec.safeParse({ kind: 'dress', weathers: [], rounds: 3 }).success).toBe(false);
    expect(gameSpec.safeParse({ kind: 'dress', items: 5, rounds: 3 }).success).toBe(false);
    expect(gameSpec.safeParse({ kind: 'dress', rounds: 7 }).success).toBe(false);
  });

  it('сложи фигуру (этап 58): две детали → четыре повёрнутые → все семь → только силуэт', () => {
    const fig = gameSpec.parse({ kind: 'figure', rounds: 4 }) as GameSpec;
    expect(fig).toMatchObject({
      figures: ['house', 'fish', 'cat', 'boat'],
      pieces: 2,
      outlines: true,
      turn: false,
    });
    expect(specAtLevel(fig, 2)).toMatchObject({ pieces: 4, turn: true, outlines: true });
    expect(specAtLevel(fig, 3)).toMatchObject({ pieces: 7, turn: true, outlines: true });
    expect(specAtLevel(fig, 4)).toMatchObject({ pieces: 7, turn: true, outlines: false });
    // Фигуры уровни не трогают; шесть деталей — на втором шаге не больше семи.
    const six = gameSpec.parse({
      kind: 'figure',
      figures: ['cat'],
      pieces: 6,
      rounds: 2,
    }) as GameSpec;
    expect(specAtLevel(six, 2)).toMatchObject({ figures: ['cat'], pieces: 7 });
    expect(gameSpec.safeParse({ kind: 'figure', figures: [], rounds: 3 }).success).toBe(false);
    expect(gameSpec.safeParse({ kind: 'figure', pieces: 1, rounds: 3 }).success).toBe(false);
    expect(gameSpec.safeParse({ kind: 'figure', pieces: 8, rounds: 3 }).success).toBe(false);
  });

  it('робот (этап 58): 1–2 шага → поворот → коробки на пути → «Найди ошибку»', () => {
    const bot = gameSpec.parse({ kind: 'bot', rounds: 4 }) as GameSpec;
    expect(bot).toMatchObject({ tasks: ['go'], steps: 2, turns: 0, blocks: false });
    expect(specAtLevel(bot, 2)).toMatchObject({ steps: 3, turns: 1, blocks: false, tasks: ['go'] });
    expect(specAtLevel(bot, 3)).toMatchObject({ steps: 4, turns: 1, blocks: true, tasks: ['go'] });
    expect(specAtLevel(bot, 4)).toMatchObject({ steps: 4, blocks: true, tasks: ['go', 'fix'] });
    // Родитель уже задал больше — уровни не убавляют; восемь шагов — предел.
    const big = gameSpec.parse({
      kind: 'bot',
      tasks: ['fix'],
      steps: 7,
      turns: 2,
      rounds: 3,
    }) as GameSpec;
    expect(specAtLevel(big, 4)).toMatchObject({ steps: 8, turns: 2, tasks: ['fix'] });
    expect(gameSpec.safeParse({ kind: 'bot', tasks: [], rounds: 3 }).success).toBe(false);
    expect(gameSpec.safeParse({ kind: 'bot', steps: 0, rounds: 3 }).success).toBe(false);
    expect(gameSpec.safeParse({ kind: 'bot', steps: 9, rounds: 3 }).success).toBe(false);
    expect(gameSpec.safeParse({ kind: 'bot', turns: 4, rounds: 3 }).success).toBe(false);
  });

  it('часы с кукушкой (этап 58): целые часы → стрелками → половины → режим дня', () => {
    const cuckoo = gameSpec.parse({ kind: 'cuckoo', rounds: 4 }) as GameSpec;
    expect(cuckoo).toMatchObject({ tasks: ['read'], half: false });
    expect(specAtLevel(cuckoo, 2)).toMatchObject({ tasks: ['read', 'set'], half: false });
    expect(specAtLevel(cuckoo, 3)).toMatchObject({ tasks: ['read', 'set'], half: true });
    expect(specAtLevel(cuckoo, 4)).toMatchObject({ tasks: ['read', 'set', 'day'], half: true });
    // Родитель выбрал только режим дня — уровни добавляют стрелки, а не убирают его.
    const day = gameSpec.parse({ kind: 'cuckoo', tasks: ['day'], rounds: 3 }) as GameSpec;
    expect(specAtLevel(day, 4)).toMatchObject({ tasks: ['day', 'set'], half: true });
    expect(gameSpec.safeParse({ kind: 'cuckoo', tasks: [], rounds: 3 }).success).toBe(false);
    expect(gameSpec.safeParse({ kind: 'cuckoo', rounds: 1 }).success).toBe(false);
    expect(gameSpec.safeParse({ kind: 'cuckoo', rounds: 9 }).success).toBe(false);
  });

  it('буквы этапа 56: обводка — ступенью выше, шарики — и маленькие', () => {
    const trace = gameSpec.parse({
      kind: 'tracing',
      shapes: ['А', 'а'],
      guides: ['dots', 'line'],
    }) as GameSpec;
    expect(specAtLevel(trace, 2)).toMatchObject({ guides: ['line', 'start'] });
    expect(specAtLevel(trace, 4)).toMatchObject({ guides: ['start'] });
    const shapes = gameSpec.parse({ kind: 'tracing', shapes: ['circle'] }) as GameSpec;
    expect(specAtLevel(shapes, 4)).toEqual(shapes);
    const balls = gameSpec.parse({
      kind: 'balloons',
      count: 6,
      letters: { find: 'О', others: ['А'], lower: false },
    }) as GameSpec;
    expect(specAtLevel(balls, 2)).toMatchObject({
      count: 9,
      target: null,
      letters: { find: 'О', lower: true },
    });
  });

  it('буквы этапа 56: проверки схемы', () => {
    const bad = [
      { kind: 'tracing', shapes: ['А'], guides: ['dots', 'dots'] },
      { kind: 'tracing', shapes: ['А', 'О', 'У', 'а', 'о'], guides: ['dots', 'line', 'start'] },
      { kind: 'balloons', count: 6, letters: { find: 'О', others: ['О'], lower: false } },
      {
        kind: 'balloons',
        count: 6,
        target: 'red',
        letters: { find: 'О', others: ['А'], lower: false },
      },
      { kind: 'letter', letters: ['А', 'О'], choices: 2, rounds: 4, letterCase: 'small' },
      {
        kind: 'soundPlace',
        sound: 'О',
        words: [
          { emoji: '⛵', word: "ЛО'ДКА" },
          { emoji: '🐱', word: 'КОТ' },
        ],
        rounds: 2,
      },
    ];
    for (const raw of bad) expect(gameSpec.safeParse(raw).success, JSON.stringify(raw)).toBe(false);
    expect(
      gameSpec.safeParse({
        kind: 'soundPlace',
        sound: 'О',
        words: [
          { emoji: '⛵', word: 'ЛО́ДКА' },
          { emoji: '🐱', word: 'КОТ' },
        ],
        rounds: 2,
      }).success,
    ).toBe(true);
  });
});
