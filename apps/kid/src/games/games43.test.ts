import { gameSpec, type GameSpec } from '@kidsplus/shared/games';
import { describe, expect, it } from 'vitest';
import { diveCatch, divePhrases, gamePhrases } from '../phrases';
import type { SpecOf } from './common';
import {
  diveTasks,
  isGood,
  needOf,
  nextSwimmer,
  steer,
  taskPhrase,
  WATER,
  wrongPhrase,
  type Swimmer,
} from './diveLogic';

/** Повторяемый «случай» для тестов. */
const seeded = (seed: number) => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const spec = (raw: object) => gameSpec.parse({ kind: 'dive', ...raw }) as SpecOf<'dive'>;

describe('подводное плавание (этап 43)', () => {
  it('задания: цвета — от двух до пяти рыбок, цифры — до max, подряд не повторяются', () => {
    const rnd = seeded(5);
    for (let k = 0; k < 50; k++) {
      const colors = diveTasks(spec({ task: 'colors', max: 10, rounds: 8 }), rnd);
      for (const [i, t] of colors.entries()) {
        expect(t.kind).toBe('color');
        if (t.kind !== 'color') continue;
        expect(t.count).toBeGreaterThanOrEqual(2);
        expect(t.count).toBeLessThanOrEqual(5);
        const prev = colors[i - 1];
        if (prev?.kind === 'color') expect(prev.color).not.toBe(t.color);
      }
      const numbers = diveTasks(spec({ task: 'numbers', max: 3, rounds: 8 }), rnd);
      for (const [i, t] of numbers.entries()) {
        if (t.kind !== 'number') throw new Error('ждали цифру');
        expect(t.n).toBeGreaterThanOrEqual(1);
        expect(t.n).toBeLessThanOrEqual(3);
        expect(numbers[i - 1]).not.toEqual(t);
      }
      // max 3 — в задании на цвет не больше трёх рыбок.
      for (const t of diveTasks(spec({ task: 'colors', max: 3, rounds: 4 }), rnd))
        expect(needOf(t)).toBeLessThanOrEqual(3);
    }
    const mixed = diveTasks(spec({ task: 'mixed', max: 5, rounds: 4 }));
    expect(mixed.map((t) => t.kind)).toEqual(['color', 'number', 'color', 'number']);
  });

  it('кто приплывает: нужные рыбки бывают всегда, у цифр — цифры до max, медуз нет при none', () => {
    const rnd = seeded(11);
    const s = spec({ task: 'numbers', max: 4, jellies: 'none', rounds: 2 });
    const task = { kind: 'number', n: 3 } as const;
    const around: Swimmer[] = [];
    let good = 0;
    for (let i = 0; i < 300; i++) {
      const f = nextSwimmer(s, task, around.slice(-6), rnd);
      expect(f.kind).toBe('fish');
      expect(f.n).toBeGreaterThanOrEqual(1);
      expect(f.n).toBeLessThanOrEqual(4);
      expect(f.y).toBeGreaterThan(WATER.top);
      expect(f.y).toBeLessThan(WATER.bottom);
      if (isGood(task, f)) good++;
      around.push({ ...f, id: i, x: 1 });
    }
    expect(good).toBeGreaterThan(60);
    const jelly = spec({ task: 'colors', max: 5, jellies: 'many', rounds: 2 });
    const kinds = Array.from({ length: 300 }, () => [] as Swimmer[]).reduce<Swimmer[]>(
      (all, _, i) => [
        ...all,
        { ...nextSwimmer(jelly, { kind: 'color', color: 'red', count: 3 }, all, rnd), id: i, x: 1 },
      ],
      [],
    );
    expect(kinds.some((k) => k.kind === 'jelly')).toBe(true);
    // Две медузы подряд — никогда.
    expect(kinds.some((k, i) => k.kind === 'jelly' && kinds[i - 1]?.kind === 'jelly')).toBe(false);
  });

  it('фразы: «две жёлтые рыбки», «пять синих рыбок», «одну красную рыбку»; не та — «Это …»', () => {
    expect(diveCatch('yellow', 2)).toBe('Поймай две жёлтые рыбки!');
    expect(diveCatch('blue', 5)).toBe('Поймай пять синих рыбок!');
    expect(diveCatch('red', 1)).toBe('Поймай одну красную рыбку!');
    expect(taskPhrase({ kind: 'number', n: 7 })).toBe('Поймай рыбку с цифрой семь!');
    const task = { kind: 'color', color: 'green', count: 3 } as const;
    expect(wrongPhrase(task, { color: 'purple', n: null })).toBe('Это фиолетовая рыбка.');
    expect(wrongPhrase({ kind: 'number', n: 2 }, { color: 'red', n: 4 })).toBe('Это цифра четыре.');
    // Всё, что может прозвучать на любом уровне, озвучивается заранее.
    const all = gamePhrases(spec({ max: 3, rounds: 2 }) as GameSpec);
    for (const p of divePhrases()) expect(all).toContain(p);
    expect(all).toContain('Поймай рыбку с цифрой десять!');
  });

  it('батискаф догоняет палец плавно и не выплывает из воды', () => {
    let pos = { x: 0.3, y: 0.5, vx: 0, vy: 0 };
    for (let i = 0; i < 120; i++) pos = steer(pos, { x: 0.7, y: 0.3 }, 1 / 60);
    expect(pos.x).toBeCloseTo(0.7, 1);
    expect(pos.y).toBeCloseTo(0.3, 1);
    for (let i = 0; i < 120; i++) pos = steer(pos, { x: 2, y: -1 }, 1 / 60);
    expect(pos.x).toBeLessThanOrEqual(0.8);
    expect(pos.y).toBeGreaterThanOrEqual(WATER.top);
  });
});
