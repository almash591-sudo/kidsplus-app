// Логика «Сложи фигуру» (этап 58) отдельно от рисования: семь деталей танграма, фигуры из них,
// какая деталь встаёт на какое место (одинаковые — на любое из своих), повороты, раунды и как
// фигура с лотком деталей помещается на экране.
import type { FigureShape } from '@kidsplus/shared/games';
import type { SpecOf } from './common';

export type Pt = readonly [number, number];
/** Детали танграма: большой, средний и маленький треугольник, квадрат, параллелограмм. */
export type PieceType = 'big' | 'mid' | 'small' | 'square' | 'para';
/** Сколько каких деталей в наборе — всего семь. */
export const SET: Record<PieceType, number> = { big: 2, mid: 1, small: 2, square: 1, para: 1 };
/** Площадь детали (катет маленького треугольника — 1): всего 8. */
export const AREA: Record<PieceType, number> = { big: 2, mid: 1, small: 0.5, square: 1, para: 1 };
/** Цвета деталей — у одинаковых разные: первая и вторая. */
export const PIECE_COLORS: Record<PieceType, readonly string[]> = {
  big: ['#ef5350', '#42a5f5'],
  mid: ['#66bb6a'],
  small: ['#ffca28', '#ff9f43'],
  square: ['#ab47bc'],
  para: ['#ec407a'],
};

export interface FigurePiece {
  type: PieceType;
  /** Вершины на своём месте в фигуре (y — вниз), по кругу. */
  v: Pt[];
}
export interface Figure {
  pieces: FigurePiece[];
  /** Ширина и высота фигуры (левый верхний угол — 0, 0). */
  w: number;
  h: number;
  /** Точка из чертежа фигуры (в его единицах) — в единицах фигуры. */
  at: (p: Pt) => Pt;
}

const S2 = Math.SQRT2;
/** Фигура из деталей: часть фигур удобнее задать в «косых» единицах (катет — √2). */
function figure(pieces: [PieceType, ...Pt[]][], unit = 1): Figure {
  const ps = pieces.map(([type, ...v]) => ({
    type,
    v: v.map(([x, y]) => [x / unit, y / unit] as const),
  }));
  const xs = ps.flatMap((p) => p.v.map((q) => q[0]));
  const ys = ps.flatMap((p) => p.v.map((q) => q[1]));
  const x0 = Math.min(...xs);
  const y0 = Math.min(...ys);
  return {
    pieces: ps.map((p) => ({ type: p.type, v: p.v.map(([x, y]) => [x - x0, y - y0] as const) })),
    w: Math.max(...xs) - x0,
    h: Math.max(...ys) - y0,
    at: ([x, y]) => [x / unit - x0, y / unit - y0],
  };
}

/** Фигуры: домик (крыша из двух больших), рыбка (хвост, ромб и плавники), кошка, кораблик. */
export const FIGURES: Record<FigureShape, Figure> = {
  house: figure([
    ['big', [0, 2], [2, 2], [2, 0]],
    ['big', [2, 0], [2, 2], [4, 2]],
    ['mid', [1, 2], [3, 2], [2, 3]],
    ['para', [1, 2], [1, 3], [2, 4], [2, 3]],
    ['small', [1, 3], [2, 4], [1, 4]],
    ['square', [2, 3], [3, 3], [3, 4], [2, 4]],
    ['small', [2, 3], [3, 2], [3, 3]],
  ]),
  fish: figure(
    [
      ['mid', [0, 0], [0, 2], [2, 2]],
      ['small', [0, 2], [2, 2], [1, 3]],
      ['small', [0, 2], [1, 3], [0, 4]],
      ['big', [2, 2], [6, 2], [4, 0]],
      ['big', [2, 2], [6, 2], [4, 4]],
      ['para', [3, 1], [4, 0], [4, -2], [3, -1]],
      ['square', [3, 3], [4, 4], [3, 5], [2, 4]],
    ],
    S2,
  ),
  cat: figure(
    [
      ['square', [1, 0], [2, 1], [1, 2], [0, 1]],
      ['small', [0, -1], [1, 0], [0, 1]],
      ['small', [2, -1], [1, 0], [2, 1]],
      ['mid', [0, 3], [2, 1], [2, 3]],
      ['big', [0, 3], [2 * S2, 3], [0, 3 + 2 * S2]],
      ['big', [2 * S2, 3], [2 * S2, 3 + 2 * S2], [0, 3 + 2 * S2]],
      [
        'para',
        [2 * S2, 1 + 2 * S2],
        [2 * S2, 3 + 2 * S2],
        [2 * S2 + 1, 2 + 2 * S2],
        [2 * S2 + 1, 2 * S2],
      ],
    ],
    S2,
  ),
  boat: figure([
    ['big', [2, 0], [2, 2], [0, 2]],
    ['big', [2, 0], [2, 2], [4, 2]],
    ['para', [-0.5, 2], [0.5, 2], [1.5, 3], [0.5, 3]],
    ['small', [0.5, 2], [1.5, 2], [1.5, 3]],
    ['square', [1.5, 2], [2.5, 2], [2.5, 3], [1.5, 3]],
    ['mid', [2.5, 2], [4.5, 2], [3.5, 3]],
    ['small', [2.5, 2], [3.5, 3], [2.5, 3]],
  ]),
};

