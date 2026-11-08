// Этап 59: «Волшебные пузыри» — раунды, как плывут пузыри и где на кадре шевельнулась рука. На вход
// приходят два маленьких серых кадра, на выходе — только «здесь было движение»: ни лиц, ни
// картинок логика не видит и не хранит.
import type { BubblesTask } from '@kidsplus/shared/games';
import type { SpecOf } from './common';

export type Rnd = () => number;

export const BUBBLE_COLORS = ['red', 'blue', 'green', 'yellow', 'purple'] as const;
export type BubbleColor = (typeof BUBBLE_COLORS)[number];
/** Как цвет звучит в задании. */
export const COLOR_WORDS: Record<BubbleColor, string> = {
  red: 'красные',
  blue: 'синие',
  green: 'зелёные',
  yellow: 'жёлтые',
  purple: 'фиолетовые',
};
export const BUBBLE_DIGITS = [1, 2, 3, 4, 5] as const;

/** Длинная сторона кадра для поиска движения, пикселей. */
export const FRAME_LONG = 96;
/** Пиксель «шевельнулся», если яркость изменилась хотя бы на столько (из 255). */
const FLOOR = 24;
/** Весь кадр сдвинулся: телефон подняли или поменялся свет. Такой кадр не считаем. */
export const SHAKEN = 0.6;
/** Заряд взмаха, с которого пузырь лопается, и сколько заряда остаётся к следующему кадру. */
export const POP_AT = 0.35;
const KEEP = 0.6;
/** За сколько секунд пузырь проплывает весь экран. */
const RISE_S = 8;
const RISE_FAST_S = 5.5;
/** Новый пузырь — раз в столько мс; больше скольких на экране не бывает. */
const GAP_MS = 900;
const GAP_FAST_MS = 650;
export const MAX_LIVE = 6;

export interface BubblesRound {
  task: BubblesTask;
  goal: number;
  color?: BubbleColor;
  digit?: number;
}
export interface Bubble {
  id: number;
  /** Середина без покачивания. */
  x0: number;
  x: number;
  y: number;
  r: number;
  color: BubbleColor;
  digit?: number;
  target: boolean;
  speed: number;
  sway: number;
  phase: number;
  age: number;
  /** Заряд взмаха: копится, пока рука двигается по пузырю. */
  charge: number;
  wobbleAt: number;
}

const shuffled = <T>(items: readonly T[], rnd: Rnd) => {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
};
const pick = <T>(items: readonly T[], rnd: Rnd) => items[Math.floor(rnd() * items.length)]!;

export function planRounds(spec: SpecOf<'bubbles'>, rnd: Rnd = Math.random): BubblesRound[] {
  const colors = shuffled(BUBBLE_COLORS, rnd);
  const digits = shuffled(BUBBLE_DIGITS, rnd);
  return Array.from({ length: spec.rounds }, (_, i) => {
    const task = spec.tasks[i % spec.tasks.length]!;
    const base = { task, goal: spec.goal };
    if (task === 'color') return { ...base, color: colors[i % colors.length]! };
    if (task === 'digit') return { ...base, digit: digits[i % digits.length]! };
    return base;
  });
}

export const bubblesSprites = () => [
  ...BUBBLE_COLORS.map((c) => `bubbles-${c}`),
  'bubbles-hand',
  'bubbles-bg-p',
  'bubbles-bg-l',
];

/** Радиус пузыря: и пальцу, и взмаху должно быть куда попасть даже на маленьком экране. */
export const radiusFor = (w: number, h: number) => Math.min(w, h) * 0.13;
export const gapMs = (fast: boolean) => (fast ? GAP_FAST_MS : GAP_MS);

/** Пузырь снизу экрана. Нужных на экране нет — следующий будет нужным: ждать не придётся. */
export function spawn(
  round: BubblesRound,
  fast: boolean,
  w: number,
  h: number,
  live: readonly Bubble[],
  id: number,
  rnd: Rnd = Math.random,
): Bubble {
  const r = radiusFor(w, h) * (0.9 + rnd() * 0.25);
  const target = round.task === 'all' || !live.some((b) => b.target) || rnd() < 0.5;
  const others = <T>(all: readonly T[], skip?: T) => all.filter((c) => c !== skip);
  const color =
    round.task === 'color'
      ? target
        ? round.color!
        : pick(others(BUBBLE_COLORS, round.color), rnd)
      : pick(BUBBLE_COLORS, rnd);
  const digit =
    round.task === 'digit'
      ? target
        ? round.digit!
        : pick(others(BUBBLE_DIGITS, round.digit as (typeof BUBBLE_DIGITS)[number]), rnd)
      : undefined;
  // Подальше от тех, что только что всплыли: иначе пузыри слипаются внизу.
  const low = live.filter((b) => b.y > h * 0.6);
  let x0 = r + rnd() * (w - 2 * r);
  for (let i = 0; i < 6 && low.some((b) => Math.abs(b.x0 - x0) < r * 2.2); i++)
    x0 = r + rnd() * (w - 2 * r);
  return {
    id,
    x0,
    x: x0,
    y: h + r,
    r,
    color,
    digit,
    target,
    speed: (h + 2 * r) / (fast ? RISE_FAST_S : RISE_S),
    sway: r * (0.2 + rnd() * 0.3),
    phase: rnd() * Math.PI * 2,
    age: 0,
    charge: 0,
    wobbleAt: -1e9,
  };
}

