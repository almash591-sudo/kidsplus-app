// Этап 58: «Сложи фигуру» — фигуры из семи деталей танграма, куда ложится деталь, раунды,
// фигура с лотком на экранах, фразы.
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { FIGURE_SHAPES, gameSpec, type GameSpec } from '@kidsplus/shared/games';
import { describe, expect, it } from 'vitest';
import {
  FIGURE_DONE,
  FIGURE_END,
  FIGURE_NOT_HERE,
  FIGURE_TURN,
  figureTask,
  gamePhrases,
} from '../phrases';
import type { SpecOf } from './common';
import {
  ALIVE,
  AREA,
  area,
  centroid,
  dropAt,
  figureOrder,
  FIGURES,
  figureSprites,
  fits,
  inside,
  overlaps,
  OWL_RIGHT,
  planFigure,
  radius,
  SET,
  stageFor,
  TOP_BUTTONS,
  toFigure,
  toScreen,
  type Box,
  type Pt,
} from './figureLogic';

const spec = (o: object) => gameSpec.parse({ kind: 'figure', rounds: 4, ...o }) as SpecOf<'figure'>;
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
const boxIn = (a: Box, b: Box, eps = 1e-6) =>
  a.x >= b.x - eps &&
  a.y >= b.y - eps &&
  a.x + a.w <= b.x + b.w + eps &&
  a.y + a.h <= b.y + b.h + eps;
const boxHit = (a: Box, b: Box) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const near = (a: number, b: number) => Math.abs(a - b) < 1e-6;
const sides = (v: readonly Pt[]) =>
  v.map((p, i) => Math.hypot(v[(i + 1) % v.length]![0] - p[0], v[(i + 1) % v.length]![1] - p[1]));
/** Точка на отрезке ab. */
const onSegment = (p: Pt, a: Pt, b: Pt) => {
  const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const cross = ((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])) / l;
  const dot = ((p[0] - a[0]) * (b[0] - a[0]) + (p[1] - a[1]) * (b[1] - a[1])) / l;
  return Math.abs(cross) < 1e-6 && dot > -1e-6 && dot < l + 1e-6;
};
const touch = (a: readonly Pt[], b: readonly Pt[]) =>
  [
    [a, b],
    [b, a],
  ].some(([p, q]) =>
    p!.some((pt) => q!.some((s, i) => onSegment(pt, s, q![(i + 1) % q!.length]!))),
  );