/** Что оживает в собранной фигуре (в единицах фигуры). */
export interface Alive {
  /** Глаза. */
  eyes: Pt[];
  /** Какие детали качаются (хвост) и вокруг какой точки. */
  wag: number[];
  pivot?: Pt;
  /** Окошко (деталь) и откуда идёт дым. */
  window?: number;
  smoke?: Pt;
}
export const ALIVE: Record<FigureShape, Alive> = {
  // Домик: окошко в квадрате, дым из крыши справа.
  house: { eyes: [], wag: [], window: 5, smoke: FIGURES.house.at([3.15, 0.9]) },
  // Рыбка плывёт вправо: глаз у носа, хвост из трёх деталей качается вокруг стыка с телом.
  fish: { eyes: [FIGURES.fish.at([5, 1.6])], wag: [0, 1, 2], pivot: FIGURES.fish.at([2, 2]) },
  // Кошка: глаза на голове, хвост-параллелограмм машет от тела.
  cat: {
    eyes: [FIGURES.cat.at([0.68, 1.02]), FIGURES.cat.at([1.32, 1.02])],
    wag: [6],
    pivot: FIGURES.cat.at([2 * S2, 2.6 + 2 * S2]),
  },
  boat: { eyes: [], wag: [] },
};

// ─── Геометрия ───

export const centroid = (v: readonly Pt[]): Pt => [
  v.reduce((a, p) => a + p[0], 0) / v.length,
  v.reduce((a, p) => a + p[1], 0) / v.length,
];
export const area = (v: readonly Pt[]) =>
  Math.abs(
    v.reduce((a, p, i) => {
      const q = v[(i + 1) % v.length]!;
      return a + p[0] * q[1] - q[0] * p[1];
    }, 0),
  ) / 2;
/** Поворот на k четвертей по часовой стрелке на экране (y — вниз). */
export const turn = ([x, y]: Pt, k: number): Pt => {
  const q = ((k % 4) + 4) % 4;
  return q === 0 ? [x, y] : q === 1 ? [-y, x] : q === 2 ? [-x, -y] : [y, -x];
};
/** Вершины детали вокруг её середины. */
export const rel = (v: readonly Pt[]): Pt[] => {
  const [cx, cy] = centroid(v);
  return v.map(([x, y]) => [x - cx, y - cy] as const);
};
/** Одна и та же фигура на месте: те же вершины (в любом порядке). */
export const sameShape = (a: readonly Pt[], b: readonly Pt[], eps = 1e-6) =>
  a.length === b.length &&
  a.every((p) => b.some((q) => Math.abs(p[0] - q[0]) < eps && Math.abs(p[1] - q[1]) < eps));
/** Как лежит деталь места idx, повёрнутая на k четвертей (вокруг середины). */
export const shapeOf = (fig: Figure, idx: number, k: number) =>
  rel(fig.pieces[idx]!.v).map((p) => turn(p, k));
/** Деталь места idx, повёрнутая на k, ровно ложится на место j. */
export const fits = (fig: Figure, idx: number, k: number, j: number) =>
  fig.pieces[idx]!.type === fig.pieces[j]!.type &&
  sameShape(shapeOf(fig, idx, k), rel(fig.pieces[j]!.v));
