// Этап 57: «Шестерёнки» — цепочки, зубцы входят во впадины, всё помещается на экранах, фразы.
import { gameSpec, type GameSpec } from '@kidsplus/shared/games';
import { describe, expect, it } from 'vitest';
import {
  GEARS_BIG,
  GEARS_END,
  GEARS_GAP,
  GEARS_LOOK,
  GEARS_RIGHT,
  GEARS_SMALL,
  GEARS_TURN,
  gamePhrases,
  gearsBuild,
  gearsDir,
  gearsWhich,
  gearsWorks,
} from '../phrases';
import type { SpecOf } from './common';
import {
  chainAngles,
  chainFits,
  DRIVER_TEETH,
  fitRound,
  gearOutline,
  gearsSprites,
  layoutChain,
  machineDir,
  MACHINES,
  middleTeeth,
  outer,
  outputTeeth,
  pitch,
  planGears,
  spinOf,
  stageFor,
  trayLayout,
  type Pt,
} from './gearsLogic';

const spec = (o: object) => gameSpec.parse({ kind: 'gears', rounds: 3, ...o }) as SpecOf<'gears'>;
/** Простой повторяемый генератор для тестов. */
const seeded = (seed: number) => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
/** S20 стоя и лёжа, iPhone 15 и SE (как в e2e), обычный Android и планшеты. */
const SCREENS = [
  [412, 915],
  [915, 412],
  [393, 659],
  [320, 568],
  [360, 640],
  [393, 852],
  [852, 393],
  [768, 1024],
  [1024, 768],
] as const;
const TARGET = SCREENS.slice(0, 4);

/** Контур шестерёнки на месте: центр c, повёрнута на a (плюс — по часовой на экране). */
const placed = (teeth: number, c: Pt, a: number): Pt[] =>
  gearOutline(teeth).map(([t, r]) => ({
    x: c.x + r * Math.cos(t + a),
    y: c.y + r * Math.sin(t + a),
  }));
/** Точка внутри многоугольника (чётность пересечений). */
const inside = (p: Pt, poly: Pt[]) => {
  let odd = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x)
      odd = !odd;
  }
  return odd;
};
/** Точки на сторонах контура — гуще, чем вершины. */
const dense = (poly: Pt[], per = 6) =>
  poly.flatMap((a, i) => {
    const b = poly[(i + 1) % poly.length]!;
    return Array.from({ length: per }, (_, k) => ({
      x: a.x + ((b.x - a.x) * k) / per,
      y: a.y + ((b.y - a.y) * k) / per,
    }));
  });
/** Насколько контуры двух шестерёнок залезают друг в друга: сколько точек одной — внутри другой. */
const overlap = (a: Pt[], b: Pt[]) =>
  dense(a).filter((p) => inside(p, b)).length + dense(b).filter((p) => inside(p, a)).length;

describe('«Шестерёнки»: задания', () => {
  it('у ручки — большая, у машины — средняя (у вертушки — маленькая), между — сколько пустых', () => {
    for (let seed = 1; seed < 60; seed++) {
      for (const gaps of [1, 2, 3, 4]) {
        const rounds = planGears(spec({ gaps, sizes: seed % 2 === 0, rounds: 6 }), seeded(seed));
        for (const r of rounds) {
          expect(r.chain).toHaveLength(gaps + 2);
          expect(r.chain[0]).toBe(DRIVER_TEETH);
          expect(r.chain.at(-1)).toBe(outputTeeth(r.machine));
          expect(r.empty).toEqual(Array.from({ length: gaps }, (_, k) => k + 1));
        }
      }
    }
    expect(outputTeeth('pinwheel')).toBe(8);
    expect(outputTeeth('mill')).toBe(12);
  });

  it('машины по кругу — все три, задания по очереди', () => {
    const rounds = planGears(spec({ tasks: ['build', 'direction'], rounds: 6 }), seeded(5));
    expect(rounds.map((r) => r.kind)).toEqual([
      'build',
      'direction',
      'build',
      'direction',
      'build',
      'direction',
    ]);
    expect(new Set(rounds.slice(0, 3).map((r) => r.machine)).size).toBe(3);
    for (const r of rounds.filter((x) => x.kind === 'direction')) {
      expect(r.empty).toEqual([]);
      expect(r.tray).toEqual([]);
    }
    const cranks = new Set<number>();
    for (let seed = 1; seed < 40; seed++)
      for (const r of planGears(spec({ tasks: ['direction'] }), seeded(seed))) cranks.add(r.crank);
    expect([...cranks].sort()).toEqual([-1, 1]);
  });

  it('одинаковые — все средние и в коробке ровно они; разные — два размера, больших не больше двух', () => {
    for (let seed = 1; seed < 200; seed++) {
      const rnd = seeded(seed);
      expect(middleTeeth(3, false, rnd)).toEqual([12, 12, 12]);
      expect([8, 16]).toContain(middleTeeth(1, true, rnd)[0]);
      for (const gaps of [2, 3, 4]) {
        const m = middleTeeth(gaps, true, rnd);
        expect(new Set(m).size).toBeGreaterThanOrEqual(2);
        expect(m.filter((t) => t === 16).length).toBeLessThanOrEqual(2);
      }
      for (const r of planGears(spec({ gaps: 2 }), rnd)) expect(r.tray).toEqual([12, 12]);
      for (const r of planGears(spec({ gaps: 1 + (seed % 4), sizes: true }), rnd)) {
        const need = r.chain.slice(1, -1);
        // Всё нужное есть, есть из чего выбирать: всех трёх размеров и хотя бы одна лишняя.
        const left = [...r.tray];
        for (const t of need) {
          const i = left.indexOf(t);
          expect(i).toBeGreaterThanOrEqual(0);
          left.splice(i, 1);
        }
        expect(left.length).toBeGreaterThanOrEqual(1);
        expect(new Set(r.tray)).toEqual(new Set([8, 12, 16]));
      }
    }
  });

  it('соседние крутятся в разные стороны, машина — как последняя', () => {
    expect([0, 1, 2, 3].map((i) => spinOf(1, i))).toEqual([1, -1, 1, -1]);
    expect([0, 1, 2].map((i) => spinOf(-1, i))).toEqual([-1, 1, -1]);
    expect(machineDir({ chain: [16, 12, 12], crank: 1 })).toBe(1);
    expect(machineDir({ chain: [16, 12, 8, 12], crank: 1 })).toBe(-1);
    expect(machineDir({ chain: [16, 12, 12, 12, 8], crank: -1 })).toBe(-1);
  });
});

