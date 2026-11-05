// Этап 59: «Катись, шарик» — дощечка с перегородками и ямками, как катится шарик, что собирать по
// порядку, маршрут до цели и раскладка на экране.
import type { MarbleTask } from '@kidsplus/shared/games';
import type { SpecOf } from './common';
import type { Vec } from './tilt';

export type P = Vec;
export type Rnd = () => number;

/** Ширина дощечки в клетках; высота — под экран. */
export const BOARD_W = 8;
export const BALL_R = 0.45;
/** Половина толщины перегородки. */
export const WALL_R = 0.16;
export const HOLE_R = 0.72;
export const PIT_R = 0.62;
export const TOKEN_R = 0.62;
/** Проход в перегородке: шарик диаметром 0,9 проходит с запасом. */
const GAP = 2.9;
/** Разгон при полном наклоне, клеток/с²; трение, 1/с; предел скорости; отскок от стенки. */
const ACCEL = 13;
const DRAG = 1.5;
const VMAX = 8;
const BOUNCE = 0.35;
/** Лунка мягко подтягивает шарик с такого расстояния, клеток. */
const PULL_R = HOLE_R * 1.6;
/** Шарик падает, когда середина ближе этой доли радиуса ямки или лунки. */
const CATCH = 0.72;
/** Запас от стенок и ямок, с которым маршрут считается проходимым. */
const PASS_WALL = BALL_R + 0.08;
const PASS_PIT = PIT_R + 0.4;
/** Шаг сетки маршрута, клеток. */
const STEP = 0.25;

/** Перегородка: отрезок со скруглёнными концами. */
export interface Wall {
  a: P;
  b: P;
}
export interface Token {
  at: P;
  label: string;
}
export interface MarbleRound {
  task: MarbleTask;
  walls: number;
  pits: boolean;
  /** Что собирать по порядку: числа или буквы слова. */
  labels: string[];
  word?: string;
  /** Старт внизу, цель вверху: наклон не копится в одну сторону от раунда к раунду. */
  flip: boolean;
}
export interface Board {
  w: number;
  h: number;
  start: P;
  /** Лунка; когда собирают по порядку, её нет. */
  goal: P | null;
  walls: Wall[];
  pits: P[];
  tokens: Token[];
}
export interface Ball extends P {
  vx: number;
  vy: number;
}

const dist = (a: P, b: P) => Math.hypot(a.x - b.x, a.y - b.y);
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/** Ближайшая к p точка перегородки. */
function nearest(w: Wall, p: P): P {
  const dx = w.b.x - w.a.x;
  const dy = w.b.y - w.a.y;
  const k = clamp(((p.x - w.a.x) * dx + (p.y - w.a.y) * dy) / (dx * dx + dy * dy || 1), 0, 1);
  return { x: w.a.x + dx * k, y: w.a.y + dy * k };
}

/** Может ли здесь пройти шарик, не задев стенку и не упав в ямку. */
export function free(b: Pick<Board, 'w' | 'h' | 'walls' | 'pits'>, p: P) {
  if (p.x < PASS_WALL || p.y < PASS_WALL || p.x > b.w - PASS_WALL || p.y > b.h - PASS_WALL)
    return false;
  return (
    b.walls.every((w) => dist(p, nearest(w, p)) >= WALL_R + PASS_WALL) &&
    b.pits.every((c) => dist(p, c) >= PASS_PIT)
  );
}

// ─── Маршрут: сетка расстояний до цели, по ней — путь и точка, куда катить ───

export interface Flow {
  cols: number;
  rows: number;
  /** Шагов сетки до цели; -1 — не добраться. */
  dist: Int32Array;
}
const NEAR = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
] as const;

/** Ближайшая к p клетка сетки, откуда можно добраться до цели. */
function reachableNear(f: Flow, p: P) {
  const c = clamp(Math.round(p.x / STEP), 0, f.cols - 1);
  const r = clamp(Math.round(p.y / STEP), 0, f.rows - 1);
  for (let ring = 0; ring <= 8; ring++)
    for (let dy = -ring; dy <= ring; dy++)
      for (let dx = -ring; dx <= ring; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
        const x = c + dx;
        const y = r + dy;
        if (x < 0 || y < 0 || x >= f.cols || y >= f.rows) continue;
        if (f.dist[y * f.cols + x]! >= 0) return { c: x, r: y };
      }
  return null;
}

