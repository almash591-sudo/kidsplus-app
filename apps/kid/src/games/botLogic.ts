// Этап 58: «Робот и батарейка» — коврик в клетку, путь до батарейки, проезд по программе,
// подсказка следующей стрелки, ошибка в готовой программе и раскладка на экране.
import type { BotTask } from '@kidsplus/shared/games';
import type { SpecOf } from './common';

export type Dir = 'up' | 'down' | 'left' | 'right';
/** Порядок стрелок на пульте: влево, вверх, вниз, вправо. */
export const DIRS: readonly Dir[] = ['left', 'up', 'down', 'right'];
export const STEP: Record<Dir, readonly [number, number]> = {
  up: [0, -1],
  down: [0, 1],
  left: [-1, 0],
  right: [1, 0],
};
/** Клетка: столбец и строка от левого верхнего угла. */
export type Cell = readonly [number, number];
export type BlockKind = 'box' | 'plant' | 'blocks' | 'ball';
export const BLOCK_KINDS: readonly BlockKind[] = ['box', 'plant', 'blocks', 'ball'];

export interface BotField {
  /** Коврик n × n клеток. */
  n: number;
  start: Cell;
  goal: Cell;
  blocks: { c: Cell; kind: BlockKind }[];
  /** Кратчайший путь (с наименьшим числом поворотов) — следы после двух неудач. */
  path: Dir[];
}

export interface BotRound {
  task: BotTask;
  field: BotField;
  /** «Найди ошибку»: программа робота с одной неправильной стрелкой. */
  program: Dir[];
  /** Сколько гнёзд в ленте. */
  slots: number;
}

export type Rnd = () => number;
const pick = <T>(xs: readonly T[], rnd: Rnd) => xs[Math.floor(rnd() * xs.length)]!;
const same = (a: Cell, b: Cell) => a[0] === b[0] && a[1] === b[1];
/** Та же программа, но с другой стрелкой на месте i (Array.with нет в старом Safari). */
export const put = (p: readonly Dir[], i: number, d: Dir) => p.map((x, j) => (j === i ? d : x));
const go = (c: Cell, d: Dir): Cell => [c[0] + STEP[d][0], c[1] + STEP[d][1]];
const inGrid = (n: number, c: Cell) => c[0] >= 0 && c[1] >= 0 && c[0] < n && c[1] < n;
export const isBlock = (f: Pick<BotField, 'blocks'>, c: Cell) => f.blocks.some((b) => same(b.c, c));
/** Сколько поворотов в пути. */
export const turnsOf = (p: readonly Dir[]) => p.filter((d, i) => i > 0 && d !== p[i - 1]).length;

/** Коврик: до двух шагов — 4 × 4, дальше — 5 × 5. */
export const gridFor = (steps: number) => (steps <= 2 ? 4 : 5);

/** Расстояния (в шагах) от клетки до всех клеток в обход коробок; недоступные — Infinity. */
export function distances(f: Pick<BotField, 'n' | 'blocks'>, from: Cell): number[][] {
  const d = Array.from({ length: f.n }, () => Array<number>(f.n).fill(Infinity));
  d[from[1]]![from[0]] = 0;
  const q: Cell[] = [from];
  for (let i = 0; i < q.length; i++) {
    const c = q[i]!;
    for (const dir of DIRS) {
      const nb = go(c, dir);
      if (!inGrid(f.n, nb) || isBlock(f, nb) || d[nb[1]]![nb[0]] !== Infinity) continue;
      d[nb[1]]![nb[0]] = d[c[1]]![c[0]]! + 1;
      q.push(nb);
    }
  }
  return d;
}
const at = (d: number[][], c: Cell) => d[c[1]]![c[0]]!;

/** Сколько разных кратчайших путей от start до goal. */
function pathCount(f: Pick<BotField, 'n' | 'blocks'>, start: Cell, goal: Cell) {
  const d = distances(f, start);
  const L = at(d, goal);
  if (L === Infinity) return 0;
  const ways = Array.from({ length: f.n }, () => Array<number>(f.n).fill(0));
  ways[start[1]]![start[0]] = 1;
  const cells: Cell[] = [];
  for (let y = 0; y < f.n; y++) for (let x = 0; x < f.n; x++) cells.push([x, y]);
  cells.sort((a, b) => at(d, a) - at(d, b));
  for (const c of cells) {
    const k = at(d, c);
    if (k === Infinity || k === 0) continue;
    for (const dir of DIRS) {
      const p = go(c, dir);
      if (inGrid(f.n, p) && at(d, p) === k - 1) ways[c[1]]![c[0]]! += ways[p[1]]![p[0]]!;
    }
  }
  return ways[goal[1]]![goal[0]]!;
}

