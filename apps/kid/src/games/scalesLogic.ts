// Логика «Весов» (этап 57) отдельно от рисования: что лежит на чашах в каждом задании, какие
// гирьки на прилавке, как грузы раскладываются по чаше и насколько наклоняется коромысло.
import type { ScalesTask } from '@kidsplus/shared/games';
import type { SpecOf } from './common';

type ScalesSpec = SpecOf<'scales'>;

/** Какая чаша тяжелее: на левой left, на правой right (не поровну). */
export interface CompareRound {
  kind: 'compare';
  left: number;
  right: number;
}
/** Уравновесь: слева груз target, на прилавке гирьки pieces — каждой сколько угодно. */
export interface BalanceRound {
  kind: 'balance';
  target: number;
  pieces: number[];
}
/** Сложи: слева два груза, на прилавке три гири — одна весит столько, сколько оба вместе. */
export interface SumRound {
  kind: 'sum';
  left: [number, number];
  choices: number[];
}
export type ScalesRound = CompareRound | BalanceRound | SumRound;

const shuffle = <T>(xs: readonly T[], rnd: () => number): T[] => {
  const out = [...xs];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
};
/** Целое из from…to включительно. */
const int = (from: number, to: number, rnd: () => number) =>
  from + Math.floor(rnd() * (to - from + 1));

/** Гирьки на прилавке для «уравновесь»: кубики — по одному, гирьки — 1, 2 и с шести — 3. */
export const piecesFor = (spec: Pick<ScalesSpec, 'look' | 'max'>) =>
  spec.look === 'cubes' ? [1] : spec.max <= 5 ? [1, 2] : [1, 2, 3];

/** Какая чаша тяжелее: два разных веса из 1…max. */
export function compareRound(max: number, rnd: () => number): CompareRound {
  const left = int(1, max, rnd);
  let right = int(1, max - 1, rnd);
  if (right >= left) right++;
  return { kind: 'compare', left, right };
}

/** Уравновесь: кубики — от двух, гирьки — от трёх (одной гирькой не обойтись). */
export function balanceRound(spec: Pick<ScalesSpec, 'look' | 'max'>, rnd: () => number) {
  const pieces = piecesFor(spec);
  const from = spec.look === 'cubes' ? 2 : 3;
  return { kind: 'balance', target: int(from, spec.max, rnd), pieces } as BalanceRound;
}

/** Сложи: a + b не больше max; рядом с ответом — два веса на один-два больше или меньше. */
export function sumRound(max: number, rnd: () => number): SumRound {
  const sum = int(2, max, rnd);
  const a = int(1, sum - 1, rnd);
  const near = shuffle(
    [-2, -1, 1, 2].map((d) => sum + d).filter((n) => n >= 1 && n <= 10),
    rnd,
  ).sort((x, y) => Math.abs(x - sum) - Math.abs(y - sum));
  // Из трёх ближних — два: не всегда «на один меньше и на один больше».
  const others = shuffle(near.slice(0, 3), rnd).slice(0, 2);
  return { kind: 'sum', left: [a, sum - a], choices: shuffle([sum, ...others], rnd) };
}

const same = (a: ScalesRound, b: ScalesRound | undefined) =>
  !!b && JSON.stringify(a) === JSON.stringify(b);

/** Задания по очереди из spec.tasks; два одинаковых подряд не бывает. */
export function planScales(spec: ScalesSpec, rnd: () => number = Math.random): ScalesRound[] {
  const out: ScalesRound[] = [];
  const make = (task: ScalesTask): ScalesRound =>
    task === 'compare'
      ? compareRound(spec.max, rnd)
      : task === 'balance'
        ? balanceRound(spec, rnd)
        : sumRound(spec.max, rnd);
  for (let i = 0; i < spec.rounds; i++) {
    const task = spec.tasks[i % spec.tasks.length]!;
    let r = make(task);
    for (let k = 0; k < 20 && same(r, out.at(-1)); k++) r = make(task);
    out.push(r);
  }
  return out;
}

/**
 * Кучка из одинаковых грузов на чаше: снизу ряд до четырёх, выше — на один меньше, как пирамидка.
 * [x, ряд]: x — от середины в размерах груза, ряд 0 — на дне чаши.
 */
export function pileLayout(count: number): [number, number][] {
  const out: [number, number][] = [];
  let row = 0;
  let left = count;
  while (left > 0) {
    const inRow = Math.min(left, Math.max(1, 4 - row));
    for (let i = 0; i < inRow; i++) out.push([i - (inRow - 1) / 2, row]);
    left -= inRow;
    row++;
  }
  return out;
}

/** Наибольший наклон коромысла, рад. */
export const MAX_TILT = 0.3;
/**
 * На какой угол встанут весы, рад: плюс — правая чаша ниже. Разница в один — уже заметно,
 * в три и больше — почти до упора.
 */
export const tiltFor = (left: number, right: number) => MAX_TILT * Math.tanh((right - left) / 1.6);

/** Сколько весит чаша. */
export const total = (loads: readonly number[]) => loads.reduce((a, b) => a + b, 0);

/** Глиняные картинки игры. */
export const scalesSprites = () => [
  'scales-bg-l',
  'scales-bg-p',
  'scales-stand',
  'scales-pan',
  'scales-weight',
  'scales-cube',
];
