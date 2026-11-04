// Логика «Одень мишку» (этап 58) отдельно от рисования: какие вещи к какой погоде, что лежит в
// шкафу, где что сидит на мишке и как всё помещается на экране. Размеры на мишке — в долях
// картинки мишки: x и ширина — от её ширины, y — от высоты.
import type { DressTask, DressWeather } from '@kidsplus/shared/games';
import type { SpecOf } from './common';

type DressSpec = SpecOf<'dress'>;

export const ITEM_IDS = [
  'panama',
  'hat',
  'tshirt',
  'raincoat',
  'furcoat',
  'jacket',
  'sandals',
  'boots',
  'valenki',
  'shoes',
  'glasses',
  'umbrella',
  'mittens',
  'scarf',
] as const;
export type ItemId = (typeof ITEM_IDS)[number];

/** Куда надевается: на одно место — одна вещь. */
export type Slot = 'head' | 'eyes' | 'neck' | 'body' | 'paws' | 'hand' | 'feet';
export const SLOT: Record<ItemId, Slot> = {
  panama: 'head',
  hat: 'head',
  tshirt: 'body',
  raincoat: 'body',
  furcoat: 'body',
  jacket: 'body',
  sandals: 'feet',
  boots: 'feet',
  valenki: 'feet',
  shoes: 'feet',
  glasses: 'eyes',
  umbrella: 'hand',
  mittens: 'paws',
  scarf: 'neck',
};
/** Картинка вещи; у пар (варежки, обувь) — одна, вторая рисуется зеркально. */
export const spriteOf = (id: ItemId) => `dress-${id === 'mittens' ? 'mitten' : id}`;

/** Что надеть в эту погоду — по важности: на «одну вещь» берётся первая. */
export const OUTFITS: Record<DressWeather, ItemId[]> = {
  rain: ['umbrella', 'boots', 'raincoat'],
  snow: ['hat', 'furcoat', 'mittens', 'valenki'],
  sun: ['panama', 'glasses', 'tshirt', 'sandals'],
  wind: ['scarf', 'jacket', 'hat', 'shoes'],
};
/**
 * Что точно не годится — и про это есть короткое «почему» (фразы — в phrases.ts). Спорного нет:
 * шарф в снег или куртка в дождь в шкаф не попадают.
 */
export const WRONG_IN: Record<DressWeather, ItemId[]> = {
  rain: ['panama', 'hat', 'tshirt', 'furcoat', 'sandals', 'valenki', 'shoes', 'glasses', 'mittens'],
  snow: ['panama', 'tshirt', 'raincoat', 'sandals', 'boots', 'shoes', 'umbrella'],
  sun: [
    'hat',
    'raincoat',
    'furcoat',
    'jacket',
    'boots',
    'valenki',
    'shoes',
    'umbrella',
    'mittens',
    'scarf',
  ],
  wind: ['panama', 'tshirt', 'sandals', 'umbrella'],
};
/** В «Что не так?» мишка путает шапку, одёжку или обувь — их понятно чем заменить. */
const ODD_SLOTS: Slot[] = ['head', 'body', 'feet'];
/** Больше вещей в шкаф не помещается. */
export const SHELF_MAX = 8;

export interface DressRound {
  weather: DressWeather;
  task: DressTask;
  /** Что надеть: в «Одень» — все эти вещи, в «Что не так?» — одну вместо лишней. */
  need: ItemId[];
  /** «Что не так?»: во что мишка оделся сам (с лишней вещью); в «Одень» — пусто. */
  wear: ItemId[];
  /** Лишняя вещь — её снять. */
  wrong?: ItemId;
  /** Шкаф: в «Что не так?» — после того как лишнее сняли (оно тоже возвращается в шкаф). */
  tray: ItemId[];
}

const shuffle = <T>(xs: readonly T[], rnd: () => number): T[] => {
  const out = [...xs];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
};
const pick = <T>(xs: readonly T[], rnd: () => number) => xs[Math.floor(rnd() * xs.length)]!;

/** Сколько вещей надеть в эту погоду (в дождь всего три). */
export const needCount = (w: DressWeather, items: number) => Math.min(items, OUTFITS[w].length);