/**
 * Кратчайший путь от from до goal с наименьшим числом поворотов; first — в какую сторону робот
 * ехал до этого (лучше продолжать прямо). Нет пути — null.
 */
export function bestPath(f: Pick<BotField, 'n' | 'blocks'>, from: Cell, goal: Cell, first?: Dir) {
  const dg = distances(f, goal);
  if (at(dg, from) === Infinity) return null;
  const memo = new Map<string, { turns: number; path: Dir[] }>();
  const best = (c: Cell, last: Dir | undefined): { turns: number; path: Dir[] } => {
    if (same(c, goal)) return { turns: 0, path: [] };
    const key = `${c[0]},${c[1]},${last ?? ''}`;
    const hit = memo.get(key);
    if (hit) return hit;
    let res = { turns: Infinity, path: [] as Dir[] };
    for (const dir of DIRS) {
      const nb = go(c, dir);
      if (!inGrid(f.n, nb) || at(dg, nb) !== at(dg, c) - 1) continue;
      const r = best(nb, dir);
      const t = r.turns + (last && last !== dir ? 1 : 0);
      if (t < res.turns) res = { turns: t, path: [dir, ...r.path] };
    }
    memo.set(key, res);
    return res;
  };
  return best(from, first).path;
}

export type RunResult = 'goal' | 'block' | 'wall' | 'short';
export interface Run {
  /** Где робот побывал: старт и клетка после каждого сделанного шага. */
  cells: Cell[];
  result: RunResult;
  /** Номер стрелки, на которой робот доехал или упёрся; не доехал — длина программы. */
  at: number;
}

/** Проехать по программе: до батарейки (дальше не едет), до коробки или края коврика, или до конца. */
export function run(f: BotField, program: readonly Dir[]): Run {
  const cells: Cell[] = [f.start];
  let c = f.start;
  for (let i = 0; i < program.length; i++) {
    const nb = go(c, program[i]!);
    if (!inGrid(f.n, nb)) return { cells, result: 'wall', at: i };
    if (isBlock(f, nb)) return { cells, result: 'block', at: i };
    c = nb;
    cells.push(c);
    if (same(c, f.goal)) return { cells, result: 'goal', at: i };
  }
  return { cells, result: 'short', at: program.length };
}

/** Какие стрелки программы можно заменить одной другой, чтобы робот доехал. */
export function fixable(f: BotField, program: readonly Dir[]) {
  return program.flatMap((d, i) =>
    DIRS.some((o) => o !== d && run(f, put(program, i, o)).result === 'goal') ? [i] : [],
  );
}

export type BotHint =
  { kind: 'add'; dir: Dir } | { kind: 'remove'; index: number } | { kind: 'run' };
/**
 * Что подсказать пальцем: доедет — «Пуск»; ещё можно доехать, места в ленте хватает — следующую
 * стрелку (лучше прямо, как ехал); иначе убрать последнюю стрелку.
 */
export function nextHint(f: BotField, program: readonly Dir[], slots: number): BotHint {
  const r = run(f, program);
  if (r.result === 'goal') return { kind: 'run' };
  if (r.result === 'short') {
    const end = r.cells[r.cells.length - 1]!;
    const p = bestPath(f, end, f.goal, program[program.length - 1]);
    if (p?.length && program.length + p.length <= slots) return { kind: 'add', dir: p[0]! };
  }
  return { kind: 'remove', index: program.length - 1 };
}

