// Логика «Найди отличия» (этап 43) без рисования: картинки из спрайтов на фоне, выбор отличий,
// попадание касанием. Картинка — в своих координатах 1000 × 750; Differences.tsx рисует её дважды.
import type { DiffScene } from '@kidsplus/shared/games';
import { ASPECT } from './diffAspect';

export const W = 1000;
export const H = 750;

export type Anim = 'bob' | 'sway' | 'swim' | 'spin' | 'pulse';
export interface Thing {
  /** Имя спрайта: /games/<s>.webp. */
  s: string;
  /** Низ по центру. */
  x: number;
  y: number;
  w: number;
  anim?: Anim;
  /** Нарисован зеркально. */
  mirror?: boolean;
}
export type DiffKind = 'gone' | 'color' | 'swap' | 'flip' | 'big';
export interface Diff {
  /** Какой предмет картинки. */
  thing: number;
  kind: DiffKind;
  /** На какой из двух картинок по-другому. */
  side: 0 | 1;
  /** Другой спрайт (цвет или картинка). */
  alt?: string;
}

/** Другой цвет — спрайт из той же группы. */
const COLOR_GROUPS = [
  [
    'dive-fish-red',
    'dive-fish-blue',
    'dive-fish-yellow',
    'dive-fish-green',
    'dive-fish-purple',
    'dive-fish-orange',
  ],
  ['balloon-red', 'balloon-yellow', 'balloon-blue', 'balloon-green'],
  [
    'rocket-planet-green',
    'rocket-planet-ice',
    'rocket-planet-lava',
    'rocket-planet-yellow',
    'rocket-planet-purple',
  ],
];
/** Другая картинка — из той же группы. */
const SWAP_GROUPS = [
  ['race-tree-apple', 'race-tree-round', 'race-tree-pine'],
  ['animal-rabbit', 'animal-chick', 'animal-bear', 'animal-frog', 'animal-mouse', 'animal-turtle'],
  ['diff-hedgehog', 'diff-squirrel', 'diff-snail'],
  ['race-flowers', 'race-bush', 'diff-mushroom'],
  ['dive-shell', 'dive-star', 'dive-pearl'],
  ['dive-coral1', 'dive-coral2'],
  ['robot-star', 'rocket-asteroid'],
  ['diff-butterfly', 'diff-ladybug'],
];
/** Несимметричные — зеркало заметно. */
const FLIPPABLE = new Set([
  'dive-fish-red',
  'dive-fish-blue',
  'dive-fish-yellow',
  'dive-fish-green',
  'dive-fish-purple',
  'dive-fish-orange',
  'dive-sub',
  'diff-snail',
  'diff-hedgehog',
  'diff-squirrel',
  'space-rocket',
  'flight-owl',
  'animal-turtle',
]);

export const BACKDROP: Record<DiffScene, string> = {
  meadow: 'race-sky',
  forest: 'scene-forest-l',
  sea: 'dive-far',
  space: 'rocket-space',
};

