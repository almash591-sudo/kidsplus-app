// Фигуры, цифры и буквы для обводки: штрихи — ломаные в поле 100 × 100 (y вниз).
import { TRACE_LETTERS, type TraceLetter, type TraceShape } from '@kidsplus/shared/games';

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

type TraceDef = {
  name: string;
  strokes: Stroke[];
  letter?: true;
  /** Где стоят номера штрихов, если не подходит расстановка по умолчанию ({@link strokeNumbers}). */
  numbers?: Pt[];
};

/**
 * Большие печатные буквы (этап 56): штрихи в том порядке и направлении, как учат в садике —
 * палочки сверху вниз, перекладины слева направо, сначала левая палочка.
 */
const CAPS: Record<string, Stroke[]> = {
  А: [
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
  О: [arc(50, 50, 24, 32, -90, -450)],
  У: [
    [
      [26, T],
      [52, 54],
    ],
    [
      [74, T],
      [36, B],
    ],
  ],
  Б: [
    [
      [30, T],
      [30, B],
    ],
    [
      [30, T],
      [68, T],
    ],
    [[30, 48], ...arc(48, 65, 20, 17, -90, 90), [30, B]],
  ],
  В: [
    [
      [30, T],
      [30, B],
    ],
    [[30, T], ...arc(46, 33, 17, 15, -90, 90), [30, 48]],
    [[30, 48], ...arc(48, 65, 20, 17, -90, 90), [30, B]],
  ],
  Г: [
    [
      [32, T],
      [32, B],
    ],
    [
      [32, T],
      [70, T],
    ],
  ],
  Д: [
    [
      [42, T],
      [41, 42],
      [36, 64],
      [28, B],
    ],
    [
      [42, T],
      [70, T],
      [70, B],
    ],
    [
      [20, 94],
      [20, B],
      [78, B],
      [78, 94],
    ],
  ],
  Е: [
    [
      [32, T],
      [32, B],
    ],
    [
      [32, T],
      [68, T],
    ],
    [
      [32, 50],
      [64, 50],
    ],
    [
      [32, B],
      [68, B],
    ],
  ],
  Ж: [
    [
      [50, T],
      [50, B],
    ],
    [
      [22, T],
      [50, 50],
      [22, B],
    ],
    [
      [78, T],
      [50, 50],
      [78, B],
    ],
  ],
  З: [[...arc(48, 33, 18, 15, 200, 450), ...arc(48, 65.5, 19, 16.5, 270, 520)]],
  // И — одним движением: вниз, наискосок вверх, вниз.
  И: [
    [
      [30, T],
      [30, B],
      [70, T],
      [70, B],
    ],
  ],
  К: [
    [
      [30, T],
      [30, B],
    ],
    [
      [70, T],
      [31, 50],
      [70, B],
    ],
  ],
  Л: [
    [
      [42, T],
      [41, 40],
      [37, 62],
      [28, B],
    ],
    [
      [42, T],
      [70, T],
      [70, B],
    ],
  ],
  М: [
    [
      [26, T],
      [26, B],
    ],
    [
      [26, T],
      [50, 62],
      [74, T],
      [74, B],
    ],
  ],
  Н: [
    [
      [28, T],
      [28, B],
    ],
    [
      [72, T],
      [72, B],
    ],
    [
      [28, 50],
      [72, 50],
    ],
  ],
  П: [
    [
      [28, T],
      [28, B],
    ],
    [
      [28, T],
      [72, T],
      [72, B],
    ],
  ],
  Р: [
    [
      [30, T],
      [30, B],
    ],
    [[30, T], ...arc(48, 34, 18, 16, -90, 90), [30, 50]],
  ],
  // С — против часовой стрелки, как О.
  С: [arc(52, 50, 24, 32, -40, -320)],
  Т: [
    [
      [26, T],
      [74, T],
    ],
    [
      [50, T],
      [50, B],
    ],
  ],
  Ф: [
    [
      [50, T],
      [50, B],
    ],
    arc(50, 48, 27, 20, -90, -450),
  ],
  Х: [
    [
      [28, T],
      [72, B],
    ],
    [
      [72, T],
      [28, B],
    ],
  ],
  Ц: [
    [
      [28, T],
      [28, B],
    ],
    [
      [66, T],
      [66, B],
    ],
    [
      [28, B],
      [76, B],
      [76, 94],
    ],
  ],
  Ч: [
    [[30, T], [30, 36], ...arc(46, 36, 16, 14, 180, 90), [68, 50]],
    [
      [68, T],
      [68, B],
    ],
  ],
  Ш: [
    [
      [24, T],
      [24, B],
    ],
    [
      [50, T],
      [50, B],
    ],
    [
      [76, T],
      [76, B],
    ],
    [
      [24, B],
      [76, B],
    ],
  ],
  Щ: [
    [
      [22, T],
      [22, B],
    ],
    [
      [46, T],
      [46, B],
    ],
    [
      [70, T],
      [70, B],
    ],
    [
      [22, B],
      [78, B],
      [78, 94],
    ],
  ],
  Ъ: [
    [
      [22, T],
      [36, T],
      [36, B],
    ],
    [[36, 48], ...arc(54, 65, 20, 17, -90, 90), [36, B]],
  ],
  Ы: [
    [
      [24, T],
      [24, B],
    ],
    [[24, 48], ...arc(38, 65, 18, 17, -90, 90), [24, B]],
    [
      [76, T],
      [76, B],
    ],
  ],
  Ь: [
    [
      [32, T],
      [32, B],
    ],
    [[32, 48], ...arc(50, 65, 20, 17, -90, 90), [32, B]],
  ],
  // Э — по часовой стрелке, потом перекладина.
  Э: [
    arc(48, 50, 24, 32, -140, 140),
    [
      [38, 50],
      [72, 50],
    ],
  ],
  Ю: [
    [
      [22, T],
      [22, B],
    ],
    [
      [22, 50],
      [40, 50],
    ],
    arc(59, 50, 19, 32, -90, -450),
  ],
  Я: [
    [
      [70, T],
      [70, B],
    ],
    [[70, T], ...arc(50, 34, 18, 16, -90, -270), [70, 50]],
    [
      [54, 50],
      [30, B],
    ],
  ],
};
// Ё и Й — Е и И с точками и дужкой сверху; точки ставят касанием.
CAPS['Ё'] = [
  ...CAPS['Е']!,
  [
    [42, 9],
    [42, 10],
  ],
  [
    [58, 9],
    [58, 10],
  ],
];
CAPS['Й'] = [...CAPS['И']!, arc(50, 8, 9, 4.5, 180, 0)];

/** Маленькие буквы, которые пишутся не как уменьшенные большие. */
const SMALL: Record<string, Stroke[]> = {
  а: [
    arc(49, 61, 15, 21, -30, -390),
    [
      [64, M],
      [64, B],
    ],
  ],
  о: [arc(50, 61, 16, 21, -90, -450)],
  у: [
    [
      [34, M],
      [51, 72],
    ],
    [
      [66, M],
      [40, 96],
    ],
  ],
  // б — с хвостиком сверху, как цифра 6.
  б: [
    [
      [66, T],
      [60, 19.5],
      [50, 22],
      [42, 26],
      [37, 33],
      [35, 42],
      ...arc(51, 63, 16, 19, 180, -180),
    ],
  ],
  е: [[[34, 61], ...arc(50, 61, 16, 21, 0, -310)]],
  р: [
    [
      [32, M],
      [32, 97],
    ],
    [[32, M], ...arc(48, 61, 18, 21, -90, 90), [32, B]],
  ],
  ф: [
    [
      [50, T],
      [50, 97],
    ],
    arc(50, 61, 23, 21, -90, -450),
  ],
};
SMALL['ё'] = [
  ...SMALL['е']!,
  [
    [42, 31],
    [42, 32],
  ],
  [
    [58, 31],
    [58, 32],
  ],
];

/** Остальные маленькие — большие, ужатые к средней линейке и чуть уже. */
const shrink = (strokes: Stroke[]): Stroke[] =>
  strokes.map((s) =>
    s.map(([x, y]): Pt => [50 + (x - 50) * 0.8, B - ((B - y) * (B - M)) / (B - T)]),
  );

/** Номера штрихов первых букв этапа (у А оба наклонных — из вершины, номера по сторонам). */
const NUMBERS: Record<string, Pt[]> = {
  А: [
    [40, 17],
    [60, 17],
    [27, 60],
  ],
  У: [
    [19, 20],
    [81, 20],
  ],
  а: [
    [55, 53],
    [71, 42],
  ],
  у: [
    [27, 42],
    [73, 42],
  ],
};

/** Как буква звучит в задании: «большую букву Б», «маленький мягкий знак». */
const letterName = (l: string) => {
  const big = l !== l.toLowerCase();
  const up = l.toUpperCase();
  if (up === 'Ъ') return `${big ? 'большой' : 'маленький'} твёрдый знак`;
  if (up === 'Ь') return `${big ? 'большой' : 'маленький'} мягкий знак`;
  return `${big ? 'большую' : 'маленькую'} букву ${up}`;
};

const LETTERS = Object.fromEntries(
  TRACE_LETTERS.map((l) => [
    l,
    {
      name: letterName(l),
      letter: true,
      strokes: CAPS[l] ?? SMALL[l] ?? shrink(CAPS[l.toUpperCase()]!),
      ...(NUMBERS[l] && { numbers: NUMBERS[l] }),
    },
  ]),
) as Record<TraceLetter, TraceDef>;

export const TRACES: Record<TraceShape, TraceDef> = {
  ...LETTERS,
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

const strokeLength = (s: Stroke) =>
  s.slice(1).reduce((d, [x, y], i) => d + Math.hypot(x - s[i]![0], y - s[i]![1]), 0);

/** Точка (Ё): её не ведут, а ставят касанием; номер ей не нужен. */
export const isDot = (s: Stroke) => strokeLength(s) < 4;

/** Куда ставить номер от начала штриха — по порядку: слева, слева сверху, сверху… */
const AROUND = [180, 225, 270, 135, 315, 0, 90, 45].map((a): Pt => [
  Math.cos((a * Math.PI) / 180),
  Math.sin((a * Math.PI) / 180),
]);

/**
 * Номера штрихов у буквы из нескольких штрихов (null — номера нет): заданные у буквы или
 * у начала штриха — там, где цифра не ложится на линии и соседние номера и ближе всего
 * к своему штриху. Координата — середина базовой линии цифры (text-anchor: middle).
 */
export function strokeNumbers(def: Pick<TraceDef, 'strokes' | 'numbers'>): (Pt | null)[] {
  const { strokes } = def;
  if (strokes.length < 2) return strokes.map(() => null);
  if (def.numbers) return def.numbers;
  const ink = strokes.flatMap((s) => resample(s, 1.5));
  const starts = strokes.filter((s) => !isDot(s)).map((s) => s[0]!);
  const placed: Pt[] = [];
  const free = (c: Pt, gap: number) =>
    c[0] >= 4 &&
    c[0] <= 96 &&
    c[1] >= 5 &&
    c[1] <= 97 &&
    ink.every(([x, y]) => Math.hypot(x - c[0], y - c[1]) >= gap) &&
    placed.every(([x, y]) => Math.hypot(x - c[0], y - c[1]) >= 9);
  return strokes.map((s) => {
    if (isDot(s)) return null;
    const [x0, y0] = s[0]!;
    for (const gap of [7.5, 6, 4.5])
      for (const r of [8, 9.5, 11])
        for (const [ux, uy] of AROUND) {
          const c: Pt = [x0 + ux * r, y0 + uy * r];
          const own = Math.hypot(c[0] - x0, c[1] - y0);
          if (!free(c, gap) || starts.some(([x, y]) => Math.hypot(c[0] - x, c[1] - y) < own))
            continue;
          placed.push(c);
          // Центр цифры размером 7 → базовая линия на 2,5 ниже.
          return [c[0], c[1] + 2.5];
        }
    return [x0 - 7, y0 + 2];
  });
}