/** Погода по раундам: все из spec по кругу, в перемешку и без одной и той же два раза подряд. */
export function weatherOrder(weathers: readonly DressWeather[], rounds: number, rnd: () => number) {
  const out: DressWeather[] = [];
  while (out.length < rounds) {
    const lap = shuffle(weathers, rnd);
    if (lap.length > 1 && lap[0] === out.at(-1)) lap.push(lap.shift()!);
    out.push(...lap);
  }
  return out.slice(0, rounds);
}

/**
 * Шкаф «Одень»: нужные вещи и столько же лишних (всего не больше восьми) — сначала с тех же мест
 * (панамка — и шапка рядом), потом другие.
 */
export function trayFor(
  w: DressWeather,
  need: readonly ItemId[],
  items: number,
  rnd: () => number,
) {
  const slots = new Set(need.map((id) => SLOT[id]));
  const wrong = WRONG_IN[w];
  const same = shuffle(
    wrong.filter((id) => slots.has(SLOT[id])),
    rnd,
  );
  const other = shuffle(
    wrong.filter((id) => !slots.has(SLOT[id])),
    rnd,
  );
  const extra = [...same, ...other].slice(0, Math.min(items, SHELF_MAX - need.length));
  return shuffle([...need, ...extra], rnd);
}

/**
 * «Что не так?»: мишка надел всё по погоде, но одну шапку, одёжку или обувь перепутал. В шкафу
 * потом — нужная вещь, лишняя и, если есть, ещё одна неподходящая с того же места.
 */
export function oddRound(w: DressWeather, rnd: () => number, avoid?: ItemId): DressRound {
  const outfit = OUTFITS[w];
  const wrongFor = (id: ItemId) => WRONG_IN[w].filter((x) => SLOT[x] === SLOT[id]);
  const can = outfit.filter((id) => ODD_SLOTS.includes(SLOT[id]) && wrongFor(id).length > 0);
  const fresh = can.filter((id) => id !== avoid);
  const right = pick(fresh.length ? fresh : can, rnd);
  const others = shuffle(wrongFor(right), rnd);
  const wrong = others[0]!;
  return {
    weather: w,
    task: 'odd',
    need: [right],
    wear: outfit.map((id) => (id === right ? wrong : id)),
    wrong,
    tray: shuffle([right, ...others.slice(0, 2)], rnd),
  };
}

/**
 * Раунды: задания по очереди («Одень» первым), погода по кругу. Когда погода повторяется,
 * «Одень» берёт следующие по списку вещи — не те же самые.
 */
export function planDress(spec: DressSpec, rnd: () => number = Math.random): DressRound[] {
  const order = weatherOrder(spec.weathers, spec.rounds, rnd);
  const seen = new Map<DressWeather, number>();
  const lastOdd = new Map<DressWeather, ItemId>();
  return order.map((weather, i) => {
    const task = spec.tasks[i % spec.tasks.length]!;
    if (task === 'odd') {
      const r = oddRound(weather, rnd, lastOdd.get(weather));
      lastOdd.set(weather, r.need[0]!);
      return r;
    }
    const outfit = OUTFITS[weather];
    const k = needCount(weather, spec.items);
    const times = seen.get(weather) ?? 0;
    seen.set(weather, times + 1);
    const from = (times * k) % outfit.length;
    const need = [...outfit.slice(from), ...outfit.slice(0, from)].slice(0, k);
    return { weather, task, need, wear: [], tray: trayFor(weather, need, spec.items, rnd) };
  });
}

// ─── Где что сидит на мишке ───

/** Картинка мишки: ширина к высоте. */
export const BEAR_AR = 567 / 900;
/** Пропорции картинок вещей (высота к ширине) — для шкафа и примерки. */
export const ITEM_AR: Record<ItemId, number> = {
  panama: 274 / 420,
  hat: 420 / 370,
  tshirt: 413 / 560,
  raincoat: 485 / 600,
  furcoat: 450 / 600,
  jacket: 414 / 600,
  sandals: 165 / 300,
  boots: 320 / 310,
  valenki: 320 / 290,
  shoes: 240 / 300,
  glasses: 148 / 380,
  umbrella: 760 / 704,
  mittens: 240 / 190,
  scarf: 420 / 350,
};

/**
 * Вещь на мишке: центр (x — в ширинах, y — в высотах мишки), ширина (в ширинах), поворот.
 * pair — вторая такая же зеркально на (1 − x).
 */