/** Пузырь плывёт вверх и покачивается; dt в секундах. */
export function drift(b: Bubble, dt: number) {
  b.age += dt;
  b.y -= b.speed * dt;
  b.x = b.x0 + Math.sin(b.age * 1.4 + b.phase) * b.sway;
}
export const gone = (b: Bubble) => b.y < -b.r;
/** Палец: прощаем чуть мимо — маленькие пальцы попадают рядом. */
export const touched = (b: Bubble, x: number, y: number) =>
  Math.hypot(b.x - x, b.y - y) <= b.r * 1.15;

// ─── Где шевельнулась рука ───

/** Размер кадра для поиска движения: те же пропорции, что у камеры. */
export function frameSize(vw: number, vh: number) {
  const k = FRAME_LONG / Math.max(vw, vh);
  return { w: Math.max(1, Math.round(vw * k)), h: Math.max(1, Math.round(vh * k)) };
}

/** Цветной кадр в серый: в `out` только яркость. */
export function toGray(rgba: ArrayLike<number>, out: Uint8Array) {
  for (let i = 0; i < out.length; i++) {
    const p = i * 4;
    out[i] = (rgba[p]! * 77 + rgba[p + 1]! * 150 + rgba[p + 2]! * 29) >> 8;
  }
}

/** Кадры совсем одинаковые: настоящая камера так не умеет — шум есть всегда. */
export function sameFrame(a: Uint8Array, b: Uint8Array) {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/**
 * Где кадр изменился. Порог растёт вместе со средней разницей: камера подстроила яркость — кадр
 * меняется весь, но это не рука. Одиночные пиксели — шум, их отбрасываем. share — какая доля кадра
 * изменилась до всех поправок: больше SHAKEN — трясут телефон или поменялся свет.
 */
export function motionOf(prev: Uint8Array, cur: Uint8Array, w: number, h: number) {
  const n = w * h;
  let sum = 0;
  let changed = 0;
  for (let i = 0; i < n; i++) {
    const d = Math.abs(cur[i]! - prev[i]!);
    sum += d;
    if (d >= FLOOR) changed++;
  }
  const floor = Math.max(FLOOR, (sum / n) * 2);
  const raw = new Uint8Array(n);
  for (let i = 0; i < n; i++) raw[i] = Math.abs(cur[i]! - prev[i]!) >= floor ? 1 : 0;
  const mask = new Uint8Array(n);
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (!raw[i]) continue;
      if (raw[i - 1]! + raw[i + 1]! + raw[i - w]! + raw[i + w]! < 2) continue;
      mask[i] = 1;
    }
  return { mask, share: changed / n };
}

/** Как кадр ложится на экран (object-fit: cover): масштаб и сдвиг, в пикселях кадра-маски. */
export function coverFit(mw: number, mh: number, sw: number, sh: number) {
  const k = Math.max(sw / mw, sh / mh);
  return { k, ox: (sw - mw * k) / 2, oy: (sh - mh * k) / 2 };
}
export type Fit = ReturnType<typeof coverFit>;

/**
 * Какая доля пузыря шевельнулась. Передняя камера показывает как зеркало, поэтому x на экране и в
 * кадре идут навстречу; задней камере передают mirror = false.
 */
export function motionIn(
  mask: Uint8Array,
  mw: number,
  mh: number,
  fit: Fit,
  sw: number,
  b: Pick<Bubble, 'x' | 'y' | 'r'>,
  mirror = true,
) {
  const sx = mirror ? sw - b.x : b.x;
  const cx = (sx - fit.ox) / fit.k;
  const cy = (b.y - fit.oy) / fit.k;
  const r = b.r / fit.k;
  let all = 0;
  let moved = 0;
  const y0 = Math.max(0, Math.floor(cy - r));
  const y1 = Math.min(mh - 1, Math.ceil(cy + r));
  const x0 = Math.max(0, Math.floor(cx - r));
  const x1 = Math.min(mw - 1, Math.ceil(cx + r));
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 > r * r) continue;
      all++;
      moved += mask[y * mw + x]!;
    }
  return all ? moved / all : 0;
}

/** Заряд следующего кадра. Постоянный слабый шум не накопится до POP_AT, взмах — за пару кадров. */
export const charged = (charge: number, share: number) => charge * KEEP + share;
