// Этап 56: буквы О, А, У — обводка букв, «Где звук?» для гласных, шарики с буквами, строчные.
import { gameSpec, TRACE_LETTERS } from '@kidsplus/shared/games';
import { specAtLevel } from '@kidsplus/shared/levels';
import { STRESS } from '@kidsplus/shared/sounds';
import { describe, expect, it } from 'vitest';
import { gamePhrases } from '../phrases';
import type { SpecOf } from './common';
import { makeRound } from './letters/LetterGame';
import { advance, isDot, LETTER_RULES, resample, strokeNumbers, TRACES } from './traceShapes';

const spec = <K extends 'tracing' | 'balloons' | 'letter' | 'soundPlace' | 'firstLetter'>(
  s: object,
) => gameSpec.parse(s) as SpecOf<K>;

describe('обведи букву', () => {
  it('весь алфавит: 33 большие и 33 маленькие буквы', () => {
    expect(TRACE_LETTERS.join('')).toBe(
      'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдеёжзийклмнопрстуфхцчшщъыьэюя',
    );
  });

  it('буквы стоят на строке: большие — от верхней линейки, маленькие — от средней', () => {
    for (const l of TRACE_LETTERS) {
      const { letter, strokes } = TRACES[l];
      expect(letter, l).toBe(true);
      for (const [x, y] of strokes.flat()) {
        expect(x, l).toBeGreaterThanOrEqual(18);
        expect(x, l).toBeLessThanOrEqual(82);
        expect(y, l).toBeGreaterThanOrEqual(3);
        expect(y, l).toBeLessThanOrEqual(97);
      }
      // Точки и дужка (Ё, Й) — над буквой; без них буква от линейки до строки.
      const body = strokes.filter((s, i) => !isDot(s) && !('Йй'.includes(l) && i === 1));
      const ys = body.flat().map(([, y]) => y);
      const big = l !== l.toLowerCase();
      // У «б» и «ф» палочка — до верхней линейки, как у больших.
      const top = big || 'бф'.includes(l) ? LETTER_RULES.top : LETTER_RULES.middle;
      expect(Math.min(...ys), l).toBeCloseTo(top, 0);
      // Хвостики (у, р, ф, д, ц, щ) — ниже строки; у большой У хвостик кончается на строке.
      if ('уДдЦцЩщрф'.includes(l))
        expect(Math.max(...ys), l).toBeGreaterThan(LETTER_RULES.base + 5);
      else expect(Math.max(...ys), l).toBeCloseTo(LETTER_RULES.base, 0);
      if ('ЁЙёй'.includes(l))
        expect(Math.min(...strokes.flat().map(([, y]) => y)), l).toBeLessThan(top - 3);
    }
  });

  it('палочки — сверху вниз, перекладины — слева направо', () => {
    for (const l of TRACE_LETTERS)
      for (const s of TRACES[l].strokes) {
        if (s.length !== 2 || isDot(s)) continue;
        const [[x0, y0], [x1, y1]] = s as [[number, number], [number, number]];
        if (x0 === x1) expect(y1, l).toBeGreaterThan(y0);
        if (y0 === y1) expect(x1, l).toBeGreaterThan(x0);
      }
  });

  it('у Ё точки ставят касанием, у Й — дужка; мягкий и твёрдый знак называются знаками', () => {
    expect(TRACES['Ё'].strokes.filter(isDot)).toHaveLength(2);
    expect(TRACES['ё'].strokes.filter(isDot)).toHaveLength(2);
    expect(TRACES['Й'].strokes.filter(isDot)).toHaveLength(0);
    expect(TRACES['Б'].name).toBe('большую букву Б');
    expect(TRACES['ь'].name).toBe('маленький мягкий знак');
    expect(TRACES['Ъ'].name).toBe('большой твёрдый знак');
    expect(gamePhrases(spec<'tracing'>({ kind: 'tracing', shapes: ['й', 'ь'] }))).toEqual([
      'Обведи маленькую букву Й.',
      'Обведи маленький мягкий знак.',
    ]);
  });

  it('штрихи — как в прописях: А из трёх, У из двух, О одним движением', () => {
    expect(TRACES['А'].strokes).toHaveLength(3);
    expect(TRACES['У'].strokes).toHaveLength(2);
    expect(TRACES['О'].strokes).toHaveLength(1);
    expect(TRACES['а'].strokes).toHaveLength(2);
    // Палочки и наклонные — сверху вниз.
    for (const s of [...TRACES['А'].strokes.slice(0, 2), ...TRACES['У'].strokes])
      expect(s[0]![1]).toBeLessThan(s.at(-1)![1]);
    // О — против часовой стрелки от верхней точки: сначала идём влево.
    const o = TRACES['О'].strokes[0]!;
    expect(o[1]![0]).toBeLessThan(o[0]![0]);
  });

  it('номера штрихов не налезают друг на друга и стоят у своего штриха', () => {
    for (const l of TRACE_LETTERS) {
      const { strokes } = TRACES[l];
      const at = strokeNumbers(TRACES[l]);
      expect(at, l).toHaveLength(strokes.length);
      if (strokes.length < 2) {
        expect(at, l).toEqual([null]);
        continue;
      }
      // Номер есть у каждого штриха, кроме точек.
      for (const [i, p] of at.entries()) expect(p === null, l).toBe(isDot(strokes[i]!));
      const nums = at.flatMap((p, i) => (p ? [{ i, x: p[0], y: p[1] - 2.5 }] : []));
      for (const a of nums) {
        expect(a.x, l).toBeGreaterThanOrEqual(3);
        expect(a.x, l).toBeLessThanOrEqual(97);
        expect(a.y, l).toBeGreaterThanOrEqual(3);
        expect(a.y, l).toBeLessThanOrEqual(97);
        for (const b of nums)
          if (b.i > a.i) expect(Math.hypot(a.x - b.x, a.y - b.y), l).toBeGreaterThan(8);
        // Номер ближе к началу своего штриха, чем к началу любого другого.
        const d = nums.map((b) =>
          Math.hypot(strokes[b.i]![0]![0] - a.x, strokes[b.i]![0]![1] - a.y),
        );
        expect(Math.min(...d), l).toBe(d[nums.indexOf(a)]);
        // И не лежит на линиях буквы.
        const ink = strokes.flatMap((s) => resample(s, 1));
        expect(Math.min(...ink.map(([x, y]) => Math.hypot(x - a.x, y - a.y))), l).toBeGreaterThan(
          4,
        );
      }
    }
  });

  it('на ступени «сама» неровная рука в пределах 12 тоже доводит штрих', () => {
    for (const l of TRACE_LETTERS)
      for (const stroke of TRACES[l].strokes) {
        const pts = resample(stroke);
        let done = 0;
        for (const [x, y] of pts) done = advance(pts, done, { x: x + 6, y: y - 6 }, 12);
        expect(done, l).toBe(pts.length);
      }
  });

  it('ступени: обводок — фигуры × ступени; с уровнем ступени сдвигаются', () => {
    const s = spec<'tracing'>({ kind: 'tracing', shapes: ['А', 'а'], guides: ['dots', 'line'] });
    expect(specAtLevel(s, 3)).toMatchObject({ guides: ['start'] });
    const said = gamePhrases(specAtLevel(s, 3));
    expect(said).toContain('Напиши большую букву А по образцу. Начни с зелёной точки.');
    expect(said).toContain('Подскажу: веди вот так.');
    expect(gamePhrases(s)).toEqual(['Обведи большую букву А.', 'Обведи маленькую букву А.']);
  });
});

