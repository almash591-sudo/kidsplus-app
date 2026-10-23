// Логика «Подводного плавания» (этап 43) без рисования: задания раундов, кто приплывёт следующим,
// кто подходит под задание, как батискаф догоняет палец. Рисует всё Dive.tsx на canvas.
import { DIVE_FISH, type DiveFish } from '@kidsplus/shared/games';
import { diveCatch, diveIsColor, diveIsNumber, diveNumber, DIVE_MAX_COUNT } from '../phrases';
import type { SpecOf } from './common';

type DiveSpec = SpecOf<'dive'>;

export type DiveTask =
  { kind: 'color'; color: DiveFish; count: number } | { kind: 'number'; n: number };

/** Кто плавает: рыбка (цвет, у заданий с цифрами — ещё и цифра) или медуза. */
export interface Swimmer {
  id: number;
  kind: 'fish' | 'jelly';
  color: DiveFish;
  n: number | null;
  /** Координаты — доли экрана; x может уходить за край. */
  x: number;
  y: number;
  /** Своя скорость, доля ширины в секунду (рыбки плывут навстречу, т. е. влево). */
  vx: number;
  /** Сдвиг фазы покачивания. */
  phase: number;
  /** Размер — доля короткой стороны экрана. */
  size: number;
  /** Когда поймали (для анимации «в батискаф»); null — плавает. */
  caughtAt: number | null;
}

/** Где можно плавать: доли высоты (сверху — счёт пойманных, снизу — песок). */
export const WATER = { top: 0.16, bottom: 0.8 };
/** Доля медуз среди всех, кто приплывает. */
const JELLY_SHARE = { none: 0, few: 0.15, many: 0.28 } as const;
/** Как быстро плывёт море — доля ширины экрана в секунду. */
export const SEA_SPEED = { slow: 0.07, normal: 0.1, fast: 0.14 } as const;

const pick = <T>(items: readonly T[], rnd: () => number) =>
  items[Math.floor(rnd() * items.length)]!;

/** Задания раундов: подряд не повторяются; mixed — цвет и цифра по очереди. */
export function diveTasks(spec: DiveSpec, rnd = Math.random): DiveTask[] {
  const tasks: DiveTask[] = [];
  for (let i = 0; i < spec.rounds; i++) {
    const prev = tasks[i - 1];
    const kind =
      spec.task === 'mixed'
        ? i % 2
          ? 'number'
          : 'color'
        : spec.task === 'numbers'
          ? 'number'
          : 'color';
    if (kind === 'color') {
      const colors = DIVE_FISH.filter((c) => prev?.kind !== 'color' || c !== prev.color);
      const most = Math.min(DIVE_MAX_COUNT, spec.max);
      tasks.push({ kind, color: pick(colors, rnd), count: 2 + Math.floor(rnd() * (most - 1)) });
    } else {
      const ns = Array.from({ length: spec.max }, (_, k) => k + 1).filter(
        (n) => prev?.kind !== 'number' || n !== prev.n,
      );
      tasks.push({ kind, n: pick(ns, rnd) });
    }
  }
  return tasks;
}

/** Сколько рыбок нужно поймать за раунд. */
export const needOf = (task: DiveTask) => (task.kind === 'color' ? task.count : 1);

export const isGood = (task: DiveTask, s: Pick<Swimmer, 'kind' | 'color' | 'n'>) =>
  s.kind === 'fish' && (task.kind === 'color' ? s.color === task.color : s.n === task.n);

export const taskPhrase = (task: DiveTask) =>
  task.kind === 'color' ? diveCatch(task.color, task.count) : diveNumber(task.n);

/** Не та рыбка: «Это красная рыбка.» или «Это цифра три.» */
export const wrongPhrase = (task: DiveTask, s: Pick<Swimmer, 'color' | 'n'>) =>
  task.kind === 'color' || s.n === null ? diveIsColor(s.color) : diveIsNumber(s.n);

/**
 * Кто приплывёт следующим. Нужных рыбок на экране держим хотя бы две (чаще приплывают, когда их
 * мало), медуз — не две подряд. Возвращает всё, кроме id и x.
 */
export function nextSwimmer(
  spec: DiveSpec,
  task: DiveTask,
  around: readonly Swimmer[],
  rnd = Math.random,
): Omit<Swimmer, 'id' | 'x'> {
  const y = WATER.top + 0.06 + rnd() * (WATER.bottom - WATER.top - 0.12);
  const phase = rnd() * Math.PI * 2;
  const last = around.at(-1);
  if (last?.kind !== 'jelly' && rnd() < JELLY_SHARE[spec.jellies]) {
    return {
      kind: 'jelly',
      color: 'red',
      n: null,
      y,
      vx: 0.01 + rnd() * 0.02,
      phase,
      size: 0.2,
      caughtAt: null,
    };
  }
  const goodNow = around.filter((s) => s.caughtAt === null && isGood(task, s)).length;
  const good = rnd() < (goodNow < 2 ? 0.65 : 0.3);
  let color: DiveFish;
  let n: number | null = null;
  if (task.kind === 'color') {
    color = good
      ? task.color
      : pick(
          DIVE_FISH.filter((c) => c !== task.color),
          rnd,
        );
  } else {
    color = pick(DIVE_FISH, rnd);
    const others = Array.from({ length: spec.max }, (_, k) => k + 1).filter((k) => k !== task.n);
    n = good ? task.n : pick(others, rnd);
  }
  return {
    kind: 'fish',
    color,
    n,
    y,
    vx: 0.04 + rnd() * 0.06,
    phase,
    size: 0.15 + rnd() * 0.05,
    caughtAt: null,
  };
}

/**
 * Шаг батискафа: плавно догоняет палец (пружина с затуханием), не выходит из воды. Координаты —
 * доли экрана, скорость — доли в секунду.
 */
export function steer(
  pos: { x: number; y: number; vx: number; vy: number },
  target: { x: number; y: number },
  dt: number,
) {
  const k = 18;
  const damp = 2 * Math.sqrt(k);
  let vx = pos.vx + ((target.x - pos.x) * k - pos.vx * damp) * dt;
  let vy = pos.vy + ((target.y - pos.y) * k - pos.vy * damp) * dt;
  const speed = Math.hypot(vx, vy);
  if (speed > 1.4) {
    vx = (vx / speed) * 1.4;
    vy = (vy / speed) * 1.4;
  }
  const x = Math.max(0.16, Math.min(0.8, pos.x + vx * dt));
  const y = Math.max(WATER.top, Math.min(WATER.bottom, pos.y + vy * dt));
  return { x, y, vx: x === pos.x + vx * dt ? vx : 0, vy: y === pos.y + vy * dt ? vy : 0 };
}
