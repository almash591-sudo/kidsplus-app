// «Весы» (этап 57). На прилавке деревенской лавки — медные весы: коромысло на стойке, чаши на
// цепочках, стрелка над шкалой. Три задания: «какая чаша тяжелее» (весы стоят на подставках —
// ребёнок нажимает на тяжёлую чашу, подставки опускаются, и весы показывают), «уравновесь»
// (кладёт кубики или гирьки на пустую чашу, пока стрелка не встанет посередине) и «сложи»
// (одна гиря с прилавка — столько же, сколько две на другой чаше). Коромысло качается
// по-настоящему: пружина к своему наклону с затуханием, чаши — маятники. Всё — один canvas.
import { useEffect, useRef, useState } from 'react';
import { fx } from '../fx';
import {
  MORE_THAN,
  PLUS,
  SCALES_BALANCE_AGAIN,
  SCALES_COMPARE,
  SCALES_COMPARE_AGAIN,
  SCALES_COUNT,
  SCALES_END,
  SCALES_EVEN,
  SCALES_HEAVY,
  SCALES_LIGHT,
  SCALES_NUMBERS,
  SCALES_OVER,
  scalesBalance,
  scalesSum,
  scalesSumAgain,
  WILL_BE,
} from '../phrases';
import {
  afterSpeech,
  clayUrl,
  NUMBERS,
  praise,
  retry,
  say,
  setTask,
  type GameProps,
} from './common';
import {
  pileLayout,
  planScales,
  scalesSprites,
  tiltFor,
  total,
  type ScalesRound,
} from './scalesLogic';
import { dotsLayout } from './trainLogic';

type Phase = 'drop' | 'play' | 'done' | 'finish';
/** Кубик, башенка из кубиков («сложи» с кубиками) или гиря с точками/цифрой. */
type Form = 'cube' | 'tower' | 'weight';

// Всё в единицах U от оси коромысла (см. view).
/** Полкоромысла: от оси до крючка чаши. */
const B = 2;
/** Чаша: ширина и высота картинки, верх картинки — ниже крючка на столько. */
const PAN_W = 1.9;
const PAN_H = (PAN_W * 238) / 640;
const PAN_TOP = 1.3;
/** Низ чаши — от крючка. */
const PAN_BOTTOM = PAN_TOP + PAN_H;
/** Дно, где стоят грузы, и обод, где цепочки, — доли высоты картинки чаши. */
const FLOOR_K = 0.68;
const RIM_K = 0.42;
/** Стойка: высота картинки, ось — на этой доле сверху. */
const STAND_H = 3.62;
const STAND_W = (STAND_H * 440) / 640;
const KNOB_K = 0.06;
/** Прилавок — ниже оси на столько. */
const COUNTER = 3.35;
/** Шкала со стрелкой над осью. */
const DIAL_R = 1.15;
const NEEDLE = 1.05;
const DIAL_SPAN = 0.34;
/** Подставки под чашами («какая тяжелее»): полширины; внизу прячутся за прилавок. */
const POD_HALF = 0.55;
const POD_DOWN = COUNTER + 0.1;
/** Ширина к высоте: кубик и гиря; кружок на гире — середина и радиус в долях картинки. */
const CUBE_K = 283 / 300;
const WEIGHT_K = 276 / 360;
const PLATE_X = 0.489;
const PLATE_Y = 0.649;
const PLATE_R = 0.322;
const INK = '#3b2a1a';
/** Кубики: на левой чаше — красные и синие, свои (с прилавка) — зелёные. */
const RED = '#ef4444';
const BLUE = '#3b82f6';
const GREEN = '#22c55e';
const COLORS = ['#ef4444', '#facc15', '#3b82f6', '#22c55e', '#a855f7', '#fb923c'];
/** Сколько летит груз с прилавка на чашу и обратно, падает сверху, мс. */
const FLY = 480;
const BACK = 380;
const FALL = 420;
const DROP_STEP = 90;

/** Груз на чаше (или летит на неё). */
interface Item {
  v: number;
  form: Form;
  color: string;
  /** Откуда прилетел (px, низ посередине) — с прилавка или из пальца; нет — падает сверху. */
  from: { x: number; y: number; size: number } | null;
  at: number;
  dur: number;
  landed: boolean;
  /** Где лежит в чаше (px от середины дна) — плавно едет к своему месту в кучке. */
  lx: number;
  ly: number;
  /** С какого места прилавка — туда и вернётся. */
  tray: number;
}
/** Груз ушёл с чаши: лопается между заданиями или летит обратно на прилавок. */
interface Leaving {
  it: Item;
  x: number;
  y: number;
  size: number;
  at: number;
  kind: 'pop' | 'back';
}
/** Гирька на прилавке. «Уравновесь» — каждой сколько угодно, «сложи» — уходит на чашу. */
interface Piece {
  v: number;
  form: Form;
  color: string;
  used: boolean;
  /** Когда появилась (новая из запаса, вернулась) — «выпрыгивает». */
  at: number;
}
interface Drag {
  i: number;
  x: number;
  y: number;
  /** От пальца до низа груза. */
  ox: number;
  oy: number;
  sx: number;
  sy: number;
  moved: boolean;
}
interface Slot {
  x: number;
  /** Низ груза от дна чаши, px (вверх — минус). */
  y: number;
  size: number;
}
interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  life: number;
  age: number;
  color: string;
  kind: 'spark' | 'confetti';
  rot: number;
}

const ease = (k: number) => (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2);
const clamp01 = (k: number) => Math.max(0, Math.min(1, k));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** Башенка: до пяти — столбик, больше — по два в ряд. */
const colsOf = (v: number) => (v > 5 ? 2 : 1);
const rowsOf = (v: number) => Math.ceil(v / colsOf(v));
/** Ширина и высота груза, px: size — высота кубика/гири. */
const widthOf = (form: Form, v: number, size: number) =>
  form === 'weight' ? size * WEIGHT_K : form === 'cube' ? size * CUBE_K : colsOf(v) * size * CUBE_K;
const heightOf = (form: Form, v: number, size: number) =>
  form === 'tower' ? (rowsOf(v) - 1) * size * 0.94 + size : size;