describe('шарики с буквой', () => {
  it('задание и подсказки при ошибке — для каждой другой буквы', () => {
    const s = spec<'balloons'>({
      kind: 'balloons',
      count: 6,
      letters: { find: 'О', others: ['А', 'У'], lower: false },
    });
    expect(gamePhrases(s)).toEqual([
      'Лопни шарики с буквой О!',
      'Это буква А. Ищи букву О!',
      'Это буква У. Ищи букву О!',
    ]);
    expect(gamePhrases(specAtLevel(s, 2))[0]).toBe(
      'Лопни шарики с буквой О — большой и маленькой!',
    );
  });
});

describe('найди букву: большие и маленькие', () => {
  const base = { kind: 'letter', letters: ['А', 'О', 'У'], choices: 3, rounds: 5 };
  it('маленькие — все подписи строчные, ответ — по-прежнему заглавная', () => {
    const s = spec<'letter'>({ ...base, letterCase: 'lower' });
    for (let i = 0; i < 20; i++) {
      const r = makeRound(s);
      expect(r.options.map((o) => o.label).join('')).toMatch(/^[ауо]{3}$/u);
      expect(r.answer).toMatch(/^[АОУ]$/u);
      expect(r.askText).toBe(`Найди букву ${r.answer}.`);
    }
  });

  it('вперемешку — встречаются и большие, и маленькие; без поля — большие', () => {
    const mixed = spec<'letter'>({ ...base, letterCase: 'mixed' });
    const labels = Array.from({ length: 30 }, () => makeRound(mixed))
      .flatMap((r) => r.options.map((o) => o.label))
      .join('');
    expect(labels).toMatch(/[АОУ]/u);
    expect(labels).toMatch(/[аоу]/u);
    const upper = spec<'letter'>(base);
    expect(
      makeRound(upper)
        .options.map((o) => o.label)
        .join(''),
    ).toMatch(/^[АОУ]{3}$/u);
  });
});