export interface Fit {
  x: number;
  y: number;
  w: number;
  rot?: number;
  pair?: boolean;
}
export const FITS: Record<Exclude<ItemId, 'umbrella'>, Fit> = {
  panama: { x: 0.5, y: 0.03, w: 0.7 },
  hat: { x: 0.5, y: -0.035, w: 0.6 },
  glasses: { x: 0.51, y: 0.228, w: 0.53 },
  scarf: { x: 0.5, y: 0.5, w: 0.46 },
  tshirt: { x: 0.5, y: 0.58, w: 0.9 },
  raincoat: { x: 0.5, y: 0.63, w: 1.02 },
  furcoat: { x: 0.5, y: 0.61, w: 1.04 },
  jacket: { x: 0.5, y: 0.595, w: 1.0 },
  mittens: { x: 0.09, y: 0.7, w: 0.21, rot: Math.PI, pair: true },
  sandals: { x: 0.27, y: 0.94, w: 0.38, pair: true },
  boots: { x: 0.28, y: 0.89, w: 0.37, pair: true },
  valenki: { x: 0.29, y: 0.89, w: 0.35, pair: true },
  shoes: { x: 0.28, y: 0.92, w: 0.37, pair: true },
};
/** Голова — её рисуют ещё раз поверх воротника и шарфа (эллипс в долях мишки). */
export const HEAD = { x: 0.5, y: 0.215, rx: 0.375, ry: 0.19 };
/**
 * Зонтик в правой лапе: где кольцо ручки (hand) и середина купола (cap), ширина купола. Палка
 * идёт за головой, купол — над ней, лицо открыто.
 */
export const UMBRELLA = { hand: { x: 0.91, y: 0.69 }, cap: { x: 0.62, y: 0.07 }, w: 0.85 };
/**
 * Картинка зонтика по частям (в её пикселях): купол до canopy, палка (shaft: x0, x1, y0, y1)
 * тянется до нужной длины, ручка (hook) — кольцом ring к лапе. axis — середина палки, cap — где
 * палка входит в купол.
 */
export const UMB_SPRITE = {
  W: 704,
  H: 760,
  axis: 352,
  cap: 357,
  canopy: 385,
  shaft: [334, 370, 400, 585],
  hook: [290, 480, 585, 760],
  ring: 608,
} as const;
/** Порядок рисования: одёжка, обувь, варежки, шарф — потом голова, шапка, очки, зонтик. */
export const DRAW_ORDER: Slot[] = ['body', 'feet', 'paws', 'neck', 'head', 'eyes', 'hand'];

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Где вещь на мишке, px: прямоугольник (у пары — обе вместе) — чтобы нажать на неё. */
export function wornBox(id: ItemId, bear: Box): Box {
  if (id === 'umbrella') {
    // Нажать можно на купол — не на лицо под ним.
    const { cap, w } = UMBRELLA;
    const cw = w * bear.w;
    const ch = (cw * UMB_SPRITE.canopy) / UMB_SPRITE.W;
    const y = bear.y + cap.y * bear.h - (cw * UMB_SPRITE.cap) / UMB_SPRITE.W;
    return { x: bear.x + cap.x * bear.w - cw / 2, y, w: cw, h: ch };
  }
  const f = FITS[id];
  const w = f.w * bear.w;
  const h = w * ITEM_AR[id];
  const cx = bear.x + f.x * bear.w;
  const cy = bear.y + f.y * bear.h;
  if (!f.pair) return { x: cx - w / 2, y: cy - h / 2, w, h };
  const x1 = bear.x + (1 - f.x) * bear.w;
  return { x: cx - w / 2, y: cy - h / 2, w: x1 - cx + w, h };
}

// ─── Комната на экране ───

/** Фон: где на картинке начинается пол (доля высоты). */
export const FLOOR = { l: 0.69, p: 0.71 };
/** Сколько над головой мишки занимают шапка с помпоном и зонтик (в высотах мишки). */
export const HEADROOM = 0.25;
/** Лёжа сова сидит слева: до сюда (px) окно не заходит. */
export const OWL_RIGHT = 100;
/** Кнопка «послушать» в правом верхнем углу: шкаф лёжа начинается ниже. */
export const TOP_BUTTONS = 92;

