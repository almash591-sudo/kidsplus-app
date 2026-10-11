// Картинки для раскраски: области (заливаются касанием) и контуры поверх. Поле 400 × 400.
import type { ColoringPicture } from '@kidsplus/shared/games';
import type { PaintId } from './common';

export interface Region {
  id: string;
  /** Винительный падеж для задания: «Раскрась <крышу> красным». */
  name: string;
  /** Цвет в режиме заданий. */
  target: PaintId;
  /** Контуры области (path d); mirror — добавить зеркальную копию (крылья бабочки). */
  parts: string[];
  mirror?: boolean;
}

export interface Picture {
  regions: Region[];
  /** Детали поверх (глаза, рамы окон) — не заливаются. */
  details: { d: string; fill?: string }[];
}

const rect = (x: number, y: number, w: number, h: number) => `M${x},${y} h${w} v${h} h${-w} Z`;
const circle = (cx: number, cy: number, r: number) =>
  `M${cx - r},${cy} a${r},${r} 0 1,0 ${2 * r},0 a${r},${r} 0 1,0 ${-2 * r},0 Z`;
const ellipse = (cx: number, cy: number, rx: number, ry: number) =>
  `M${cx - rx},${cy} a${rx},${ry} 0 1,0 ${2 * rx},0 a${rx},${ry} 0 1,0 ${-2 * rx},0 Z`;
const poly = (...pts: [number, number][]) => `M${pts.map(([x, y]) => `${x},${y}`).join(' L')} Z`;
const r1 = (n: number) => Math.round(n * 10) / 10;

/** Лучи солнца — треугольники вокруг круга. */
const rays = (cx: number, cy: number, inner: number, outer: number, count: number) =>
  Array.from({ length: count }, (_, i) => {
    const a = (i * 2 * Math.PI) / count;
    const w = 0.22;
    const p = (r: number, t: number): [number, number] => [
      r1(cx + r * Math.cos(t)),
      r1(cy + r * Math.sin(t)),
    ];
    return poly(p(inner, a - w), p(outer, a), p(inner, a + w));
  });

