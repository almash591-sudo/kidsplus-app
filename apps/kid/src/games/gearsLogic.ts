// Логика «Шестерёнок» (этап 57) отдельно от рисования: какие шестерёнки в цепочке, где они висят,
// как сцепляются зубчики и в какую сторону всё крутится. Длины — в радиусах средней шестерёнки.
import type { GearsTask } from '@kidsplus/shared/games';
import type { SpecOf } from './common';

type GearsSpec = SpecOf<'gears'>;

/** Что крутит последняя шестерёнка. */
export const MACHINES = ['mill', 'wheel', 'pinwheel'] as const;
export type Machine = (typeof MACHINES)[number];

/** Зубчики маленькой, средней и большой шестерёнки. */
export const TEETH = [8, 12, 16] as const;
/** У ручки — большая шестерёнка, у машины — средняя; у вертушки — маленькая: её крылышки видно. */
export const DRIVER_TEETH = 16;
export const outputTeeth = (m: Machine) => (m === 'pinwheel' ? 8 : 12);
/** Радиус окружности, по которой зубчики сцепляются: у средней — 1. */
export const pitch = (teeth: number) => teeth / 12;
/** Высота зубца над этой окружностью — у всех одна, иначе зубчики не сцепятся. */
export const ADDENDUM = 2 / 12;
/** Глубина впадины под ней — чуть больше, чтобы зубец соседки не упирался в дно. */
export const DEDENDUM = 1.2 * ADDENDUM;
/** До кончиков зубцов. */
export const outer = (teeth: number) => pitch(teeth) + ADDENDUM;

export interface GearsRound {
  kind: GearsTask;
  machine: Machine;
  /** Зубчики по цепочке: у ручки, между, у машины. */
  chain: number[];
  /** Пустые места (номера в chain) — в «собери»; в «какую сторону» их нет. */
  empty: number[];
  /** Шестерёнки в коробке (зубчики) — в «собери». */
  tray: number[];
  /** Куда повернут ручку: 1 — по часовой стрелке, −1 — против. */
  crank: 1 | -1;
}

const shuffle = <T>(xs: readonly T[], rnd: () => number): T[] => {
  const out = [...xs];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
};
const pick = <T>(xs: readonly T[], rnd: () => number) => xs[Math.floor(rnd() * xs.length)]!;

/**
 * Шестерёнки между ручкой и машиной: одинаковые средние или (sizes) разные — одна-единственная
 * маленькая или большая, из нескольких хотя бы двух размеров и не больше двух больших (иначе
 * цепочка не поместится на маленьком экране).
 */
export function middleTeeth(gaps: number, sizes: boolean, rnd: () => number): number[] {
  if (!sizes) return Array.from({ length: gaps }, () => 12);
  if (gaps === 1) return [pick([8, 16], rnd)];
  for (;;) {
    const out = Array.from({ length: gaps }, () => pick(TEETH, rnd));
    if (new Set(out).size >= 2 && out.filter((t) => t === 16).length <= 2) return out;
  }
}

/**
 * Коробка для «собери»: одинаковые — ровно сколько нужно; разные — нужные, каких размеров не
 * хватает и, если выбирать почти не из чего, одна лишняя.
 */
export function trayFor(needed: readonly number[], sizes: boolean, rnd: () => number): number[] {
  if (!sizes) return [...needed];
  const out = [...needed, ...TEETH.filter((t) => !needed.includes(t))];
  if (out.length < needed.length + 1) out.push(pick(TEETH, rnd));
  return shuffle(out, rnd);
}

/** Задания по очереди из spec.tasks, машины — по кругу с любой. */
export function planGears(spec: GearsSpec, rnd: () => number = Math.random): GearsRound[] {
  const first = Math.floor(rnd() * MACHINES.length);
  return Array.from({ length: spec.rounds }, (_, i) => {
    const kind = spec.tasks[i % spec.tasks.length]!;
    const middle = middleTeeth(spec.gaps, spec.sizes, rnd);
    const machine = MACHINES[(first + i) % MACHINES.length]!;
    const chain = [DRIVER_TEETH, ...middle, outputTeeth(machine)];
    const build = kind === 'build';
    return {
      kind,
      machine,
      chain,
      empty: build ? middle.map((_, k) => k + 1) : [],
      tray: build ? trayFor(middle, spec.sizes, rnd) : [],
      crank: rnd() < 0.5 ? 1 : -1,
    };
  });
}