export interface DressStage {
  land: boolean;
  /** Окно (внутри — погода). */
  win: Box;
  /** Картинка мишки. */
  bear: Box;
  /** Шкаф и клетки вещей в нём. */
  shelf: Box;
  cells: Box[];
  /** Полки шкафа (y досок). */
  boards: number[];
}

/**
 * Комната на экране w×h px для шкафа на n вещей: стоя — окно сверху, мишка посередине, шкаф
 * внизу; лёжа — окно слева, мишка посередине, шкаф справа. Сверху место под кнопки.
 */
export function stageFor(w: number, h: number, n: number): DressStage {
  const land = w > h;
  const top = land ? 56 : 100;
  const pad = Math.max(8, Math.min(w, h) * 0.025);
  /** Шкаф sw×(rows клеток): клетки по середине полок. */
  const rack = (cols: number, rows: number, cell: number, x: number, y: number, sw: number) => {
    const frame = cell * 0.1;
    const shelf = { x, y, w: sw, h: rows * cell + 2 * frame };
    const cells: Box[] = [];
    for (let i = 0; i < n; i++) {
      const row = Math.floor(i / cols);
      const inRow = Math.min(cols, n - row * cols);
      const left = x + (sw - inRow * cell) / 2;
      cells.push({ x: left + (i % cols) * cell, y: y + frame + row * cell, w: cell, h: cell });
    }
    const boards = Array.from({ length: rows }, (_, r) => y + frame + (r + 1) * cell);
    return { shelf, cells, boards };
  };
  if (land) {
    const cols = n <= 2 ? 1 : n <= 4 ? 2 : 3;
    const rows = Math.ceil(n / cols);
    const cell = Math.min(w * 0.11, (h - TOP_BUTTONS - pad) / (Math.max(rows, 2) + 0.2));
    const sw = cols * cell + 0.3 * cell;
    const sh = rows * cell + 0.2 * cell;
    const sy = Math.min(h - pad - sh, Math.max(TOP_BUTTONS, (h - sh) / 2 + top / 4));
    const r = rack(cols, rows, cell, w - pad - sw, sy, sw);
    const winW = Math.min(w * 0.27, (h - top) * 0.95);
    const winH = Math.min(winW * 0.8, (h - top - 2 * pad) * 0.62);
    // Окно правее совы (она лёжа — слева под кнопкой «домой»).
    const win = {
      x: Math.max(pad + w * 0.04, OWL_RIGHT),
      y: top + (h - top) * 0.06,
      w: winW,
      h: winH,
    };
    const room = r.shelf.x - win.x - winW;
    const bh = Math.min((h - 0.5 * top - pad) / (1 + HEADROOM), (room * 0.9) / BEAR_AR);
    const bw = bh * BEAR_AR;
    const cx = (win.x + winW + r.shelf.x) / 2;
    return { land, win, bear: { x: cx - bw / 2, y: h - pad - bh, w: bw, h: bh }, ...r };
  }
  const rows = n <= 4 ? 1 : 2;
  const cols = Math.ceil(n / rows);
  const cell = Math.min(w * 0.22, (h - top) * 0.13, (w - 2 * pad) / (Math.max(cols, 3) + 0.3));
  // Шкаф не уже трёх клеток — вещи посередине.
  const sw = (Math.max(cols, 3) + 0.3) * cell;
  const r = rack(cols, rows, cell, (w - sw) / 2, h - pad - (rows + 0.2) * cell, sw);
  const winH = (r.shelf.y - top) * 0.27;
  const winW = Math.min(w - 2 * pad, winH * 1.9);
  const win = { x: (w - winW) / 2, y: top, w: winW, h: winH };
  // Мишка стоит на полу над шкафом, а не на нём.
  const feet = r.shelf.y - Math.max(pad * 2, h * 0.025);
  const bh = (feet - (top + winH)) / (1 + HEADROOM);
  const bw = bh * BEAR_AR;
  return { land, win, bear: { x: (w - bw) / 2, y: feet - bh, w: bw, h: bh }, ...r };
}

/** Глиняные картинки игры. */
export const dressSprites = () => [
  'dress-bear',
  'dress-bg-l',
  'dress-bg-p',
  ...(['rain', 'snow', 'sun', 'wind'] as const).map((w) => `dress-view-${w}`),
  ...ITEM_IDS.map(spriteOf),
];
