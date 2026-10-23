// Логика «Гонок» (этап 43) без рисования: трасса из отрезков (повороты, горки, деревья, ворота,
// конусы, финиш), задания у ворот, ответы на воротах, полосы. Рисует всё Race.tsx на canvas.
import { FISHING_LETTERS, RACE_COLORS, type RaceColor } from '@kidsplus/shared/games';
import {
  raceIsColor,
  raceIsLetter,
  raceIsNumber,
  raceToColor,
  raceToLetter,
  raceToNumber,
} from '../phrases';
import type { SpecOf } from './common';

type RaceSpec = SpecOf<'race'>;

const pick = <T>(items: readonly T[], rnd: () => number) =>
  items[Math.floor(rnd() * items.length)]!;
function shuffle<T>(items: readonly T[], rnd: () => number): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/** Длина отрезка дороги и полуширина дороги — в «мировых» единицах. */
export const SEG = 200;
export const ROAD = 1000;
/** Середины трёх полос: доли полуширины дороги. */
export const LANES: readonly number[] = [-0.64, 0, 0.64];
/** Отрезков от старта до первых ворот, между воротами, от последних ворот до финиша, после финиша. */
export const START = 60;
export const GAP = 110;
export const TO_FINISH = 70;
export const AFTER = 260;
/** Скорость, отрезков в секунду. */
export const SPEED = { slow: 15, normal: 19, fast: 23 } as const;

export type GateValue = RaceColor | number | string;
export type GateTask =
  | { kind: 'color'; answer: RaceColor }
  | { kind: 'number'; answer: number }
  | { kind: 'letter'; answer: string };

/** Задания ворот: подряд не повторяются. */
export function raceTasks(spec: RaceSpec, rnd = Math.random): GateTask[] {
  const tasks: GateTask[] = [];
  for (let i = 0; i < spec.gates; i++) {
    const prev = tasks[i - 1]?.answer;
    let t: GateTask;
    do {
      t =
        spec.quiz === 'colors'
          ? {
              kind: 'color',
              answer: pick(RACE_COLORS.slice(0, Math.max(3, Math.min(6, spec.max))), rnd),
            }
          : spec.quiz === 'letters'
            ? { kind: 'letter', answer: pick(FISHING_LETTERS.slice(0, spec.max), rnd) }
            : { kind: 'number', answer: 1 + Math.floor(rnd() * spec.max) };
    } while (t.answer === prev);
    tasks.push(t);
  }
  return tasks;
}

/** Что на трёх воротах (слева направо): ответ и два других того же вида. */
export function gateValues(
  task: GateTask,
  spec: Pick<RaceSpec, 'max'>,
  rnd = Math.random,
): GateValue[] {
  const pool: GateValue[] =
    task.kind === 'color'
      ? [...RACE_COLORS]
      : task.kind === 'letter'
        ? [...FISHING_LETTERS.slice(0, Math.max(3, spec.max))]
        : Array.from({ length: Math.max(3, spec.max) }, (_, k) => k + 1);
  const others = shuffle(
    pool.filter((v) => v !== task.answer),
    rnd,
  ).slice(0, 2);
  return shuffle([task.answer, ...others], rnd);
}

export const taskPhrase = (t: GateTask) =>
  t.kind === 'color'
    ? raceToColor(t.answer)
    : t.kind === 'letter'
      ? raceToLetter(t.answer)
      : raceToNumber(t.answer);
export const wrongPhrase = (t: GateTask, v: GateValue) =>
  t.kind === 'color'
    ? raceIsColor(v as RaceColor)
    : t.kind === 'letter'
      ? raceIsLetter(String(v))
      : raceIsNumber(Number(v));

/** Ближайшая полоса к положению машинки x (доли полуширины). */
export const laneOf = (x: number) =>
  LANES.reduce<number>(
    (best, l, i) => (Math.abs(l - x) < Math.abs(LANES[best]! - x) ? i : best),
    0,
  );

export type Scenery =
  'tree-round' | 'tree-pine' | 'tree-apple' | 'bush' | 'flowers' | 'rock' | 'house' | 'windmill';
