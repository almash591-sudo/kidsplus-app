// Картинки игр этапа 42: точки «Соедини точки» (поле 100 × 100), детали «Танграма-малыша»
// (поле 100 × 100) и места цифр «Раскраски по цифрам» (поле раскраски 400 × 400).
import type { ColoringPicture, DotPicture, TangramFigure } from '@kidsplus/shared/games';

type Pt = [number, number];

const star = (): Pt[] =>
  Array.from({ length: 10 }, (_, k) => {
    const a = ((-90 + 36 * k) * Math.PI) / 180;
    const r = k % 2 ? 18 : 42;
    return [Math.round(50 + r * Math.cos(a)), Math.round(54 + r * Math.sin(a))];
  });

const heart = (): Pt[] =>
  Array.from({ length: 12 }, (_, i) => {
    const t = (i / 12) * 2 * Math.PI;
    const x = 16 * Math.sin(t) ** 3;
    const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    return [Math.round(50 + x * 2.5), Math.round(46 - y * 2.5)];
  });

/** Точки по порядку (1, 2, 3…); после последней линия возвращается к первой. */
export const DOTS: Record<DotPicture, { points: Pt[]; color: string }> = {
  star: { points: star(), color: '#FACC15' },
  house: {
    points: [
      [20, 90],
      [20, 48],
      [50, 18],
      [62, 30],
      [62, 18],
      [72, 18],
      [72, 40],
      [80, 48],
      [80, 90],
    ],
    color: '#F59E0B',
  },
  fish: {
    points: [
      [12, 50],
      [30, 32],
      [55, 26],
      [75, 38],
      [90, 24],
      [90, 76],
      [75, 62],
      [55, 74],
      [30, 68],
    ],
    color: '#7DD3FC',
  },
  heart: { points: heart(), color: '#F472B6' },
  boat: {
    points: [
      [28, 84],
      [14, 64],
      [42, 64],
      [42, 12],
      [78, 52],
      [54, 52],
      [54, 64],
      [86, 64],
      [72, 84],
    ],
    color: '#2563EB',
  },
  fir: {
    points: [
      [44, 92],
      [44, 78],
      [14, 78],
      [36, 56],
      [22, 56],
      [42, 34],
      [32, 34],
      [50, 10],
      [68, 34],
      [58, 34],
      [78, 56],
      [64, 56],
      [86, 78],
      [56, 78],
      [56, 92],
    ],
    color: '#22A55B',
  },
  rocket: {
    points: [
      [50, 8],
      [64, 30],
      [64, 66],
      [78, 88],
      [60, 78],
      [40, 78],
      [22, 88],
      [36, 66],
      [36, 30],
    ],
    color: '#E8453C',
  },
};

/** Деталь танграма — в своём прямоугольнике x, y, w, h; треугольник смотрит вершиной вверх, влево или вправо. */
export type PieceShape = 'rect' | 'tri' | 'triLeft' | 'triRight' | 'circle' | 'half';
export interface Piece {
  shape: PieceShape;
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
}

export function piecePath({ shape, x, y, w, h }: Omit<Piece, 'color'>): string {
  switch (shape) {
    case 'rect':
      return `M${x},${y} h${w} v${h} h${-w} Z`;
    case 'tri':
      return `M${x},${y + h} L${x + w / 2},${y} L${x + w},${y + h} Z`;
    case 'triLeft':
      return `M${x + w},${y} L${x},${y + h / 2} L${x + w},${y + h} Z`;
    case 'triRight':
      return `M${x},${y} L${x + w},${y + h / 2} L${x},${y + h} Z`;
    case 'circle':
      return `M${x},${y + h / 2} a${w / 2},${h / 2} 0 1,0 ${w},0 a${w / 2},${h / 2} 0 1,0 ${-w},0 Z`;
    case 'half':
      return `M${x},${y + h} A${w / 2},${h} 0 0,1 ${x + w},${y + h} Z`;
  }
}

/** Детали одинаковой формы и размера взаимозаменяемы. */
export const pieceKind = (p: Piece) => `${p.shape}:${p.w}x${p.h}`;