export const SCENES: Record<DiffScene, Thing[]> = {
  meadow: [
    { s: 'diff-sun', x: 850, y: 250, w: 170, anim: 'pulse' },
    { s: 'diff-kite', x: 170, y: 330, w: 120, anim: 'sway' },
    { s: 'balloon-red', x: 570, y: 330, w: 72, anim: 'bob' },
    { s: 'balloon-yellow', x: 655, y: 300, w: 72, anim: 'bob' },
    { s: 'diff-butterfly', x: 400, y: 420, w: 110, anim: 'bob' },
    { s: 'race-windmill', x: 830, y: 600, w: 170 },
    { s: 'race-tree-apple', x: 120, y: 620, w: 210, anim: 'sway' },
    { s: 'race-tree-pine', x: 330, y: 575, w: 115, anim: 'sway' },
    { s: 'race-house', x: 580, y: 610, w: 175 },
    { s: 'animal-rabbit', x: 290, y: 735, w: 140, anim: 'bob' },
    { s: 'animal-chick', x: 720, y: 740, w: 115, anim: 'bob' },
    { s: 'race-flowers', x: 500, y: 742, w: 140 },
    { s: 'diff-snail', x: 885, y: 738, w: 125 },
    { s: 'race-bush', x: 75, y: 742, w: 130 },
  ],
  forest: [
    { s: 'animal-bird', x: 170, y: 300, w: 105, anim: 'bob' },
    { s: 'diff-butterfly', x: 640, y: 300, w: 95, anim: 'bob' },
    { s: 'race-tree-pine', x: 660, y: 540, w: 115, anim: 'sway' },
    { s: 'race-bush', x: 400, y: 560, w: 125 },
    { s: 'race-rock', x: 140, y: 575, w: 120 },
    { s: 'diff-squirrel', x: 860, y: 580, w: 135, anim: 'bob' },
    { s: 'animal-bear', x: 500, y: 660, w: 170, anim: 'bob' },
    { s: 'diff-mushroom', x: 290, y: 690, w: 95 },
    { s: 'diff-ladybug', x: 150, y: 505, w: 70 },
    { s: 'diff-hedgehog', x: 170, y: 738, w: 145 },
    { s: 'diff-snail', x: 470, y: 742, w: 115 },
    { s: 'diff-mushroom', x: 690, y: 735, w: 80 },
    { s: 'race-flowers', x: 880, y: 745, w: 135 },
  ],
  sea: [
    { s: 'dive-sub', x: 450, y: 210, w: 190, anim: 'bob' },
    { s: 'dive-fish-red', x: 200, y: 260, w: 150, anim: 'swim' },
    { s: 'dive-fish-blue', x: 780, y: 220, w: 140, anim: 'swim', mirror: true },
    { s: 'dive-jelly', x: 110, y: 470, w: 110, anim: 'bob' },
    { s: 'dive-fish-yellow', x: 520, y: 420, w: 130, anim: 'swim', mirror: true },
    { s: 'dive-fish-purple', x: 860, y: 450, w: 125, anim: 'swim' },
    { s: 'dive-coral1', x: 130, y: 730, w: 175, anim: 'sway' },
    { s: 'dive-weed1', x: 330, y: 735, w: 80, anim: 'sway' },
    { s: 'dive-star', x: 250, y: 748, w: 85 },
    { s: 'dive-shell', x: 430, y: 745, w: 95 },
    { s: 'dive-chest', x: 580, y: 730, w: 170 },
    { s: 'dive-weed2', x: 735, y: 700, w: 100, anim: 'sway' },
    { s: 'dive-coral2', x: 875, y: 735, w: 165 },
  ],
  space: [
    { s: 'rocket-planet-ring', x: 220, y: 300, w: 240, anim: 'bob' },
    { s: 'robot-star', x: 420, y: 170, w: 75, anim: 'pulse' },
    { s: 'space-rocket', x: 600, y: 330, w: 175, anim: 'bob' },
    { s: 'rocket-planet-green', x: 840, y: 260, w: 165, anim: 'bob' },
    { s: 'space-planet', x: 420, y: 560, w: 165, anim: 'bob' },
    { s: 'rocket-asteroid', x: 720, y: 500, w: 95, anim: 'spin' },
    { s: 'flight-owl', x: 860, y: 590, w: 150, anim: 'bob' },
    { s: 'rocket-planet-ice', x: 130, y: 700, w: 145, anim: 'bob' },
    { s: 'robot-star', x: 290, y: 690, w: 65, anim: 'pulse' },
    { s: 'rocket-planet-lava', x: 620, y: 730, w: 150, anim: 'bob' },
    { s: 'robot-star', x: 920, y: 735, w: 70, anim: 'pulse' },
  ],
};

const aspect = (s: string) => ASPECT[s] ?? 1;
/** Середина предмета и «радиус» для касания и для колечка. */
export function spot(t: Thing, d?: Diff) {
  const k = d?.kind === 'big' ? BIG : 1;
  const w = t.w * k;
  const h = w * aspect(d?.alt ?? t.s);
  return { x: t.x, y: t.y - h / 2, r: Math.max(70, 0.55 * Math.max(w, h)) };
}
/** Насколько больше «большой» предмет. */
export const BIG = 1.4;

const groupOf = (groups: string[][], s: string) => groups.find((g) => g.includes(s));
/** Какие отличия возможны у предмета. */
export function kindsOf(t: Thing): DiffKind[] {
  const out: DiffKind[] = ['gone'];
  if (groupOf(COLOR_GROUPS, t.s)) out.push('color');
  const swap = groupOf(SWAP_GROUPS, t.s)?.filter((s) => s !== t.s);
  if (swap?.length) out.push('swap');
  if (FLIPPABLE.has(t.s)) out.push('flip');
  if (t.w <= 180) out.push('big');
  return out;
}

function shuffle<T>(items: readonly T[], rnd: () => number): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/**
 * Отличия картинки: count предметов, далеко друг от друга (колечки не налезают), виды — разные,
 * насколько выходит: сначала берётся вид, которого ещё меньше всего.
 */
