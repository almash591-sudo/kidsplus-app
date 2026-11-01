// Этап 56: буквы О, А, У — обводка букв, «Где звук?» для гласных, шарики с буквами, строчные.
import { gameSpec, TRACE_LETTERS } from '@kidsplus/shared/games';
import { specAtLevel } from '@kidsplus/shared/levels';
import { STRESS } from '@kidsplus/shared/sounds';
import { describe, expect, it } from 'vitest';
import { gamePhrases } from '../phrases';
import type { SpecOf } from './common';
import { makeRound } from './letters/LetterGame';
import { advance, LETTER_RULES, resample, TRACES } from './traceShapes';

const spec = <K extends 'tracing' | 'balloons' | 'letter' | 'soundPlace' | 'firstLetter'>(
  s: object,
) => gameSpec.parse(s) as SpecOf<K>;

describe('обведи букву', () => {
  it('буквы стоят на строке: большие — от верхней линейки, маленькие — от средней', () => {
    for (const l of TRACE_LETTERS) {
      const { letter, strokes } = TRACES[l];
      expect(letter, l).toBe(true);
      const ys = strokes.flat().map(([, y]) => y);
      const top = l === l.toUpperCase() ? LETTER_RULES.top : LETTER_RULES.middle;
      expect(Math.min(...ys), l).toBeCloseTo(top, 0);
      // Хвостик «у» — ниже строки, остальные кончаются на ней.
      if (l !== 'у' && l !== 'У') expect(Math.max(...ys), l).toBeCloseTo(LETTER_RULES.base, 0);
    }
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
      const { strokes, numbers } = TRACES[l];
      if (strokes.length < 2) continue;
      expect(numbers, l).toHaveLength(strokes.length);
      const at = numbers!;
      for (let i = 0; i < at.length; i++)
        for (let j = i + 1; j < at.length; j++)
          expect(Math.hypot(at[i]![0] - at[j]![0], at[i]![1] - at[j]![1]), l).toBeGreaterThan(8);
      // Номер ближе к началу своего штриха, чем к началу любого другого.
      for (const [i, [x, y]] of at.entries()) {
        const d = strokes.map((s) => Math.hypot(s[0]![0] - x, s[0]![1] - y));
        expect(Math.min(...d), l).toBe(d[i]);
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