/** Насколько деталь отходит от середины (для лотка: так она влезает при любом повороте). */
export const radius = (fig: Figure, idx: number) =>
  Math.max(...rel(fig.pieces[idx]!.v).map(([x, y]) => Math.hypot(x, y)));
/** Точка внутри выпуклого многоугольника (на краю — тоже). */
export function inside([x, y]: Pt, v: readonly Pt[], eps = 1e-9) {
  let sign = 0;
  for (let i = 0; i < v.length; i++) {
    const a = v[i]!;
    const b = v[(i + 1) % v.length]!;
    const c = (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]);
    if (Math.abs(c) < eps) continue;
    if (sign === 0) sign = Math.sign(c);
    else if (Math.sign(c) !== sign) return false;
  }
  return true;
}
/** Выпуклые многоугольники налезают друг на друга (общая сторона или угол — не в счёт). */
export function overlaps(a: readonly Pt[], b: readonly Pt[], eps = 1e-6) {
  for (const poly of [a, b])
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i]!;
      const q = poly[(i + 1) % poly.length]!;
      const nx = q[1] - p[1];
      const ny = p[0] - q[0];
      const l = Math.hypot(nx, ny);
      const pa = a.map((r) => (r[0] * nx + r[1] * ny) / l);
      const pb = b.map((r) => (r[0] * nx + r[1] * ny) / l);
      const gap =
        Math.min(Math.max(...pa), Math.max(...pb)) - Math.max(Math.min(...pa), Math.min(...pb));
      if (gap < eps) return false;
    }
  return true;
}

// ─── Куда отпустили деталь ───

/** На таком расстоянии от середины места деталь притягивается (в катетах маленького). */
export const SNAP = 0.75;
export type Drop =
  /** Встала на место slot (одинаковые детали — на любое своё). */
  | { kind: 'snap'; slot: number }
  /** Место её, но лежит не так — повернуть. */
  | { kind: 'turn'; slot: number }
  /** Не на своё место — ошибка. */
  | { kind: 'wrong' }
  /** Мимо фигуры или рядом со своим — просто обратно, не ошибка. */
  | { kind: 'miss' };

/**
 * Деталь места idx, повёрнутая на k, отпущена серединой в точке at (единицы фигуры); filled —
 * занятые места. Без поворотов (turn = false) деталь сама ложится как надо.
 */
export function dropAt(
  fig: Figure,
  filled: ReadonlySet<number>,
  idx: number,
  k: number,
  at: Pt,
  needTurn: boolean,
): Drop {
  const type = fig.pieces[idx]!.type;
  const empty = fig.pieces.map((_, j) => j).filter((j) => !filled.has(j));
  const dist = (j: number) => {
    const [cx, cy] = centroid(fig.pieces[j]!.v);
    return Math.hypot(at[0] - cx, at[1] - cy);
  };
  const same = empty.filter((j) => fig.pieces[j]!.type === type).sort((a, b) => dist(a) - dist(b));
  const near = same.filter((j) => dist(j) < SNAP);
  const fit = near.find((j) => !needTurn || fits(fig, idx, k, j));
  if (fit !== undefined) return { kind: 'snap', slot: fit };
  if (near.length) return { kind: 'turn', slot: near[0]! };
  // Ошибка — только если явно целились в чужое место: точка на нём, и его середина ближе своего.
  const mine = same.length ? dist(same[0]!) : Infinity;
  const other = empty.find(
    (j) => fig.pieces[j]!.type !== type && inside(at, fig.pieces[j]!.v) && dist(j) < mine,
  );
  return other === undefined ? { kind: 'miss' } : { kind: 'wrong' };
}

// ─── Раунды ───

export interface FigureRound {
  figure: FigureShape;
  /** Какие места собрать (остальные детали уже стоят). */
  loose: number[];
  /** Как повёрнута каждая деталь в лотке (четверти; 0 — как на месте). */
  turns: number[];
}

const shuffle = <T>(xs: readonly T[], rnd: () => number): T[] => {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
};

/** Фигуры по кругу в перемешку, одна и та же два раза подряд — нет. */
export function figureOrder(figures: readonly FigureShape[], rounds: number, rnd: () => number) {
  const out: FigureShape[] = [];
  while (out.length < rounds) {
    const lap = shuffle(figures, rnd);
    if (lap.length > 1 && lap[0] === out.at(-1)) lap.push(lap.shift()!);
    out.push(...lap);
  }
  return out.slice(0, rounds);
}