describe('«Сложи фигуру»: фигуры', () => {
  it('в каждой фигуре все семь деталей танграма, каждая — своей формы', () => {
    const R = Math.SQRT2;
    for (const f of FIGURE_SHAPES) {
      const fig = FIGURES[f];
      const count: Record<string, number> = {};
      for (const p of fig.pieces) count[p.type] = (count[p.type] ?? 0) + 1;
      expect(count, f).toEqual(SET);
      for (const p of fig.pieces) {
        expect(area(p.v), `${f} ${p.type}`).toBeCloseTo(AREA[p.type], 6);
        const s = sides(p.v);
        const sorted = [...s].sort((a, b) => a - b);
        const want = {
          small: [1, 1, R],
          mid: [R, R, 2],
          big: [2, 2, 2 * R],
          square: [1, 1, 1, 1],
          para: [1, 1, R, R],
        }[p.type];
        sorted.forEach((x, i) => expect(x, `${f} ${p.type}`).toBeCloseTo(want[i]!, 6));
        if (p.type === 'para' || p.type === 'square') {
          // Параллелограмм: середины диагоналей совпадают, стороны 1 и √2 чередуются.
          const [a, b, c, d] = p.v as [Pt, Pt, Pt, Pt];
          expect(near(a[0] + c[0], b[0] + d[0]) && near(a[1] + c[1], b[1] + d[1]), f).toBe(true);
          expect(near(s[0]!, s[2]!) && near(s[1]!, s[3]!), f).toBe(true);
        }
      }
    }
  });

  it('детали не налезают друг на друга, площадь 8, фигура — одним куском', () => {
    for (const f of FIGURE_SHAPES) {
      const { pieces, w, h } = FIGURES[f];
      expect(pieces.reduce((a, p) => a + area(p.v), 0)).toBeCloseTo(8, 6);
      for (let i = 0; i < pieces.length; i++)
        for (let j = i + 1; j < pieces.length; j++)
          expect(overlaps(pieces[i]!.v, pieces[j]!.v), `${f}: ${i} и ${j}`).toBe(false);
      // Все детали связаны: касаются стороной или углом.
      const seen = new Set([0]);
      for (let grew = true; grew;) {
        grew = false;
        for (let i = 0; i < pieces.length; i++)
          if (!seen.has(i) && [...seen].some((j) => touch(pieces[i]!.v, pieces[j]!.v))) {
            seen.add(i);
            grew = true;
          }
      }
      expect(seen.size, f).toBe(7);
      const xs = pieces.flatMap((p) => p.v.map((q) => q[0]));
      const ys = pieces.flatMap((p) => p.v.map((q) => q[1]));
      expect(Math.min(...xs)).toBeCloseTo(0, 9);
      expect(Math.min(...ys)).toBeCloseTo(0, 9);
      expect(Math.max(...xs)).toBeCloseTo(w, 9);
      expect(Math.max(...ys)).toBeCloseTo(h, 9);
    }
  });

  it('одинаковые детали встают на места друг друга поворотом; квадрат — при любом', () => {
    for (const f of FIGURE_SHAPES) {
      const fig = FIGURES[f];
      fig.pieces.forEach((p, i) => {
        expect(fits(fig, i, 0, i)).toBe(true);
        fig.pieces.forEach((q, j) => {
          const ks = [0, 1, 2, 3].filter((k) => fits(fig, i, k, j));
          if (q.type !== p.type) expect(ks).toEqual([]);
          else expect(ks.length, `${f}: ${i} → ${j}`).toBeGreaterThan(0);
          if (i === j && p.type === 'square') expect(ks).toEqual([0, 1, 2, 3]);
          if (i === j && p.type !== 'square' && p.type !== 'para') expect(ks).toEqual([0]);
          // Параллелограмм симметричен поворотом на пол-оборота.
          if (i === j && p.type === 'para') expect(ks).toEqual([0, 2]);
        });
      });
    }
  });

  it('оживает: глаза и дым — на фигуре, хвост качается вокруг точки стыка', () => {
    for (const f of FIGURE_SHAPES) {
      const fig = FIGURES[f];
      const a = ALIVE[f];
      for (const e of a.eyes)
        expect(
          fig.pieces.some((p) => inside(e, p.v)),
          `${f}: глаз`,
        ).toBe(true);
      if (a.pivot) {
        expect(a.wag.length).toBeGreaterThan(0);
        const tail = a.wag.map((i) => fig.pieces[i]!.v);
        const body = fig.pieces.filter((_, i) => !a.wag.includes(i)).map((p) => p.v);
        const onPiece = (vs: (readonly Pt[])[]) =>
          vs.some((v) => v.some((s, i) => onSegment(a.pivot!, s, v[(i + 1) % v.length]!)));
        expect(onPiece(tail) && onPiece(body), `${f}: стык хвоста`).toBe(true);
      }
    }
    expect(FIGURES.house.pieces[ALIVE.house.window!]!.type).toBe('square');
    expect(ALIVE.fish.eyes).toHaveLength(1);
    expect(ALIVE.cat.eyes).toHaveLength(2);
    expect(ALIVE.cat.wag.map((i) => FIGURES.cat.pieces[i]!.type)).toEqual(['para']);
    // Глаз рыбки — у носа (справа), хвост — слева: она плывёт вправо.
    expect(ALIVE.fish.eyes[0]![0]).toBeGreaterThan(FIGURES.fish.w * 0.6);
    expect(ALIVE.fish.pivot![0]).toBeLessThan(FIGURES.fish.w * 0.5);
  });
});

