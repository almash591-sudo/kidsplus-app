// Фигуры сортера: контур в поле 100 × 100, название и период симметрии (поворот, после которого
// фигура выглядит так же — тогда она пролезает в отверстие).
import type { SorterShape } from '@kidsplus/shared/games';

const star = (cx: number, cy: number, r: number, inner: number) =>
  'M' +
  Array.from({ length: 10 }, (_, i) => {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? inner : r;
    return `${(cx + rr * Math.cos(a)).toFixed(1)},${(cy + rr * Math.sin(a)).toFixed(1)}`;
  }).join(' L') +
  ' Z';

const hexagon = 'M50,6 L88,28 L88,72 L50,94 L12,72 L12,28 Z';

export const SORTER: Record<
  SorterShape,
  { d: string; name: string; color: string; period: number }
> = {
  circle: {
    d: 'M8,50 a42,42 0 1,0 84,0 a42,42 0 1,0 -84,0 Z',
    name: 'круг',
    color: '#E8453C',
    period: 90,
  },
  square: { d: 'M12,12 H88 V88 H12 Z', name: 'квадрат', color: '#3B82F6', period: 90 },
  triangle: { d: 'M50,8 L94,86 L6,86 Z', name: 'треугольник', color: '#22A55B', period: 360 },
  rectangle: { d: 'M4,28 H96 V72 H4 Z', name: 'прямоугольник', color: '#F59E0B', period: 180 },
  star: { d: star(50, 52, 46, 20), name: 'звезда', color: '#FACC15', period: 360 },
  heart: {
    d: 'M50,90 C20,68 6,52 6,34 C6,18 18,8 31,8 C40,8 47,13 50,21 C53,13 60,8 69,8 C82,8 94,18 94,34 C94,52 80,68 50,90 Z',
    name: 'сердце',
    color: '#F472B6',
    period: 360,
  },
  hexagon: { d: hexagon, name: 'шестиугольник', color: '#9B5DE5', period: 180 },
  oval: {
    d: 'M6,50 a44,28 0 1,0 88,0 a44,28 0 1,0 -88,0 Z',
    name: 'овал',
    color: '#14B8A6',
    period: 180,
  },
  rhombus: { d: 'M50,4 L84,50 L50,96 L16,50 Z', name: 'ромб', color: '#EC4899', period: 180 },
  cross: {
    d: 'M36,6 H64 V36 H94 V64 H64 V94 H36 V64 H6 V36 H36 Z',
    name: 'крестик',
    color: '#0EA5E9',
    period: 90,
  },
};

/** Пролезет ли фигура, повёрнутая на rot градусов (кратно 90), в отверстие. */
export const fits = (shape: SorterShape, rot: number) =>
  ((rot % SORTER[shape].period) + SORTER[shape].period) % SORTER[shape].period === 0;
