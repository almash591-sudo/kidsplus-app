// Этап 57: «Поезд» — номера вагонов, билеты, потерявшийся вагон, точки и фразы.
import { gameSpec, type GameSpec } from '@kidsplus/shared/games';
import { describe, expect, it } from 'vitest';
import {
  gamePhrases,
  TRAIN_END,
  TRAIN_GO,
  TRAIN_LOST,
  TRAIN_NEXT,
  TRAIN_PROMPT,
  TRAIN_WHICH,
  trainCount,
  trainFind,
  trainTicket,
  trainWagon,
} from '../phrases';
import type { SpecOf } from './common';
import {
  dotsLayout,
  planTrain,
  spareFor,
  ticketsFor,
  topOf,
  TRAIN_ANIMALS,
  trainSprites,
  wagonNumbers,
  type MissingRound,
  type TicketsRound,
} from './trainLogic';

const spec = (o: object) => gameSpec.parse({ kind: 'train', rounds: 3, ...o }) as SpecOf<'train'>;
/** Простой повторяемый генератор для тестов. */
const seeded = (seed: number) => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

describe('«Поезд»: вагоны и билеты', () => {
  it('самый большой номер — не меньше, чем вагонов, и не больше десяти', () => {
    expect(topOf({ max: 3, wagons: 3 })).toBe(3);
    expect(topOf({ max: 2, wagons: 4 })).toBe(4);
    expect(topOf({ max: 10, wagons: 5 })).toBe(10);
  });

  it('номера вагонов разные, по порядку, из 1…top', () => {
    for (let seed = 1; seed < 60; seed++) {
      const w = wagonNumbers(4, 10, seeded(seed));
      expect(w).toHaveLength(4);
      expect(new Set(w).size).toBe(4);
      expect([...w].sort((a, b) => a - b)).toEqual(w);
      for (const n of w) expect(n >= 1 && n <= 10).toBe(true);
    }
    expect(wagonNumbers(3, 3, seeded(5))).toEqual([1, 2, 3]);
  });

  it('билеты — те же номера, но не в порядке вагонов', () => {
    for (let seed = 1; seed < 60; seed++) {
      const wagons = [2, 5, 7];
      const t = ticketsFor(wagons, seeded(seed));
      expect([...t].sort((a, b) => a - b)).toEqual(wagons);
      expect(t).not.toEqual(wagons);
    }
    expect(ticketsFor([4], seeded(1))).toEqual([4]);
  });

  it('на запасном пути — нужный и два чужих, ближе к нужному', () => {
    for (let seed = 1; seed < 60; seed++) {
      const wagons = [3, 4, 5, 6];
      const spare = spareFor(wagons, 4, seeded(seed));
      expect(spare).toHaveLength(3);
      expect(spare).toContain(4);
      const others = spare.filter((n) => n !== 4);
      expect(new Set(others).size).toBe(2);
      for (const n of others) expect(wagons).not.toContain(n);
      // Свободные номера ближе всего к четырём: 2, потом 1 или 7.
      expect(others).toContain(2);
      expect([1, 7]).toContain(others.find((n) => n !== 2));
    }
  });
});

