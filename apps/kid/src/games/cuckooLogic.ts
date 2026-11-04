// Этап 58: «Часы с кукушкой» — время и стрелки, раунды и режим дня, раскладка часов на экране.
import type { CuckooTask } from '@kidsplus/shared/games';
import type { SpecOf } from './common';

/** Время на циферблате: h — 1…12, m — 0 или 30. */
export interface Time {
  h: number;
  m: 0 | 30;
}
export const NOON: Time = { h: 12, m: 0 };
export const sameTime = (a: Time, b: Time) => a.h === b.h && a.m === b.m;
const hour12 = (n: number) => ((Math.round(n) % 12) + 12) % 12 || 12;
const frac = (x: number) => x - Math.floor(x);

// ─── Стрелки ───
/**
 * Длина маленькой и большой стрелок и радиус чисел — доли радиуса циферблата. Острие большой —
 * за числами, на кольце минут: «12» и «6» под ней видно.
 */
export const SMALL_LEN = 0.52;
export const BIG_LEN = 0.95;
export const NUM_R = 0.74;

export interface Face {
  x: number;
  y: number;
  r: number;
}
/** Поворот стрелок от «12» по часовой (0…1); маленькая к половине уходит на полпути к числу. */
export const hourTurn = (t: Time) => frac(((t.h % 12) + t.m / 60) / 12);
export const minuteTurn = (t: Time) => t.m / 60;
/** Поворот точки вокруг центра циферблата от «12» по часовой. */
export const turnAt = (f: Face, x: number, y: number) =>
  frac(Math.atan2(y - f.y, x - f.x) / (2 * Math.PI) + 0.25);
/** Точка на циферблате: поворот turn, расстояние len (доля радиуса). */
export const pointAt = (f: Face, turn: number, len: number): [number, number] => {
  const a = turn * 2 * Math.PI - Math.PI / 2;
  return [f.x + Math.cos(a) * len * f.r, f.y + Math.sin(a) * len * f.r];
};
/** Кратчайший поворот от from до to (−0,5…0,5). */
export const turnDelta = (from: number, to: number) => frac(to - from + 0.5) - 0.5;

/** Большая стрелка легла: на «12» (0 минут) или на «6» (30); без половин — всегда на «12». */
export const snapMinute = (big: number, half: boolean): 0 | 30 =>
  half && Math.round(frac(big) * 2) % 2 === 1 ? 30 : 0;
/**
 * Маленькая стрелка легла: ровно — ближайший час; в половину — час, на котором она стоит или
 * который чуть позади (стрелка между 3 и 4 и на самой «3» — это половина четвёртого).
 */
export const snapHour = (small: number, m: 0 | 30) => hour12(frac(small) * 12 - (m ? 0.25 : 0));
/** Какое время показывают стрелки, когда их отпустили. */
export const settle = (small: number, big: number, half: boolean): Time => {
  const m = snapMinute(big, half);
  return { h: snapHour(small, m), m };
};

/**
 * Стрелку отпустили — какое теперь время. Как settle, но маленькую, поставленную на нужный час
 * «с половиной», когда большая ещё не там, засчитать за нужный час: ребёнок думает правильно,
 * следующая — большая стрелка.
 */
export function release(target: Time, small: number, big: number, half: boolean, moved: Hand) {
  const now = settle(small, big, half);
  if (
    moved === 'small' &&
    now.m !== target.m &&
    Math.abs(turnDelta(small, hourTurn(target))) * 12 < 0.3
  )
    return { h: target.h, m: now.m } as Time;
  return now;
}

/** Число, на которое нажали (по углу), или null — нажали в середину или мимо циферблата. */
export function numberAt(f: Face, x: number, y: number): number | null {
  const d = Math.hypot(x - f.x, y - f.y);
  if (d < f.r * 0.3 || d > f.r * 1.3) return null;
  return hour12(turnAt(f, x, y) * 12);
}

