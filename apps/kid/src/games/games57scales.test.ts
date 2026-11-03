// Этап 57: «Весы» — задания на чашах, гирьки на прилавке, кучка на чаше, наклон и фразы.
import { gameSpec, type GameSpec } from '@kidsplus/shared/games';
import { describe, expect, it } from 'vitest';
import {
  gamePhrases,
  MORE_THAN,
  PLUS,
  SCALES_BALANCE_AGAIN,
  SCALES_COMPARE,
  SCALES_COUNT,
  SCALES_END,
  SCALES_EVEN,
  SCALES_HEAVY,
  SCALES_LIGHT,
  SCALES_NUMBERS,
  SCALES_OVER,
  scalesBalance,
  scalesSum,
  WILL_BE,
} from '../phrases';
import type { SpecOf } from './common';
import {
  compareRound,
  MAX_TILT,
  pileLayout,
  piecesFor,
  planScales,
  scalesSprites,
  sumRound,
  tiltFor,
  type BalanceRound,
  type CompareRound,
  type SumRound,
} from './scalesLogic';

const spec = (o: object) => gameSpec.parse({ kind: 'scales', rounds: 3, ...o }) as SpecOf<'scales'>;
/** Простой повторяемый генератор для тестов. */
const seeded = (seed: number) => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

describe('«Весы»: задания', () => {
  it('какая тяжелее: два разных веса из 1…max, тяжёлая бывает и слева, и справа', () => {
    const sides = new Set<string>();
    for (let seed = 1; seed < 200; seed++) {
      const r = compareRound(5, seeded(seed * 7919));
      expect(r.left).not.toBe(r.right);
      for (const n of [r.left, r.right]) expect(n >= 1 && n <= 5).toBe(true);
      sides.add(r.left > r.right ? 'left' : 'right');
    }
    expect(sides.size).toBe(2);
  });

  it('уравновесь: кубики — по одному, гирьки 1 и 2, с шести — ещё 3; груз — от двух/трёх', () => {
    expect(piecesFor({ look: 'cubes', max: 10 })).toEqual([1]);
    expect(piecesFor({ look: 'dots', max: 5 })).toEqual([1, 2]);
    expect(piecesFor({ look: 'digits', max: 6 })).toEqual([1, 2, 3]);
    for (let seed = 1; seed < 80; seed++) {
      const cubes = planScales(spec({ tasks: ['balance'], max: 4 }), seeded(seed));
      for (const r of cubes as BalanceRound[]) {
        expect(r.kind).toBe('balance');
        expect(r.target >= 2 && r.target <= 4).toBe(true);
      }
      const weights = planScales(
        spec({ tasks: ['balance'], look: 'digits', max: 7 }),
        seeded(seed),
      );
      for (const r of weights as BalanceRound[]) {
        expect(r.target >= 3 && r.target <= 7).toBe(true);
        expect(r.pieces).toEqual([1, 2, 3]);
      }
    }
  });

  it('сложи: два груза вместе не больше max, среди трёх гирь ровно одна — сумма', () => {
    for (let seed = 1; seed < 200; seed++) {
      const r = sumRound(6, seeded(seed));
      const [a, b] = r.left;
      expect(a).toBeGreaterThanOrEqual(1);
      expect(b).toBeGreaterThanOrEqual(1);
      expect(a + b).toBeLessThanOrEqual(6);
      expect(r.choices).toHaveLength(3);
      expect(new Set(r.choices).size).toBe(3);
      expect(r.choices.filter((n) => n === a + b)).toHaveLength(1);
      for (const n of r.choices) {
        expect(n >= 1 && n <= 10).toBe(true);
        expect(Math.abs(n - (a + b))).toBeLessThanOrEqual(2);
      }
    }
  });

  it('задания по очереди, два одинаковых подряд — нет', () => {
    const rounds = planScales(spec({ tasks: ['compare', 'balance', 'sum'], rounds: 7 }), seeded(4));
    expect(rounds.map((r) => r.kind)).toEqual([
      'compare',
      'balance',
      'sum',
      'compare',
      'balance',
      'sum',
      'compare',
    ]);
    for (let seed = 1; seed < 60; seed++) {
      const only = planScales(spec({ tasks: ['compare'], max: 3, rounds: 8 }), seeded(seed));
      only.forEach((r, i) => i && expect(r).not.toEqual(only[i - 1]));
      for (const r of only as CompareRound[]) expect(r.kind).toBe('compare');
    }
    const sums = planScales(spec({ tasks: ['sum'], max: 10, rounds: 4 }), seeded(9));
    for (const r of sums as SumRound[]) expect(r.kind).toBe('sum');
  });
});

describe('«Весы»: чаши', () => {
  it('кучка: снизу до четырёх, выше — пирамидка, всё по середине', () => {
    expect(pileLayout(1)).toEqual([[0, 0]]);
    expect(pileLayout(3)).toEqual([
      [-1, 0],
      [0, 0],
      [1, 0],
    ]);
    const ten = pileLayout(10);
    expect(ten.map(([, row]) => row)).toEqual([0, 0, 0, 0, 1, 1, 1, 2, 2, 3]);
    expect(ten.at(-1)).toEqual([0, 3]);
    // Больше десяти (перевес до того, как лишнее уберут) — дальше столбиком.
    expect(pileLayout(11).at(-1)).toEqual([0, 4]);
    for (let n = 1; n <= 11; n++) {
      const p = pileLayout(n);
      expect(new Set(p.map(([x, y]) => `${x},${y}`)).size).toBe(n);
    }
  });

  it('наклон: поровну — прямо, разница в один заметна, больше — сильнее, но не до упора', () => {
    expect(tiltFor(4, 4)).toBe(0);
    expect(tiltFor(3, 4)).toBeGreaterThan(0.12);
    expect(tiltFor(4, 3)).toBeLessThan(-0.12);
    expect(tiltFor(1, 5)).toBeGreaterThan(tiltFor(3, 5));
    expect(Math.abs(tiltFor(0, 10))).toBeLessThanOrEqual(MAX_TILT);
  });

  it('все картинки — свои', () => {
    const s = scalesSprites();
    expect(new Set(s).size).toBe(s.length);
    for (const name of s) expect(name.startsWith('scales-')).toBe(true);
  });
});

describe('«Весы»: фразы', () => {
  it('все фразы игры — в списке озвучки, лишних нет', () => {
    const all = gamePhrases(
      gameSpec.parse({
        kind: 'scales',
        tasks: ['compare', 'balance', 'sum'],
        look: 'digits',
        rounds: 4,
      }) as GameSpec,
    );
    for (const p of [
      SCALES_COMPARE,
      SCALES_NUMBERS,
      SCALES_OVER,
      SCALES_LIGHT,
      SCALES_HEAVY,
      SCALES_EVEN,
      SCALES_END,
      SCALES_BALANCE_AGAIN,
      scalesBalance('digits'),
      scalesSum('digits'),
      MORE_THAN,
      PLUS,
      WILL_BE,
    ])
      expect(all).toContain(p);
    expect(scalesSum('cubes')).toBe('Поставь на пустую чашу одну башенку — чтобы стало поровну!');
    // Только «какая тяжелее» с кубиками: ни «уравновесь», ни «плюс».
    const small = gamePhrases(gameSpec.parse({ kind: 'scales', rounds: 3 }) as GameSpec);
    expect(small).toContain(SCALES_COUNT);
    expect(small).not.toContain(SCALES_NUMBERS);
    expect(small).not.toContain(SCALES_OVER);
    expect(small).not.toContain(PLUS);
  });
});