/** Сколько шагов сетки до цели от каждой клетки, в обход стенок и ямок. */
export function flowTo(b: Board, target: P): Flow {
  const cols = Math.floor(b.w / STEP) + 1;
  const rows = Math.floor(b.h / STEP) + 1;
  const open = new Int32Array(cols * rows);
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      open[r * cols + c] = free(b, { x: c * STEP, y: r * STEP }) ? 0 : -1;
  const f: Flow = { cols, rows, dist: new Int32Array(cols * rows).fill(-1) };
  // Сама цель может стоять у стенки: начинаем с ближайшей открытой клетки.
  const from = reachableNear({ cols, rows, dist: open }, target);
  if (!from) return f;
  const q = [from.r * cols + from.c];
  f.dist[q[0]!] = 0;
  for (let i = 0; i < q.length; i++) {
    const at = q[i]!;
    const c = at % cols;
    const r = (at - c) / cols;
    for (const [dx, dy] of NEAR) {
      const x = c + dx;
      const y = r + dy;
      if (x < 0 || y < 0 || x >= cols || y >= rows) continue;
      const n = y * cols + x;
      if (open[n]! < 0 || f.dist[n]! >= 0) continue;
      // По диагонали — только если не срезаем угол стенки.
      if (dx && dy && (open[r * cols + x]! < 0 || open[y * cols + c]! < 0)) continue;
      f.dist[n] = f.dist[at]! + 1;
      q.push(n);
    }
  }
  return f;
}

/** Путь по сетке от точки до цели. */
export function pathFrom(f: Flow, from: P): P[] {
  const start = reachableNear(f, from);
  if (!start) return [];
  const path: P[] = [];
  let { c, r } = start;
  for (;;) {
    path.push({ x: c * STEP, y: r * STEP });
    const here = f.dist[r * f.cols + c]!;
    if (here === 0) return path;
    let next: { c: number; r: number } | null = null;
    for (const [dx, dy] of NEAR) {
      const x = c + dx;
      const y = r + dy;
      if (x < 0 || y < 0 || x >= f.cols || y >= f.rows) continue;
      if (f.dist[y * f.cols + x] !== here - 1) continue;
      if (dx && dy && (f.dist[r * f.cols + x]! < 0 || f.dist[y * f.cols + c]! < 0)) continue;
      next = { c: x, r: y };
      break;
    }
    if (!next) return path;
    ({ c, r } = next);
  }
}

/** Докатится ли шарик от a до b по прямой. */
function sees(b: Board, a: P, to: P) {
  const n = Math.ceil(dist(a, to) / 0.15);
  for (let i = 1; i <= n; i++) {
    const k = i / n;
    if (!free(b, { x: a.x + (to.x - a.x) * k, y: a.y + (to.y - a.y) * k })) return false;
  }
  return true;
}

/** Куда катить сейчас: самая дальняя точка пути, до которой шарик докатится по прямой. */
export function aimFrom(b: Board, f: Flow, from: P): P {
  const path = pathFrom(f, from);
  if (!path.length) return from;
  let aim = path[Math.min(3, path.length - 1)]!;
  for (let i = 0; i < path.length; i += 2) if (sees(b, from, path[i]!)) aim = path[i]!;
  return aim;
}

// ─── Дощечка ───

/** Высота дощечки под свободное место на экране. */
export const boardHeight = (long: number, short: number) =>
  clamp(Math.round((BOARD_W * long) / short), 10, 20);