const segDist = (f: Face, turn: number, len: number, x: number, y: number) => {
  const [tx, ty] = pointAt(f, turn, len);
  const dx = tx - f.x;
  const dy = ty - f.y;
  const t = Math.max(0, Math.min(1, ((x - f.x) * dx + (y - f.y) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(x - f.x - t * dx, y - f.y - t * dy);
};
export type Hand = 'small' | 'big';
/**
 * Какую стрелку взял палец: без половин — всегда маленькую (большая стоит на «12»); с половинами —
 * ту, что ближе к пальцу (у середины, где они рядом, — маленькую), а мимо обеих — ближайшую по углу.
 */
export function grabHand(f: Face, small: number, big: number, x: number, y: number, half: boolean) {
  if (!half) return 'small' as Hand;
  const ds = segDist(f, small, SMALL_LEN, x, y);
  const db = segDist(f, big, BIG_LEN, x, y);
  if (Math.min(ds, db) <= f.r * 0.35) return (ds <= db + f.r * 0.05 ? 'small' : 'big') as Hand;
  const t = turnAt(f, x, y);
  return (Math.abs(turnDelta(small, t)) <= Math.abs(turnDelta(big, t)) ? 'small' : 'big') as Hand;
}

/**
 * Стрелку отпустили: угадал; маленькая не на том часе (ошибка); маленькая верно — теперь большую;
 * большая не на тех минутах (ошибка); большая верно — теперь маленькую.
 */
export type Verdict = 'win' | 'hour' | 'needBig' | 'minute' | 'needSmall';
export function judge(target: Time, now: Time, moved: Hand): Verdict {
  if (sameTime(target, now)) return 'win';
  if (moved === 'small') return now.h === target.h ? 'needBig' : 'hour';
  return now.m === target.m ? 'needSmall' : 'minute';
}

// ─── Режим дня ───
export const DAY_IDS = [
  'wake',
  'exercise',
  'breakfast',
  'walk',
  'lunch',
  'draw',
  'bath',
  'teeth',
  'sleep',
] as const;
export type DayId = (typeof DAY_IDS)[number];
export type DayPart = 'morning' | 'day' | 'evening';
export interface DayEvent {
  id: DayId;
  t: Time;
  part: DayPart;
}
/** День мишки по порядку; события в половину — только с половинами часов. */
export const DAY: readonly DayEvent[] = [
  { id: 'wake', t: { h: 7, m: 0 }, part: 'morning' },
  { id: 'exercise', t: { h: 7, m: 30 }, part: 'morning' },
  { id: 'breakfast', t: { h: 8, m: 0 }, part: 'morning' },
  { id: 'walk', t: { h: 11, m: 0 }, part: 'day' },
  { id: 'lunch', t: { h: 1, m: 0 }, part: 'day' },
  { id: 'draw', t: { h: 4, m: 30 }, part: 'day' },
  { id: 'bath', t: { h: 8, m: 0 }, part: 'evening' },
  { id: 'teeth', t: { h: 8, m: 30 }, part: 'evening' },
  { id: 'sleep', t: { h: 9, m: 0 }, part: 'evening' },
];

// ─── Раунды ───
export interface CuckooRound {
  task: CuckooTask;
  target: Time;
  /** С какого времени начинаются стрелки (обычно — ответ прошлого раунда). */
  start: Time;
  day: DayEvent | null;
}
export type Rnd = () => number;
const pick = <T>(xs: readonly T[], rnd: Rnd) => xs[Math.floor(rnd() * xs.length)]!;

/**
 * Раунды: задания по очереди. «Который час?» — целые часы 1…11 (на «12» стоят обе стрелки);
 * «Покажи» — 1…12, с половинами — две из трёх в половину; «Режим дня» — события по порядку дня,
 * по одному из каждой части. Час всегда другой, чем показывают часы, — стрелкам есть куда идти.
 */
export function planRounds(spec: SpecOf<'cuckoo'>, rnd: Rnd = Math.random): CuckooRound[] {
  const taskAt = (k: number) => spec.tasks[k % spec.tasks.length]!;
  const pool = DAY.filter((e) => spec.half || e.t.m === 0);
  const nDay = Array.from({ length: spec.rounds }, (_, k) => taskAt(k)).filter(
    (t) => t === 'day',
  ).length;
  const out: CuckooRound[] = [];
  let clock = NOON;
  let sets = 0;
  let days = 0;
  for (let k = 0; k < spec.rounds; k++) {
    const task = taskAt(k);
    let target: Time;
    let day: DayEvent | null = null;
    if (task === 'day') {
      const i = days++;
      const n = pool.length;
      if (nDay <= n) {
        const lo = Math.floor((i * n) / nDay);
        const hi = Math.floor(((i + 1) * n) / nDay);
        day = pool[lo + Math.floor(rnd() * (hi - lo))]!;
      } else day = pool[i % n]!;
      target = day.t;
    } else {
      const m: 0 | 30 = task === 'set' && spec.half && sets++ % 3 !== 1 ? 30 : 0;
      const hours = Array.from({ length: task === 'read' ? 11 : 12 }, (_, i) => i + 1).filter(
        (h) => h !== clock.h,
      );
      target = { h: pick(hours, rnd), m };
    }
    const start = sameTime(target, clock) ? { h: hour12(target.h + 3), m: 0 as const } : clock;
    out.push({ task, target, start, day });
    clock = target;
  }
  return out;
}

// ─── Раскладка на экране ───
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface CuckooStage {
  land: boolean;
  /** Корпус часов (картинка целиком) и сколько под ним висят маятник и гирьки (px). */
  case: Box;
  hang: number;
  face: Face;
  /** Дверца кукушки (створки). */
  door: Box;
  /** Карточка режима дня (картинка мишки). */
  card: Box | null;
}

/** Корпус на картинке: ширина к высоте. */
export const CASE_ASPECT = 707 / 760;
/** Циферблат: x и r — доли ширины корпуса, y — доля высоты. */
export const FACE = { x: 0.4937, y: 0.6474, r: 0.238 };
/** Дверца кукушки: x, w — доли ширины; y, h — доли высоты. */
export const DOOR = { x: 0.441, y: 0.226, w: 0.124, h: 0.149 };
/**
 * Верх корпуса (доля высоты) на расстоянии d от середины циферблата — через каждые 0,025 ширины:
 * у самой середины — птичка на крыше, дальше — скаты крыши. Замерено по картинке.
 */
const ROOF = [
  0.004, 0.005, 0.021, 0.051, 0.132, 0.158, 0.168, 0.179, 0.196, 0.224, 0.237, 0.272, 0.286, 0.299,
  0.314, 0.347, 0.361, 0.379, 0.414, 0.43,
];
/** Верх корпуса не выше этого (с запасом: между замерами крыша только ниже). */
export const roofTop = (d: number) =>
  Math.abs(d) > 0.51 ? Infinity : ROOF[Math.min(ROOF.length - 1, Math.floor(Math.abs(d) / 0.025))]!;
/** Сверху кнопки «домой» и «послушать», стоя рядом с «домой» — сова; лёжа сова слева. */
export const OWL_RIGHT = 100;
export function obstacles(w: number, h: number): Box[] {
  const land = w > h;
  return [
    { x: 16, y: 16, w: 72, h: 72 },
    { x: w - 88, y: 16, w: 72, h: 72 },
    land ? { x: 16, y: 100, w: 72, h: 72 } : { x: 100, y: 16, w: 72, h: 72 },
  ];
}
/**
 * Маятник и гирьки висят под корпусом: не короче и не длиннее (доля высоты корпуса); лёжа
 * экран низкий — маятник покороче, зато циферблат крупнее.
 */
export const hangMin = (land: boolean) => (land ? 0.22 : 0.3);
const HANG_MAX = 0.55;

/** Корпус с левым краем x0 и шириной W: как высоко его можно поднять, не задев кнопки и сову. */
function topFor(x0: number, W: number, obs: readonly Box[], pad: number) {
  const H = W / CASE_ASPECT;
  const cx = x0 + FACE.x * W;
  let y0 = pad;
  for (const o of obs) {
    const a = o.x - 6;
    const b = o.x + o.w + 6;
    if (b <= x0 || a >= x0 + W) continue;
    const d = cx < a ? a - cx : cx > b ? cx - b : 0;
    y0 = Math.max(y0, o.y + o.h + 4 - roofTop(d / W) * H);
  }
  return y0;
}

/**
 * Где часы: как можно крупнее. Стоя — по середине, крыша поднимается между совой и кнопками,
 * карточка режима дня — внизу (маятник может уходить за неё). Лёжа — между совой и кнопкой
 * «послушать», карточка справа.
 */
export function stageFor(w: number, h: number, card: boolean): CuckooStage {
  const land = w > h;
  const pad = 8;
  const gap = 12;
  const obs = obstacles(w, h);
  let cardBox: Box | null = null;
  let left = pad;
  let right = w - pad;
  let bottom = h - pad;
  if (land) {
    left = OWL_RIGHT + pad;
    right = w - OWL_RIGHT - pad;
    if (card) {
      const c = Math.min(Math.max(h * 0.6, 112), 260, (right - left) * 0.4);
      cardBox = { x: right - c, y: (h - c) / 2, w: c, h: c };
      right = cardBox.x - gap;
    }
  } else if (card) {
    const c = Math.min(Math.max(h * 0.22, 112), 210);
    cardBox = { x: (w - c) / 2, y: h - pad - c, w: c, h: c };
    bottom = cardBox.y - gap;
  }
  const HANG_MIN = hangMin(land);
  const x0For = (W: number) => (left + right) / 2 - FACE.x * W;
  const fits = (W: number) => {
    const H = W / CASE_ASPECT;
    const y0 = topFor(x0For(W), W, obs, pad);
    // Маятник и гирьки — на экране; корпус не налезает на карточку (стоя маятник уходит за неё).
    return y0 + H * (1 + HANG_MIN) <= h - pad && y0 + H * (land ? 1 + HANG_MIN : 1) <= bottom;
  };
  let lo = 40;
  let hi = right - left;
  if (fits(hi)) lo = hi;
  else
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      if (fits(mid)) lo = mid;
      else hi = mid;
    }
  const W = lo;
  const H = W / CASE_ASPECT;
  const x0 = x0For(W);
  let y0 = topFor(x0, W, obs, pad);
  // Лишнее место — сначала маятнику подлиннее, остальное — поровну сверху и снизу.
  const free = Math.min(bottom, h - pad) - y0 - H * (1 + HANG_MIN);
  const hang = H * HANG_MIN + Math.max(0, Math.min(H * (HANG_MAX - HANG_MIN), free));
  y0 += Math.max(0, free - (hang - H * HANG_MIN)) / 2;
  return {
    land,
    case: { x: x0, y: y0, w: W, h: H },
    hang,
    face: { x: x0 + FACE.x * W, y: y0 + FACE.y * H, r: FACE.r * W },
    door: { x: x0 + DOOR.x * W, y: y0 + DOOR.y * H, w: DOOR.w * W, h: DOOR.h * H },
    card: cardBox,
  };
}

/** Верх корпуса на экране над точкой x (Infinity — корпуса там нет). */
export const caseTopAt = (st: CuckooStage, x: number) =>
  st.case.y + roofTop((x - st.face.x) / st.case.w) * st.case.h;

/** Глиняные картинки игры. */
export const cuckooSprites = () => [
  'cuckoo-case',
  'cuckoo-bird',
  'cuckoo-cone',
  'cuckoo-bob',
  'cuckoo-room-p',
  'cuckoo-room-l',
  ...DAY_IDS.map((id) => `cuckoo-day-${id}`),
];