/** Монотонный путь из steps шагов ровно с turns поворотами на коврике n × n. */
function straightField(n: number, steps: number, turns: number, rnd: Rnd): BotField {
  const t = Math.max(steps > n - 1 ? 1 : 0, Math.min(turns, steps - 1, 3));
  const k = t + 1;
  const na = Math.ceil(k / 2);
  const nb = k - na;
  // Сколько шагов по одной оси (a) и по другой (b): каждый отрезок — хотя бы один шаг.
  const as: number[] = [];
  for (let a = na; a <= Math.min(n - 1, steps - nb); a++)
    if (steps - a <= n - 1 && (nb > 0 || a === steps)) as.push(a);
  const a = pick(as, rnd);
  const split = (total: number, parts: number) => {
    const xs = Array<number>(parts).fill(1);
    for (let i = parts; i < total; i++) xs[Math.floor(rnd() * parts)]!++;
    return xs;
  };
  const sa = split(a, na);
  const sb = split(steps - a, nb);
  const horiz = rnd() < 0.5;
  const dx: Dir = rnd() < 0.5 ? 'right' : 'left';
  const dy: Dir = rnd() < 0.5 ? 'down' : 'up';
  const [da, db] = horiz ? [dx, dy] : [dy, dx];
  const path: Dir[] = [];
  for (let i = 0; i < k; i++) {
    const len = i % 2 ? sb[i >> 1]! : sa[i >> 1]!;
    for (let j = 0; j < len; j++) path.push(i % 2 ? db : da);
  }
  const w = path.filter((d) => d === dx).length;
  const h = path.filter((d) => d === dy).length;
  const x0 = Math.floor(rnd() * (n - w));
  const y0 = Math.floor(rnd() * (n - h));
  const start: Cell = [dx === 'right' ? x0 : x0 + w, dy === 'down' ? y0 : y0 + h];
  let goal = start;
  for (const d of path) goal = go(goal, d);
  return { n, start, goal, blocks: [], path };
}

/**
 * Поле: старт, батарейка и (с blocks) коробки. Без коробок — путь ровно в steps шагов с turns
 * поворотами. С коробками — кратчайший объезд ровно в steps шагов, и коробки правда мешают: путь
 * длиннее, чем напрямую, или прямых путей стало меньше.
 */
export function planField(steps: number, turns: number, blocks: boolean, rnd: Rnd): BotField {
  const n = gridFor(steps);
  const kinds = () => {
    const ks = [...BLOCK_KINDS];
    for (let i = ks.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [ks[i], ks[j]] = [ks[j]!, ks[i]!];
    }
    return ks;
  };
  if (blocks && steps >= 2) {
    const cells: Cell[] = [];
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) cells.push([x, y]);
    for (let attempt = 0; attempt < 6000; attempt++) {
      // Объезд (путь длиннее, чем напрямую) возможен с четырёх шагов: тогда только он; на двух-трёх
      // шагах коробки хотя бы закрывают часть прямых путей.
      const detour = steps >= 4;
      const start = pick(cells, rnd);
      const goal = pick(cells, rnd);
      const m = Math.abs(start[0] - goal[0]) + Math.abs(start[1] - goal[1]);
      if (m < 1 || m > steps || (steps - m) % 2 || (detour && m === steps)) continue;
      const count = 2 + Math.floor(rnd() * 4);
      const free = cells.filter((c) => !same(c, start) && !same(c, goal));
      const ks = kinds();
      const bs: BotField['blocks'] = [];
      while (bs.length < count) {
        const c = pick(free, rnd);
        if (!bs.some((b) => same(b.c, c))) bs.push({ c, kind: ks[bs.length % ks.length]! });
      }
      const f = { n, blocks: bs };
      if (at(distances(f, start), goal) !== steps) continue;
      if (m === steps && pathCount(f, start, goal) >= pathCount({ n, blocks: [] }, start, goal))
        continue;
      // Поворот в объезде есть, если его просили.
      const path = bestPath(f, start, goal)!;
      if (turnsOf(path) < Math.min(turns, 1)) continue;
      return { n, start, goal, blocks: bs, path };
    }
  }
  const f = straightField(n, steps, turns, rnd);
  if (!blocks) return f;
  // Один шаг — коробки только для вида, в стороне от пути.
  const onPath: Cell[] = [f.start];
  for (const d of f.path) onPath.push(go(onPath.at(-1)!, d));
  const ks = kinds();
  for (let tries = 0; f.blocks.length < 2 && tries < 200; tries++) {
    const c: Cell = [Math.floor(rnd() * n), Math.floor(rnd() * n)];
    if (onPath.some((p) => same(p, c)) || isBlock(f, c)) continue;
    f.blocks.push({ c, kind: ks[f.blocks.length]! });
  }
  return f;
}