describe('«Сложи фигуру»: куда отпустили деталь', () => {
  const fig = FIGURES.house;
  const c = (i: number) => centroid(fig.pieces[i]!.v);
  const bigs = [0, 1];

  it('на своё место — встаёт; на место такой же детали — тоже', () => {
    const none = new Set<number>();
    expect(dropAt(fig, none, 0, 0, c(0), false)).toEqual({ kind: 'snap', slot: 0 });
    expect(dropAt(fig, none, 0, 0, c(1), false)).toEqual({ kind: 'snap', slot: 1 });
    // Чуть мимо середины — тоже притягивается.
    const [x, y] = c(5);
    expect(dropAt(fig, none, 5, 0, [x + 0.4, y - 0.3], false)).toEqual({ kind: 'snap', slot: 5 });
    // Место занято — на соседнее такое же, если оно рядом; если нет — обратно.
    expect(dropAt(fig, new Set([1]), 0, 0, c(1), false).kind).not.toBe('snap');
  });

  it('с поворотами: лежит не так — «поверни», повёрнута как надо — встаёт', () => {
    const none = new Set<number>();
    const k = [1, 2, 3].find((q) => !bigs.some((j) => fits(fig, 0, q, j)))!;
    expect(dropAt(fig, none, 0, k, c(0), true)).toEqual({ kind: 'turn', slot: 0 });
    expect(dropAt(fig, none, 0, k, c(0), false)).toEqual({ kind: 'snap', slot: 0 });
    // Большой треугольник крыши, повёрнутый на четверть, — как раз второй скат.
    const other = [1, 2, 3].find((q) => fits(fig, 0, q, 1))!;
    expect(dropAt(fig, none, 0, other, c(1), true)).toEqual({ kind: 'snap', slot: 1 });
    // Квадрат при любом повороте встаёт.
    expect(dropAt(fig, none, 5, 1, c(5), true)).toEqual({ kind: 'snap', slot: 5 });
  });

  it('на чужое пустое место — ошибка; мимо фигуры или на занятое — просто обратно', () => {
    const none = new Set<number>();
    // Маленький треугольник на квадрат.
    expect(dropAt(fig, none, 4, 0, c(5), false)).toEqual({ kind: 'wrong' });
    expect(dropAt(fig, none, 4, 0, [-3, -3], false)).toEqual({ kind: 'miss' });
    expect(dropAt(fig, new Set([5]), 4, 0, c(5), false)).toEqual({ kind: 'miss' });
  });
});

describe('«Сложи фигуру»: раунды', () => {
  it('фигуры по кругу, в перемешку, без одной и той же два раза подряд', () => {
    for (let seed = 1; seed < 40; seed++) {
      const order = figureOrder(FIGURE_SHAPES, 6, seeded(seed));
      expect(order).toHaveLength(6);
      expect(new Set(order.slice(0, 4)).size).toBe(4);
      order.forEach((f, i) => i && expect(f).not.toBe(order[i - 1]));
    }
    expect(figureOrder(['cat'], 3, seeded(3))).toEqual(['cat', 'cat', 'cat']);
  });

  it('сколько деталей собрать; две — разные; крупные в лотке первыми', () => {
    for (let seed = 1; seed < 60; seed++) {
      for (const pieces of [2, 4, 7]) {
        const rounds = planFigure(spec({ pieces }), seeded(seed));
        expect(rounds).toHaveLength(4);
        for (const r of rounds) {
          const fig = FIGURES[r.figure];
          expect(r.loose).toHaveLength(pieces);
          expect(new Set(r.loose).size).toBe(pieces);
          expect(r.turns).toEqual(r.loose.map(() => 0));
          if (pieces === 2)
            expect(fig.pieces[r.loose[0]!]!.type).not.toBe(fig.pieces[r.loose[1]!]!.type);
          const rs = r.loose.map((i) => radius(fig, i));
          rs.forEach((x, i) => i && expect(x).toBeLessThanOrEqual(rs[i - 1]! + 1e-9));
        }
      }
    }
  });

  it('с поворотами деталь в лотке не ложится ни на одно своё место без поворота', () => {
    for (let seed = 1; seed < 60; seed++)
      for (const r of planFigure(spec({ pieces: 4, turn: true }), seeded(seed))) {
        const fig = FIGURES[r.figure];
        r.loose.forEach((idx, n) => {
          expect(r.turns[n]).toBeGreaterThanOrEqual(1);
          expect(r.turns[n]).toBeLessThanOrEqual(3);
          if (fig.pieces[idx]!.type !== 'square')
            expect(r.loose.some((j) => fits(fig, idx, r.turns[n]!, j))).toBe(false);
        });
      }
  });

  it('та же фигура ещё раз — собирать другие детали', () => {
    for (let seed = 1; seed < 30; seed++) {
      const rounds = planFigure(spec({ figures: ['fish'], pieces: 2, rounds: 3 }), seeded(seed));
      const key = (r: (typeof rounds)[number]) => [...r.loose].sort().join();
      expect(key(rounds[1]!)).not.toBe(key(rounds[0]!));
      expect(key(rounds[2]!)).not.toBe(key(rounds[1]!));
    }
  });
});