function shuffled<T>(xs: readonly T[], rnd: Rnd): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/** Перегородки змейкой: от левого и правого края по очереди, проход — с другой стороны. */
function layout(n: number, h: number, flip: boolean, rnd: Rnd) {
  const mirror = rnd() < 0.5;
  const row = h / (n + 1);
  const walls: Wall[] = [];
  const fromLeft = (i: number) => (i % 2 === 0) !== mirror;
  for (let i = 0; i < n; i++) {
    const y = row * (i + 1) + (rnd() - 0.5) * Math.min(0.8, row * 0.2);
    const len = BOARD_W - GAP - rnd() * 0.8;
    walls.push(
      fromLeft(i)
        ? { a: { x: 0, y }, b: { x: len, y } }
        : { a: { x: BOARD_W, y }, b: { x: BOARD_W - len, y } },
    );
  }
  const side = (left: boolean) => (left ? 1.4 : BOARD_W - 1.4);
  const first = walls[0]?.a.y ?? h;
  const last = walls[n - 1]?.a.y ?? 0;
  // Старт над прижатым концом первой перегородки: сразу надо катить к проходу. Лунка — под прижатым
  // концом последней: пройдя проход, катить обратно.
  const start = { x: side(fromLeft(0)), y: Math.min(1.3, first / 2) };
  const goal = {
    x: side(n ? fromLeft(n - 1) : !fromLeft(0)),
    y: Math.max(h - 1.4, (last + h) / 2),
  };
  if (!flip) return { walls, start, goal };
  const over = (p: P) => ({ x: p.x, y: h - p.y });
  return {
    walls: walls.map((w) => ({ a: over(w.a), b: over(w.b) })),
    start: over(start),
    goal: over(goal),
  };
}

function placeTokens(b: Board, labels: string[], apart: number, rnd: Rnd): Token[] | null {
  const spots: P[] = [];
  for (let i = 0; i < 400 && spots.length < labels.length; i++) {
    const p = { x: 1 + rnd() * (b.w - 2), y: 1 + rnd() * (b.h - 2) };
    if (!free(b, p) || dist(p, b.start) < 2.2) continue;
    if (spots.some((s) => dist(s, p) < apart)) continue;
    spots.push(p);
  }
  if (spots.length < labels.length) return null;
  // Много перегородок: по порядку вдоль пути, а не туда-сюда через все проходы.
  if (b.walls.length >= 2) {
    const f = flowTo(b, b.start);
    const steps = new Map(spots.map((p) => [p, pathFrom(f, p).length]));
    spots.sort((x, y) => steps.get(x)! - steps.get(y)!);
  }
  const order = b.walls.length >= 2 ? spots : shuffled(spots, rnd);
  return labels.map((label, i) => ({ at: order[i]!, label }));
}

/** Все цели достижимы от старта. */
function solvable(b: Board) {
  const f = flowTo(b, b.start);
  const targets = [...b.tokens.map((t) => t.at), ...(b.goal ? [b.goal] : [])];
  return targets.every((t) => {
    const path = pathFrom(f, t);
    return path.length > 0 && dist(path[0]!, t) < 1;
  });
}

/** Ямки — там, где шарик поедет: близко к пути, но так, чтобы обойти можно было всегда. */
function placePits(b: Board, count: number, rnd: Rnd) {
  const goal = b.goal ?? b.tokens[b.tokens.length - 1]!.at;
  const route = pathFrom(flowTo(b, goal), b.start);
  const keep = [b.start, ...(b.goal ? [b.goal] : []), ...b.tokens.map((t) => t.at)];
  for (let i = 0; i < 300 && b.pits.length < count; i++) {
    const p = { x: 1 + rnd() * (b.w - 2), y: 1 + rnd() * (b.h - 2) };
    if (keep.some((k) => dist(k, p) < 2.3)) continue;
    if (b.pits.some((c) => dist(c, p) < 2.6)) continue;
    if (b.walls.some((w) => dist(p, nearest(w, p)) < PIT_R + WALL_R + 0.1)) continue;
    if (!route.some((r) => dist(r, p) < 1.7)) continue;
    b.pits.push(p);
    if (!solvable(b)) b.pits.pop();
  }
}

/** Дощечка раунда: всегда проходимая. Не сложилась на маленьком экране — перегородкой меньше. */
export function makeBoard(r: MarbleRound, h: number, rnd: Rnd = Math.random): Board {
  let last: Board | null = null;
  for (let i = 0; i < 40; i++) {
    const { walls, start, goal } = layout(r.walls, h, r.flip, rnd);
    const b: Board = {
      w: BOARD_W,
      h,
      start,
      goal: r.task === 'hole' ? goal : null,
      walls,
      pits: [],
      tokens: [],
    };
    if (r.labels.length) {
      const tokens = placeTokens(b, r.labels, i < 20 ? 2.4 : 1.8, rnd);
      if (!tokens) continue;
      b.tokens = tokens;
    }
    if (!solvable(b)) continue;
    last = b;
    if (!r.pits) return b;
    placePits(b, r.walls >= 2 ? 3 : 2, rnd);
    if (b.pits.length) return b;
  }
  if (last) return last;
  if (r.walls === 0) throw new Error('дощечка не сложилась');
  return makeBoard({ ...r, walls: r.walls - 1 }, h, rnd);
}