describe('«Шестерёнки»: зубчики', () => {
  it('контур: зубцов сколько надо, кончики — на одном расстоянии у всех размеров', () => {
    for (const n of [8, 12, 16]) {
      const o = gearOutline(n);
      expect(o).toHaveLength(5 * n);
      const tips = o.filter(([, r]) => r > pitch(n));
      expect(tips).toHaveLength(2 * n);
      for (const [, r] of tips) expect(r).toBeCloseTo(outer(n));
    }
  });

  it('сцеплены: зубец входит во впадину при любом повороте ручки и не застревает', () => {
    const pairs = [
      [16, 12],
      [12, 8],
      [8, 16],
      [16, 16],
      [12, 12],
      [8, 8],
    ];
    for (const [n0, n1] of pairs) {
      for (const th of [0, 0.7, 2.1, -2.6]) {
        const d = pitch(n0!) + pitch(n1!);
        const pos = [
          { x: 0, y: 0 },
          { x: d * Math.cos(th), y: d * Math.sin(th) },
        ];
        let closest = Infinity;
        for (let k = 0; k < 40; k++) {
          const a0 = (k / 40) * ((2 * Math.PI) / n0!) * 3 - 1;
          const [a, b] = chainAngles([n0!, n1!], pos, a0);
          const g0 = placed(n0!, pos[0]!, a!);
          const g1 = placed(n1!, pos[1]!, b!);
          expect(overlap(g0, g1), `${n0}-${n1} θ=${th} a0=${a0}`).toBe(0);
          // И не болтаются: какой-то зубец почти касается соседки.
          for (const p of g1) closest = Math.min(closest, Math.hypot(p.x, p.y) - pitch(n0!));
        }
        expect(closest).toBeLessThan(0.1);
      }
    }
  });

  it('а повёрнутая на ползубца — застревает (проверка проверки)', () => {
    const pos = [
      { x: 0, y: 0 },
      { x: pitch(12) + pitch(16), y: 0 },
    ];
    const [a, b] = chainAngles([12, 16], pos, 0.3);
    expect(
      overlap(placed(12, pos[0]!, a!), placed(16, pos[1]!, b! + Math.PI / 16)),
    ).toBeGreaterThan(0);
  });

  it('по цепочке: каждая следующая — в обратную сторону и во столько раз медленнее', () => {
    const chain = [16, 12, 8, 12];
    const pos = [
      { x: 0, y: 0 },
      { x: 2.3, y: 0.4 },
      { x: 3.4, y: 2.1 },
      { x: 5, y: 2.6 },
    ];
    const a = chainAngles(chain, pos, 0);
    const b = chainAngles(chain, pos, 0.01);
    for (let i = 0; i < chain.length; i++)
      expect(b[i]! - a[i]!).toBeCloseTo((spinOf(1, i) * 0.01 * chain[0]!) / chain[i]!, 10);
  });
});