/**
 * Какие детали собрать: n мест в перемешку; из двух — разные детали (не два маленьких
 * треугольника). avoid — что собирали в прошлый раз в этой фигуре: не те же.
 */
export function looseFor(fig: Figure, n: number, rnd: () => number, avoid?: readonly number[]) {
  const all = fig.pieces.map((_, i) => i);
  if (n >= all.length) return all.sort((a, b) => radius(fig, b) - radius(fig, a) || a - b);
  const key = (xs: readonly number[]) => [...xs].sort((a, b) => a - b).join();
  for (let attempt = 0; ; attempt++) {
    const pick = shuffle(all, rnd).slice(0, n);
    const types = new Set(pick.map((i) => fig.pieces[i]!.type));
    if (attempt < 50 && types.size < pick.length && n === 2) continue;
    if (attempt < 50 && avoid && key(pick) === key(avoid)) continue;
    return pick.sort((a, b) => radius(fig, b) - radius(fig, a) || a - b);
  }
}

/**
 * Как повернуть детали в лотке: так, чтобы ни на одно пустое место своего вида она не ложилась
 * без поворота (квадрат при любом повороте такой же — ему всё равно).
 */
export function turnsFor(fig: Figure, loose: readonly number[], rnd: () => number) {
  return loose.map((idx) => {
    const bad = [1, 2, 3].filter((k) => !loose.some((j) => fits(fig, idx, k, j)));
    return bad.length ? bad[Math.floor(rnd() * bad.length)]! : 1 + Math.floor(rnd() * 3);
  });
}

export function planFigure(spec: SpecOf<'figure'>, rnd: () => number = Math.random): FigureRound[] {
  const last = new Map<FigureShape, number[]>();
  return figureOrder(spec.figures, spec.rounds, rnd).map((f) => {
    const fig = FIGURES[f];
    const loose = looseFor(fig, spec.pieces, rnd, last.get(f));
    last.set(f, loose);
    return { figure: f, loose, turns: spec.turn ? turnsFor(fig, loose, rnd) : loose.map(() => 0) };
  });
}

// ─── Фигура и лоток на экране ───

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
/** Деталь в лотке: середина и радиус (px). */
export interface Cell {
  x: number;
  y: number;
  r: number;
}
export interface FigureStage {
  land: boolean;
  /** Пикселей в катете маленького треугольника — в фигуре и в лотке. */
  unit: number;
  tunit: number;
  /** Где фигура (её 0, 0 — левый верхний угол box). */
  box: Box;
  /** Лоток и детали в нём (по порядку loose). */
  tray: Box;
  cells: Cell[];
}

/** Лёжа сова сидит слева: до сюда (px) фигура не заходит. */
export const OWL_RIGHT = 100;
/** Кнопка «послушать» в правом верхнем углу: лоток лёжа начинается ниже. */
export const TOP_BUTTONS = 92;
/** Между деталями в лотке (в радиусах). */
const GAP = 0.18;

/** Детали радиусов rs (в единицах) рядами по ширине W при масштабе u: середины и высота. */
function flow(rs: readonly number[], u: number, W: number) {
  const rows: number[][] = [[]];
  let x = 0;
  rs.forEach((r, i) => {
    const d = 2 * r * u * (1 + GAP);
    if (x + d > W + 1e-6 && rows.at(-1)!.length) {
      rows.push([]);
      x = 0;
    }
    rows.at(-1)!.push(i);
    x += d;
  });
  const cells: Cell[] = new Array(rs.length);
  let y = 0;
  for (const row of rows) {
    const rh = Math.max(...row.map((i) => 2 * rs[i]! * u * (1 + GAP)));
    const rw = row.reduce((a, i) => a + 2 * rs[i]! * u * (1 + GAP), 0);
    let cx = (W - rw) / 2;
    for (const i of row) {
      const d = 2 * rs[i]! * u * (1 + GAP);
      cells[i] = { x: cx + d / 2, y: y + rh / 2, r: rs[i]! * u };
      cx += d;
    }
    y += rh;
  }
  return { cells, h: y };
}
/** Самый крупный масштаб, при котором детали влезают в W×H. */
function trayUnit(rs: readonly number[], W: number, H: number, max: number) {
  let lo = 4;
  let hi = max;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    if (flow(rs, mid, W).h <= H) lo = mid;
    else hi = mid;
  }
  return lo;
}

