import { NOTE_NAMES } from '@kidsplus/shared/games';
import { describe, expect, it } from 'vitest';
import { staffOptions } from './Staff';
import { rhythmMatches, rhythmPattern } from './timing';

describe('ритм', () => {
  it('без длительностей — ровные удары', () => {
    expect(rhythmPattern(4, false)).toEqual([1, 1, 1]);
  });

  it('с длительностями — есть и «та», и «ти-ти»; «ти» парами', () => {
    for (let k = 0; k < 50; k++) {
      const gaps = rhythmPattern(5, true);
      expect(gaps).toHaveLength(4);
      expect(gaps).toContain(1);
      expect(gaps).toContain(0.5);
      const ti = gaps.join(',').match(/0\.5/g)!.length;
      expect(ti % 2).toBe(0);
    }
  });

  it('темп ребёнка любой, важны пропорции', () => {
    expect(rhythmMatches([1, 0.5, 0.5], [0.8, 0.4, 0.4])).toBe(true);
    expect(rhythmMatches([1, 0.5, 0.5], [1.2, 0.55, 0.7])).toBe(true);
    expect(rhythmMatches([1, 0.5, 0.5], [0.5, 0.5, 1])).toBe(false);
    expect(rhythmMatches([1, 1], [0.6])).toBe(false);
  });
});

describe('нотный стан', () => {
  it('три разных названия, среди них верное; «до» не повторяется', () => {
    for (let target = 0; target < 8; target++) {
      const options = staffOptions(8, target);
      expect(options).toHaveLength(3);
      expect(new Set(options).size).toBe(3);
      expect(options).toContain(NOTE_NAMES[target]);
    }
  });
});