export const PICTURES: Record<ColoringPicture, Picture> = {
  sun: {
    regions: [
      { id: 'sky', name: 'небо', target: 'lightblue', parts: [rect(0, 0, 400, 400)] },
      { id: 'rays', name: 'лучики', target: 'orange', parts: rays(200, 200, 88, 170, 10) },
      { id: 'sun', name: 'солнышко', target: 'yellow', parts: [circle(200, 200, 95)] },
    ],
    details: [
      { d: circle(168, 182, 9), fill: '#222' },
      { d: circle(232, 182, 9), fill: '#222' },
      { d: 'M160,225 Q200,262 240,225' },
    ],
  },
  fish: {
    regions: [
      { id: 'water', name: 'воду', target: 'blue', parts: [rect(0, 0, 400, 400)] },
      {
        id: 'bubbles',
        name: 'пузырьки',
        target: 'lightblue',
        parts: [circle(340, 90, 18), circle(360, 40, 11), circle(320, 140, 9)],
      },
      {
        id: 'tail',
        name: 'хвостик',
        target: 'red',
        parts: [poly([120, 200], [35, 130], [35, 270])],
      },
      {
        id: 'fin',
        name: 'плавник',
        target: 'yellow',
        parts: [poly([160, 150], [215, 85], [250, 145])],
      },
      { id: 'body', name: 'рыбку', target: 'orange', parts: [ellipse(210, 205, 115, 72)] },
    ],
    details: [
      { d: circle(275, 188, 10), fill: '#222' },
      { d: 'M235,160 Q218,205 235,250' },
      { d: 'M318,222 q-12,10 -24,4' },
    ],
  },
  house: {
    regions: [
      { id: 'sky', name: 'небо', target: 'lightblue', parts: [rect(0, 0, 400, 300)] },
      { id: 'grass', name: 'траву', target: 'green', parts: [rect(0, 300, 400, 100)] },
      { id: 'sun', name: 'солнце', target: 'yellow', parts: [circle(345, 58, 36)] },
      { id: 'wall', name: 'стену', target: 'orange', parts: [rect(90, 170, 220, 150)] },
      { id: 'roof', name: 'крышу', target: 'red', parts: [poly([65, 178], [200, 65], [335, 178])] },
      { id: 'door', name: 'дверь', target: 'brown', parts: [rect(175, 238, 55, 82)] },
      {
        id: 'windows',
        name: 'окошки',
        target: 'blue',
        parts: [rect(110, 198, 50, 50), rect(245, 198, 50, 50)],
      },
    ],
    details: [
      { d: 'M135,198 v50 M110,223 h50 M270,198 v50 M245,223 h50' },
      { d: circle(220, 282, 4), fill: '#222' },
    ],
  },
  flower: {
    regions: [
      {
        id: 'pot',
        name: 'горшок',
        target: 'brown',
        parts: [poly([135, 300], [265, 300], [245, 392], [155, 392])],
      },
      { id: 'stem', name: 'стебель', target: 'green', parts: [rect(192, 165, 16, 137)] },
      {
        id: 'leaves',
        name: 'листики',
        target: 'green',
        parts: [
          'M200,262 Q150,215 115,250 Q155,290 200,262 Z',
          'M200,232 Q250,185 285,222 Q245,262 200,232 Z',
        ],
      },
      {
        id: 'petals',
        name: 'лепестки',
        target: 'pink',
        parts: Array.from({ length: 6 }, (_, i) => {
          const a = (i * Math.PI) / 3;
          return circle(r1(200 + 58 * Math.cos(a)), r1(135 + 58 * Math.sin(a)), 40);
        }),
      },
      { id: 'center', name: 'серединку', target: 'yellow', parts: [circle(200, 135, 40)] },
    ],
    details: [],
  },
  car: {
    regions: [
      { id: 'sky', name: 'небо', target: 'lightblue', parts: [rect(0, 0, 400, 300)] },
      { id: 'grass', name: 'травку', target: 'green', parts: [rect(0, 300, 400, 100)] },
      {
        id: 'body',
        name: 'машину',
        target: 'red',
        parts: [
          'M50,215 Q50,200 65,200 L335,200 Q350,200 350,215 L350,280 L50,280 Z',
          poly([108, 200], [148, 138], [272, 138], [312, 200]),
        ],
      },
      {
        id: 'windows',
        name: 'окна',
        target: 'blue',
        parts: [
          poly([126, 194], [157, 150], [204, 150], [204, 194]),
          poly([216, 194], [216, 150], [263, 150], [294, 194]),
        ],
      },
      { id: 'light', name: 'фару', target: 'yellow', parts: [circle(334, 228, 12)] },
      {
        id: 'wheels',
        name: 'колёса',
        target: 'black',
        parts: [circle(120, 282, 38), circle(280, 282, 38)],
      },
    ],
    details: [
      { d: circle(120, 282, 14), fill: '#ddd' },
      { d: circle(280, 282, 14), fill: '#ddd' },
      { d: 'M180,215 h22' },
    ],
  },
  butterfly: {
    regions: [
      {
        id: 'upper',
        name: 'верхние крылышки',
        target: 'purple',
        parts: ['M200,190 C140,70 45,55 58,170 C68,225 150,222 200,200 Z'],
        mirror: true,
      },
      {
        id: 'lower',
        name: 'нижние крылышки',
        target: 'pink',
        parts: ['M200,215 C130,228 85,330 148,342 C190,348 206,282 200,230 Z'],
        mirror: true,
      },
      {
        id: 'spots',
        name: 'пятнышки',
        target: 'yellow',
        parts: [circle(112, 150, 22)],
        mirror: true,
      },
      { id: 'body', name: 'тельце', target: 'black', parts: [ellipse(200, 215, 16, 98)] },
    ],
    details: [
      { d: 'M194,122 Q180,80 160,66 M206,122 Q220,80 240,66' },
      { d: circle(158, 64, 7), fill: '#222' },
      { d: circle(242, 64, 7), fill: '#222' },
    ],
  },
  rocket: {
    regions: [
      { id: 'space', name: 'космос', target: 'purple', parts: [rect(0, 0, 400, 400)] },
      {
        id: 'flame',
        name: 'огонь',
        target: 'orange',
        parts: [poly([168, 325], [200, 395], [232, 325])],
      },
      {
        id: 'fins',
        name: 'крылья',
        target: 'red',
        parts: [poly([152, 245], [105, 330], [158, 312])],
        mirror: true,
      },
      { id: 'body', name: 'ракету', target: 'lightblue', parts: [rect(150, 128, 100, 197)] },
      { id: 'nose', name: 'носик', target: 'blue', parts: ['M150,130 Q200,15 250,130 Z'] },
      { id: 'window', name: 'окошко', target: 'yellow', parts: [circle(200, 200, 30)] },
    ],
    details: [
      { d: circle(60, 70, 5), fill: '#fff' },
      { d: circle(330, 50, 4), fill: '#fff' },
      { d: circle(340, 260, 6), fill: '#fff' },
      { d: circle(70, 300, 4), fill: '#fff' },
    ],
  },
};