/** Куда крутится шестерёнка number цепочки, если ручку крутят в сторону crank: через одну. */
export const spinOf = (crank: 1 | -1, index: number): 1 | -1 =>
  (index % 2 ? -crank : crank) as 1 | -1;
/** Куда закрутится машина: как последняя шестерёнка. */
export const machineDir = (r: Pick<GearsRound, 'chain' | 'crank'>) =>
  spinOf(r.crank, r.chain.length - 1);

export interface Pt {
  x: number;
  y: number;
}
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * Углы шестерёнок (рад, плюс — по часовой на экране), когда ручка повёрнута на a0. Каждая
 * следующая крутится в обратную сторону и во столько раз медленнее, во сколько у неё больше
 * зубчиков; повёрнута так, что зубец соседки входит точно во впадину. Зубец номер 0 — на угле 0.
 */
export function chainAngles(chain: readonly number[], pos: readonly Pt[], a0: number): number[] {
  const out = [a0];
  for (let i = 1; i < chain.length; i++) {
    const n0 = chain[i - 1]!;
    const n1 = chain[i]!;
    const th = Math.atan2(pos[i]!.y - pos[i - 1]!.y, pos[i]!.x - pos[i - 1]!.x);
    out.push(th + Math.PI - Math.PI / n1 + ((th - out[i - 1]!) * n0) / n1);
  }
  return out;
}

/**
 * Контур шестерёнки: [угол, радиус] по кругу, зубец номер 0 — на угле 0. Зубец — трапеция: у
 * основания шире, к кончику уже, на окружности сцепления — меньше половины шага: с зазором,
 * чтобы зубец соседки не задевал (проверено в тестах на всех парах размеров).
 */
export function gearOutline(teeth: number): [number, number][] {
  const r = pitch(teeth);
  const root = r - DEDENDUM;
  const tip = r + ADDENDUM;
  const step = (2 * Math.PI) / teeth;
  const out: [number, number][] = [];
  for (let k = 0; k < teeth; k++) {
    const c = k * step;
    out.push(
      [c - 0.5 * step, root],
      [c - 0.28 * step, root],
      [c - 0.12 * step, tip],
      [c + 0.12 * step, tip],
      [c + 0.28 * step, root],
    );
  }
  return out;
}

/** Окружность (центр c, радиус r) касается прямоугольника? */
const hitsBox = (c: Pt, r: number, b: Box) => {
  const dx = Math.max(b.x - c.x, 0, c.x - (b.x + b.w));
  const dy = Math.max(b.y - c.y, 0, c.y - (b.y + b.h));
  return dx * dx + dy * dy < r * r;
};

export interface LayoutOpts {
  /** Центр шестерёнки у машины. */
  to: Pt;
  /** Где может стоять ручка: на отрезке от near до far (ближе к машине — дальше от неё). */
  near: Pt;
  far: Pt;
  /** Все шестерёнки целиком — внутри. */
  box: Box;
  /** Куда шестерёнкам между ручкой и машиной нельзя: корпус машины, коробка. */
  avoid: readonly Box[];
}