export interface Segment {
  index: number;
  /** Поворот: на сколько смещается дорога на этом отрезке. */
  curve: number;
  /** Высота начала и конца отрезка (горки). */
  y1: number;
  y2: number;
  /** Деревья и домики у дороги: offset — доли полуширины, |offset| > 1.2. */
  scenery: { kind: Scenery; offset: number }[];
  /** Конус на дороге: x — доли полуширины. */
  cone?: number;
  /** Номер ворот на этом отрезке. */
  gate?: number;
  finish?: boolean;
}
export interface Track {
  segments: Segment[];
  /** Номер отрезка каждых ворот. */
  gates: number[];
  finish: number;
}

const easeInOut = (a: number, b: number, k: number) =>
  a + (b - a) * (-Math.cos(k * Math.PI) / 2 + 0.5);
const BIG: Scenery[] = ['tree-round', 'tree-pine', 'tree-apple', 'tree-round', 'tree-pine'];
const SMALL: Scenery[] = ['bush', 'flowers', 'rock', 'bush', 'flowers'];
const RARE: Scenery[] = ['house', 'windmill'];
const CONES = { none: 0, few: 1, many: 3 } as const;

/**
 * Трасса: прямой старт, между воротами — плавный поворот и горка, у ворот дорога прямая и
 * ровная (чтобы ворота были хорошо видны), за последними воротами — финиш и прямая после него.
 */
export function buildTrack(spec: Pick<RaceSpec, 'gates' | 'cones'>, rnd = Math.random): Track {
  const segments: Segment[] = [];
  let y = 0;
  const add = (curve: number, dy: number, n: number) => {
    const y0 = y;
    for (let i = 0; i < n; i++) {
      const k1 = i / n;
      const k2 = (i + 1) / n;
      segments.push({
        index: segments.length,
        curve,
        y1: easeInOut(y0, y0 + dy, k1),
        y2: easeInOut(y0, y0 + dy, k2),
        scenery: [],
      });
    }
    y = y0 + dy;
  };
  /** Поворот с плавным входом и выходом, с горкой вверх-вниз. */
  const bend = (n: number) => {
    const curve = (rnd() < 0.5 ? -1 : 1) * (2 + rnd() * 3);
    const hill = (rnd() - 0.4) * 2400;
    const third = Math.round(n / 3);
    const start = segments.length;
    add(0, hill / 2, third);
    add(0, hill / 2, n - 2 * third);
    add(0, -hill, third);
    for (let i = start; i < segments.length; i++) {
      const k = (i - start) / n;
      segments[i]!.curve = curve * Math.sin(k * Math.PI);
    }
  };
  const gates: number[] = [];
  add(0, 0, START);
  for (let g = 0; g < spec.gates; g++) {
    if (g) bend(GAP - 30);
    add(0, 0, g ? 30 : 0);
    gates.push(segments.length - 1);
    segments.at(-1)!.gate = g;
  }
  bend(TO_FINISH - 20);
  add(0, 0, 20);
  const finish = segments.length - 1;
  segments[finish]!.finish = true;
  add(0, 0, AFTER);

  // Деревья и кусты по обочинам, иногда домик или мельница.
  for (const s of segments) {
    if (s.index % 3 === 0) {
      const side = rnd() < 0.5 ? -1 : 1;
      s.scenery.push({ kind: pick(BIG, rnd), offset: side * (1.6 + rnd() * 1.6) });
    }
    if (s.index % 5 === 2)
      s.scenery.push({
        kind: pick(SMALL, rnd),
        offset: (rnd() < 0.5 ? -1 : 1) * (1.25 + rnd() * 0.5),
      });
    if (s.index % 47 === 20)
      s.scenery.push({ kind: pick(RARE, rnd), offset: (rnd() < 0.5 ? -1 : 1) * (2.4 + rnd()) });
  }
  // Конусы между воротами — не ближе 18 отрезков к воротам и финишу.
  const marks = [0, ...gates, finish];
  for (let i = 1; i < marks.length; i++) {
    const from = marks[i - 1]! + 18;
    const to = marks[i]! - 18;
    for (let c = 0; c < CONES[spec.cones]; c++) {
      const at = Math.round(from + ((c + 0.5) / CONES[spec.cones]) * (to - from));
      segments[at]!.cone = pick(LANES, rnd);
    }
  }
  return { segments, gates, finish };
}

/** Машинка догоняет палец по горизонтали — пружина без раскачки. */
export function steer(x: number, vx: number, target: number, dt: number) {
  const k = 30;
  const nvx = vx + ((target - x) * k - vx * 2 * Math.sqrt(k)) * dt;
  return { x: Math.max(-0.95, Math.min(0.95, x + nvx * dt)), vx: nvx };
}
