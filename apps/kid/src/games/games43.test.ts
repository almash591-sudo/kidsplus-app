import { gameSpec, type GameSpec } from '@kidsplus/shared/games';
import { describe, expect, it } from 'vitest';
import { diveCatch, divePhrases, gamePhrases, rocketPhrases, rocketWrongColor } from '../phrases';
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
import {
  blueprintOf,
  fits,
  flightPhrase,
  flightTasks,
  partsOf,
  planetAnswers,
  planetPhrase,
  taskLabel,
  trayOf,
} from './rocketLogic';

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

const rocket = (raw: object) => gameSpec.parse({ kind: 'rocket', ...raw }) as SpecOf<'rocket'>;

describe('ракета (этап 43)', () => {
  it('чертёж: цвет у каждой цветной детали, соседние разные; на столе — верная и чужого цвета', () => {
    const rnd = seeded(7);
    for (let k = 0; k < 40; k++) {
      const s = rocket({ parts: 5, max: 5, rounds: 2 });
      const parts = partsOf(s);
      expect(parts).toEqual(['body', 'fins', 'nose', 'window', 'engine']);
      const bp = blueprintOf(s, rnd);
      expect(bp.body).not.toBe(bp.fins);
      expect(bp.fins).not.toBe(bp.nose);
      const tray = trayOf(bp, parts, rnd);
      expect(tray).toHaveLength(9);
      expect(new Set(tray.map((t) => t.id)).size).toBe(9);
      for (const part of parts) {
        const mine = tray.filter((t) => t.part === part);
        expect(mine.filter((t) => fits(bp, t))).toHaveLength(1);
        expect(mine).toHaveLength(part === 'window' ? 1 : 2);
      }
    }
    expect(partsOf(rocket({ parts: 3, max: 5, rounds: 1 }))).toEqual(['body', 'fins', 'nose']);
  });

  it('полёты: ответы до max, подряд не повторяются; на планетах — ответ и два других', () => {
    const rnd = seeded(3);
    for (let k = 0; k < 40; k++) {
      for (const quiz of ['numbers', 'sums', 'letters'] as const) {
        const s = rocket({ parts: 3, quiz, max: 4, rounds: 5 });
        const tasks = flightTasks(s, rnd);
        expect(tasks).toHaveLength(5);
        for (const [i, t] of tasks.entries()) {
          if (i) expect(t.answer).not.toBe(tasks[i - 1]!.answer);
          if (t.kind === 'sum') {
            expect(t.a + t.b).toBe(t.answer);
            expect(t.a).toBeGreaterThanOrEqual(1);
            expect(t.b).toBeGreaterThanOrEqual(1);
            expect(t.answer).toBeLessThanOrEqual(4);
          }
          if (t.kind === 'number') expect(t.answer).toBeLessThanOrEqual(4);
          const answers = planetAnswers(t, s, rnd);
          expect(answers).toHaveLength(3);
          expect(new Set(answers).size).toBe(3);
          expect(answers).toContain(t.answer);
        }
      }
    }
  });

  it('фразы: «Нужен синий корпус», «Нужны зелёные крылья», задания и подписи; всё озвучено заранее', () => {
    expect(rocketWrongColor('body', 'blue')).toBe('Нужен синий корпус.');
    expect(rocketWrongColor('fins', 'green')).toBe('Нужны зелёные крылья.');
    const sum = { kind: 'sum', a: 2, b: 3, answer: 5 } as const;
    expect(taskLabel(sum)).toBe('2 + 3 = ?');
    expect(flightPhrase(sum)).toBe('Сколько будет два плюс три? Лети на планету с ответом!');
    expect(planetPhrase(3)).toBe('Здесь три.');
    expect(planetPhrase('М')).toBe('Здесь буква М.');
    for (const quiz of ['numbers', 'sums', 'letters'] as const) {
      // На уровнях max растёт до 10 — фразы озвучиваются на все.
      const all = gamePhrases(rocket({ parts: 3, quiz, max: 3, rounds: 1 }) as GameSpec);
      for (const p of rocketPhrases(quiz)) expect(all).toContain(p);
      expect(all).toContain('Нужны фиолетовые крылья.');
    }
    expect(rocketPhrases('sums')).toContain(flightPhrase({ kind: 'sum', a: 4, b: 6, answer: 10 }));
  });
});