/** Цепочка стоит правильно: соседки сцеплены, остальные не задевают друг друга, всё на месте. */
export function chainFits(chain: readonly number[], pos: readonly Pt[], o: LayoutOpts) {
  const n = chain.length;
  for (let i = 0; i < n; i++) {
    const p = pos[i]!;
    const r = outer(chain[i]!);
    if (p.x - r < o.box.x || p.y - r < o.box.y) return false;
    if (p.x + r > o.box.x + o.box.w || p.y + r > o.box.y + o.box.h) return false;
    if (i > 0 && i < n - 1 && o.avoid.some((b) => hitsBox(p, r + 0.05, b))) return false;
    for (let j = i + 1; j < n; j++) {
      const d = dist(p, pos[j]!);
      if (j === i + 1) {
        if (Math.abs(d - pitch(chain[i]!) - pitch(chain[j]!)) > 1e-6) return false;
      } else if (d < r + outer(chain[j]!) + 0.12) return false;
    }
  }
  return true;
}

/** Где ручка, чтобы до машины было d: на отрезке near → far. */
function driverAt(o: LayoutOpts, d: number): Pt {
  let lo = 0;
  let hi = 1;
  const at = (t: number) => ({
    x: o.near.x + (o.far.x - o.near.x) * t,
    y: o.near.y + (o.far.y - o.near.y) * t,
  });
  if (dist(at(1), o.to) <= d) return at(1);
  if (dist(at(0), o.to) >= d) return at(0);
  for (let k = 0; k < 30; k++) {
    const t = (lo + hi) / 2;
    if (dist(at(t), o.to) < d) lo = t;
    else hi = t;
  }
  return at(lo);
}

/**
 * Где висят шестерёнки цепочки (с ручкой и машиной): ручка — на отрезке near → far, между ними —
 * ломаной, каждая следующая — там, где не задевает прежних и откуда ещё можно дотянуться до
 * машины; последняя промежуточная — точно на пересечении окружностей (сцепиться и с соседкой,
 * и с машиной). Сначала пробуем почти прямо, потом — всё извилистее. null — не вышло.
 */
export function layoutChain(
  chain: readonly number[],
  o: LayoutOpts,
  rnd: () => number = Math.random,
): Pt[] | null {
  const n = chain.length;
  const link = (i: number) => pitch(chain[i]!) + pitch(chain[i + 1]!);
  /** Сколько ещё тянуться от шестерёнки i до машины. */
  const rest = (i: number) => chain.slice(i + 1).reduce((s, _, k) => s + link(i + k), 0);
  const span = rest(0);
  const near = dist(o.near, o.to);
  const far = dist(o.far, o.to);
  const inside = (p: Pt, r: number) =>
    p.x - r >= o.box.x &&
    p.y - r >= o.box.y &&
    p.x + r <= o.box.x + o.box.w &&
    p.y + r <= o.box.y + o.box.h;
  /** Шестерёнку i можно повесить в p: внутри, не на машине и не на прежних (кроме соседки). */
  const free = (pos: readonly Pt[], i: number, p: Pt) => {
    const r = outer(chain[i]!);
    if (!inside(p, r) || o.avoid.some((b) => hitsBox(p, r + 0.05, b))) return false;
    for (let j = 0; j < i - 1; j++)
      if (dist(p, pos[j]!) < r + outer(chain[j]!) + 0.12) return false;
    return i === n - 2 || dist(p, o.to) >= r + outer(chain[n - 1]!) + 0.12;
  };
  for (let attempt = 0; attempt < 400; attempt++) {
    const bend = Math.min(1, 0.15 + attempt / 250);
    const lo = Math.max(near, span * (0.95 - 0.5 * bend));
    const hi = Math.max(lo, Math.min(far, span * 0.95));
    const pos: Pt[] = [driverAt(o, lo + (hi - lo) * rnd())];
    let ok = true;
    for (let i = 1; i < n - 2 && ok; i++) {
      const p = pos[i - 1]!;
      const l = link(i - 1);
      ok = false;
      for (let t = 0; t < 14 && !ok; t++) {
        const head = Math.atan2(o.to.y - p.y, o.to.x - p.x) + (rnd() * 2 - 1) * 2 * bend;
        const q = { x: p.x + l * Math.cos(head), y: p.y + l * Math.sin(head) };
        const d = dist(q, o.to);
        if (d > rest(i) || d < Math.abs(link(n - 2) - link(n - 3)) || !free(pos, i, q)) continue;
        pos.push(q);
        ok = true;
      }
    }
    if (!ok) continue;
    // Последняя промежуточная: на расстоянии a от предыдущей и b от машины.
    const p = pos[n - 3]!;
    const a = link(n - 3);
    const b = link(n - 2);
    const d = dist(p, o.to);
    if (d > a + b || d < Math.abs(a - b) || d === 0) continue;
    const along = (a * a - b * b + d * d) / (2 * d);
    const h = Math.sqrt(Math.max(0, a * a - along * along));
    const ux = (o.to.x - p.x) / d;
    const uy = (o.to.y - p.y) / d;
    const side = rnd() < 0.5 ? 1 : -1;
    const tries = [side, -side].map((sd) => ({
      x: p.x + ux * along - uy * h * sd,
      y: p.y + uy * along + ux * h * sd,
    }));
    const fit = tries.find((q) => chainFits(chain, [...pos, q, o.to], o));
    if (fit) return [...pos, fit, o.to];
  }
  return null;
}