export function Scales({ spec, phrases, onFinish }: GameProps<'scales'>) {
  const [rounds] = useState(() => planScales(spec));
  const [round, setRound] = useState(0);
  const [phase, setPhase] = useState<Phase>('drop');
  const root = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const hint = useRef<HTMLDivElement>(null);
  const target = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = root.current!;
    const cv = canvas.current!;
    const ctx = cv.getContext('2d')!;
    const img = new Map<string, HTMLImageElement>();
    for (const name of scalesSprites()) {
      const i = new Image();
      i.src = clayUrl(name);
      img.set(name, i);
    }
    const ok = (name: string) => {
      const i = img.get(name);
      return i && i.complete && i.naturalWidth > 0 ? i : undefined;
    };
    const font = getComputedStyle(el).fontFamily || 'sans-serif';

    let w = 0;
    let h = 0;
    let dpr = 1;
    const resize = () => {
      const box = el.getBoundingClientRect();
      w = box.width || window.innerWidth;
      h = box.height || window.innerHeight;
      dpr = Math.min(2, window.devicePixelRatio || 1);
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    const webdriver = navigator.webdriver;
    /** Часы игры, мс: идут только с кадрами — погашенный экран ставит игру на паузу. */
    let clock = 0;

    /** Пиксели на U, ось коромысла, прилавок, прилавок с гирьками — на этот кадр. */
    let U = 50;
    let land = true;
    let pivotX = 0;
    let pivotY = 0;
    let counterY = 0;
    /** Глубина столешницы, U: лёжа — узкая полоска, стоя — гирьки на ней перед весами. */
    let depth = 0.4;
    let trayCX = 0;
    let trayY = 0;
    const view = () => {
      land = w > h;
      if (land) {
        // Сверху — кнопка «Домой» и совёнок; весы слева, прилавок с гирьками справа.
        const top = 56;
        const avail = h - top - 10;
        U = Math.max(20, Math.min(avail / 5.3, w / 10.4, 120));
        pivotY = top + Math.max(0, avail - 5.3 * U) * 0.45 + 1.3 * U;
        pivotX = (w - 10.3 * U) / 2 + 3 * U;
        counterY = pivotY + COUNTER * U;
        depth = 0.4;
        trayCX = pivotX + 5.3 * U;
        trayY = counterY + 0.22 * U;
      } else {
        // Стоя: весы посередине, гирьки — перед ними на столешнице.
        const top = 100;
        const avail = h - top - 10;
        U = Math.max(20, Math.min((w - 24) / 6.1, avail / 7, 120));
        pivotY = top + Math.max(0, avail - 7 * U) * 0.4 + 1.3 * U;
        pivotX = w / 2;
        counterY = pivotY + COUNTER * U;
        depth = Math.max(2.1, Math.min(3.2, (h - counterY) / U - 1.2));
        trayCX = pivotX;
        trayY = counterY + (depth - 0.25) * U;
      }
    };
    view();

    const s = {
      round: 0,
      phase: 'drop' as Phase,
      phaseAt: 0,
      /** Что на чашах: 0 — левая, 1 — правая. */
      pans: [[], []] as Item[][],
      leaving: [] as Leaving[],
      tray: [] as Piece[],
      /** Высота кубика в башенках этого задания, U — одна на все: башенки можно сравнить. */
      towerC: 0.3,
      /** Коромысло: угол (плюс — правая ниже), скорость и ускорение. */
      theta: 0,
      omega: 0,
      /** Чаши-маятники: отклонение и скорость. */
      phi: [0, 0],
      phiV: [0, 0],
      /** Подставки: 1 — подняты и держат чаши, 0 — спрятаны за прилавком. */
      pod: 0,
      podTo: 0,
      wiggleAt: -1e9,
      lastLand: 0,
      /** Касания закрыты до (гирька возвращается после перевеса). */
      lockUntil: 0,
      wrong: 0,
      glowAt: -1e9,
      tapAt: [-1e9, -1e9],
      told: new Set<string>(),
      drag: null as Drag | null,
      timers: [] as { at: number; fn: () => void }[],
      particles: [] as Particle[],
      stopped: false,
      /** Сколько грузов легло на правую чашу за игру (для автотестов: только растёт). */
      puts: 0,
    };
    const go = (p: Phase) => {
      s.phase = p;
      s.phaseAt = clock;
      setPhase(p);
    };
    const later = (ms: number, fn: () => void) => s.timers.push({ at: clock + ms, fn });
    const cur = (): ScalesRound => rounds[s.round]!;
    const landed = (side: number) =>
      total(s.pans[side]!.filter((it) => it.landed).map((it) => it.v));
    const loaded = (side: number) => total(s.pans[side]!.map((it) => it.v));
    const flying = () => s.pans.some((p) => p.some((it) => !it.landed)) || s.leaving.length > 0;

    // ─── Картинки ───
    const tinted = new Map<string, HTMLCanvasElement>();
    const cubeImg = (color: string) => {
      const base = ok('scales-cube');
      if (!base) return undefined;
      let c = tinted.get(color);
      if (!c) {
        c = document.createElement('canvas');
        c.width = base.naturalWidth;
        c.height = base.naturalHeight;
        const x = c.getContext('2d')!;
        x.drawImage(base, 0, 0);
        x.globalCompositeOperation = 'multiply';
        x.fillStyle = color;
        x.fillRect(0, 0, c.width, c.height);
        x.globalCompositeOperation = 'destination-in';
        x.drawImage(base, 0, 0);
        tinted.set(color, c);
      }
      return c;
    };
    const drawCube = (x: number, bottom: number, size: number, color: string) => {
      const im = cubeImg(color);
      const wd = size * CUBE_K;
      if (im) return ctx.drawImage(im, x - wd / 2, bottom - size, wd, size);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.roundRect(x - wd / 2, bottom - size, wd, size, size * 0.18);
      ctx.fill();
    };
    const drawTower = (x: number, bottom: number, v: number, c: number, color: string) => {
      const cols = colsOf(v);
      const cw = c * CUBE_K;
      for (let k = 0; k < v; k++) {
        const row = Math.floor(k / cols);
        const inRow = Math.min(cols, v - row * cols);
        drawCube(x + ((k % cols) - (inRow - 1) / 2) * cw, bottom - row * c * 0.94, c, color);
      }
    };
    const digit = (num: number | string, x: number, y: number, px: number, color: string) => {
      ctx.font = `900 ${Math.round(px)}px ${font}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = color;
      ctx.fillText(String(num), x, y + px * 0.04);
    };
    /** Точки как на кубике: до шести — в квадрате size, дальше — два ряда, шире. */
    const drawDots = (x: number, y: number, size: number, num: number, color: string) => {
      const bw = num > 6 ? size * 1.75 : size;
      const r = num <= 6 ? size * 0.11 : bw * 0.06;
      ctx.fillStyle = color;
      for (const [dx, dy] of dotsLayout(num)) {
        ctx.beginPath();
        ctx.arc(x + (dx - 0.5) * bw, y + (dy - 0.5) * size, r, 0, Math.PI * 2);
        ctx.fill();
      }
    };
    /** Гиря: все одного размера — сколько весит, говорит только кружок (точки или цифра). */
    const drawWeight = (x: number, bottom: number, size: number, v: number) => {
      const im = ok('scales-weight');
      const wd = size * WEIGHT_K;
      if (im) ctx.drawImage(im, x - wd / 2, bottom - size, wd, size);
      else {
        ctx.fillStyle = '#3f3f46';
        ctx.beginPath();
        ctx.roundRect(x - wd / 2, bottom - size * 0.7, wd, size * 0.7, size * 0.2);
        ctx.fill();
        ctx.fillStyle = '#f5ecd4';
        ctx.beginPath();
        ctx.arc(x, bottom - size * (1 - PLATE_Y), wd * PLATE_R, 0, Math.PI * 2);
        ctx.fill();
      }
      const cx = x + (PLATE_X - 0.5) * wd;
      const cy = bottom - size * (1 - PLATE_Y);
      const r = wd * PLATE_R;
      if (spec.look === 'digits') digit(v, cx, cy, v >= 10 ? r * 1.05 : r * 1.4, INK);
      else drawDots(cx, cy, v > 6 ? r * 0.95 : r * 1.2, v, INK);
    };
    const drawThing = (
      form: Form,
      v: number,
      color: string,
      x: number,
      bottom: number,
      size: number,
    ) => {
      if (form === 'weight') drawWeight(x, bottom, size, v);
      else if (form === 'tower') drawTower(x, bottom, v, size, color);
      else drawCube(x, bottom, size, color);
    };
    /** Мягкое светлое пятно — подсказка «сюда». */
    const halo = (x: number, y: number, rx: number, ry: number, k: number) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(1, ry / rx);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
      g.addColorStop(0, `rgba(255,250,200,${0.9 * k})`);
      g.addColorStop(0.6, `rgba(255,250,200,${0.45 * k})`);
      g.addColorStop(1, 'rgba(255,250,200,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, rx, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    };
    const shadow = (x: number, y: number, rx: number, ry: number, a: number) => {
      ctx.fillStyle = `rgba(70,35,10,${a})`;
      ctx.beginPath();
      ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
    };

    // ─── Где что ───
    /** Угол коромысла на экране: после ошибки весы «дёргаются» на подставках. */
    const shownTheta = () => {
      const k = (clock - s.wiggleAt) / 700;
      return k < 0 || k > 1 ? s.theta : s.theta + 0.035 * Math.sin(k * 20) * (1 - k);
    };
    let hooks = [
      { x: 0, y: 0 },
      { x: 0, y: 0 },
    ];
    const placeHooks = () => {
      const th = shownTheta();
      hooks = [-1, 1].map((sg) => ({
        x: pivotX + sg * B * Math.cos(th) * U,
        y: pivotY + sg * B * Math.sin(th) * U,
      }));
    };
    /** Точка чаши (px от крючка, чаша висит прямо) — на экран, с качанием чаши. */
    const onPan = (side: number, lx: number, ly: number) => {
      const hk = hooks[side]!;
      const a = s.phi[side]!;
      return {
        x: hk.x + lx * Math.cos(a) - ly * Math.sin(a),
        y: hk.y + lx * Math.sin(a) + ly * Math.cos(a),
      };
    };
    const floorY = () => (PAN_TOP + FLOOR_K * PAN_H) * U;
    /** Середина чаши на экране — куда нажимать. */
    const panCenter = (side: number) => onPan(side, 0, (PAN_TOP + 0.35 * PAN_H) * U);
    const onPanHit = (side: number, p: { x: number; y: number }) => {
      const hk = hooks[side]!;
      return (
        Math.abs(p.x - hk.x) < 1.1 * U &&
        p.y > hk.y + (PAN_TOP - 1.8) * U &&
        p.y < Math.max(counterY, hk.y + (PAN_BOTTOM + 0.3) * U)
      );
    };
    /** Места грузов в чаше: кубики и много гирь — пирамидкой, до трёх гирь — рядком. */
    const slots = (items: Item[]): Slot[] => {
      const n = items.length;
      if (!n) return [];
      const form = items[0]!.form;
      if (form === 'tower') {
        const c = s.towerC * U;
        const ws = items.map((it) => widthOf('tower', it.v, c));
        const gap = 0.14 * U;
        let x = -(total(ws) + gap * (n - 1)) / 2;
        return ws.map((wd) => {
          const sl = { x: x + wd / 2, y: 0, size: c };
          x += wd + gap;
          return sl;
        });
      }
      if (form === 'weight' && n <= 3) {
        const size = [0.95, 0.8, 0.6][n - 1]! * U;
        const step = size * WEIGHT_K * 1.04;
        return items.map((_, i) => ({ x: (i - (n - 1) / 2) * step, y: 0, size }));
      }
      const pile = pileLayout(n);
      const rows = pile.at(-1)![1] + 1;
      const size = Math.min(form === 'cube' ? 0.36 : 0.48, 1.5 / rows) * U;
      const step = widthOf(form, 1, size) * 1.03;
      return pile.map(([px, row]) => ({ x: px * step, y: -row * size * 0.93, size }));
    };
    /** Подставки сейчас: 0…1 с плавным началом и концом. */
    const podLevel = () => ease(clamp01(s.pod));
    /** Верх подставки — от оси, U. */
    const podTop = () => lerp(POD_DOWN, PAN_BOTTOM, podLevel());

    /**
     * Гирьки на прилавке: размер (высота кубика/гири), низ посередине. Лёжа прилавок просторный,
     * а кубики на нём мелковаты для пальца — крупнее; к чаше летят и уменьшаются до её размера.
     */
    const traySize = (p: Piece) =>
      p.form === 'weight'
        ? (land ? 1 : 1.15) * U
        : (p.form === 'cube' ? 0.42 : s.towerC) * (land ? 1.35 : 1) * U;
    const trayAt = (i: number) => {
      const n = s.tray.length;
      const step = (land ? 1.25 : 1.6) * U;
      return { x: trayCX + (i - (n - 1) / 2) * step, y: trayY };
    };
    /** Рамка гирьки на прилавке (для касаний и подсказки): x, y — середина. */
    const trayBox = (i: number) => {
      const p = s.tray[i]!;
      const at = trayAt(i);
      const size = traySize(p);
      const wd = p.form === 'cube' ? size * CUBE_K * 2.1 : widthOf(p.form, p.v, size);
      const ht = p.form === 'cube' ? size * 1.9 : heightOf(p.form, p.v, size);
      return { x: at.x, y: at.y - ht / 2, w: Math.max(0.9 * U, wd + 0.2 * U), h: ht + 0.3 * U };
    };
    /** Откуда вылетает гирька с прилавка: из запаса кубиков — верхний. */
    const trayFrom = (i: number) => {
      const p = s.tray[i]!;
      const at = trayAt(i);
      const size = traySize(p);
      return p.form === 'cube'
        ? { x: at.x, y: at.y - size * 0.92, size }
        : { x: at.x, y: at.y, size };
    };

    // ─── Задания ───
    const prompt = (r: ScalesRound, again: boolean) =>
      r.kind === 'compare'
        ? again
          ? SCALES_COMPARE_AGAIN
          : SCALES_COMPARE
        : r.kind === 'balance'
          ? again
            ? SCALES_BALANCE_AGAIN
            : scalesBalance(spec.look)
          : again
            ? scalesSumAgain(spec.look)
            : scalesSum(spec.look);
    const cubes = spec.look === 'cubes';
    const make = (v: number, form: Form, color: string, at: number): Item => ({
      v,
      form,
      color,
      from: null,
      at,
      dur: FALL,
      landed: false,
      lx: 0,
      ly: 0,
      tray: -1,
    });
    /** Что падает на чаши в начале задания: кубики по одному, гири — целиком. */
    const loads = (r: ScalesRound): [number, Form, string][][] => {
      if (r.kind === 'compare')
        return cubes
          ? [
              Array.from({ length: r.left }, () => [1, 'cube', RED]),
              Array.from({ length: r.right }, () => [1, 'cube', BLUE]),
            ]
          : [[[r.left, 'weight', INK]], [[r.right, 'weight', INK]]];
      if (r.kind === 'balance')
        return [
          cubes
            ? Array.from({ length: r.target }, () => [1, 'cube', RED])
            : [[r.target, 'weight', INK]],
          [],
        ];
      return [
        cubes
          ? [
              [r.left[0], 'tower', RED],
              [r.left[1], 'tower', BLUE],
            ]
          : r.left.map((v) => [v, 'weight', INK]),
        [],
      ];
    };
    const start = (k: number) => {
      s.round = k;
      setRound(k);
      const r = rounds[k]!;
      s.wrong = 0;
      s.glowAt = -1e9;
      s.lockUntil = 0;
      s.podTo = r.kind === 'compare' ? 1 : 0;
      if (r.kind === 'sum') {
        const rows = Math.max(...[...r.left, ...r.choices].map(rowsOf));
        s.towerC = Math.min(0.3, 1.45 / rows);
      }
      s.tray =
        r.kind === 'balance'
          ? r.pieces.map((v) => ({
              v,
              form: cubes ? 'cube' : 'weight',
              color: GREEN,
              used: false,
              at: clock,
            }))
          : r.kind === 'sum'
            ? r.choices.map((v) => ({
                v,
                form: cubes ? 'tower' : 'weight',
                color: GREEN,
                used: false,
                at: clock,
              }))
            : [];
      // Подставки сначала встают (или прячутся), потом грузы падают — левая чаша первой.
      let t = clock + (r.kind === 'compare' ? 350 : 150);
      s.pans = loads(r).map((side) =>
        side.map(([v, form, color]) => {
          const it = make(v, form, color, t);
          t += form === 'cube' ? DROP_STEP : DROP_STEP * 2.5;
          return it;
        }),
      );
      go('drop');
      const again = s.told.has(r.kind);
      s.told.add(r.kind);
      void say(prompt(r, again));
    };

    const burst = (x: number, y: number, count: number, colors?: string[]) => {
      for (let i = 0; i < count; i++) {
        const a = Math.random() * Math.PI * 2;
        const v = 120 + Math.random() * 260;
        s.particles.push({
          x,
          y,
          vx: Math.cos(a) * v,
          vy: Math.sin(a) * v - 60,
          r: 4 + Math.random() * 4,
          life: 0.9,
          age: 0,
          color: colors ? colors[i % colors.length]! : i % 3 ? '#ffe14d' : '#fff',
          kind: 'spark',
          rot: Math.random() * 6,
        });
      }
    };
    const confetti = () => {
      for (let i = 0; i < 110; i++) {
        const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4;
        const v = 320 + Math.random() * 520;
        s.particles.push({
          x: w * (0.15 + Math.random() * 0.7),
          y: h * 0.85,
          vx: Math.cos(a) * v,
          vy: Math.sin(a) * v,
          r: 5 + Math.random() * 5,
          life: 2.8,
          age: 0,
          color: COLORS[i % COLORS.length]!,
          kind: 'confetti',
          rot: Math.random() * 6,
        });
      }
    };

    /** Где груз на экране сейчас (низ посередине) и какого размера. */
    const itemAt = (it: Item, side: number, sl: Slot) => {
      const to = onPan(side, sl.x, floorY() + sl.y);
      if (it.landed) {
        const p = onPan(side, it.lx, floorY() + it.ly);
        return { x: p.x, y: p.y, size: sl.size };
      }
      const k = clamp01((clock - it.at) / it.dur);
      if (!it.from) return { x: to.x, y: lerp(-1.5 * sl.size, to.y, k * k), size: sl.size };
      const e = ease(k);
      return {
        x: lerp(it.from.x, to.x, e),
        y: lerp(it.from.y, to.y, e) - Math.sin(Math.PI * k) * 1.4 * U,
        size: lerp(it.from.size, sl.size, e),
      };
    };
    /** Снять груз с чаши: обратно на прилавок (летит) или лопнуть. */
    const takeOff = (side: number, idx: number, kind: Leaving['kind']) => {
      const list = s.pans[side]!;
      const sl = slots(list);
      const it = list[idx]!;
      const p = itemAt(it, side, sl[idx]!);
      list.splice(idx, 1);
      s.leaving.push({ it, x: p.x, y: p.y, size: p.size, at: clock, kind });
      if (kind === 'pop') burst(p.x, p.y - p.size / 2, 3);
    };

    const complete = (answer: string[]) => {
      go('done');
      fx.sparkle();
      for (const side of [0, 1]) {
        const c = panCenter(side);
        burst(c.x, c.y, 10);
      }
      const k = s.round;
      const last = k + 1 >= rounds.length;
      void afterSpeech(praise(phrases, undefined, answer), 2200).then(() => {
        if (s.stopped || s.round !== k) return;
        if (!last) {
          // Грузы лопаются с искрами, весы выпрямляются — и следующее задание.
          for (const side of [0, 1])
            for (let i = s.pans[side]!.length - 1; i >= 0; i--) takeOff(side, i, 'pop');
          s.tray = [];
          fx.pop();
          later(550, () => start(k + 1));
          return;
        }
        confetti();
        go('finish');
        void afterSpeech(say(SCALES_END), 2600).then(() => {
          if (!s.stopped) onFinish();
        });
      });
    };
    const mistake = () => {
      s.wrong++;
    };

    /** Груз лёг на чашу: звон, чаша качнулась; в игре — проверить, что вышло. */
    const landOn = (it: Item, side: number, sl: Slot) => {
      it.landed = true;
      it.lx = sl.x;
      it.ly = sl.y;
      s.lastLand = clock;
      if (it.form === 'weight') fx.clink(it.v);
      else fx.knock();
      s.phiV[side] = s.phiV[side]! + (Math.random() < 0.5 ? -0.5 : 0.5) * (1 - podLevel());
      if (s.phase !== 'play' || side !== 1) return;
      s.puts++;
      const r = cur();
      if (r.kind === 'balance') {
        const sum = landed(1);
        if (sum === r.target) {
          go('done');
          void afterSpeech(say(`${NUMBERS[sum]!}!`, SCALES_EVEN), 900).then(() => {
            if (!s.stopped && s.round === rounds.indexOf(r)) complete([]);
          });
          return;
        }
        if (sum > r.target) {
          // Перевесило: «ой», и последняя гирька сама возвращается на прилавок.
          mistake();
          s.lockUntil = clock + 1500;
          void retry(phrases).then(() => say(SCALES_OVER));
          later(1100, () => {
            const list = s.pans[1]!;
            if (s.phase === 'play' && list.length) takeOff(1, list.length - 1, 'back');
          });
          return;
        }
        void say(`${NUMBERS[sum]!}!`);
        return;
      }
      if (r.kind === 'sum') {
        const need = r.left[0] + r.left[1];
        if (it.v === need) {
          complete([NUMBERS[r.left[0]]!, PLUS, NUMBERS[r.left[1]]!, WILL_BE, `${NUMBERS[need]!}!`]);
          return;
        }
        // Весы сначала показывают, куда перевесило, — потом «легковато» или «тяжеловато».
        mistake();
        s.lockUntil = clock + 1500;
        later(600, () => {
          if (s.stopped) return;
          void retry(phrases).then(() => say(it.v < need ? SCALES_LIGHT : SCALES_HEAVY));
        });
        later(1300, () => {
          const list = s.pans[1]!;
          if (s.phase === 'play' && list.length) takeOff(1, list.length - 1, 'back');
        });
      }
    };

    /** «Какая тяжелее»: нажали на чашу. */
    const answer = (side: number) => {
      const r = cur();
      if (r.kind !== 'compare') return;
      const heavy = r.left > r.right ? 0 : 1;
      s.tapAt[side] = clock;
      if (side === heavy) {
        s.podTo = 0;
        fx.whoosh();
        const big = Math.max(r.left, r.right);
        const small = Math.min(r.left, r.right);
        complete([NUMBERS[big]!, MORE_THAN, NUMBERS[small]!]);
        return;
      }
      mistake();
      s.wiggleAt = clock;
      void retry(phrases).then(() => say(spec.look === 'digits' ? SCALES_NUMBERS : SCALES_COUNT));
    };
    /** Отправить гирьку с прилавка на правую чашу (from — откуда летит, px). */
    const send = (i: number, from: { x: number; y: number; size: number }) => {
      const p = s.tray[i]!;
      const r = cur();
      const it = make(p.v, p.form === 'cube' ? 'cube' : p.form, p.color, clock);
      it.from = from;
      it.dur = FLY;
      it.tray = i;
      s.pans[1]!.push(it);
      if (r.kind === 'sum') p.used = true;
      else p.at = clock;
      fx.whoosh();
    };
    /** Можно ли сейчас брать гирьки с прилавка. */
    const canSend = () => {
      const r = cur();
      if (s.phase !== 'play' || clock < s.lockUntil || flying()) return false;
      return r.kind === 'balance' || (r.kind === 'sum' && s.pans[1]!.length === 0);
    };
    /** Что сейчас подсказать: тяжёлая чаша, нужная гирька на прилавке. */
    const bestPiece = () => {
      const r = cur();
      if (r.kind === 'sum') {
        const need = r.left[0] + r.left[1];
        return s.tray.findIndex((p) => p.v === need && !p.used);
      }
      if (r.kind !== 'balance') return -1;
      const rem = r.target - loaded(1);
      let best = -1;
      s.tray.forEach((p, i) => {
        if (p.v <= rem && (best < 0 || p.v > s.tray[best]!.v)) best = i;
      });
      return best;
    };

    /** «Ушко» и подсказка при бездействии: задание ещё раз, нужное светится. */
    const remind = () => {
      s.glowAt = clock;
      return say(prompt(cur(), false));
    };
    setTask(remind);

    // ─── Рисование ───
    const drawBack = () => {
      ctx.fillStyle = '#e9b77a';
      ctx.fillRect(0, 0, w, h);
      const im = ok(land ? 'scales-bg-l' : 'scales-bg-p');
      if (!im) return;
      const k = Math.max(w / im.naturalWidth, h / im.naturalHeight);
      const dw = im.naturalWidth * k;
      const dh = im.naturalHeight * k;
      ctx.drawImage(im, (w - dw) / 2, (h - dh) * 0.35, dw, dh);
    };
    const drawCounter = () => {
      const D = depth * U;
      const lip = 0.14 * U;
      const g = ctx.createLinearGradient(0, counterY, 0, counterY + D);
      g.addColorStop(0, '#c98b52');
      g.addColorStop(1, '#e7b47b');
      ctx.fillStyle = g;
      ctx.fillRect(0, counterY, w, D);
      // Доски столешницы и тень от стены.
      ctx.strokeStyle = 'rgba(110,60,25,0.2)';
      ctx.lineWidth = Math.max(1, U * 0.025);
      const planks = Math.max(1, Math.round(depth / 0.7));
      for (let i = 1; i <= planks; i++) {
        const y = counterY + (D * i) / (planks + 1);
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }
      for (let i = 0; i < planks + 1; i++) {
        const y0 = counterY + (D * i) / (planks + 1);
        const y1 = counterY + (D * (i + 1)) / (planks + 1);
        for (let x = ((i * 1.7) % 2.6) * U; x < w; x += 2.6 * U) {
          ctx.beginPath();
          ctx.moveTo(x, y0);
          ctx.lineTo(x, y1);
          ctx.stroke();
        }
      }
      const sh = ctx.createLinearGradient(0, counterY, 0, counterY + 0.2 * U);
      sh.addColorStop(0, 'rgba(80,40,15,0.35)');
      sh.addColorStop(1, 'rgba(80,40,15,0)');
      ctx.fillStyle = sh;
      ctx.fillRect(0, counterY, w, 0.2 * U);
      // Край столешницы и передняя стенка с филёнками.
      const lg = ctx.createLinearGradient(0, counterY + D, 0, counterY + D + lip);
      lg.addColorStop(0, '#f3c690');
      lg.addColorStop(1, '#b06f37');
      ctx.fillStyle = lg;
      ctx.fillRect(0, counterY + D, w, lip);
      const top = counterY + D + lip;
      if (top >= h) return;
      ctx.fillStyle = '#9c5b2a';
      ctx.fillRect(0, top, w, h - top);
      ctx.fillStyle = 'rgba(60,25,5,0.3)';
      ctx.fillRect(0, top, w, Math.max(2, 0.06 * U));
      const ph = h - top - 0.5 * U;
      if (ph > 0.6 * U) {
        const pw = 2.4 * U;
        const n = Math.ceil(w / pw) + 1;
        const x0 = (w - n * pw) / 2;
        ctx.lineWidth = Math.max(2, 0.05 * U);
        for (let i = 0; i < n; i++) {
          const x = x0 + i * pw + 0.2 * U;
          ctx.strokeStyle = 'rgba(60,25,5,0.35)';
          ctx.beginPath();
          ctx.roundRect(x, top + 0.25 * U, pw - 0.4 * U, ph, 0.15 * U);
          ctx.stroke();
          ctx.strokeStyle = 'rgba(255,220,170,0.18)';
          ctx.beginPath();
          ctx.roundRect(x + 2, top + 0.25 * U + 2, pw - 0.4 * U, ph, 0.15 * U);
          ctx.stroke();
        }
      }
    };
    const drawPodium = (side: number) => {
      const top = pivotY + podTop() * U;
      if (top >= counterY) return;
      const x = pivotX + (side ? 1 : -1) * B * U;
      const hw = POD_HALF * U;
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, w, counterY + 0.04 * U);
      ctx.clip();
      const g = ctx.createLinearGradient(x - hw, 0, x + hw, 0);
      g.addColorStop(0, '#9a5a26');
      g.addColorStop(0.45, '#d89a58');
      g.addColorStop(1, '#8f5222');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.roundRect(x - hw, top, 2 * hw, counterY - top + 0.1 * U, [0.1 * U, 0.1 * U, 0, 0]);
      ctx.fill();
      ctx.fillStyle = '#f2c78f';
      ctx.beginPath();
      ctx.roundRect(x - hw, top, 2 * hw, 0.1 * U, 0.05 * U);
      ctx.fill();
      ctx.strokeStyle = 'rgba(90,45,15,0.3)';
      ctx.lineWidth = Math.max(1, U * 0.02);
      for (const dx of [-0.25, 0.12, 0.33]) {
        ctx.beginPath();
        ctx.moveTo(x + dx * hw * 2, top + 0.2 * U);
        ctx.lineTo(x + dx * hw * 2, counterY);
        ctx.stroke();
      }
      ctx.restore();
    };
    const drawDial = (balanced: boolean) => {
      const R = DIAL_R * U;
      ctx.save();
      ctx.translate(pivotX, pivotY);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, R, -Math.PI / 2 - 0.56, -Math.PI / 2 + 0.56);
      ctx.closePath();
      ctx.fillStyle = '#fff7e6';
      ctx.fill();
      ctx.strokeStyle = '#b7791f';
      ctx.lineWidth = 0.07 * U;
      ctx.lineJoin = 'round';
      ctx.stroke();
      ctx.lineCap = 'round';
      for (let a = -0.3; a <= 0.301; a += 0.1) {
        const mid = Math.abs(a) < 0.01;
        const r0 = (mid ? 0.66 : 0.8) * R;
        const r1 = 0.94 * R;
        ctx.strokeStyle = mid ? (balanced ? '#16a34a' : '#6b7280') : 'rgba(107,114,128,0.7)';
        ctx.lineWidth = (mid ? 0.09 : 0.045) * U;
        ctx.beginPath();
        ctx.moveTo(Math.sin(a) * r0, -Math.cos(a) * r0);
        ctx.lineTo(Math.sin(a) * r1, -Math.cos(a) * r1);
        ctx.stroke();
      }
      // Дуга шкалы, по краям — «тяжелее» красноватым.
      ctx.lineWidth = 0.05 * U;
      ctx.strokeStyle = 'rgba(180,120,60,0.45)';
      ctx.beginPath();
      ctx.arc(0, 0, 0.98 * R, -Math.PI / 2 - DIAL_SPAN, -Math.PI / 2 + DIAL_SPAN);
      ctx.stroke();
      if (balanced) halo(0, -0.8 * R, 0.5 * R, 0.5 * R, 0.8);
      ctx.restore();
    };
    const drawStand = () => {
      shadow(pivotX, pivotY + (STAND_H * (1 - KNOB_K) - 0.05) * U, 1.25 * U, 0.13 * U, 0.3);
      const im = ok('scales-stand');
      const top = pivotY - KNOB_K * STAND_H * U;
      if (im) ctx.drawImage(im, pivotX - (STAND_W * U) / 2, top, STAND_W * U, STAND_H * U);
      else {
        ctx.fillStyle = '#d4a017';
        ctx.fillRect(pivotX - 0.12 * U, pivotY, 0.24 * U, 3 * U);
        ctx.fillStyle = '#a0522d';
        ctx.fillRect(pivotX - 1.2 * U, pivotY + 2.9 * U, 2.4 * U, 0.5 * U);
      }
    };
    const drawNeedle = (th: number) => {
      ctx.save();
      ctx.translate(pivotX, pivotY);
      ctx.rotate(th);
      ctx.beginPath();
      ctx.moveTo(-0.075 * U, 0);
      ctx.lineTo(0, -NEEDLE * U);
      ctx.lineTo(0.075 * U, 0);
      ctx.closePath();
      ctx.fillStyle = '#dc2626';
      ctx.fill();
      ctx.strokeStyle = '#7f1d1d';
      ctx.lineWidth = Math.max(1, 0.025 * U);
      ctx.lineJoin = 'round';
      ctx.stroke();
      ctx.restore();
    };
    const brass = (y0: number, y1: number) => {
      const g = ctx.createLinearGradient(0, y0, 0, y1);
      g.addColorStop(0, '#fde68a');
      g.addColorStop(0.45, '#e0a923');
      g.addColorStop(1, '#9a5d08');
      return g;
    };
    const drawBeam = (th: number) => {
      const t = 0.17 * U;
      const L = (B + 0.1) * U;
      ctx.save();
      ctx.translate(pivotX, pivotY);
      ctx.rotate(th);
      ctx.fillStyle = brass(-t / 2, t / 2);
      ctx.strokeStyle = '#7c4a03';
      ctx.lineWidth = Math.max(1, 0.025 * U);
      ctx.beginPath();
      ctx.roundRect(-L, -t / 2, 2 * L, t, t / 2);
      ctx.fill();
      ctx.stroke();
      // Узор посередине и шарики на концах — там висят чаши.
      ctx.beginPath();
      ctx.moveTo(-0.45 * U, 0);
      ctx.quadraticCurveTo(0, -0.34 * U, 0.45 * U, 0);
      ctx.quadraticCurveTo(0, 0.18 * U, -0.45 * U, 0);
      ctx.fill();
      ctx.stroke();
      for (const sg of [-1, 1]) {
        ctx.fillStyle = brass(-0.12 * U, 0.12 * U);
        ctx.beginPath();
        ctx.arc(sg * B * U, 0, 0.12 * U, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      ctx.fillStyle = brass(-0.15 * U, 0.15 * U);
      ctx.beginPath();
      ctx.arc(0, 0, 0.15 * U, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.beginPath();
      ctx.arc(-0.05 * U, -0.05 * U, 0.045 * U, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    };
    const chain = (x0: number, y0: number, x1: number, y1: number) => {
      ctx.lineCap = 'round';
      ctx.setLineDash([0.03 * U, 0.075 * U]);
      ctx.strokeStyle = '#7c4a03';
      ctx.lineWidth = 0.07 * U;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
      ctx.strokeStyle = '#f4c542';
      ctx.lineWidth = 0.04 * U;
      ctx.stroke();
      ctx.setLineDash([]);
    };
    /** Чаша с цепочками и всем, что в ней лежит; качается вокруг крючка. */
    const drawPan = (side: number) => {
      const hk = hooks[side]!;
      const list = s.pans[side]!;
      const sl = slots(list);
      const PW = PAN_W * U;
      const PH = PAN_H * U;
      const top = PAN_TOP * U;
      const rimY = top + RIM_K * PH;
      ctx.save();
      ctx.translate(hk.x, hk.y);
      ctx.rotate(s.phi[side]!);
      chain(0, 0, 0, top + 0.05 * PH);
      chain(0, 0, -0.47 * PW, rimY);
      chain(0, 0, 0.47 * PW, rimY);
      const im = ok('scales-pan');
      const drawDish = () => {
        if (im) ctx.drawImage(im, -PW / 2, top, PW, PH);
        else {
          ctx.fillStyle = '#e0a923';
          ctx.beginPath();
          ctx.ellipse(0, top + PH * 0.45, PW / 2, PH * 0.45, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      };
      drawDish();
      list.forEach((it, i) => {
        if (!it.landed) return;
        drawThing(it.form, it.v, it.color, it.lx, floorY() + it.ly, sl[i]!.size);
      });
      // Передний край чаши — поверх грузов: они лежат в ней, а не на ней.
      ctx.save();
      ctx.beginPath();
      const cy = top + RIM_K * PH;
      ctx.moveTo(-PW / 2 - 2, cy);
      ctx.lineTo(-0.47 * PW, cy);
      ctx.ellipse(0, cy, 0.47 * PW, 0.28 * PH, 0, Math.PI, 0, true);
      ctx.lineTo(PW / 2 + 2, cy);
      ctx.lineTo(PW / 2 + 2, top + PH + 2);
      ctx.lineTo(-PW / 2 - 2, top + PH + 2);
      ctx.closePath();
      ctx.clip();
      drawDish();
      ctx.restore();
      ctx.restore();
    };
    /** Гирьки на прилавке; запас кубиков — горкой из трёх. */
    const drawTray = (help: number, glow: number) => {
      s.tray.forEach((p, i) => {
        if (p.used || (s.drag?.i === i && p.form !== 'cube' && cur().kind === 'sum')) return;
        const at = trayAt(i);
        const size = traySize(p);
        const k = clamp01((clock - p.at) / 260);
        const pop =
          k < 1 ? 0.6 + 0.4 * Math.sin((k * Math.PI) / 2) + 0.12 * Math.sin(k * Math.PI) : 1;
        const wd = p.form === 'cube' ? size * CUBE_K * 2 : widthOf(p.form, p.v, size);
        shadow(at.x, at.y, wd * 0.55, 0.09 * U, 0.28);
        if (i === help && glow > 0) {
          const b = trayBox(i);
          halo(b.x, b.y, b.w * 0.9, b.h * 0.7, glow);
        }
        ctx.save();
        ctx.translate(at.x, at.y);
        ctx.scale(pop, pop);
        if (p.form === 'cube') {
          const cw = size * CUBE_K * 1.02;
          drawCube(-cw / 2, 0, size, p.color);
          drawCube(cw / 2, 0, size, p.color);
          drawCube(0, -size * 0.92, size, p.color);
        } else drawThing(p.form, p.v, p.color, 0, 0, size);
        ctx.restore();
      });
    };

    // ─── Кадр ───
    let raf = 0;
    let last = performance.now();
    let frameNo = 0;
    const frame = (raw: number) => {
      const gap = Math.max(0, raw - last);
      const dt = Math.min(0.05, gap / 1000);
      last = raw;
      clock += Math.min(gap, 250);
      frameNo++;
      view();
      const r = cur();

      const due = s.timers.filter((t) => t.at <= clock);
      if (due.length) {
        s.timers = s.timers.filter((t) => t.at > clock);
        for (const t of due) if (!s.stopped) t.fn();
      }

      // Подставки встают и прячутся за треть секунды.
      s.pod += Math.sign(s.podTo - s.pod) * Math.min(Math.abs(s.podTo - s.pod), dt / 0.3);

      // ─── Коромысло: пружина к своему наклону; подставки не дают чаше опуститься ───
      const want = tiltFor(landed(0), landed(1));
      const lim = Math.asin(Math.min(1, ((podTop() - PAN_BOTTOM) * 1) / B));
      const steps = Math.max(1, Math.ceil(dt * 120));
      const k = dt / steps;
      for (let i = 0; i < steps; i++) {
        const acc = 30 * (want - s.theta) - 3.5 * s.omega;
        s.omega += acc * k;
        s.theta += s.omega * k;
        if (s.theta > lim) {
          s.theta = lim;
          if (s.omega > 0) s.omega = 0;
        } else if (s.theta < -lim) {
          s.theta = -lim;
          if (s.omega < 0) s.omega = 0;
        }
        for (const side of [0, 1]) {
          const pa = -16 * s.phi[side]! - 1.2 * s.phiV[side]! - 0.15 * acc;
          s.phiV[side] = s.phiV[side]! + pa * k;
          s.phi[side] = Math.max(-0.25, Math.min(0.25, s.phi[side]! + s.phiV[side]! * k));
        }
      }
      placeHooks();
      const th = shownTheta();

      // ─── Грузы: падают и прилетают, в чаше едут к своему месту ───
      for (const side of [0, 1]) {
        const list = s.pans[side]!;
        const sl = slots(list);
        list.forEach((it, i) => {
          const to = sl[i]!;
          if (!it.landed && clock >= it.at + it.dur) landOn(it, side, to);
          else if (it.landed) {
            const f = Math.min(1, dt * 10);
            it.lx += (to.x - it.lx) * f;
            it.ly += (to.y - it.ly) * f;
          }
        });
      }
      if (
        s.phase === 'drop' &&
        s.pans.every((p) => p.every((it) => it.landed)) &&
        clock - s.lastLand > 280 &&
        s.pod === s.podTo
      )
        go('play');

      // ─── Что подсказать ───
      const helpPan = r.kind === 'compare' ? (r.left > r.right ? 0 : 1) : -1;
      const helpPiece = r.kind === 'compare' ? -1 : bestPiece();
      const sinceGlow = (clock - s.glowAt) / 1000;
      const glow =
        s.phase !== 'play'
          ? 0
          : Math.max(
              s.wrong >= 2 ? 0.55 + 0.35 * Math.sin(clock / 180) : 0,
              sinceGlow < 1.8 ? 0.5 + 0.4 * Math.sin(sinceGlow * 9) : 0,
            );

      // ─── Сцена ───
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawBack();
      drawCounter();
      for (const side of [0, 1]) {
        const hk = hooks[side]!;
        const low = (hk.y + PAN_BOTTOM * U - pivotY) / U;
        shadow(
          hk.x,
          counterY + Math.min(0.3, depth * 0.5) * U,
          0.75 * U,
          0.08 * U,
          0.06 + 0.05 * low,
        );
      }
      drawPodium(0);
      drawPodium(1);
      const balanced =
        r.kind !== 'compare' &&
        landed(0) > 0 &&
        landed(0) === landed(1) &&
        Math.abs(s.theta) < 0.02;
      drawDial(balanced);
      drawStand();
      drawNeedle(th);
      if (helpPan >= 0 && glow > 0) {
        const c = panCenter(helpPan);
        halo(c.x, c.y, 1.3 * U, 0.9 * U, glow);
      }
      for (const side of [0, 1]) {
        const tap = (clock - s.tapAt[side]!) / 300;
        if (tap >= 0 && tap < 1) {
          const c = panCenter(side);
          halo(c.x, c.y, 1.2 * U, 0.8 * U, 0.6 * (1 - tap));
        }
        drawPan(side);
      }
      drawBeam(th);
      drawTray(helpPiece, glow);

      // Летят на чаши, с чаш и в пальце — поверх всего.
      for (const side of [0, 1]) {
        const list = s.pans[side]!;
        const sl = slots(list);
        list.forEach((it, i) => {
          if (it.landed || clock < it.at) return;
          const p = itemAt(it, side, sl[i]!);
          drawThing(it.form, it.v, it.color, p.x, p.y, p.size);
        });
      }
      s.leaving = s.leaving.filter((lv) => {
        const k = (clock - lv.at) / (lv.kind === 'pop' ? 240 : BACK);
        if (k >= 1) {
          if (lv.kind === 'back' && lv.it.tray >= 0) {
            const p = s.tray[lv.it.tray];
            if (p) {
              p.used = false;
              p.at = clock;
            }
          }
          return false;
        }
        if (lv.kind === 'pop') {
          ctx.save();
          ctx.globalAlpha = 1 - k;
          ctx.translate(lv.x, lv.y - (lv.size * k) / 2);
          ctx.scale(1 + 0.3 * k, 1 + 0.3 * k);
          drawThing(lv.it.form, lv.it.v, lv.it.color, 0, 0, lv.size);
          ctx.restore();
          return true;
        }
        const p = s.tray[lv.it.tray];
        const to = p ? trayFrom(lv.it.tray) : { x: lv.x, y: h + lv.size * 2, size: lv.size };
        const e = ease(k);
        drawThing(
          lv.it.form,
          lv.it.v,
          lv.it.color,
          lerp(lv.x, to.x, e),
          lerp(lv.y, to.y, e) - Math.sin(Math.PI * k) * 0.9 * U,
          lerp(lv.size, to.size, e),
        );
        return true;
      });
      const d = s.drag;
      if (d && d.moved) {
        const p = s.tray[d.i]!;
        const size = traySize(p);
        drawThing(p.form, p.v, p.color, d.x + d.ox, d.y + d.oy, size);
      }

      // ─── Искры и конфетти ───
      for (const p of s.particles) {
        p.age += dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.rot += dt * 6;
        if (p.kind === 'confetti') {
          p.vx *= 1 - dt * 1.2;
          p.vy = p.vy * (1 - dt * 1.2) + 420 * dt;
        } else {
          p.vx *= 1 - dt * 2.2;
          p.vy *= 1 - dt * 2.2;
        }
        ctx.globalAlpha = Math.min(1, (1 - p.age / p.life) * 1.5);
        ctx.fillStyle = p.color;
        if (p.kind === 'confetti') {
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.fillRect(-p.r, -p.r * 0.4, p.r * 2, p.r * 0.8);
          ctx.restore();
        } else {
          ctx.beginPath();
          for (let q = 0; q < 10; q++) {
            const a = (q * Math.PI) / 5 + p.rot;
            const rr = q % 2 ? p.r * 0.45 : p.r;
            ctx.lineTo(p.x + Math.cos(a) * rr, p.y + Math.sin(a) * rr);
          }
          ctx.closePath();
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
      s.particles = s.particles.filter((p) => p.age < p.life);

      // Палец подсказки (IdleHint): на тяжёлую чашу / от нужной гирьки к пустой чаше.
      if (frameNo % 6 === 0 && hint.current && target.current) {
        const hs = hint.current.style;
        const ts = target.current.style;
        const place = (st: CSSStyleDeclaration, x: number, y: number, bw: number, bh: number) => {
          st.display = 'block';
          st.left = `${x - bw / 2}px`;
          st.top = `${y - bh / 2}px`;
          st.width = `${bw}px`;
          st.height = `${bh}px`;
        };
        hs.display = 'none';
        ts.display = 'none';
        if (s.phase === 'play') {
          if (helpPan >= 0) {
            const c = panCenter(helpPan);
            place(hs, c.x, c.y, PAN_W * U * 0.7, 0.9 * U);
          } else if (helpPiece >= 0 && canSend()) {
            const b = trayBox(helpPiece);
            const c = panCenter(1);
            place(hs, b.x, b.y, b.w * 0.7, b.h * 0.7);
            place(ts, c.x, c.y, PAN_W * U * 0.6, 0.8 * U);
          }
        }
      }
      // Для автотестов — каждый кадр.
      if (webdriver) {
        el.dataset.kind = r.kind;
        el.dataset.left = String(landed(0));
        el.dataset.right = String(landed(1));
        el.dataset.puts = String(s.puts);
        el.dataset.busy = flying() || clock < s.lockUntil || s.drag ? '1' : '0';
        el.dataset.pans = JSON.stringify(
          [0, 1].map((side) => {
            const c = panCenter(side);
            return { x: Math.round(c.x), y: Math.round(c.y), total: landed(side) };
          }),
        );
        el.dataset.tray = JSON.stringify(
          s.tray.map((p, i) => {
            const b = trayBox(i);
            return { v: p.v, x: Math.round(b.x), y: Math.round(b.y), used: p.used };
          }),
        );
      }
      raf = requestAnimationFrame(frame);
    };

    // ─── Касания: нажать на чашу, бросить гирьку на чашу ───
    const at = (e: PointerEvent) => {
      const box = el.getBoundingClientRect();
      return { x: e.clientX - box.left, y: e.clientY - box.top };
    };
    const down = (e: PointerEvent) => {
      if ((e.target as Element).closest('.corner-button')) return;
      if (s.drag || s.phase !== 'play') return;
      const p = at(e);
      const r = cur();
      if (r.kind === 'compare') {
        const side = [0, 1].find((sd) => onPanHit(sd, p));
        if (side !== undefined) answer(side);
        return;
      }
      if (clock < s.lockUntil) return;
      const i = s.tray.findIndex((pc, k) => {
        if (pc.used) return false;
        const b = trayBox(k);
        return Math.abs(p.x - b.x) < b.w / 2 && Math.abs(p.y - b.y) < b.h / 2;
      });
      if (i >= 0) {
        if (!canSend()) return;
        const from = trayFrom(i);
        s.drag = {
          i,
          x: p.x,
          y: p.y,
          ox: from.x - p.x,
          oy: from.y - p.y,
          sx: p.x,
          sy: p.y,
          moved: false,
        };
        el.setPointerCapture?.(e.pointerId);
        fx.tap();
        return;
      }
      // «Уравновесь»: нажали на свою чашу — последняя гирька обратно на прилавок.
      if (r.kind === 'balance' && onPanHit(1, p) && s.pans[1]!.length && !flying()) {
        s.tapAt[1] = clock;
        takeOff(1, s.pans[1]!.length - 1, 'back');
        fx.whoosh();
        const sum = loaded(1);
        if (sum > 0) void say(`${NUMBERS[sum]!}!`);
      }
    };
    const move = (e: PointerEvent) => {
      const d = s.drag;
      if (!d) return;
      const p = at(e);
      d.x = p.x;
      d.y = p.y;
      if (Math.hypot(p.x - d.sx, p.y - d.sy) > 10) d.moved = true;
    };
    const up = (e: PointerEvent) => {
      const d = s.drag;
      if (!d) return;
      s.drag = null;
      // Где отпустили — по самому событию: последний pointermove мог не дойти.
      if (e.type === 'pointerup') {
        Object.assign(d, at(e));
        if (Math.hypot(d.x - d.sx, d.y - d.sy) > 10) d.moved = true;
      }
      if (!canSend()) return;
      if (!d.moved) return send(d.i, trayFrom(d.i));
      const p = s.tray[d.i]!;
      const size = traySize(p);
      const from = { x: d.x + d.ox, y: d.y + d.oy, size };
      if (e.type === 'pointerup' && onPanHit(1, d)) return send(d.i, from);
      // Мимо чаши — обратно на прилавок.
      s.leaving.push({
        it: { ...make(p.v, p.form, p.color, clock), tray: cur().kind === 'sum' ? d.i : -1 },
        x: from.x,
        y: from.y,
        size,
        at: clock,
        kind: 'back',
      });
      if (cur().kind === 'sum') p.used = true;
    };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);

    start(0);
    raf = requestAnimationFrame(frame);
    return () => {
      s.stopped = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const busy = phase !== 'play';
  return (
    <div
      className="game scales"
      data-testid="game-scales"
      data-phase={phase}
      data-round={round}
      data-no-idle={busy || undefined}
      ref={root}
    >
      <canvas ref={canvas} className="scales-canvas" />
      <div ref={hint} className="scales-hint" data-hint={!busy || undefined} />
      <div ref={target} className="scales-hint" data-hint-target={!busy || undefined} />
    </div>
  );
}
