// Логика «Поезда» (этап 57) отдельно от рисования: какие номера у вагонов на каждой станции,
// какие зверята с какими билетами ждут на платформе и какой вагон потерялся.
import type { SpecOf } from './common';

type TrainSpec = SpecOf<'train'>;

/** Пассажиры — спрайты зверят из других игр. */
export const TRAIN_ANIMALS = [
  'animal-rabbit',
  'animal-bear',
  'animal-chick',
  'animal-frog',
  'animal-elephant',
  'animal-mouse',
  'diff-hedgehog',
  'animal-turtle',
  'diff-squirrel',
  'animal-bird',
] as const;
export type TrainAnimal = (typeof TRAIN_ANIMALS)[number];

export interface Passenger {
  animal: TrainAnimal;
  ticket: number;
}
/** Станция: сесть по билетам — номера вагонов слева направо и зверята на платформе. */
export interface TicketsRound {
  kind: 'tickets';
  wagons: number[];
  passengers: Passenger[];
}
/** Станция: вагон потерялся — номера по порядку, дырка на месте gap и три вагона на запасном. */
export interface MissingRound {
  kind: 'missing';
  wagons: number[];
  gap: number;
  spare: number[];
}
export type TrainRound = TicketsRound | MissingRound;

/** Самый большой номер: вагонов не меньше, чем номеров. */
export const topOf = (spec: Pick<TrainSpec, 'max' | 'wagons'>) =>
  Math.min(10, Math.max(spec.max, spec.wagons));

const shuffle = <T>(xs: readonly T[], rnd: () => number): T[] => {
  const out = [...xs];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
};
const range = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => from + i);

/** Номера вагонов: по порядку слева направо, из 1…top (если вагонов меньше — с пропусками). */
export function wagonNumbers(count: number, top: number, rnd: () => number): number[] {
  return shuffle(range(1, top), rnd)
    .slice(0, count)
    .sort((a, b) => a - b);
}

/** Билеты вперемешку — но не в том же порядке, что вагоны: иначе нечего искать. */
export function ticketsFor(wagons: readonly number[], rnd: () => number): number[] {
  if (wagons.length < 2) return [...wagons];
  for (;;) {
    const t = shuffle(wagons, rnd);
    if (t.some((n, i) => n !== wagons[i])) return t;
  }
}

/** Вагоны на запасном пути: нужный и два других, ближе к нужному — сначала. */
export function spareFor(wagons: readonly number[], answer: number, rnd: () => number): number[] {
  const others = shuffle(
    range(1, 10).filter((n) => n !== answer && !wagons.includes(n)),
    rnd,
  ).sort((a, b) => Math.abs(a - answer) - Math.abs(b - answer));
  return shuffle([answer, ...others.slice(0, 2)], rnd);
}

/** Задание на станции: tickets, missing или по очереди (mixed — с билетов). */
const kindAt = (task: TrainSpec['task'], i: number): TrainRound['kind'] =>
  task === 'mixed' ? (i % 2 ? 'missing' : 'tickets') : task;

/** Вся поездка: станции, номера, зверята (по кругу, чтобы не повторялись подряд). */
export function planTrain(spec: TrainSpec, rnd: () => number = Math.random): TrainRound[] {
  const top = topOf(spec);
  let pool: TrainAnimal[] = [];
  const animals = (n: number) => {
    const out: TrainAnimal[] = [];
    while (out.length < n) {
      if (!pool.length) pool = shuffle(TRAIN_ANIMALS, rnd);
      const a = pool.shift()!;
      if (!out.includes(a)) out.push(a);
    }
    return out;
  };
  return Array.from({ length: spec.rounds }, (_, i): TrainRound => {
    if (kindAt(spec.task, i) === 'tickets') {
      const wagons = wagonNumbers(spec.wagons, top, rnd);
      const kids = animals(wagons.length);
      return {
        kind: 'tickets',
        wagons,
        passengers: ticketsFor(wagons, rnd).map((ticket, k) => ({ animal: kids[k]!, ticket })),
      };
    }
    // Номера подряд; потерялся не первый — чтобы было видно, откуда считать.
    const start = 1 + Math.floor(rnd() * (top - spec.wagons + 1));
    const wagons = range(start, start + spec.wagons - 1);
    const gap = 1 + Math.floor(rnd() * (spec.wagons - 1));
    return { kind: 'missing', wagons, gap, spare: spareFor(wagons, wagons[gap]!, rnd) };
  });
}

/** Точки на билете и табличке: как на кубике до шести, дальше — два ряда по пять. */
export function dotsLayout(n: number): [number, number][] {
  const D: Record<number, [number, number][]> = {
    1: [[0.5, 0.5]],
    2: [
      [0.25, 0.25],
      [0.75, 0.75],
    ],
    3: [
      [0.22, 0.22],
      [0.5, 0.5],
      [0.78, 0.78],
    ],
    4: [
      [0.27, 0.27],
      [0.73, 0.27],
      [0.27, 0.73],
      [0.73, 0.73],
    ],
    5: [
      [0.25, 0.25],
      [0.75, 0.25],
      [0.5, 0.5],
      [0.25, 0.75],
      [0.75, 0.75],
    ],
    6: [
      [0.27, 0.2],
      [0.73, 0.2],
      [0.27, 0.5],
      [0.73, 0.5],
      [0.27, 0.8],
      [0.73, 0.8],
    ],
  };
  if (D[n]) return D[n];
  // 7…10: сверху пять, снизу остальные — считать удобно, как на пальцах.
  const row = (k: number, y: number) =>
    Array.from({ length: k }, (_, i): [number, number] => [0.1 + (0.8 * (i + 0.5)) / 5, y]);
  return [...row(5, 0.3), ...row(n - 5, 0.7)];
}

/** Все спрайты игры. */
export const trainSprites = () => [
  'train-loco',
  'train-wheel',
  'train-wagon',
  'train-station',
  ...TRAIN_ANIMALS,
  // Пейзаж — из «Гонок».
  'race-sky',
  'race-tree-pine',
  'race-tree-round',
  'race-tree-apple',
  'race-bush',
  'race-house',
  'race-rock',
  'race-flowers',
  'race-windmill',
];