/** Фоны-мастерские: размер картинки и где на ней верх верстака (доля высоты). */
const BACKS = {
  p: { w: 1024, h: 1536, bench: 0.732 },
  l: { w: 1536, h: 864, bench: 0.738 },
};

export interface GearsStage {
  /** Пикселей в единице (радиус средней шестерёнки). */
  u: number;
  /** Экран в единицах. */
  W: number;
  H: number;
  land: boolean;
  /** Верх верстака, единицы. */
  bench: number;
  /** Фон: где верх картинки и её размер, px. */
  back: { y: number; w: number; h: number };
  /** Где шестерёнки: цепочка, машина, ручка, коробка. */
  layout: LayoutOpts;
  /** Коробка с шестерёнками или кнопки «в какую сторону» — на верстаке. */
  tray: Box;
}

/**
 * Мастерская на экране w×h px: стоя — машина справа на верстаке, ручка слева, коробка — на
 * верстаке внизу; лёжа — верстак низкий, коробка — на нём слева, машина справа.
 */
export function stageFor(w: number, h: number, machine: Machine): GearsStage {
  const land = w > h;
  const top = land ? 56 : 100;
  const u = land ? Math.min(h / 9, w / 18) : Math.min(w / 8, (h - top) / 13.2);
  const W = w / u;
  const H = h / u;
  const T = top / u;
  // Фон — во весь экран; лёжа верстак поднимаем, чтобы на нём поместилась коробка.
  const bk = land ? BACKS.l : BACKS.p;
  const k = Math.max(w / bk.w, h / bk.h);
  const bw = bk.w * k;
  const bh = bk.h * k;
  const want = (land ? H - 2.3 : H - 4.4) * u;
  const by = Math.min(0, Math.max(h - bh, want - bk.bench * bh));
  const bench = (by + bk.bench * bh) / u;
  const to = { x: W - (land ? 3 : 2.3), y: bench - 2.75 };
  // Корпус машины под осью — туда шестерёнкам нельзя.
  const half = machine === 'mill' ? 1.55 : machine === 'wheel' ? 1.75 : 0.4;
  const drop = machine === 'wheel' ? 1.1 : 0.9;
  const body = { x: to.x - half, y: to.y + drop, w: 2 * half, h: bench + 0.4 - to.y - drop };
  const tray = land
    ? { x: 0.3, y: bench - 0.25, w: W - 6.8, h: H - bench + 0.15 }
    : { x: 0.25, y: bench + 0.05, w: W - 0.5, h: H - bench - 0.25 };
  const dy = land ? Math.max(T + 1.6, Math.min(to.y, tray.y - 1.65)) : 0;
  return {
    u,
    W,
    H,
    land,
    bench,
    back: { y: by, w: bw, h: bh },
    layout: {
      to,
      near: land ? { x: to.x - 2.9, y: dy } : { x: to.x - 3.1, y: bench - 1.75 },
      far: land ? { x: 1.7, y: dy } : { x: 1.65, y: T + 1.75 },
      box: { x: 0.12, y: T + 0.05, w: W - 0.24, h: bench + 0.3 - T - 0.05 },
      avoid: [body, tray],
    },
    tray,
  };
}