const P = (
  shape: PieceShape,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
): Piece => ({
  shape,
  x,
  y,
  w,
  h,
  color,
});

/** Детали фигуры — в порядке рисования (дверь поверх стены). */
export const TANGRAMS: Record<TangramFigure, Piece[]> = {
  house: [
    P('rect', 20, 50, 60, 40, '#F59E0B'),
    P('tri', 12, 16, 76, 34, '#E8453C'),
    P('rect', 42, 64, 16, 26, '#92400E'),
  ],
  tree: [
    P('tri', 14, 28, 72, 38, '#22A55B'),
    P('tri', 22, 6, 56, 30, '#4ADE80'),
    P('rect', 42, 66, 16, 26, '#92400E'),
  ],
  rocket: [
    P('rect', 36, 26, 28, 52, '#7DD3FC'),
    P('tri', 36, 4, 28, 22, '#E8453C'),
    P('tri', 20, 58, 16, 26, '#F59E0B'),
    P('tri', 64, 58, 16, 26, '#F59E0B'),
    P('circle', 42, 34, 16, 16, '#FACC15'),
  ],
  car: [
    P('half', 26, 22, 48, 24, '#2563EB'),
    P('rect', 10, 46, 80, 24, '#E8453C'),
    P('circle', 16, 62, 22, 22, '#222222'),
    P('circle', 62, 62, 22, 22, '#222222'),
  ],
  boat: [
    P('tri', 30, 10, 40, 46, '#FACC15'),
    P('rect', 14, 60, 72, 18, '#92400E'),
    P('circle', 74, 4, 16, 16, '#F59E0B'),
  ],
  snowman: [
    P('circle', 30, 52, 40, 40, '#E0F2FE'),
    P('circle', 36, 26, 28, 28, '#BAE6FD'),
    P('circle', 41, 8, 18, 18, '#7DD3FC'),
  ],
  fish: [
    P('circle', 14, 30, 56, 40, '#F59E0B'),
    P('triLeft', 66, 30, 24, 40, '#E8453C'),
    P('tri', 32, 16, 20, 14, '#FACC15'),
  ],
  castle: [
    P('rect', 26, 40, 48, 50, '#F472B6'),
    P('rect', 10, 26, 18, 64, '#9B5DE5'),
    P('rect', 72, 26, 18, 64, '#9B5DE5'),
    P('tri', 8, 8, 22, 18, '#E8453C'),
    P('tri', 70, 8, 22, 18, '#E8453C'),
    P('rect', 42, 64, 16, 26, '#92400E'),
  ],
};

/** Где стоят цифры у областей раскраски (у области из нескольких частей — несколько цифр). */
export const NUMBER_SPOTS: Record<ColoringPicture, Record<string, Pt[]>> = {
  sun: { sky: [[40, 40]], rays: [[328, 200]], sun: [[200, 150]] },
  fish: {
    water: [[50, 50]],
    bubbles: [[340, 90]],
    tail: [[72, 200]],
    fin: [[208, 128]],
    body: [[160, 210]],
  },
  house: {
    sky: [[40, 40]],
    grass: [[60, 360]],
    sun: [[345, 58]],
    wall: [[276, 286]],
    roof: [[200, 140]],
    door: [[202, 265]],
    windows: [
      [147, 236],
      [282, 236],
    ],
  },
  flower: {
    pot: [[200, 350]],
    stem: [[200, 288]],
    leaves: [
      [150, 252],
      [250, 220],
    ],
    petals: [[258, 135]],
    center: [[200, 135]],
  },
  car: {
    sky: [[40, 40]],
    grass: [[200, 370]],
    body: [[90, 245]],
    windows: [
      [175, 175],
      [245, 175],
    ],
    light: [[334, 228]],
    wheels: [
      [120, 282],
      [280, 282],
    ],
  },
  butterfly: {
    upper: [[150, 165]],
    lower: [[150, 290]],
    spots: [[112, 150]],
    body: [[200, 250]],
  },
  rocket: {
    space: [[50, 150]],
    flame: [[200, 345]],
    fins: [[130, 300]],
    body: [[200, 270]],
    nose: [[200, 95]],
    window: [[200, 200]],
  },
};
