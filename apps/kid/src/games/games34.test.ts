import { describe, expect, it } from 'vitest';
import { clockRound } from './Clock';
import { robotField, runProgram } from './Robot';
import { shopRound } from './Shop';

describe('новые игры (этап 34)', () => {
  it('часы: варианты разные, среди них есть нужный; без половин — только целые часы', () => {
    for (let i = 0; i < 50; i++) {
      const r = clockRound({ half: false, choices: 4 });
      expect(r.options).toHaveLength(4);
      expect(new Set(r.options.map((o) => `${o.h}:${o.half}`)).size).toBe(4);
      expect(r.options.some((o) => o.h === r.target.h && o.half === r.target.half)).toBe(true);
      expect(r.options.every((o) => !o.half && o.h >= 1 && o.h <= 12)).toBe(true);
    }
  });

  it('магазин: цена от 1 до max', () => {
    for (let i = 0; i < 50; i++) {
      const r = shopRound({ max: 7, imageIds: ['a', 'b'] });
      expect(r.price).toBeGreaterThanOrEqual(1);
      expect(r.price).toBeLessThanOrEqual(7);
      expect(['a', 'b']).toContain(r.image);
    }
  });

  it('робот: цель достижима за steps шагов, камни не на старте и не на цели', () => {
    for (let i = 0; i < 50; i++) {
      const spec = { size: 5, steps: 4, rocks: true };
      const f = robotField(spec);
      const key = (c: [number, number]) => `${c[0]},${c[1]}`;
      expect(f.rocks.has(key(f.start))).toBe(false);
      expect(f.rocks.has(key(f.goal))).toBe(false);
      const dist = Math.abs(f.goal[0] - f.start[0]) + Math.abs(f.goal[1] - f.start[1]);
      expect(dist).toBeLessThanOrEqual(4);
      expect(dist).toBeGreaterThanOrEqual(2);
    }
  });

  it('робот: программа — дошёл, упёрся в стену, в камень, не дошёл', () => {
    const field = {
      start: [0, 0] as [number, number],
      goal: [2, 0] as [number, number],
      rocks: new Set(['0,1']),
    };
    expect(runProgram(field, 3, ['right', 'right']).result).toBe('goal');
    expect(runProgram(field, 3, ['left']).result).toBe('wall');
    expect(runProgram(field, 3, ['down']).result).toBe('rock');
    expect(runProgram(field, 3, ['right']).result).toBe('short');
    expect(runProgram(field, 3, ['right', 'right']).cells).toEqual([
      [1, 0],
      [2, 0],
    ]);
  });
});