describe('«Сложи фигуру»: фигура и лоток на экране', () => {
  const cases = FIGURE_SHAPES.flatMap((f) =>
    [2, 4, 7].flatMap((pieces) =>
      [1, 2, 3].map((seed) => ({
        f,
        loose: planFigure(spec({ figures: [f], pieces, rounds: 2 }), seeded(seed))[0]!.loose,
      })),
    ),
  );

  it('на всех экранах всё внутри; фигура, лоток и детали в нём не налезают', () => {
    for (const [w, h] of SCREENS)
      for (const { f, loose } of cases) {
        const st = stageFor(w, h, FIGURES[f], loose);
        const at = `${w}×${h} ${f} ${loose.length}`;
        const screen = { x: 0, y: 0, w, h };
        expect(boxIn(st.box, screen), at).toBe(true);
        expect(boxIn(st.tray, screen), at).toBe(true);
        expect(boxHit(st.box, st.tray), at).toBe(false);
        expect(st.cells).toHaveLength(loose.length);
        st.cells.forEach((c, i) => {
          const cb = { x: c.x - c.r, y: c.y - c.r, w: 2 * c.r, h: 2 * c.r };
          expect(boxIn(cb, st.tray, 0.5), `${at} деталь ${i}`).toBe(true);
          expect(c.r).toBeCloseTo(radius(FIGURES[f], loose[i]!) * st.tunit, 6);
          st.cells.forEach((d, j) => {
            if (j > i) expect(Math.hypot(c.x - d.x, c.y - d.y), at).toBeGreaterThan(c.r + d.r);
          });
        });
        // Сова и кнопки: стоя фигура ниже их, лёжа — правее совы, лоток — ниже «послушать».
        if (st.land) {
          expect(st.box.x, at).toBeGreaterThanOrEqual(OWL_RIGHT);
          expect(st.tray.y, at).toBeGreaterThanOrEqual(TOP_BUTTONS);
        } else expect(st.box.y, at).toBeGreaterThanOrEqual(100);
      }
  });

  it('фигура на телефонах крупная, детали в лотке — по пальцу и не больше, чем в фигуре', () => {
    for (const [w, h] of SCREENS)
      for (const { f, loose } of cases) {
        const st = stageFor(w, h, FIGURES[f], loose);
        const at = `${w}×${h} ${f} ${loose.length}`;
        expect(st.unit, at).toBeGreaterThanOrEqual(48);
        expect(st.tunit, at).toBeLessThanOrEqual(st.unit);
        // Самая маленькая деталь в лотке — не меньше 36 px в поперечнике.
        expect(st.tunit * 2 * 0.707, at).toBeGreaterThanOrEqual(36);
        if (loose.length <= 4) expect(st.tunit, at).toBeGreaterThanOrEqual(st.unit * 0.5);
      }
  });

  it('из точки фигуры на экран и обратно', () => {
    const st = stageFor(412, 915, FIGURES.cat, [0, 1]);
    const p = toScreen(st, [1.5, 2.25]);
    const [x, y] = toFigure(st, p[0], p[1]);
    expect(x).toBeCloseTo(1.5, 9);
    expect(y).toBeCloseTo(2.25, 9);
  });

  it('все картинки — свои и лежат в public/games', () => {
    const s = figureSprites();
    expect(new Set(s).size).toBe(s.length);
    for (const name of s) {
      expect(name.startsWith('figure-')).toBe(true);
      const file = fileURLToPath(new URL(`../../public/games/${name}.webp`, import.meta.url));
      expect(existsSync(file), name).toBe(true);
    }
  });
});

describe('«Сложи фигуру»: фразы', () => {
  it('все фразы игры — в списке озвучки, лишних нет', () => {
    const all = gamePhrases(gameSpec.parse({ kind: 'figure', turn: true, rounds: 4 }) as GameSpec);
    for (const f of FIGURE_SHAPES)
      for (const p of [figureTask(f, true), FIGURE_DONE[f]]) expect(all).toContain(p);
    for (const p of [FIGURE_TURN, FIGURE_NOT_HERE, FIGURE_END]) expect(all).toContain(p);
    expect(new Set(all).size).toBe(all.length);
    expect(all).not.toContain('');
    expect(figureTask('fish', false)).toBe('Собери рыбку! Перетащи детальки на свои места.');
    const easy = gamePhrases(
      gameSpec.parse({ kind: 'figure', figures: ['house'], rounds: 2 }) as GameSpec,
    );
    expect(easy).not.toContain(FIGURE_TURN);
    expect(easy).not.toContain(FIGURE_DONE.fish);
  });
});