/** Слова из разных букв: собирать по порядку. */
export const MARBLE_WORDS = ['кот', 'дом', 'сок', 'лес', 'мак', 'жук', 'сыр', 'лук'] as const;

/** Сколько чисел собирать: с перегородками — больше. */
export const countFor = (walls: number) => Math.min(5, 3 + Math.floor(walls / 2));

/** Раунды: задания по очереди, слова не повторяются. */
export function planRounds(spec: SpecOf<'marble'>, rnd: Rnd = Math.random): MarbleRound[] {
  const words = shuffled(MARBLE_WORDS, rnd);
  return Array.from({ length: spec.rounds }, (_, i) => {
    const task = spec.tasks[i % spec.tasks.length]!;
    const base = { task, walls: spec.walls, pits: spec.pits, flip: i % 2 === 1 };
    if (task === 'count')
      return {
        ...base,
        labels: Array.from({ length: countFor(spec.walls) }, (_, k) => String(k + 1)),
      };
    if (task === 'word') {
      const word = words[i % words.length]!;
      return { ...base, word, labels: [...word.toUpperCase()] };
    }
    return { ...base, labels: [] };
  });
}

// ─── Как катится шарик ───

function bounce(ball: Ball, nx: number, ny: number) {
  const vn = ball.vx * nx + ball.vy * ny;
  if (vn >= 0) return 0;
  ball.vx -= (1 + BOUNCE) * vn * nx;
  ball.vy -= (1 + BOUNCE) * vn * ny;
  return -vn;
}

/** Шаг шарика по наклону; вернёт силу самого сильного удара о стенку (скорость к ней). */
export function roll(ball: Ball, wish: Vec, dt: number, b: Pick<Board, 'w' | 'h' | 'walls'>) {
  ball.vx += wish.x * ACCEL * dt;
  ball.vy += wish.y * ACCEL * dt;
  const drag = Math.exp(-DRAG * dt);
  ball.vx *= drag;
  ball.vy *= drag;
  const speed = Math.hypot(ball.vx, ball.vy);
  if (speed > VMAX) {
    ball.vx *= VMAX / speed;
    ball.vy *= VMAX / speed;
  }
  let hit = 0;
  // Мелкими шагами: шарик не должен проскочить тонкую перегородку.
  const steps = Math.max(1, Math.ceil((Math.min(speed, VMAX) * dt) / (BALL_R * 0.5)));
  for (let i = 0; i < steps; i++) {
    ball.x += (ball.vx * dt) / steps;
    ball.y += (ball.vy * dt) / steps;
    for (const w of b.walls) {
      const c = nearest(w, ball);
      const d = dist(ball, c);
      const min = BALL_R + WALL_R;
      if (d >= min || d === 0) continue;
      const nx = (ball.x - c.x) / d;
      const ny = (ball.y - c.y) / d;
      ball.x = c.x + nx * min;
      ball.y = c.y + ny * min;
      hit = Math.max(hit, bounce(ball, nx, ny));
    }
    if (ball.x < BALL_R) {
      ball.x = BALL_R;
      hit = Math.max(hit, bounce(ball, 1, 0));
    } else if (ball.x > b.w - BALL_R) {
      ball.x = b.w - BALL_R;
      hit = Math.max(hit, bounce(ball, -1, 0));
    }
    if (ball.y < BALL_R) {
      ball.y = BALL_R;
      hit = Math.max(hit, bounce(ball, 0, 1));
    } else if (ball.y > b.h - BALL_R) {
      ball.y = b.h - BALL_R;
      hit = Math.max(hit, bounce(ball, 0, -1));
    }
  }
  return hit;
}

/** Лунка мягко тянет к себе: маленьким рукам не надо попадать точно. */
export function pull(ball: Ball, goal: P, dt: number) {
  const d = dist(ball, goal);
  if (d >= PULL_R || d === 0) return;
  const k = (1 - d / PULL_R) * 22 * dt;
  ball.vx += ((goal.x - ball.x) / d) * k;
  ball.vy += ((goal.y - ball.y) / d) * k;
}

