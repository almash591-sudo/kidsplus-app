// Фигуры, цифры и буквы для обводки: штрихи — ломаные в поле 100 × 100 (y вниз).
import type { TraceShape } from '@kidsplus/shared/games';

type Pt = [number, number];
export type Stroke = Pt[];

/** Дуга окружности (эллипса) от угла a0 до a1 в градусах; 0° — вправо, 90° — вниз. */
const arc = (cx: number, cy: number, rx: number, ry: number, a0: number, a1: number): Pt[] => {
  const n = Math.max(8, Math.ceil(Math.abs(a1 - a0) / 8));
  return Array.from({ length: n + 1 }, (_, i) => {
    const a = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180;
    return [cx + rx * Math.cos(a), cy + ry * Math.sin(a)];
  });
};

const star = (): Stroke =>
  Array.from({ length: 6 }, (_, k) => {
    const a = ((-90 + 144 * k) * Math.PI) / 180;
    return [50 + 36 * Math.cos(a), 54 + 36 * Math.sin(a)] as Pt;
  });

const heart = (): Stroke =>
  Array.from({ length: 49 }, (_, i) => {
    const t = (i / 48) * 2 * Math.PI;
    const x = 16 * Math.sin(t) ** 3;
    const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    return [50 + x * 2.3, 48 - y * 2.3] as Pt;
  });

/**
 * Линейки букв (этап 56), как в прописях: верх большой буквы, верх маленькой, строка.
 * Хвостик «у» уходит ниже строки.
 */
export const LETTER_RULES = { top: 18, middle: 40, base: 82 } as const;
const { top: T, middle: M, base: B } = LETTER_RULES;

export const TRACES: Record<
  TraceShape,
  {
    name: string;
    strokes: Stroke[];
    letter?: true;
    /** Где стоят номера штрихов (у букв, где начала штрихов рядом). */
    numbers?: Pt[];
  }
