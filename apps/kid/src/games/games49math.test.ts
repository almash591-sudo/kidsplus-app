// Этап 49: «Счёт» — домик числа, соседи, знаки и задачи: раунды, варианты и озвучка заранее.
import { gameSpec, problemAnswer } from '@kidsplus/shared/games';
import { specAtLevel } from '@kidsplus/shared/levels';
import { MATH_LESSONS } from '@kidsplus/shared/math-lessons';
import { describe, expect, it } from 'vitest';
import { gamePhrases } from '../phrases';
import { NUMBERS, type SpecOf } from './common';
import { makeRound, nearNumbers, type CountRound } from './count/CountGame';

type Kind = 'numberHouse' | 'numberNeighbors' | 'compareSign' | 'wordProblem';
const spec = <K extends Kind>(s: object) => gameSpec.parse(s) as SpecOf<K>;
const lessons = MATH_LESSONS.map((l) => l.spec as SpecOf<Kind>);

/** Раунды подряд, как в игре: каждый следующий не повторяет прошлый. */
function rounds(s: SpecOf<Kind>, n = 40) {
  const out: CountRound[] = [makeRound(s)];
  while (out.length < n) out.push(makeRound(s, out.at(-1)!.key));
  return out;
}

/** Общие фразы чисел — озвучены у всех детей. */
const COMMON = new Set(NUMBERS.slice(1).flatMap((n) => [n, `${n}!`]));

describe('раунды игр «Счёт»', () => {
  it('ответ среди вариантов, варианты разные и по порядку, раунд не повторяется подряд', () => {
    for (const s of lessons)
      for (const lvl of [1, 2, 3, 4]) {
        const at = specAtLevel(s, lvl) as SpecOf<Kind>;
        const rs = rounds(at);
        rs.forEach((r, i) => {
          expect(r.options).toContain(r.answer);
          expect(new Set(r.options).size).toBe(r.options.length);
          if (at.kind === 'compareSign') {
            expect(r.options).toEqual(at.equal ? ['<', '=', '>'] : ['<', '>']);
          } else {
            expect(r.options).toHaveLength(at.choices);
            const nums = r.options.map(Number);
            expect(nums).toEqual([...nums].sort((a, b) => a - b));
          }
          if (i > 0) expect(r.key).not.toBe(rs[i - 1]!.key);
        });
      }
  });

  it('«Домик числа»: два окошка вместе — число на крыше, пустое — ответ', () => {
    const s = spec<'numberHouse'>({ kind: 'numberHouse', numbers: [7], choices: 3, rounds: 3 });
    const sides = new Set<number>();
    for (const r of rounds(s, 60)) {
      if (r.view.kind !== 'house') throw new Error(r.view.kind);
      const { roof, windows, hidden } = r.view;
      expect(roof).toBe(7);
      expect(windows[0] + windows[1]).toBe(7);
      expect(Math.min(...windows)).toBeGreaterThanOrEqual(1);
      expect(String(windows[hidden])).toBe(r.answer);
      sides.add(hidden);
      expect(r.right.at(-1)).toBe('семь!');
    }
    expect([...sides].sort()).toEqual([0, 1]);
  });

  it('«Соседи числа»: пропуск в ряду по порядку, «перед» и «после», в пределах урока', () => {
    const s = spec<'numberNeighbors'>({
      kind: 'numberNeighbors',
      from: 10,
      to: 20,
      modes: ['gap', 'before', 'after'],
      choices: 4,
      rounds: 3,
    });
    for (const r of rounds(s, 80)) {
      if (r.view.kind !== 'row') throw new Error(r.view.kind);
      const { cells, hidden } = r.view;
      cells.forEach((c, i) => i > 0 && expect(c).toBe(cells[i - 1]! + 1));
      expect(String(cells[hidden])).toBe(r.answer);
      for (const c of cells) {
        expect(c).toBeGreaterThanOrEqual(10);
        expect(c).toBeLessThanOrEqual(20);
      }
      // Видимые числа ряда — не варианты ответа.
      cells.forEach((c, i) => i !== hidden && expect(r.options).not.toContain(String(c)));
      // «Перед» и «после»: сосед с другой стороны — среди вариантов (его путают чаще).
      if (cells.length === 2) {
        const shown = cells[1 - hidden]!;
        const other = hidden === 0 ? shown + 1 : shown - 1;
        if (other <= 20) expect(r.options).toContain(String(other));
      }
    }
  });

  it('«Больше, меньше, равно»: знак по числам, бывают и равные, точки — только до 10', () => {
    const s = spec<'compareSign'>({
      kind: 'compareSign',
      max: 5,
      equal: true,
      dots: true,
      rounds: 3,
    });
    const seen = new Set<string>();
    for (const r of rounds(s, 120)) {
      if (r.view.kind !== 'sign') throw new Error(r.view.kind);
      const { a, b } = r.view;
      expect(r.answer).toBe(a > b ? '>' : a < b ? '<' : '=');
      expect(r.view.dots).toBe(true);
      seen.add(r.answer);
    }
    expect([...seen].sort()).toEqual(['<', '=', '>']);
    const big = makeRound({ ...s, max: 20 });
    if (big.view.kind === 'sign') expect(big.view.dots).toBe(false);
    for (const r of rounds({ ...s, equal: false }, 40)) expect(r.answer).not.toBe('=');
  });

  it('«Задачи»: ответ по условию, после ответа — пример словами', () => {
    const s = spec<'wordProblem'>({
      kind: 'wordProblem',
      problems: [
        { emoji: '🐦', a: 3, op: 'minus', b: 3, text: 'Три птички улетели. Сколько осталось?' },
        { emoji: '🍎', a: 2, op: 'plus', b: 5, text: 'Два и ещё пять. Сколько стало?' },
      ],
      choices: 4,
      rounds: 3,
    });
    for (const r of rounds(s, 20)) {
      if (r.view.kind !== 'problem') throw new Error(r.view.kind);
      const p = r.view.problem;
      expect(r.answer).toBe(String(problemAnswer(p)));
      expect(r.ask).toEqual([p.text]);
      expect(r.right).toEqual(
        p.op === 'plus'
          ? ['два', 'плюс', 'пять', 'будет', 'семь!']
          : ['три', 'минус', 'три', 'будет', 'ноль!'],
      );
      for (const o of r.options.map(Number)) {
        expect(o).toBeGreaterThanOrEqual(0);
        expect(o).toBeLessThanOrEqual(10);
      }
    }
  });

  it('обманки — рядом с ответом, но ответ не всегда посередине', () => {
    const at = new Set<number>();
    for (let i = 0; i < 200; i++) {
      const o = nearNumbers(5, 3, 1, 10);
      expect(o).toHaveLength(3);
      for (const x of o) expect(Math.abs(x - 5)).toBeLessThanOrEqual(3);
      at.add(o.indexOf(5));
    }
    expect(at.size).toBe(3);
    // Рядом мало чисел — берутся дальние; предпочтённое — всегда.
    expect(nearNumbers(1, 4, 1, 10, { prefer: [9] })).toContain(9);
    expect(nearNumbers(1, 4, 1, 3)).toEqual([1, 2, 3]);
  });

  it('всё, что скажет совёнок, есть в озвучке заранее — на любом уровне', () => {
    for (const s of lessons)
      for (const lvl of [1, 2, 3, 4]) {
        const at = specAtLevel(s, lvl) as SpecOf<Kind>;
        const all = new Set([...gamePhrases(at), ...COMMON]);
        for (const r of rounds(at))
          for (const t of [...r.ask, ...r.right]) expect(all.has(t), t).toBe(true);
      }
  });
});