describe('«Поезд»: поездка', () => {
  it('по билетам: на каждой станции зверята разные и у каждого свой вагон', () => {
    for (let seed = 1; seed < 40; seed++) {
      const rounds = planTrain(spec({ max: 5, wagons: 4, rounds: 4 }), seeded(seed));
      expect(rounds).toHaveLength(4);
      for (const r of rounds as TicketsRound[]) {
        expect(r.kind).toBe('tickets');
        expect(r.wagons).toHaveLength(4);
        expect([...r.passengers.map((p) => p.ticket)].sort((a, b) => a - b)).toEqual(r.wagons);
        expect(new Set(r.passengers.map((p) => p.animal)).size).toBe(4);
        for (const p of r.passengers) expect(TRAIN_ANIMALS).toContain(p.animal);
      }
    }
  });

  it('потерялся вагон: номера подряд, дырка не первая, нужный — на запасном', () => {
    for (let seed = 1; seed < 60; seed++) {
      const rounds = planTrain(spec({ task: 'missing', max: 7, wagons: 4 }), seeded(seed));
      for (const r of rounds as MissingRound[]) {
        expect(r.kind).toBe('missing');
        expect(r.wagons).toHaveLength(4);
        r.wagons.forEach((n, i) => i && expect(n).toBe(r.wagons[i - 1]! + 1));
        expect(r.wagons[0]).toBeGreaterThanOrEqual(1);
        expect(r.wagons.at(-1)).toBeLessThanOrEqual(7);
        expect(r.gap).toBeGreaterThanOrEqual(1);
        expect(r.gap).toBeLessThan(4);
        expect(r.spare).toContain(r.wagons[r.gap]);
      }
    }
  });

  it('mixed: станции по очереди, с билетов', () => {
    const rounds = planTrain(spec({ task: 'mixed', rounds: 5 }), seeded(3));
    expect(rounds.map((r) => r.kind)).toEqual([
      'tickets',
      'missing',
      'tickets',
      'missing',
      'tickets',
    ]);
  });

  it('точки: как на кубике до шести, дальше — пять сверху и остальные снизу', () => {
    for (let n = 1; n <= 10; n++) {
      const d = dotsLayout(n);
      expect(d).toHaveLength(n);
      expect(new Set(d.map(([x, y]) => `${x},${y}`)).size).toBe(n);
      for (const [x, y] of d) expect(x > 0 && x < 1 && y > 0 && y < 1).toBe(true);
    }
    const eight = dotsLayout(8);
    expect(eight.filter(([, y]) => y < 0.5)).toHaveLength(5);
    expect(eight.filter(([, y]) => y > 0.5)).toHaveLength(3);
  });

  it('все спрайты — с картинками зверят и пейзажа', () => {
    const s = trainSprites();
    expect(new Set(s).size).toBe(s.length);
    for (const a of TRAIN_ANIMALS) expect(s).toContain(a);
    expect(s).toContain('train-loco');
  });
});

describe('«Поезд»: фразы', () => {
  it('номера — словами', () => {
    expect(trainTicket(3)).toBe('На билете — три.');
    expect(trainWagon(10)).toBe('Это вагон десять.');
    expect(trainFind(2)).toBe('Найди вагон два!');
    expect(trainCount(1)).toBe('Один!');
  });

  it('все фразы игры — в списке озвучки', () => {
    const mixed = gamePhrases(
      gameSpec.parse({ kind: 'train', task: 'mixed', max: 10, wagons: 5, rounds: 4 }) as GameSpec,
    );
    for (const p of [TRAIN_GO, TRAIN_END, TRAIN_PROMPT, TRAIN_NEXT, TRAIN_LOST, TRAIN_WHICH])
      expect(mixed).toContain(p);
    for (let n = 1; n <= 10; n++) {
      expect(mixed).toContain(trainTicket(n));
      expect(mixed).toContain(trainFind(n));
      expect(mixed).toContain(trainWagon(n));
      expect(mixed).toContain(trainCount(n));
    }
    // Только билеты до трёх — без лишнего: ни «потерялся», ни «четыре».
    const small = gamePhrases(gameSpec.parse({ kind: 'train', rounds: 2 }) as GameSpec);
    expect(small).not.toContain(TRAIN_LOST);
    expect(small).not.toContain(trainWagon(4));
    expect(small).toContain(trainFind(3));
    // На запасном пути бывают и номера больше самого большого.
    const lost = gamePhrases(
      gameSpec.parse({ kind: 'train', task: 'missing', max: 3, rounds: 2 }) as GameSpec,
    );
    expect(lost).toContain(trainWagon(9));
    expect(lost).not.toContain(TRAIN_PROMPT);
  });
});