> = {
  line: {
    name: 'линию',
    strokes: [
      [
        [15, 50],
        [85, 50],
      ],
    ],
  },
  wave: {
    name: 'волну',
    strokes: [
      Array.from(
        { length: 29 },
        (_, i) => [15 + (70 * i) / 28, 50 + 15 * Math.sin((i / 28) * 4 * Math.PI)] as Pt,
      ),
    ],
  },
  zigzag: {
    name: 'зигзаг',
    strokes: [
      [
        [15, 35],
        [29, 65],
        [43, 35],
        [57, 65],
        [71, 35],
        [85, 65],
      ],
    ],
  },
  circle: { name: 'круг', strokes: [arc(50, 50, 32, 32, -90, -450)] },
  square: {
    name: 'квадрат',
    strokes: [
      [
        [22, 22],
        [78, 22],
        [78, 78],
        [22, 78],
        [22, 22],
      ],
    ],
  },
  triangle: {
    name: 'треугольник',
    strokes: [
      [
        [50, 16],
        [85, 80],
        [15, 80],
        [50, 16],
      ],
    ],
  },
  star: { name: 'звезду', strokes: [star()] },
  heart: { name: 'сердечко', strokes: [heart()] },
  '0': { name: 'цифру ноль', strokes: [arc(50, 50, 22, 32, -90, -450)] },
  '1': {
    name: 'цифру один',
    strokes: [
      [
        [36, 34],
        [55, 18],
        [55, 82],
      ],
    ],
  },
  '2': {
    name: 'цифру два',
    strokes: [[...arc(50, 37, 20, 19, 190, 380), [30, 82], [72, 82]]],
  },
  '3': {
    name: 'цифру три',
    strokes: [[...arc(48, 34, 18, 16, 200, 450), ...arc(48, 66, 19, 16, 270, 520)]],
  },
  '4': {
    name: 'цифру четыре',
    strokes: [
      [
        [34, 18],
        [30, 56],
        [72, 56],
      ],
      [
        [62, 30],
        [62, 82],
      ],
    ],
  },
  '5': {
    name: 'цифру пять',
    strokes: [[[68, 18], [36, 18], [33, 46], ...arc(50, 62, 20, 19, -125, 150)]],
  },
  '6': {
    name: 'цифру шесть',
    strokes: [[[64, 18], [48, 28], [36, 44], ...arc(50, 64, 18, 18, 180, -180)]],
  },
  '7': {
    name: 'цифру семь',
    strokes: [
      [
        [30, 18],
        [70, 18],
        [42, 82],
      ],
    ],
  },
  '8': {
    name: 'цифру восемь',
    strokes: [
      [
        ...arc(50, 33, 15, 15, -90, -270),
        ...arc(50, 65, 18, 17, -90, 270),
        ...arc(50, 33, 15, 15, 90, -90),
      ],
    ],
  },
  '9': {
    name: 'цифру девять',
    strokes: [[...arc(50, 36, 18, 18, 0, -360), [68, 36], [64, 82]]],
  },
  // Печатные буквы (этап 56): штрихи в том порядке и направлении, как учат в садике.
  А: {
    name: 'большую букву А',
    letter: true,
    // Оба наклонных штриха начинаются в вершине — номера по разные стороны от неё.
    numbers: [
      [40, 17],
      [60, 17],
      [27, 60],
    ],
    strokes: [
      [
        [50, T],
        [24, B],
      ],
      [
        [50, T],
        [76, B],
      ],
      [
        [34, 58],
        [66, 58],
      ],
    ],
  },
  О: { name: 'большую букву О', letter: true, strokes: [arc(50, 50, 24, 32, -90, -450)] },
  У: {
    name: 'большую букву У',
    letter: true,
    numbers: [
      [19, 20],
      [81, 20],
    ],
    strokes: [
      [
        [26, T],
        [52, 54],
      ],
      [
        [74, T],
        [36, B],
      ],
    ],
  },
  а: {
    name: 'маленькую букву А',
    letter: true,
    numbers: [
      [55, 53],
      [71, 42],
    ],
    strokes: [
      arc(49, 61, 15, 21, -30, -390),
      [
        [64, M],
        [64, B],
      ],
    ],
  },
  о: { name: 'маленькую букву О', letter: true, strokes: [arc(50, 61, 16, 21, -90, -450)] },
  у: {
    name: 'маленькую букву У',
    letter: true,
    numbers: [
      [27, 42],
      [73, 42],
    ],
    strokes: [
      [
        [34, M],
        [51, 72],
      ],
      [
        [66, M],
        [40, 96],
      ],
    ],
  },
};

/** Ломаная → точки через равные промежутки (контрольные точки обводки). */
export function resample(stroke: Stroke, step = 3): Pt[] {
  const out: Pt[] = [stroke[0]!];
  let carry = 0;
  for (let i = 1; i < stroke.length; i++) {
    const [x0, y0] = stroke[i - 1]!;
    const [x1, y1] = stroke[i]!;
    const len = Math.hypot(x1 - x0, y1 - y0);
    let d = step - carry;
    while (d <= len) {
      out.push([x0 + ((x1 - x0) * d) / len, y0 + ((y1 - y0) * d) / len]);
      d += step;
    }
    carry = len - (d - step);
  }
  const end = stroke.at(-1)!;
  const lastOut = out.at(-1)!;
  if (Math.hypot(end[0] - lastOut[0], end[1] - lastOut[1]) > 0.5) out.push(end);
  return out;
}

/**
 * Сколько контрольных точек пройдено: палец может «засчитать» следующие точки,
 * если находится рядом с одной из ближайших впереди (не дальше lookahead) — без перескоков.
 */
export function advance(
  points: readonly Pt[],
  done: number,
  p: { x: number; y: number },
  tolerance = 9,
  lookahead = 4,
): number {
  let reached = done;
  for (let i = done; i < Math.min(points.length, done + lookahead); i++) {
    const [x, y] = points[i]!;
    if (Math.hypot(p.x - x, p.y - y) <= tolerance) reached = i + 1;
  }
  return reached;
}