/**
 * Фигура и лоток на экране w×h: стоя — фигура сверху (под кнопками и совой), лоток снизу; лёжа —
 * фигура слева (правее совы), лоток справа под кнопкой «послушать».
 */
export function stageFor(w: number, h: number, fig: Figure, loose: readonly number[]): FigureStage {
  const land = w > h;
  const pad = Math.max(8, Math.min(w, h) * 0.025);
  const rs = loose.map((i) => radius(fig, i));
  // Фигура поменьше: место под «оживление» (рыбка уплывает, кошка прыгает).
  const room = 0.9;
  if (land) {
    const top = 56;
    const tw = Math.max(w * 0.36, Math.min(w * 0.44, 2.2 * (h - TOP_BUTTONS)));
    const tray = { x: w - pad - tw, y: TOP_BUTTONS, w: tw, h: h - pad - TOP_BUTTONS };
    const fx = OWL_RIGHT;
    const fw = tray.x - pad - fx;
    const fh = h - top - pad;
    const unit = Math.min((fw * room) / fig.w, (fh * room) / fig.h);
    const tunit = Math.min(unit * 0.85, trayUnit(rs, tray.w, tray.h, unit));
    const flowed = flow(rs, tunit, tray.w);
    const oy = tray.y + (tray.h - flowed.h) / 2;
    const box = {
      x: fx + (fw - fig.w * unit) / 2,
      y: top + (fh - fig.h * unit) / 2,
      w: fig.w * unit,
      h: fig.h * unit,
    };
    const cells = flowed.cells.map((c) => ({ ...c, x: c.x + tray.x, y: c.y + oy }));
    return { land, unit, tunit, box, tray, cells };
  }
  const top = 100;
  const W = w - 2 * pad;
  // Высоту лотка подбираем: чтобы и фигура, и детали в лотке были как можно крупнее вместе. Сперва —
  // чтобы клетка фигуры была не меньше 48 px, а деталь в лотке — не меньше половины своего места
  // в фигуре (иначе её трудно узнать; при всех семи деталях так не выйдет — хватит и пальца).
  let unit = 0;
  let tunit = 0;
  let best = -1;
  for (let share = 0.16; share <= 0.56; share += 0.01) {
    const t = trayUnit(rs, W, (h - top) * share, 400);
    const fh = h - top - pad - flow(rs, t, W).h - pad;
    const u = Math.min((W * room) / fig.w, (fh * room) / fig.h);
    const tu = Math.min(t, u * 0.85);
    const fine = u >= 48 && (tu >= u * 0.5 || rs.length > 4);
    const score = u * tu + (fine ? 1e9 : 0);
    if (score > best) {
      best = score;
      unit = u;
      tunit = tu;
    }
  }
  const flowed = flow(rs, tunit, W);
  const tray = { x: pad, y: h - pad - flowed.h, w: W, h: flowed.h };
  const free = tray.y - pad - top;
  const box = {
    x: (w - fig.w * unit) / 2,
    y: top + (free - fig.h * unit) / 2,
    w: fig.w * unit,
    h: fig.h * unit,
  };
  const cells = flowed.cells.map((c) => ({ ...c, x: c.x + tray.x, y: c.y + tray.y }));
  return { land, unit, tunit, box, tray, cells };
}

/** Где на экране точка фигуры и наоборот. */
export const toScreen = (st: FigureStage, [x, y]: Pt): Pt => [
  st.box.x + x * st.unit,
  st.box.y + y * st.unit,
];
export const toFigure = (st: FigureStage, x: number, y: number): Pt => [
  (x - st.box.x) / st.unit,
  (y - st.box.y) / st.unit,
];

/** Фон каждой фигуры: луг (домик, кошка), под водой (рыбка), море (кораблик). */
export const BACKDROP: Record<FigureShape, 'meadow' | 'sea' | 'deep'> = {
  house: 'meadow',
  cat: 'meadow',
  fish: 'deep',
  boat: 'sea',
};
/** Глиняные картинки игры. */
export const figureSprites = () =>
  (['meadow', 'deep', 'sea'] as const).flatMap((b) => [`figure-${b}-p`, `figure-${b}-l`]);
