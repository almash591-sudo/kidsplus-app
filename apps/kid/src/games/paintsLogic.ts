// Логика «Смешай краски» (этап 57) отдельно от рисования: как смешиваются краски, какие предметы
// раскрашиваем, какие тюбики на столе и что сказать после капли.
import {
  PAINT_RECIPES,
  PAINT_TARGETS,
  PAINT_TUBES,
  type PaintTarget,
  type PaintTube,
} from '@kidsplus/shared/games';
import type { SpecOf } from './common';

type PaintsSpec = SpecOf<'paints'>;
export type Rgb = readonly [number, number, number];
/** Сколько капель каждой краски в баночке. */
export type Drops = Record<PaintTube, number>;
export const NO_DROPS: Drops = { red: 0, yellow: 0, blue: 0, white: 0 };

/** Капель в полной баночке. */
export const CAPACITY = 6;

/** Предмет, который раскрашиваем: спрайт `paints-<id>`, имя и род (для «тыква оранжевая»). */
export interface PaintObject {
  id: string;
  name: string;
  fem: boolean;
}
export const PAINT_OBJECTS: Record<PaintTarget, readonly [PaintObject, PaintObject]> = {
  orange: [
    { id: 'pumpkin', name: 'Тыква', fem: true },
    { id: 'carrot', name: 'Морковка', fem: true },
  ],
  green: [
    { id: 'frog', name: 'Лягушка', fem: true },
    { id: 'cucumber', name: 'Огурец', fem: false },
  ],
  purple: [
    { id: 'eggplant', name: 'Баклажан', fem: false },
    { id: 'grapes', name: 'Виноград', fem: false },
  ],
  pink: [
    { id: 'piglet', name: 'Поросёнок', fem: false },
    { id: 'flamingo', name: 'Фламинго', fem: false },
  ],
  lightblue: [
    { id: 'balloon', name: 'Шарик', fem: false },
    { id: 'fish', name: 'Рыбка', fem: true },
  ],
  brown: [
    { id: 'bear', name: 'Медвежонок', fem: false },
    { id: 'cone', name: 'Шишка', fem: true },
  ],
};

/** Цвет краски в тюбике. */
export const TUBE_RGB: Record<PaintTube, Rgb> = {
  red: [224, 44, 62],
  yellow: [252, 208, 38],
  blue: [32, 112, 218],
  white: [248, 248, 244],
};

/**
 * Куб RYB (как смешиваются настоящие краски, а не лучи света): углы — чистые краски и их смеси
 * поровну. Индекс — красный·4 + жёлтый·2 + синий.
 */
const RYB: readonly Rgb[] = [
  [250, 250, 246], // ничего
  TUBE_RGB.blue,
  TUBE_RGB.yellow,
  [58, 168, 76], // зелёный
  TUBE_RGB.red,
  [130, 52, 170], // фиолетовый
  [248, 138, 22], // оранжевый
  [118, 74, 42], // коричневый
];

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerpRgb = (a: Rgb, b: Rgb, t: number): Rgb => [
  lerp(a[0], b[0], t),
  lerp(a[1], b[1], t),
  lerp(a[2], b[2], t),
];

/** Цвет смеси: доли красного, жёлтого и синего — по кубу RYB, белая краска осветляет. */
export function mixColor(d: Drops): Rgb | null {
  const colored = d.red + d.yellow + d.blue;
  if (!colored && !d.white) return null;
  if (!colored) return TUBE_RGB.white;
  const top = Math.max(d.red, d.yellow, d.blue);
  const [r, y, b] = [d.red / top, d.yellow / top, d.blue / top];
  const at = (ri: number, yi: number, bi: number) => RYB[ri * 4 + yi * 2 + bi]!;
  // Трилинейная интерполяция по кубу.
  const c00 = lerpRgb(at(0, 0, 0), at(1, 0, 0), r);
  const c01 = lerpRgb(at(0, 0, 1), at(1, 0, 1), r);
  const c10 = lerpRgb(at(0, 1, 0), at(1, 1, 0), r);
  const c11 = lerpRgb(at(0, 1, 1), at(1, 1, 1), r);
  const c = lerpRgb(lerpRgb(c00, c01, b), lerpRgb(c10, c11, b), y);
  return lerpRgb(c, TUBE_RGB.white, (d.white / (d.white + colored)) * 0.92);
}

/** Готовый цвет — краски рецепта поровну. */
export const targetRgb = (t: PaintTarget): Rgb =>
  mixColor({ ...NO_DROPS, ...Object.fromEntries(PAINT_RECIPES[t].map((c) => [c, 1])) })!;