describe('буквы из садика: найди одну букву среди похожих', () => {
  it('спрашивает только букву из ask, похожие — на кнопках, голосом не называются', () => {
    const s = spec<'letter'>({
      kind: 'letter',
      letters: ['Ж', 'Х', 'К', 'Ш'],
      ask: ['Ж'],
      choices: 3,
      rounds: 8,
    });
    const seen = new Set<string>();
    for (let i = 0, prev: string | undefined; i < 30; i++) {
      const r = makeRound(s, prev);
      expect(r.answer).toBe('Ж');
      expect(r.options.map((o) => o.id)).toContain('Ж');
      r.options.forEach((o) => seen.add(o.id));
      prev = r.key;
    }
    expect([...seen].sort()).toEqual(['Ж', 'К', 'Х', 'Ш']);
    expect(gamePhrases(s)).toEqual(['Найди букву Ж.', 'Буква Ж!']);
  });

  it('Ъ и Ь голос называет знаками', () => {
    const s = spec<'letter'>({
      kind: 'letter',
      letters: ['Ь', 'Ъ', 'Б'],
      ask: ['Ь'],
      choices: 3,
      rounds: 8,
    });
    expect(gamePhrases(s)).toEqual(['Найди мягкий знак.', 'Это мягкий знак!']);
    const b = spec<'balloons'>({
      kind: 'balloons',
      count: 6,
      letters: { find: 'Ь', others: ['Ъ', 'Б'], lower: true },
    });
    expect(gamePhrases(b)).toEqual([
      'Лопни шарики с мягким знаком — большим и маленьким!',
      'Это твёрдый знак. Ищи мягкий знак!',
      'Это буква Б. Ищи мягкий знак!',
    ]);
  });
});

describe('с какой буквы: обманки', () => {
  const words = [
    { emoji: '🍉', word: 'АРБУЗ' },
    { emoji: '👓', word: 'ОЧКИ' },
    { emoji: '🦆', word: 'УТКА' },
    { emoji: '🦈', word: 'АКУЛА' },
  ];
  it('первых букв урока хватает — обманки только из них', () => {
    const s = spec<'firstLetter'>({ kind: 'firstLetter', words, choices: 3, rounds: 4 });
    for (let i = 0; i < 20; i++)
      expect(
        makeRound(s)
          .options.map((o) => o.label)
          .sort()
          .join(''),
      ).toBe('АОУ');
  });

  it('не хватает — добираются из алфавита', () => {
    const s = spec<'firstLetter'>({ kind: 'firstLetter', words, choices: 4, rounds: 4 });
    for (let i = 0; i < 20; i++) {
      const labels = makeRound(s).options.map((o) => o.label);
      expect(new Set(labels).size).toBe(4);
    }
  });
});

describe('где звук: гласные', () => {
  it('ударение не звучит, место звука — по букве', () => {
    const s = spec<'soundPlace'>({
      kind: 'soundPlace',
      sound: 'О',
      words: [
        { emoji: '⛵', word: `ЛО${STRESS}ДКА` },
        { emoji: '🚇', word: `МЕТРО${STRESS}` },
        { emoji: '🐱', word: 'КОТ' },
      ],
      rounds: 3,
    });
    const said = gamePhrases(s);
    expect(said).toContain('Где звук ооо в слове лодка?');
    expect(said).toContain('метро — звук ооо в конце!');
    expect(said.join(' ')).not.toContain(STRESS);
    for (let i = 0; i < 10; i++) {
      const r = makeRound(s);
      expect(r.answer).toBe(r.key.startsWith('МЕТРО') ? 'end' : 'middle');
    }
  });
});