export const inHole = (ball: P, goal: P) => dist(ball, goal) < HOLE_R * CATCH;
export const inPit = (ball: P, pit: P) => dist(ball, pit) < PIT_R * CATCH;
export const onToken = (ball: P, t: Token) => dist(ball, t.at) < TOKEN_R + 0.2;

/** Палец вместо наклона: чем дальше палец от шарика, тем сильнее тянет, у пальца шарик тормозит. */
export function fingerWish(ball: Ball, finger: P): Vec {
  const dx = (finger.x - ball.x) / 2 - ball.vx * 0.14;
  const dy = (finger.y - ball.y) / 2 - ball.vy * 0.14;
  const len = Math.hypot(dx, dy);
  return len > 1 ? { x: dx / len, y: dy / len } : { x: dx, y: dy };
}

// ─── Раскладка на экране ───

/** Кнопки «домой» и «послушать»: 72 px в верхних углах с отступом 16. */
const BUTTONS = 96;

/** Где на экране дощечка: стоя — под кнопками, лёжа — между ними и повёрнута на бок. */
export interface MarbleView {
  land: boolean;
  /** Пикселей в клетке. */
  cell: number;
  /** Рамка. */
  rim: number;
  floor: { x: number; y: number; w: number; h: number };
}

function room(w: number, h: number) {
  const land = w > h;
  const rim = Math.max(10, Math.min(w, h) * 0.03);
  const side = land ? BUTTONS : 8;
  const top = land ? 8 : BUTTONS;
  return {
    land,
    rim,
    x: side + rim,
    y: top + rim,
    w: w - side * 2 - rim * 2,
    h: h - top - 8 - rim * 2,
  };
}

/** Высота дощечки для этого экрана. */
export function heightFor(w: number, h: number) {
  const r = room(w, h);
  return boardHeight(Math.max(r.w, r.h), Math.min(r.w, r.h));
}

export function viewFor(w: number, h: number, boardH: number): MarbleView {
  const r = room(w, h);
  const cell = Math.min((r.land ? r.h : r.w) / BOARD_W, (r.land ? r.w : r.h) / boardH);
  const fw = (r.land ? boardH : BOARD_W) * cell;
  const fh = (r.land ? BOARD_W : boardH) * cell;
  return {
    land: r.land,
    cell,
    rim: r.rim,
    floor: { x: r.x + (r.w - fw) / 2, y: r.y + (r.h - fh) / 2, w: fw, h: fh },
  };
}

/** Точка дощечки на экране: лёжа дощечка повёрнута на четверть оборота. */
export const toPx = (v: MarbleView, p: P): P =>
  v.land
    ? { x: v.floor.x + p.y * v.cell, y: v.floor.y + (BOARD_W - p.x) * v.cell }
    : { x: v.floor.x + p.x * v.cell, y: v.floor.y + p.y * v.cell };

export const fromPx = (v: MarbleView, p: P): P =>
  v.land
    ? { x: BOARD_W - (p.y - v.floor.y) / v.cell, y: (p.x - v.floor.x) / v.cell }
    : { x: (p.x - v.floor.x) / v.cell, y: (p.y - v.floor.y) / v.cell };

/** Наклон экрана в осях дощечки и обратно. */
export const toBoard = (v: MarbleView, t: Vec): Vec => (v.land ? { x: -t.y, y: t.x } : t);
export const toView = (v: MarbleView, t: Vec): Vec => (v.land ? { x: t.y, y: -t.x } : t);

/** Ряд того, что собирать: стоя — между кнопками, лёжа — столбиком под кнопкой справа. */
export function slotsFor(w: number, h: number, n: number) {
  const land = w > h;
  const size = Math.min(48, land ? (h - BUTTONS - 16) / n : (w - BUTTONS * 2) / n);
  return Array.from({ length: n }, (_, i) =>
    land
      ? { x: w - BUTTONS / 2, y: BUTTONS + 8 + size * (i + 0.5), size }
      : { x: w / 2 + (i - (n - 1) / 2) * size, y: 52, size },
  );
}

export const marbleSprites = () => [
  'marble-ball',
  'marble-flag',
  'marble-token',
  'marble-pit',
  'marble-board-p',
  'marble-board-l',
];