export const css = (c: Rgb, a = 1) =>
  `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${a})`;

/** Тюбики на столе в этом задании — всегда в одном порядке, чтобы место запоминалось. */
export function tubesFor(mode: PaintsSpec['tubes'], target: PaintTarget): PaintTube[] {
  const need = PAINT_RECIPES[target];
  if (mode === 'needed') return PAINT_TUBES.filter((t) => need.includes(t));
  if (mode === 'primary') return PAINT_TUBES.filter((t) => t !== 'white' || need.includes('white'));
  return [...PAINT_TUBES];
}

/** Что сейчас в баночке — для «получилась фиолетовая»: рецепт поровну или одна краска. */
export function nameOf(d: Drops): PaintTarget | PaintTube | null {
  const used = PAINT_TUBES.filter((t) => d[t] > 0);
  if (used.length === 1) return used[0]!;
  if (used.some((t) => d[t] !== d[used[0]!])) return null;
  return (
    PAINT_TARGETS.find(
      (t) =>
        PAINT_RECIPES[t].length === used.length && used.every((u) => PAINT_RECIPES[t].includes(u)),
    ) ?? null
  );
}

export type Verdict =
  /** Получилось. */
  | { kind: 'done' }
  /** Лишняя краска — цвет другой (got — какой, если у него есть имя). */
  | { kind: 'wrong'; got: PaintTarget | PaintTube | null }
  /** Одной краски столько, что поровну уже не влезет. */
  | { kind: 'over'; tube: PaintTube }
  /** Нужно ещё этой краски (missing — её ещё нет совсем). */
  | { kind: 'more'; tube: PaintTube; missing: boolean };

/** Что с баночкой после капли. */
export function judge(d: Drops, target: PaintTarget): Verdict {
  const need = PAINT_RECIPES[target];
  if (PAINT_TUBES.some((t) => d[t] > 0 && !need.includes(t)))
    return { kind: 'wrong', got: nameOf(d) };
  const most = need.reduce((a, t) => (d[t] > d[a] ? t : a), need[0]!);
  if (d[most] > Math.floor(CAPACITY / need.length)) return { kind: 'over', tube: most };
  if (need.every((t) => d[t] === d[need[0]!])) return { kind: 'done' };
  const least = need.reduce((a, t) => (d[t] < d[a] ? t : a), need[0]!);
  return { kind: 'more', tube: least, missing: d[least] === 0 };
}

/** Подсказку «добавь жёлтой» — сразу, если уже видно, чего мало; первую каплю только называем. */
export const hintNow = (d: Drops, v: Verdict) =>
  v.kind === 'more' && (!v.missing || d.red + d.yellow + d.blue + d.white >= 2);

export interface PaintRound {
  target: PaintTarget;
  object: PaintObject;
}

/** Задания игры: цвета вперемешку и без повтора подряд, предметы одного цвета — по очереди. */
export function planRounds(spec: PaintsSpec, rnd: () => number = Math.random): PaintRound[] {
  const colors = [...new Set(spec.colors)];
  const next = new Map(colors.map((c) => [c, rnd() < 0.5 ? 0 : 1]));
  const out: PaintRound[] = [];
  let pool: PaintTarget[] = [];
  while (out.length < spec.rounds) {
    if (!pool.length) {
      pool = [...colors];
      for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1));
        [pool[i], pool[j]] = [pool[j]!, pool[i]!];
      }
      const prev = out.at(-1)?.target;
      if (pool.length > 1 && pool[0] === prev) pool.push(pool.shift()!);
    }
    const target = pool.shift()!;
    const k = next.get(target)!;
    next.set(target, 1 - k);
    out.push({ target, object: PAINT_OBJECTS[target][k]! });
  }
  return out;
}

/** «Что получится?» — верный цвет и ещё два (сначала из тех, что в игре). */
export function guessChoices(
  target: PaintTarget,
  colors: readonly PaintTarget[],
  rnd: () => number = Math.random,
): PaintTarget[] {
  const mix = <T>(xs: T[]) =>
    xs
      .map((x) => [rnd(), x] as const)
      .sort((a, b) => a[0] - b[0])
      .map((p) => p[1]);
  const near = mix(colors.filter((c) => c !== target));
  const far = mix(PAINT_TARGETS.filter((c) => c !== target && !colors.includes(c)));
  return mix([target, ...[...near, ...far].slice(0, 2)]);
}

/** Все спрайты игры. */
export const paintSprites = () => [
  'paints-bg',
  'paints-tube',
  'paints-brush',
  ...Object.values(PAINT_OBJECTS).flatMap((o) => o.map((x) => `paints-${x.id}`)),
];
