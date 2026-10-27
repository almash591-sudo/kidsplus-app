import { describe, expect, it } from 'vitest';
import { gameSpec, problemAnswer } from './games';
import { specAtLevel } from './levels';
import { MATH_LESSONS } from './math-lessons';

/** Как число звучит в условии задачи (с родом и падежом). */
const FORMS: Record<number, string[]> = {
  1: ['один', 'одна', 'одно', 'одну'],
  2: ['два', 'две'],
  3: ['три'],
  4: ['четыре'],
  5: ['пять'],
  6: ['шесть'],
  7: ['семь'],
  8: ['восемь'],
  9: ['девять'],
  10: ['десять'],
};
const words = (text: string) => text.toLowerCase().split(/[^а-яё]+/u);

describe('уроки «Счёт»', () => {
  it('20 уроков для дошкольников, проходят схему, названия уникальны', () => {
    expect(MATH_LESSONS).toHaveLength(20);
    expect(new Set(MATH_LESSONS.map((l) => l.title)).size).toBe(20);
    for (const l of MATH_LESSONS) {
      expect(l.age).toBe('old');
      expect(l.title).toMatch(/^Счёт \d\d · /u);
      expect(gameSpec.safeParse(l.spec).success).toBe(true);
    }
  });

  it('в уроках только игры «Счёт», числа растут: домики до 10, соседи и знаки до 20', () => {
    const kinds = new Set(MATH_LESSONS.map((l) => l.spec.kind));
    expect([...kinds].sort()).toEqual(
      ['compareSign', 'numberHouse', 'numberNeighbors', 'wordProblem'].sort(),
    );
    const houses = MATH_LESSONS.flatMap((l) =>
      l.spec.kind === 'numberHouse' ? [Math.max(...l.spec.numbers)] : [],
    );
    expect(houses).toEqual([...houses].sort((a, b) => a - b));
    expect(houses.at(-1)).toBe(10);
  });

  it('в задаче числа условия — те же, что на экране, а ответ от 0 до 10', () => {
    for (const { spec } of MATH_LESSONS) {
      if (spec.kind !== 'wordProblem') continue;
      for (const p of spec.problems) {
        const w = words(p.text);
        expect(
          FORMS[p.a]!.some((f) => w.includes(f)),
          `${p.text}: ${p.a}`,
        ).toBe(true);
        expect(
          FORMS[p.b]!.some((f) => w.includes(f)),
          `${p.text}: ${p.b}`,
        ).toBe(true);
        expect(problemAnswer(p)).toBeGreaterThanOrEqual(0);
        expect(problemAnswer(p)).toBeLessThanOrEqual(10);
        expect(p.text.trim().endsWith('?')).toBe(true);
      }
      const texts = spec.problems.map((p) => p.text);
      expect(new Set(texts).size).toBe(texts.length);
    }
  });

  it('на любом уровне урок проходит схему', () => {
    for (const { spec } of MATH_LESSONS)
      for (const lvl of [1, 2, 3, 4])
        expect(gameSpec.safeParse(specAtLevel(spec, lvl)).success).toBe(true);
  });

  it('схема не пускает ответ задачи больше 10 и меньше нуля, а соседей — без трёх чисел', () => {
    const p = { emoji: '🐦', text: 'Сколько?', choices: 3, rounds: 3, scene: true };
    const bad = [
      { kind: 'wordProblem', ...p, problems: [{ ...p, a: 7, op: 'plus', b: 5 }] },
      { kind: 'wordProblem', ...p, problems: [{ ...p, a: 2, op: 'minus', b: 3 }] },
      { kind: 'numberNeighbors', from: 5, to: 6, modes: ['gap'], choices: 3, rounds: 3 },
      { kind: 'numberNeighbors', from: 1, to: 9, modes: ['gap', 'gap'], choices: 3, rounds: 3 },
    ];
    for (const s of bad) expect(gameSpec.safeParse(s).success, JSON.stringify(s)).toBe(false);
  });
});