/**
 * Испортить программу одной стрелкой: робот с ней не доезжает. Из всех таких — где исправить
 * можно как можно меньшим числом способов (лучше одна-единственная неправильная стрелка), и робот
 * лучше упирается, чем просто не доезжает (так ошибку видно).
 */
export function breakProgram(f: BotField, rnd: Rnd): Dir[] {
  const p = f.path;
  let best: { prog: Dir[]; score: number }[] = [];
  let bs = Infinity;
  p.forEach((d, i) => {
    for (const o of DIRS) {
      if (o === d) continue;
      const prog = put(p, i, o);
      const r = run(f, prog);
      if (r.result === 'goal') continue;
      const score = fixable(f, prog).length * 2 + (r.result === 'short' ? 1 : 0);
      if (score < bs) {
        bs = score;
        best = [];
      }
      if (score === bs) best.push({ prog, score });
    }
  });
  return pick(best, rnd).prog;
}

/** Раунды: задания по очереди, у каждого — своё поле (не то же, что в прошлый раз). */
export function planRounds(spec: SpecOf<'bot'>, rnd: Rnd = Math.random): BotRound[] {
  const out: BotRound[] = [];
  for (let k = 0; k < spec.rounds; k++) {
    const task = spec.tasks[k % spec.tasks.length]!;
    let field = planField(spec.steps, spec.turns, spec.blocks, rnd);
    for (let t = 0; t < 20; t++) {
      const prev = out[out.length - 1]?.field;
      if (!prev || !same(prev.start, field.start) || !same(prev.goal, field.goal)) break;
      field = planField(spec.steps, spec.turns, spec.blocks, rnd);
    }
    const program = task === 'fix' ? breakProgram(field, rnd) : [];
    const slots = task === 'fix' ? program.length : Math.min(10, field.path.length + 2);
    out.push({ task, field, program, slots });
  }
  return out;
}

// ─── Раскладка на экране ───
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface BotStage {
  land: boolean;
  /** Коврик и размер клетки. */
  board: Box;
  cell: number;
  /** Гнёзда ленты (середины) и их размер. */
  sockets: { x: number; y: number }[];
  socket: number;
  /** Лента целиком. */
  strip: Box;
  /** Кнопки пульта: четыре стрелки (по DIRS) и «Пуск». */
  keys: (Box & { dir: Dir })[];
  go: Box;
}

/** Лёжа слева сидит сова: досюда (px) ничего не ставим. */
export const OWL_RIGHT = 100;
/** Сверху стоя — кнопки «домой» и «послушать»; лёжа справа сверху — «послушать». */
export const TOP = 100;
export const TOP_BUTTONS = 92;

/**
 * Лента: гнёзда рядами не шире W; в один ряд — до шести, если гнёзда не мельче 44 px, иначе в два
 * (не больше пяти в ряд). Гнездо не крупнее max1 в один ряд и max2 — в два.
 */
function stripFor(slots: number, W: number, max1: number, max2 = max1) {
  const gap = 8;
  const rows = slots > 6 || (W - gap * (slots - 1)) / slots < 44 ? 2 : 1;
  const cols = rows > 1 ? (slots > 6 ? 5 : Math.ceil(slots / 2)) : slots;
  const socket = Math.min(rows > 1 ? max2 : max1, (W - gap * (cols - 1)) / cols);
  return { rows, cols, socket, gap, h: rows * socket + (rows - 1) * gap };
}

function place(
  slots: number,
  strip: { rows: number; cols: number; socket: number; gap: number; h: number },
  box: Box,
) {
  const { cols, socket, gap } = strip;
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i < slots; i++) {
    const r = Math.floor(i / cols);
    const inRow = Math.min(cols, slots - r * cols);
    const rw = inRow * socket + (inRow - 1) * gap;
    const c = i - r * cols;
    out.push({
      x: box.x + (box.w - rw) / 2 + c * (socket + gap) + socket / 2,
      y: box.y + r * (socket + gap) + socket / 2,
    });
  }
  return out;
}