describe('«Шестерёнки»: мастерская', () => {
  it('на всех экранах цепочка помещается: соседки сцеплены, остальные не задевают друг друга', () => {
    for (const [w, h] of SCREENS) {
      for (const m of MACHINES) {
        const o = stageFor(w, h, m).layout;
        for (let seed = 1; seed <= 12; seed++) {
          for (const gaps of [1, 2, 3, 4]) {
            const [r] = planGears(
              spec({ gaps, sizes: seed % 3 > 0, rounds: 2 }),
              seeded(seed * 31),
            );
            const fit = fitRound(r!, o, seed % 3 > 0, seeded(seed));
            expect(
              chainFits(fit.round.chain, fit.pos, o),
              `${w}×${h} ${m} ${fit.round.chain}`,
            ).toBe(true);
            // Ручка — на своём отрезке, машина — на своём месте.
            expect(fit.pos.at(-1)).toEqual(o.to);
          }
        }
      }
    }
  });

  it('на телефонах из e2e цепочку не приходится упрощать', () => {
    for (const [w, h] of TARGET) {
      for (const m of MACHINES) {
        const o = stageFor(w, h, m).layout;
        for (let seed = 1; seed <= 25; seed++) {
          for (const gaps of [1, 2, 3, 4]) {
            const chain = [
              DRIVER_TEETH,
              ...middleTeeth(gaps, true, seeded(seed * 7)),
              outputTeeth(m),
            ];
            expect(layoutChain(chain, o, seeded(seed)), `${w}×${h} ${m} ${chain}`).not.toBeNull();
          }
        }
      }
    }
  });

  it('если цепочка никак не помещается — берутся средние, а в крайнем случае одна', () => {
    const o = stageFor(412, 915, 'mill').layout;
    const tight = { ...o, box: { x: o.to.x - 6, y: o.to.y - 3, w: 7.5, h: 6 } };
    const [r] = planGears(spec({ gaps: 4, sizes: true }), seeded(3));
    const fit = fitRound(r!, tight, true, seeded(3));
    expect(fit.pos).toHaveLength(fit.round.chain.length);
    expect(fit.round.empty).toEqual(fit.round.chain.slice(1, -1).map((_, k) => k + 1));
    expect(fit.round.chain[0]).toBe(DRIVER_TEETH);
    expect(fit.round.chain.at(-1)).toBe(12);
  });

  it('коробка: все шестерёнки в ней, в одном масштабе, друг на друга не налезают', () => {
    for (const [w, h] of SCREENS) {
      const st = stageFor(w, h, 'mill');
      for (const teeth of [[12], [12, 12, 12, 12], [8, 12, 16, 16, 8], [16, 8, 12]]) {
        const { scale, at } = trayLayout(teeth, st.tray);
        expect(scale).toBeGreaterThan(0.5);
        expect(scale).toBeLessThanOrEqual(1);
        teeth.forEach((t, i) => {
          const r = outer(t) * scale;
          const p = at[i]!;
          expect(p.x - r).toBeGreaterThanOrEqual(st.tray.x - 1e-9);
          expect(p.x + r).toBeLessThanOrEqual(st.tray.x + st.tray.w + 1e-9);
          expect(p.y - r).toBeGreaterThanOrEqual(st.tray.y - 1e-9);
          expect(p.y + r).toBeLessThanOrEqual(st.tray.y + st.tray.h + 1e-9);
          for (let j = 0; j < i; j++)
            expect(Math.hypot(p.x - at[j]!.x, p.y - at[j]!.y)).toBeGreaterThan(
              r + outer(teeth[j]!) * scale,
            );
        });
      }
    }
  });

  it('стоя коробка — под верстаком, лёжа — на верстаке слева; машина справа', () => {
    const p = stageFor(412, 915, 'wheel');
    expect(p.land).toBe(false);
    expect(p.tray.y).toBeGreaterThan(p.bench);
    expect(p.layout.to.x).toBeGreaterThan(p.W / 2);
    const l = stageFor(915, 412, 'wheel');
    expect(l.land).toBe(true);
    expect(l.tray.x + l.tray.w).toBeLessThan(l.layout.to.x);
    expect(l.tray.y + l.tray.h).toBeLessThanOrEqual(l.H + 1e-9);
  });

  it('все картинки — свои', () => {
    const s = gearsSprites();
    expect(new Set(s).size).toBe(s.length);
    for (const name of s) expect(name.startsWith('gears-')).toBe(true);
  });
});

describe('«Шестерёнки»: фразы', () => {
  it('все фразы игры — в списке озвучки, лишних нет', () => {
    const all = gamePhrases(
      gameSpec.parse({
        kind: 'gears',
        tasks: ['build', 'direction'],
        sizes: true,
        rounds: 3,
      }) as GameSpec,
    );
    for (const m of MACHINES)
      for (const p of [gearsBuild(m), gearsWorks(m), gearsWhich(m)]) expect(all).toContain(p);
    for (const p of [
      GEARS_BIG,
      GEARS_SMALL,
      GEARS_TURN,
      GEARS_GAP,
      GEARS_RIGHT,
      GEARS_LOOK,
      GEARS_END,
      gearsDir(1),
      gearsDir(-1),
    ])
      expect(all).toContain(p);
    expect(gearsBuild('wheel')).toBe(
      'Колесо обозрения не едет! Поставь шестерёнки на пустые места — чтобы зубчики сцепились.',
    );
    // Только «собери» одинаковыми: ни «великовата», ни «в какую сторону».
    const small = gamePhrases(gameSpec.parse({ kind: 'gears', rounds: 3 }) as GameSpec);
    expect(small).toContain(GEARS_TURN);
    expect(small).not.toContain(GEARS_BIG);
    expect(small).not.toContain(gearsWhich('mill'));
    expect(small).not.toContain(GEARS_LOOK);
  });
});
