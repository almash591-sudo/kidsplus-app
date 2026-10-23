// Логика «Ракеты: собери и лети» (этап 43) без рисования: чертёж, детали на столе, задания полётов,
// ответы на планетах, где какая деталь у ракеты. Рисует всё Rocket.tsx на canvas.
import {
  FISHING_LETTERS,
  ROCKET_COLORS,
  ROCKET_PARTS,
  type RocketColor,
  type RocketPart,
} from '@kidsplus/shared/games';
import {
  rocketIsLetter,
  rocketIsNumber,
  rocketToLetter,
  rocketToNumber,
  rocketToSum,
} from '../phrases';
import type { SpecOf } from './common';

type RocketSpec = SpecOf<'rocket'>;
/** Детали с цветом (окошко — одно, без цвета). */
export type ColoredPart = Exclude<RocketPart, 'window'>;
export type Blueprint = Partial<Record<ColoredPart, RocketColor>>;

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

/** Детали этой ракеты: первые parts из ROCKET_PARTS. */
export const partsOf = (spec: Pick<RocketSpec, 'parts'>) => ROCKET_PARTS.slice(0, spec.parts);

/** Чертёж: у каждой цветной детали свой цвет, соседние по ракете — разные. */
export function blueprintOf(spec: Pick<RocketSpec, 'parts'>, rnd = Math.random): Blueprint {
  const bp: Blueprint = {};
  let prev: RocketColor | null = null;
  for (const part of partsOf(spec)) {
    if (part === 'window') continue;
    const color = pick(
      ROCKET_COLORS.filter((c) => c !== prev),
      rnd,
    );
    bp[part] = color;
    prev = color;
  }
  return bp;
}

export interface TrayItem {
  id: number;
  part: RocketPart;
  /** null — окошко. */
  color: RocketColor | null;
}

/** Детали на столе: к каждой цветной — ещё такая же другого цвета; всё вперемешку. */
export function trayOf(bp: Blueprint, parts: readonly RocketPart[], rnd = Math.random): TrayItem[] {
  const items: Omit<TrayItem, 'id'>[] = [];
  for (const part of parts) {
    if (part === 'window') {
      items.push({ part, color: null });
      continue;
    }
    const color = bp[part]!;
    items.push(
      { part, color },
      {
        part,
        color: pick(
          ROCKET_COLORS.filter((c) => c !== color),
          rnd,
        ),
      },
    );
  }
  return shuffle(items, rnd).map((it, id) => ({ ...it, id }));
}

/** Подходит ли деталь со стола к ракете по чертежу. */
export const fits = (bp: Blueprint, item: Pick<TrayItem, 'part' | 'color'>) =>
  item.part === 'window' || bp[item.part] === item.color;

export type FlightTask =
  | { kind: 'number'; answer: number }
  | { kind: 'sum'; a: number; b: number; answer: number }
  | { kind: 'letter'; answer: string };

/** Задания полётов: подряд не повторяются. Суммы — оба слагаемых от одного, ответ до max. */
export function flightTasks(spec: RocketSpec, rnd = Math.random): FlightTask[] {
  const tasks: FlightTask[] = [];
  for (let i = 0; i < spec.rounds; i++) {
    const prev = tasks[i - 1]?.answer;
    let task: FlightTask;
    do {
      if (spec.quiz === 'letters') {
        task = { kind: 'letter', answer: pick(FISHING_LETTERS.slice(0, spec.max), rnd) };
      } else if (spec.quiz === 'sums') {
        const answer = 2 + Math.floor(rnd() * (spec.max - 1));
        const a = 1 + Math.floor(rnd() * (answer - 1));
        task = { kind: 'sum', a, b: answer - a, answer };
      } else task = { kind: 'number', answer: 1 + Math.floor(rnd() * spec.max) };
    } while (task.answer === prev);
    tasks.push(task);
  }
  return tasks;
}

/** Ответы на трёх планетах (слева направо): верный и два других из того же ряда. */
export function planetAnswers(
  task: FlightTask,
  spec: Pick<RocketSpec, 'max'>,
  rnd = Math.random,
): (number | string)[] {
  const pool: (number | string)[] =
    task.kind === 'letter'
      ? [...FISHING_LETTERS.slice(0, Math.max(3, spec.max))]
      : Array.from({ length: Math.max(3, spec.max) }, (_, k) => k + 1);
  const others = shuffle(
    pool.filter((v) => v !== task.answer),
    rnd,
  ).slice(0, 2);
  return shuffle([task.answer, ...others], rnd);
}

export const flightPhrase = (task: FlightTask) =>
  task.kind === 'letter'
    ? rocketToLetter(task.answer)
    : task.kind === 'sum'
      ? rocketToSum(task.a, task.b)
      : rocketToNumber(task.answer);

/** Не та планета: «Здесь три.» / «Здесь буква М.» */
export const planetPhrase = (value: number | string) =>
  typeof value === 'string' ? rocketIsLetter(value) : rocketIsNumber(value);

/** Что написано на карточке задания вверху: «5», «М», «2 + 3 = ?». */
export const taskLabel = (task: FlightTask) =>
  task.kind === 'sum' ? `${task.a} + ${task.b} = ?` : String(task.answer);

/**
 * Где деталь у ракеты: прямоугольник в долях ширины корпуса B; начало — середина низа корпуса,
 * y вверх отрицательный.
 */
export const PART_BOX: Record<RocketPart, { x: number; y: number; w: number; h: number }> = {
  engine: { x: -0.4, y: -0.04, w: 0.8, h: 0.5 },
  body: { x: -0.5, y: -1.5, w: 1, h: 1.5 },
  fins: { x: -1.08, y: -0.86, w: 2.16, h: 0.98 },
  window: { x: -0.32, y: -1.3, w: 0.64, h: 0.64 },
  nose: { x: -0.5, y: -2.4, w: 1, h: 0.94 },
};
/** Порядок рисования: двигатель, корпус, крылья, окошко, нос. */
export const DRAW_ORDER: RocketPart[] = ['engine', 'body', 'fins', 'window', 'nose'];
/** Высота ракеты от носа до низа двигателя, в B. */
export const ROCKET_HEIGHT = 2.86;