/**
 * Шестерёнки в коробке: в один или два ряда, все в одном масштабе (не больше настоящего) —
 * чтобы было видно, какая больше. Центры — в единицах.
 */
export function trayLayout(teeth: readonly number[], box: Box): { scale: number; at: Pt[] } {
  const gap = 0.3;
  const n = teeth.length;
  let best = { scale: 0, at: [] as Pt[] };
  for (const rows of n > 1 ? [1, 2] : [1]) {
    const split = Math.ceil(n / rows);
    const lines = rows === 1 ? [teeth] : [teeth.slice(0, split), teeth.slice(split)];
    const widths = lines.map((l) => l.reduce((s, t) => s + 2 * outer(t), 0));
    const heights = lines.map((l) => Math.max(...l.map((t) => 2 * outer(t))));
    const scale = Math.min(
      1,
      ...lines.map((l, i) => (box.w - gap * (l.length + 1)) / widths[i]!),
      (box.h - gap * (rows + 1)) / heights.reduce((s, x) => s + x, 0),
    );
    if (scale <= best.scale) continue;
    const at: Pt[] = [];
    const used = heights.reduce((s, x) => s + x * scale, 0);
    let y = box.y + (box.h - used - gap * (rows - 1)) / 2;
    lines.forEach((l, i) => {
      const lw = widths[i]! * scale + gap * (l.length - 1);
      let x = box.x + (box.w - lw) / 2;
      const cy = y + (heights[i]! * scale) / 2;
      for (const t of l) {
        const r = outer(t) * scale;
        at.push({ x: x + r, y: cy });
        x += 2 * r + gap;
      }
      y += heights[i]! * scale + gap;
    });
    best = { scale, at };
  }
  return best;
}

/**
 * Задание на этом экране: где висят шестерёнки. Если цепочка не помещается — другие размеры
 * (коробка — под них), в крайнем случае — средние и, если надо, их меньше.
 */
export function fitRound(
  r: GearsRound,
  o: LayoutOpts,
  sizes: boolean,
  rnd: () => number = Math.random,
): { round: GearsRound; pos: Pt[] } {
  const build = r.kind === 'build';
  const remake = (middle: number[]): GearsRound => ({
    ...r,
    chain: [r.chain[0]!, ...middle, r.chain.at(-1)!],
    empty: build ? middle.map((_, k) => k + 1) : [],
    tray: build ? trayFor(middle, sizes, rnd) : [],
  });
  let round = r;
  const gaps = r.chain.length - 2;
  for (let k = 0; k < 6; k++) {
    const pos = layoutChain(round.chain, o, rnd);
    if (pos) return { round, pos };
    round = remake(middleTeeth(gaps, sizes, rnd));
  }
  for (let g = gaps; g >= 1; g--) {
    round = remake(Array.from({ length: g }, () => 12));
    const pos = layoutChain(round.chain, o, rnd);
    if (pos) return { round, pos };
  }
  // Совсем тесно: ручка прямо у машины через одну среднюю.
  round = remake([12]);
  const a = pitch(round.chain[0]!) + 1;
  const b = 1 + pitch(round.chain[2]!);
  const from = { x: o.to.x - a - b * 0.6, y: o.to.y };
  const d = dist(from, o.to);
  const along = (a * a - b * b + d * d) / (2 * d);
  const mid = { x: from.x + along, y: from.y - Math.sqrt(Math.max(0, a * a - along * along)) };
  return { round, pos: [from, mid, o.to] };
}

/** Глиняные картинки игры. */
export const gearsSprites = () => [
  'gears-bg-l',
  'gears-bg-p',
  'gears-mill',
  'gears-blades',
  'gears-wheel',
  'gears-wstand',
  'gears-cabin',
  'gears-pinwheel',
];