interface Keys {
  k: number;
  gap: number;
  rows: 1 | 2;
  h: number;
}
/**
 * Пульт: четыре стрелки и «Пуск» (в полтора раза шире) в ряд по ширине W; лёжа на узкой панели —
 * стрелки в ряд, «Пуск» под ними.
 */
function keysFor(W: number, max: number, land: boolean): Keys {
  const gap = 10;
  const one = Math.min(max, (W - gap * 4) / 5.5);
  if (!land || one >= 56) return { k: one, gap, rows: 1, h: one };
  const k = Math.min(max, (W - gap * 3) / 4);
  return { k, gap, rows: 2, h: k * 2 + gap };
}
function placeKeys(x: number, y: number, W: number, { k, gap, rows }: Keys) {
  const x0 = x + (W - (rows === 1 ? k * 5.5 + gap * 4 : k * 4 + gap * 3)) / 2;
  const keys = DIRS.map((dir, i) => ({ dir, x: x0 + i * (k + gap), y, w: k, h: k }));
  const go =
    rows === 1
      ? { x: x0 + 4 * (k + gap), y, w: k * 1.5, h: k }
      : { x: x + (W - k * 2) / 2, y: y + k + gap, w: k * 2, h: k };
  return { keys, go };
}

/** Где коврик, лента и пульт: стоя — сверху вниз, лёжа — коврик слева, лента и пульт справа. */
export function stageFor(w: number, h: number, n: number, slots: number): BotStage {
  const land = w > h;
  const pad = Math.max(8, Math.min(w, h) * 0.025);
  const gap = Math.max(12, Math.min(w, h) * 0.03);
  if (land) {
    // Справа панель с лентой и пультом — не уже 0,38 экрана и не уже 264 px.
    const side = Math.min(
      h - 2 * pad,
      w - OWL_RIGHT - 2 * pad - gap * 1.5 - Math.max(w * 0.38, 264),
    );
    const board = { x: OWL_RIGHT + pad, y: (h - side) / 2, w: side, h: side };
    const px = board.x + side + gap * 1.5;
    const pw = w - pad - px;
    const ph = h - pad - TOP_BUTTONS;
    const keys = keysFor(pw, Math.min(84, ph * 0.3), true);
    const room = ph - keys.h - gap * 2;
    const st = stripFor(slots, pw, Math.min(72, room / 1.2), Math.min(72, room / 2.2));
    const used = st.h + gap * 1.6 + keys.h;
    const y0 = TOP_BUTTONS + (ph - used) / 2;
    const strip = { x: px, y: y0, w: pw, h: st.h };
    const { keys: ks, go } = placeKeys(px, y0 + st.h + gap * 1.6, pw, keys);
    return {
      land,
      board,
      cell: side / n,
      sockets: place(slots, st, strip),
      socket: st.socket,
      strip,
      keys: ks,
      go,
    };
  }
  const W = w - 2 * pad;
  const keys = keysFor(W, 84, false);
  const st = stripFor(slots, W, 72);
  const below = st.h + gap * 1.6 + keys.k + pad;
  const side = Math.min(W, h - TOP - gap * 1.5 - below);
  // Коврик и пульт — посередине свободного места.
  const used = side + gap * 1.5 + below - pad;
  const y0 = TOP + Math.max(0, (h - pad - TOP - used) / 2);
  const board = { x: (w - side) / 2, y: y0, w: side, h: side };
  const strip = { x: pad, y: y0 + side + gap * 1.5, w: W, h: st.h };
  const { keys: ks, go } = placeKeys(pad, strip.y + st.h + gap * 1.6, W, keys);
  return {
    land,
    board,
    cell: side / n,
    sockets: place(slots, st, strip),
    socket: st.socket,
    strip,
    keys: ks,
    go,
  };
}

/** Середина клетки на экране. */
export const cellCenter = (st: BotStage, c: Cell): [number, number] => [
  st.board.x + (c[0] + 0.5) * st.cell,
  st.board.y + (c[1] + 0.5) * st.cell,
];

/** Глиняные картинки игры. */
export const botSprites = () => [
  'bot-robot',
  'bot-battery',
  ...BLOCK_KINDS.map((k) => `bot-${k}`),
  'bot-room-p',
  'bot-room-l',
];