export function pickDiffs(scene: Thing[], count: number, rnd = Math.random): Diff[] {
  const out: Diff[] = [];
  const used: Record<DiffKind, number> = { gone: 0, color: 0, swap: 0, flip: 0, big: 0 };
  const order = shuffle(
    scene.map((_, i) => i),
    rnd,
  );
  // Сначала — только предметы с ещё не бывшим видом отличия, потом — любые.
  for (const fresh of [true, false])
    for (const i of order) {
      if (out.length >= count) break;
      if (out.some((d) => d.thing === i)) continue;
      const t = scene[i]!;
      const a = spot(t);
      const far = out.every((d) => {
        const b = spot(scene[d.thing]!);
        return Math.hypot(a.x - b.x, a.y - b.y) > (a.r + b.r) * 0.75;
      });
      if (!far) continue;
      const kinds = shuffle(kindsOf(t), rnd).sort((x, y) => used[x] - used[y]);
      const kind = kinds[0]!;
      if (fresh && used[kind]) continue;
      used[kind]++;
      const d: Diff = { thing: i, kind, side: rnd() < 0.5 ? 0 : 1 };
      if (kind === 'color') d.alt = pickOther(groupOf(COLOR_GROUPS, t.s)!, t.s, rnd);
      if (kind === 'swap') d.alt = pickOther(groupOf(SWAP_GROUPS, t.s)!, t.s, rnd);
      out.push(d);
    }
  return out;
}
const pickOther = (group: string[], s: string, rnd: () => number) => {
  const others = group.filter((g) => g !== s);
  return others[Math.floor(rnd() * others.length)]!;
};

/** Как предмет выглядит на картинке side: спрайт, ширина, зеркало; null — его там нет. */
export function look(t: Thing, i: number, diffs: Diff[], side: 0 | 1) {
  const d = diffs.find((x) => x.thing === i && x.side === side);
  if (d?.kind === 'gone') return null;
  return {
    s: d?.alt ?? t.s,
    w: d?.kind === 'big' ? t.w * BIG : t.w,
    mirror: d?.kind === 'flip' ? !t.mirror : !!t.mirror,
  };
}

/** Какое ещё не найденное отличие под касанием (x, y в координатах картинки); -1 — никакое. */
export function hitDiff(
  scene: Thing[],
  diffs: Diff[],
  found: ReadonlySet<number>,
  x: number,
  y: number,
) {
  let best = -1;
  let bestDist = Infinity;
  diffs.forEach((d, k) => {
    if (found.has(k)) return;
    const p = spot(scene[d.thing]!, d);
    const dist = Math.hypot(x - p.x, y - p.y);
    if (dist <= p.r && dist < bestDist) {
      best = k;
      bestDist = dist;
    }
  });
  return best;
}

/** Покачивание предмета во времени — одинаковое на обеих картинках. */
export function motion(anim: Anim | undefined, t: number, phase: number) {
  const p = t + phase * 1.7;
  switch (anim) {
    case 'bob':
      return { dx: 0, dy: Math.sin(p * 1.6) * 7, rot: 0, k: 1 };
    case 'sway':
      return { dx: 0, dy: 0, rot: Math.sin(p * 1.1) * 0.05, k: 1 };
    case 'swim':
      return {
        dx: Math.sin(p * 0.7) * 22,
        dy: Math.sin(p * 1.9) * 6,
        rot: Math.sin(p * 1.9) * 0.05,
        k: 1,
      };
    case 'spin':
      return { dx: 0, dy: 0, rot: p * 0.25, k: 1 };
    case 'pulse':
      return { dx: 0, dy: 0, rot: Math.sin(p) * 0.15, k: 1 + Math.sin(p * 2.4) * 0.08 };
    default:
      return { dx: 0, dy: 0, rot: 0, k: 1 };
  }
}

/** Картинки по порядку: по кругу из выбранных родителем, подряд не повторяются. */
export function sceneOrder(
  scenes: readonly DiffScene[],
  rounds: number,
  rnd = Math.random,
): DiffScene[] {
  const out: DiffScene[] = [];
  while (out.length < rounds) {
    const batch = shuffle(scenes, rnd);
    if (out.length && batch[0] === out.at(-1) && batch.length > 1) batch.push(batch.shift()!);
    out.push(...batch);
  }
  return out.slice(0, rounds);
}

/** Все спрайты, которые могут понадобиться картинке (с цветами и заменами). */
export function spritesOf(scene: DiffScene): string[] {
  const set = new Set<string>([BACKDROP[scene]]);
  for (const t of SCENES[scene]) {
    set.add(t.s);
    for (const g of [...COLOR_GROUPS, ...SWAP_GROUPS])
      if (g.includes(t.s)) g.forEach((s) => set.add(s));
  }
  return [...set];
}
