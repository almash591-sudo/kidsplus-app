// «Поезд» (этап 57). Паровозик с вагонами едет по слоистому пейзажу — небо, холмы, деревья,
// каждый слой со своей скоростью, — ныряет в тоннель под горой и выезжает к станции. На
// платформе ждут зверята с билетами: ребёнок ведёт каждого к вагону с тем же числом (точки,
// цифра или «сосчитай точки — найди цифру»). Со ступенями — «вагон потерялся»: на запасном
// пути три вагона, нужно поставить тот, что идёт по порядку. Всё — один canvas.
import { useEffect, useRef, useState } from 'react';
import { fx } from '../fx';
import {
  TRAIN_END,
  TRAIN_GO,
  TRAIN_LOST,
  TRAIN_NEXT,
  TRAIN_PROMPT,
  TRAIN_WHICH,
  trainCount,
  trainFind,
  trainTicket,
  trainWagon,
} from '../phrases';
import { afterSpeech, clayUrl, praise, retry, say, setTask, type GameProps } from './common';
import { dotsLayout, planTrain, trainSprites } from './trainLogic';

type Phase = 'ride' | 'board' | 'fix' | 'go' | 'finish';

// Всё в «вагонных» единицах U: экран пересчитывает их в пиксели (см. view).
/** Паровоз и вагон — ширина картинки; шаг вагонов — вагон плюс сцепка. */
const LOCO_W = 1.55;
const WAGON_W = 1.36;
const PITCH = 1.2;
/** Скорость, разгон и торможение, U/с. */
const V = 7;
const ACC = 6;
const BRAKE = 5;
/** Зверёк на платформе и в вагоне (больший размер картинки), где стоят лапки. */
const PASSENGER = 0.9;
const SEATED = 0.86;
const FEET = 1.78;
/** Запасной путь (режим «вагон потерялся»). */
const SIDING = 1.75;
const SPARE_STEP = 1.6;
/** Цвет вагона по номеру — вразнобой: цвет не подсказывает порядок. */
const WAGON_COLORS = [
  '#ef4444',
  '#3b82f6',
  '#facc15',
  '#22c55e',
  '#a855f7',
  '#fb923c',
  '#ec4899',
  '#14b8a6',
  '#f97316',
  '#6366f1',
];
/** Деревья и домики за дорогой: картинка и высота, U. */
const SCENERY: readonly (readonly [string, number])[] = [
  ['race-tree-pine', 2.3],
  ['race-tree-round', 2.1],
  ['race-bush', 0.85],
  ['race-tree-apple', 2.1],
  ['race-house', 1.6],
  ['race-rock', 0.6],
  ['race-flowers', 0.55],
  ['race-windmill', 2.6],
  ['race-tree-pine', 1.9],
  ['race-bush', 0.7],
];
const COLORS = ['#ef4444', '#facc15', '#3b82f6', '#22c55e', '#a855f7', '#fb923c'];

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
/** Клуб дыма — в координатах мира: поезд уезжает, дым остаётся позади. */
interface Puff {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  age: number;
  life: number;
}
/** Прыжок зверька в вагон / полёт вагона в дырку: откуда (px) и когда. */
interface Hop {
  at: number;
  x: number;
  y: number;
  done: boolean;
}
interface Drag {
  kind: 'passenger' | 'spare';
  i: number;
  x: number;
  y: number;
  /** От пальца до «ножек» (низ посередине). */
  ox: number;
  oy: number;
  sx: number;
  sy: number;
  moved: boolean;
}
/** Гора с тоннелем посередине перегона: c — середина, half — полдлины тоннеля. */
interface Tunnel {
  c: number;
  half: number;
  peak: number;
}

const ease = (k: number) => (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2);
const easeOut = (k: number) => 1 - (1 - k) ** 3;
const clamp01 = (k: number) => Math.max(0, Math.min(1, k));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** Псевдослучайное 0..1 по номеру — пейзаж одинаковый при каждом кадре. */
const hash = (i: number) => {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};
/** Сколько длится прыжок в вагон и полёт обратно, мс. */
const HOP = 520;
const BACK = 340;
const FILL = 420;

export function Train({ spec, phrases, onFinish }: GameProps<'train'>) {
  const [rounds] = useState(() => planTrain(spec));
  const [round, setRound] = useState(0);
  const [phase, setPhase] = useState<Phase>('ride');
  const root = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const hint = useRef<HTMLDivElement>(null);
  const target = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = root.current!;
    const cv = canvas.current!;
    const ctx = cv.getContext('2d')!;
    const img = new Map<string, HTMLImageElement>();
    for (const name of trainSprites()) {
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

    const n = rounds[0]!.wagons.length;
    /** Длина поезда, U: от хвостовой сцепки до носа паровоза. */
    const L = LOCO_W + 0.68 + (n - 1) * PITCH + 0.68;
    /** Пиксели на U, где рельс и где камера (левый край экрана в U мира) — на этот кадр. */
    let U = 50;
    let railY = 0;
    let cam = 0;
    /** Стоя места по высоте много: зверята с билетами крупнее, платформа глубже. */
    let pk = 1;
    let deep = 0;
    const view = () => {
      const land = w > h;
      pk = land ? 1 : 1.3;
      deep = land ? 0 : 0.6;
      // Сверху — кнопка «Домой» и совёнок; поезд со станцией — одна полоса 4,75 U.
      const top = land ? 56 : 100;
      const bottom = 12;
      const avail = h - top - bottom;
      const band = 4.75 + deep;
      U = Math.max(20, Math.min(w / (L + 0.5), avail / band, 130));
      railY = top + Math.max(0, avail - band * U) * (land ? 0.5 : 0.75) + 2.65 * U;
    };
    /** Зверёк на платформе, px (больший размер картинки). */
    const pu = () => PASSENGER * pk * U;
    view();
    const sx = (X: number) => (X - cam) * U;
    const sy = (Y: number) => railY + Y * U;
    const stopOff = () => L / 2 + w / (2 * U);
    const wagonH = () => {
      const im = ok('train-wagon');
      return im ? (WAGON_W * im.naturalHeight) / im.naturalWidth : 0.5;
    };
    /** Середина вагона j (0 — самый левый, хвост) при носе паровоза в F. */
    const wagonX = (F: number, j: number) => F - LOCO_W - 0.68 - (n - 1 - j) * PITCH;

    const s = {
      /** Станция, к которой едем или на которой стоим. */
      round: 0,
      /** Чьи вагоны на поезде и зверята на платформе — меняется в тоннеле. */
      shown: 0,
      phase: 'ride' as Phase,
      phaseAt: 0,
      /** Нос паровоза и скорость, U и U/с. */
      F: 0,
      v: 0,
      legFrom: 0,
      legTo: 0,
      swapped: true,
      /** Сколько проехали всего — колёса, «чух» и дым. */
      dist: 0,
      chug: 0,
      puffDist: 0,
      puffAt: 0,
      camFix: 0,
      /** Нос поезда у каждой станции. */
      stations: [0] as number[],
      tunnels: [] as Tunnel[],
      /** Сели в вагон: номер зверька → прыжок. */
      seated: new Map<number, Hop>(),
      /** Летят обратно: «p3» — зверёк, «s1» — запасной вагон. */
      back: new Map<string, Hop>(),
      filled: null as (Hop & { i: number }) | null,
      drag: null as Drag | null,
      wrong: 0,
      /** После двух ошибок светится нужный вагон (номер билета / нужный запасной). */
      help: null as number | null,
      glow: null as { i: number; at: number } | null,
      pulseAt: -1e9,
      bounce: new Map<number, number>(),
      tootAt: -1e9,
      puffs: [] as Puff[],
      particles: [] as Particle[],
      once: new Set<string>(),
      stopped: false,
    };
    const once = (key: string) => !s.once.has(key) && !!s.once.add(key);
    const go = (p: Phase) => {
      s.phase = p;
      s.phaseAt = clock;
      s.once.clear();
      setPhase(p);
    };
    const shownRound = () => rounds[s.shown]!;
    const stationX = (k: number) => s.stations[k]! - L / 2;
    const spacing = () => Math.min(1.3, (w / U - 0.6) / n);

    // ─── Картинки ───
    /** Размер зверька в px при большей стороне size. */
    const fit = (name: string, size: number): [number, number] => {
      const im = ok(name);
      if (!im) return [size * 0.8, size];
      const k = size / Math.max(im.naturalWidth, im.naturalHeight);
      return [im.naturalWidth * k, im.naturalHeight * k];
    };
    const drawAnimal = (name: string, x: number, y: number, size: number, rot = 0) => {
      const im = ok(name);
      const [dw, dh] = fit(name, size);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rot);
      if (im) ctx.drawImage(im, -dw / 2, -dh, dw, dh);
      else {
        ctx.fillStyle = '#e7d3b5';
        ctx.beginPath();
        ctx.ellipse(0, -dh / 2, dw / 2, dh / 2, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    };
    /** Белый вагон из глины, перекрашенный по номеру (сцепки по бокам остаются серыми). */
    const tinted = new Map<number, HTMLCanvasElement>();
    const wagonImg = (num: number) => {
      const base = ok('train-wagon');
      if (!base) return undefined;
      let c = tinted.get(num);
      if (!c) {
        c = document.createElement('canvas');
        c.width = base.naturalWidth;
        c.height = base.naturalHeight;
        const x = c.getContext('2d')!;
        x.drawImage(base, 0, 0);
        x.globalCompositeOperation = 'multiply';
        x.fillStyle = WAGON_COLORS[(num - 1) % WAGON_COLORS.length]!;
        x.fillRect(c.width * 0.1, 0, c.width * 0.8, c.height);
        x.globalCompositeOperation = 'destination-in';
        x.drawImage(base, 0, 0);
        tinted.set(num, c);
      }
      return c;
    };
    const drawWheel = (x: number, y: number, r: number, angle: number) => {
      const im = ok('train-wheel');
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);
      if (im) ctx.drawImage(im, -r, -r * (im.naturalHeight / im.naturalWidth), 2 * r, 2 * r);
      else {
        ctx.fillStyle = '#374151';
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    };
    /** Точки как на кубике: до шести — в квадрате size, дальше — два ряда по пять, шире. */
    const dotsW = (num: number, size: number) => (num > 6 ? size * 1.75 : size);
    const drawDots = (x: number, y: number, size: number, num: number, color: string) => {
      const bw = dotsW(num, size);
      const r = num <= 6 ? size * 0.11 : bw * 0.06;
      ctx.fillStyle = color;
      for (const [dx, dy] of dotsLayout(num)) {
        ctx.beginPath();
        ctx.arc(x + (dx - 0.5) * bw, y + (dy - 0.5) * size, r, 0, Math.PI * 2);
        ctx.fill();
      }
    };
    const digit = (num: number | string, x: number, y: number, px: number, color: string) => {
      ctx.font = `900 ${Math.round(px)}px ${font}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = color;
      ctx.fillText(String(num), x, y + px * 0.04);
    };
    /** Табличка на вагоне: точки и цифра на первых ступенях, дальше — цифра. */
    const drawPlate = (x: number, y: number, num: number | null, u: number) => {
      const dots = spec.look === 'dots' && num !== null;
      // Маленькая — чтобы цвет вагона был виден.
      const ph = 0.3 * u;
      const box = num === null ? 0 : dotsW(num, ph * 0.84);
      const pw = dots ? box + ph * 1.25 : ph * 1.2;
      ctx.fillStyle = num === null ? 'rgba(255,255,255,0.55)' : '#fffdf5';
      ctx.strokeStyle = 'rgba(60,40,20,0.35)';
      ctx.lineWidth = Math.max(1, u * 0.025);
      ctx.beginPath();
      ctx.roundRect(x - pw / 2, y - ph / 2, pw, ph, ph * 0.3);
      ctx.fill();
      ctx.stroke();
      if (num === null) return digit('?', x, y, ph * 0.85, '#6b7280');
      if (!dots) return digit(num, x, y, ph * 0.85, '#1f2937');
      drawDots(x - pw / 2 + ph * 0.2 + box / 2, y, ph * 0.84, num, '#1f2937');
      digit(num, x + pw / 2 - ph * 0.5, y, ph * 0.8, '#1f2937');
    };
    /** Билет над головой: точки (сосчитать) или цифра. */
    const drawTicket = (x: number, y: number, num: number, u: number, rot: number) => {
      const th = 0.48 * u;
      const tw = spec.look !== 'digits' && num > 6 ? th * 1.95 : 0.64 * u;
      const l = -tw / 2;
      const r = tw / 2;
      const t = -th / 2;
      const b = th / 2;
      const notch = th * 0.16;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rot);
      ctx.shadowColor = 'rgba(60,30,10,0.25)';
      ctx.shadowBlur = 6;
      ctx.shadowOffsetY = 3;
      ctx.beginPath();
      ctx.moveTo(l, t);
      ctx.lineTo(r, t);
      ctx.lineTo(r, -notch);
      ctx.arc(r, 0, notch, -Math.PI / 2, Math.PI / 2, true);
      ctx.lineTo(r, b);
      ctx.lineTo(l, b);
      ctx.lineTo(l, notch);
      ctx.arc(l, 0, notch, Math.PI / 2, -Math.PI / 2, true);
      ctx.closePath();
      ctx.fillStyle = '#fff7d6';
      ctx.fill();
      ctx.shadowColor = 'transparent';
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = Math.max(1.5, u * 0.03);
      ctx.stroke();
      if (spec.look === 'digits') digit(num, 0, 0, th * 0.78, '#9a3412');
      else drawDots(0, 0, th * 0.82, num, '#9a3412');
      ctx.restore();
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

    /** Вагон: x — середина, y — низ кузова (px), turn — сколько проехали (U) для колёс. */
    const drawWagon = (x: number, y: number, num: number | null, turn: number, k = 1) => {
      const u = U * k;
      const W = WAGON_W * u;
      const H = wagonH() * u;
      const im = num === null ? undefined : wagonImg(num);
      if (num === null) {
        // Пустое место в составе: пунктирный вагон с «?».
        ctx.save();
        ctx.setLineDash([u * 0.12, u * 0.09]);
        ctx.strokeStyle = 'rgba(255,255,255,0.95)';
        ctx.lineWidth = Math.max(2, u * 0.05);
        ctx.fillStyle = 'rgba(255,255,255,0.22)';
        ctx.beginPath();
        ctx.roundRect(x - W * 0.38, y - H, W * 0.76, H, u * 0.08);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
        drawPlate(x, y - H * 0.5, null, u);
        return;
      }
      if (im) ctx.drawImage(im, x - W / 2, y - H, W, H);
      else {
        ctx.fillStyle = WAGON_COLORS[(num - 1) % WAGON_COLORS.length]!;
        ctx.beginPath();
        ctx.roundRect(x - W * 0.38, y - H, W * 0.76, H, u * 0.08);
        ctx.fill();
      }
      drawPlate(x, y - H * 0.52, num, u);
      for (const f of [0.25, 0.75])
        drawWheel(x - W * 0.38 + W * 0.76 * f, y + 0.01 * u, 0.13 * u, turn / 0.13);
    };
    const drawLoco = (right: number, bottom: number, turn: number) => {
      const W = LOCO_W * U;
      const im = ok('train-loco');
      const H = im ? (W * im.naturalHeight) / im.naturalWidth : W * 0.5;
      const x0 = right - W;
      if (im) ctx.drawImage(im, x0, bottom - H, W, H);
      else {
        ctx.fillStyle = '#dc2626';
        ctx.beginPath();
        ctx.roundRect(x0, bottom - H * 0.7, W, H * 0.7, U * 0.1);
        ctx.fill();
      }
      // Колёса крутятся вместе, золотое дышло соединяет их пальцы.
      const a = turn / 0.17;
      const wheels: [number, number, number][] = [
        [x0 + W * 0.22, bottom + 0.15 * U - 0.2 * U, 0.2 * U],
        [x0 + W * 0.52, bottom, 0.15 * U],
        [x0 + W * 0.76, bottom, 0.15 * U],
      ];
      for (const [x, y, r] of wheels) drawWheel(x, y, r, a);
      const pin = 0.09 * U;
      const px = Math.cos(a) * pin;
      const py = Math.sin(a) * pin;
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#7c4a03';
      ctx.lineWidth = U * 0.075;
      ctx.beginPath();
      ctx.moveTo(wheels[0]![0] + px, wheels[0]![1] + py);
      ctx.lineTo(wheels[2]![0] + px, wheels[2]![1] + py);
      ctx.stroke();
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = U * 0.045;
      ctx.stroke();
      ctx.fillStyle = '#fde68a';
      for (const [x, y] of wheels) {
        ctx.beginPath();
        ctx.arc(x + px, y + py, U * 0.035, 0, Math.PI * 2);
        ctx.fill();
      }
    };
    /** Тёмная сцепка между вагонами (и через пустое место). */
    const coupler = (x0: number, x1: number, y: number) => {
      ctx.strokeStyle = '#4b5563';
      ctx.lineWidth = U * 0.06;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x0, y);
      ctx.lineTo(x1, y);
      ctx.stroke();
    };

    // ─── Где кто ───
    /** Зверёк i на платформе: ножки (px) — дома или на пути обратно. */
    const passengerHome = (i: number) => ({
      x: sx(stationX(s.shown) + (i - (n - 1) / 2) * spacing()),
      y: sy(FEET + deep),
    });
    const spareHome = (i: number) => ({
      x: sx(stationX(s.shown) + (i - 1) * SPARE_STEP),
      y: sy(SIDING - 0.14),
    });
    const flying = (key: string, home: { x: number; y: number }, now: number) => {
      const b = s.back.get(key);
      if (!b) return home;
      const k = clamp01((now - b.at) / BACK);
      if (k >= 1) {
        s.back.delete(key);
        return home;
      }
      const e = easeOut(k);
      return { x: lerp(b.x, home.x, e), y: lerp(b.y, home.y, e) - Math.sin(Math.PI * k) * U * 0.4 };
    };
    /** Где сидит зверёк в вагоне j: ножки (px). */
    const seatOf = (j: number) => ({
      x: sx(wagonX(s.F, j)),
      y: sy(-0.14 - wagonH() + 0.22),
    });
    const wagonOf = (ticket: number) => shownRound().wagons.indexOf(ticket);
    /** Какой вагон под пальцем (в полосе поезда, по ближайшей середине). */
    const wagonAt = (x: number, y: number) => {
      if (y < sy(-1.75) || y > sy(0.45)) return -1;
      let best = -1;
      let bd = PITCH * U * 0.62;
      for (let j = 0; j < n; j++) {
        const d = Math.abs(x - sx(wagonX(s.F, j)));
        if (d < bd) {
          bd = d;
          best = j;
        }
      }
      return best;
    };
    const hopK = (hp: Hop, now: number, ms: number) => clamp01((now - hp.at) / ms);
    /** Точка на дуге прыжка: из (x, y) в to, выше обоих. */
    const arc = (hp: Hop, to: { x: number; y: number }, k: number, lift: number) => {
      const e = ease(k);
      return {
        x: lerp(hp.x, to.x, e),
        y: lerp(hp.y, to.y, e) - Math.sin(Math.PI * k) * lift,
      };
    };

    /** «Ушко» и подсказка при бездействии: что делать сейчас. */
    const remind = () => {
      const r = shownRound();
      if (s.phase === 'board' && r.kind === 'tickets') {
        const i = r.passengers.findIndex((_, k) => !s.seated.has(k));
        if (i < 0) return;
        const t = r.passengers[i]!.ticket;
        s.glow = { i, at: clock };
        return say(trainTicket(t), trainFind(t));
      }
      if (s.phase === 'fix' && r.kind === 'missing') {
        // Считаем вагоны до дырки — какой следующий?
        s.pulseAt = clock;
        return say(...r.wagons.slice(0, r.gap).map(trainCount), TRAIN_WHICH);
      }
      return say(rounds[s.round]!.kind === 'missing' ? TRAIN_LOST : TRAIN_PROMPT);
    };
    setTask(remind);

    // ─── Поездка ───
    const legLen = () => Math.max(w / U + L + 6, 22);
    const startLeg = (from: number, to: number) => {
      s.legFrom = from;
      s.legTo = to;
      const mid = (from + to) / 2;
      s.tunnels.push({ c: mid - L / 2, half: (L + 3) / 2, peak: 3 + hash(s.tunnels.length) * 0.5 });
      if (s.tunnels.length > 3) s.tunnels.shift();
      s.swapped = false;
      go('ride');
    };
    /** Поезд целиком в тоннеле: дальше едут вагоны и зверята следующей станции. */
    const swap = () => {
      s.swapped = true;
      s.shown = s.round;
      s.seated.clear();
      s.back.clear();
      s.filled = null;
      s.wrong = 0;
      s.help = null;
      s.glow = null;
      s.pulseAt = -1e9;
      s.bounce.clear();
    };
    const arrive = () => {
      s.F = s.legTo;
      s.v = 0;
      const r = rounds[s.round]!;
      fx.bell(4);
      setRound(s.round);
      go(r.kind === 'tickets' ? 'board' : 'fix');
      void say(r.kind === 'missing' ? TRAIN_LOST : s.round === 0 ? TRAIN_PROMPT : TRAIN_NEXT);
    };
    const complete = () => {
      go('go');
      fx.sparkle();
      for (let j = 0; j < n; j++) burst(sx(wagonX(s.F, j)), sy(-0.7), 8);
      const r = s.round;
      const last = r + 1 >= rounds.length;
      void afterSpeech(praise(phrases), 1500).then(() => {
        if (s.stopped || s.round !== r) return;
        fx.toot();
        if (!last) {
          void say(TRAIN_GO);
          s.round++;
          const to = s.F + legLen();
          s.stations.push(to);
          startLeg(s.F, to);
          return;
        }
        confetti();
        s.camFix = s.F - stopOff();
        go('finish');
        void afterSpeech(say(TRAIN_END), 2600).then(() => {
          if (!s.stopped) onFinish();
        });
      });
    };
    const mistake = (help: number) => {
      s.wrong++;
      if (s.wrong >= 2) s.help = help;
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

    // ─── Пейзаж ───
    const drawSky = () => {
      ctx.fillStyle = '#9fd8ff';
      ctx.fillRect(0, 0, w, h);
      const horizon = railY - 2 * U;
      const sky = ok('race-sky');
      if (sky) {
        // Луг на картинке начинается на 0,64 высоты — ставим его на горизонт.
        const dh = Math.max(h * 0.6, (horizon + 20) / 0.64);
        const dw = (sky.naturalWidth * dh) / sky.naturalHeight;
        const top = horizon - dh * 0.64;
        const off = (((cam * U * 0.04) % (dw * 2)) + dw * 2) % (dw * 2);
        for (let x = -off; x < w; x += dw) {
          if (Math.round((x + off) / dw) % 2 === 1) {
            ctx.save();
            ctx.translate(x + dw, top);
            ctx.scale(-1, 1);
            ctx.drawImage(sky, 0, 0, dw, dh);
            ctx.restore();
          } else ctx.drawImage(sky, x, top, dw, dh);
        }
      }
      const hills = (
        k: number,
        base: number,
        f: (X: number) => number,
        fill: string | CanvasGradient,
      ) => {
        ctx.beginPath();
        ctx.moveTo(-10, h);
        for (let x = -10; x <= w + 10; x += 10) ctx.lineTo(x, base - U * f(x / U + cam * k));
        ctx.lineTo(w + 10, h);
        ctx.closePath();
        ctx.fillStyle = fill;
        ctx.fill();
      };
      hills(
        0.2,
        horizon + 0.1 * U,
        (X) => 0.55 + 0.3 * Math.sin(0.42 * X + 1) + 0.15 * Math.sin(1.1 * X),
        '#86c98a',
      );
      const g = ctx.createLinearGradient(0, horizon, 0, railY);
      g.addColorStop(0, '#9ad36b');
      g.addColorStop(1, '#7fc152');
      hills(
        0.45,
        horizon + 0.75 * U,
        (X) => 0.45 + 0.25 * Math.sin(0.6 * X) + 0.15 * Math.sin(1.6 * X + 2),
        g,
      );
    };
    /** Деревья и домики за дорогой — слой 0,8: у станций место свободно. */
    const drawScenery = () => {
      const k = 0.8;
      const off = cam * k;
      const step = 2.8;
      const clear = s.stations.map((S, i) => S - L / 2 - 0.2 * (s.stations[i]! - stopOff()));
      for (let i = Math.floor((off - 3) / step); i <= Math.ceil((off + w / U + 3) / step); i++) {
        const X = i * step + hash(i) * 1.4;
        if (clear.some((c) => Math.abs(X - c) < 3.4)) continue;
        const [name, size] = SCENERY[Math.floor(hash(i + 50) * SCENERY.length)]!;
        const im = ok(name);
        if (!im) continue;
        const dh = size * U * (0.75 + hash(i + 7) * 0.25);
        const dw = (im.naturalWidth * dh) / im.naturalHeight;
        const x = (X - off) * U;
        ctx.drawImage(im, x - dw / 2, sy(-1.02) - dh, dw, dh);
      }
    };
    const drawTrack = () => {
      // Насыпь, шпалы, рельс; ниже — трава до низа экрана.
      const fg = ctx.createLinearGradient(0, railY, 0, h);
      fg.addColorStop(0, '#7cc45a');
      fg.addColorStop(1, '#5ea844');
      ctx.fillStyle = fg;
      ctx.fillRect(0, sy(0.2), w, h - sy(0.2));
      ctx.fillStyle = '#b9a58c';
      ctx.beginPath();
      ctx.roundRect(-10, sy(-0.04), w + 20, 0.28 * U, 0.1 * U);
      ctx.fill();
      ctx.fillStyle = '#7c5a3a';
      const sl = 0.45;
      for (let X = Math.floor(cam / sl) * sl; X < cam + w / U + sl; X += sl)
        ctx.fillRect(sx(X) - 0.09 * U, sy(-0.02), 0.18 * U, 0.17 * U);
      ctx.fillStyle = '#6b7280';
      ctx.fillRect(0, sy(-0.06), w, 0.08 * U);
      ctx.fillStyle = '#d1d5db';
      ctx.fillRect(0, sy(-0.06), w, 0.025 * U);
    };
    /** Отрезок пути (запасной): с упорами на концах. */
    const drawSiding = (x0: number, x1: number, y: number) => {
      ctx.fillStyle = '#b9a58c';
      ctx.beginPath();
      ctx.roundRect(x0, y - 0.04 * U, x1 - x0, 0.26 * U, 0.1 * U);
      ctx.fill();
      ctx.fillStyle = '#7c5a3a';
      for (let x = x0 + 0.15 * U; x < x1 - 0.1 * U; x += 0.45 * U)
        ctx.fillRect(x - 0.09 * U, y - 0.02 * U, 0.18 * U, 0.16 * U);
      ctx.fillStyle = '#6b7280';
      ctx.fillRect(x0, y - 0.06 * U, x1 - x0, 0.08 * U);
      for (const [x, dir] of [
        [x0, 1],
        [x1, -1],
      ] as const) {
        // Упор: красно-белая подушка на столбике.
        ctx.fillStyle = '#7c5a3a';
        ctx.fillRect(x - 0.05 * U + dir * 0.1 * U, y - 0.4 * U, 0.1 * U, 0.4 * U);
        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.roundRect(x - 0.12 * U + dir * 0.1 * U, y - 0.5 * U, 0.24 * U, 0.2 * U, 0.05 * U);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.fillRect(x - 0.12 * U + dir * 0.1 * U, y - 0.43 * U, 0.24 * U, 0.06 * U);
      }
    };
    const visible = (X0: number, X1: number) => sx(X1) > -20 && sx(X0) < w + 20;
    /** Станция позади поезда: домик на каменной платформе. */
    const drawStationBack = (k: number) => {
      const c = stationX(k);
      const half = Math.max(2.4, L / 2 + 0.4);
      if (!visible(c - half, c + half)) return;
      ctx.fillStyle = '#ece6dc';
      ctx.fillRect(sx(c - half), sy(-0.62), half * 2 * U, 0.22 * U);
      const im = ok('train-station');
      if (im) {
        const dw = 3.6 * U;
        const dh = (dw * im.naturalHeight) / im.naturalWidth;
        ctx.drawImage(im, sx(c) - dw / 2, sy(-0.5) - dh, dw, dh);
      }
      ctx.fillStyle = '#cfc6b8';
      ctx.fillRect(sx(c - half), sy(-0.42), half * 2 * U, 0.38 * U);
      ctx.fillStyle = 'rgba(0,0,0,0.08)';
      ctx.fillRect(sx(c - half), sy(-0.42), half * 2 * U, 0.05 * U);
    };
    /** Перед поездом: платформа для зверят или запасной путь. */
    const drawStationFront = (k: number) => {
      const c = stationX(k);
      const r = rounds[k]!;
      if (r.kind === 'missing') {
        const half = SPARE_STEP + WAGON_W / 2 + 0.4;
        if (visible(c - half, c + half)) drawSiding(sx(c - half), sx(c + half), sy(SIDING));
        return;
      }
      const half = Math.max(L / 2 + 0.6, (n * spacing()) / 2 + 0.5);
      if (!visible(c - half, c + half)) return;
      const x = sx(c - half);
      const pw = half * 2 * U;
      ctx.fillStyle = 'rgba(40,30,20,0.18)';
      ctx.fillRect(x, sy(0.26), pw, 0.06 * U);
      ctx.fillStyle = '#e7e0d4';
      ctx.fillRect(x, sy(0.28), pw, 0.16 * U);
      ctx.fillStyle = '#facc15';
      ctx.fillRect(x, sy(0.37), pw, 0.04 * U);
      ctx.fillStyle = '#dcbf92';
      ctx.fillRect(x, sy(0.44), pw, (1.58 + deep) * U);
      ctx.strokeStyle = 'rgba(120,80,40,0.18)';
      ctx.lineWidth = 1;
      for (let y = 0.44 + 0.32; y < 2 + deep; y += 0.32) {
        ctx.beginPath();
        ctx.moveTo(x, sy(y));
        ctx.lineTo(x + pw, sy(y));
        ctx.stroke();
      }
      ctx.fillStyle = '#b08a5e';
      ctx.fillRect(x, sy(2.02 + deep), pw, 0.14 * U);
    };
    /** Высота горы над тоннелем в точке X (U, вверх — минус). */
    const mountainY = (t: Tunnel, X: number) => {
      const x0 = t.c - t.half - 1.2;
      const x1 = t.c + t.half + 1.2;
      const u = (X - x0) / (x1 - x0);
      if (u <= 0 || u >= 1) return 0.5;
      const sn = Math.sin(Math.PI * u);
      return 0.5 - (t.peak + 0.5) * sn ** 0.45 + 0.12 * Math.sin(X * 2.3 + t.c) * sn;
    };
    /** Арка тоннеля: от a0 до a1 (U мира). */
    const archPath = (a0: number, a1: number) => {
      const l = sx(a0);
      const r = sx(a1);
      const spring = sy(-0.85);
      ctx.moveTo(l, sy(0.4));
      ctx.lineTo(l, spring);
      ctx.ellipse((l + r) / 2, spring, (r - l) / 2, 0.65 * U, 0, Math.PI, 0);
      ctx.lineTo(r, sy(0.4));
      ctx.closePath();
    };
    const portals = (t: Tunnel): [number, number][] => [
      [t.c - t.half, t.c - t.half + 1.4],
      [t.c + t.half - 1.4, t.c + t.half],
    ];
    /** Гора за поездом: темнота в арках и вся гора со склонами. */
    const drawTunnelBack = (t: Tunnel) => {
      if (!visible(t.c - t.half - 1.2, t.c + t.half + 1.2)) return;
      ctx.fillStyle = '#1c140e';
      ctx.beginPath();
      for (const [a0, a1] of portals(t)) archPath(a0, a1);
      ctx.fill();
      drawMountain(t);
    };
    /**
     * Гора перед поездом — только между порталами и выше поезда: склоны за порталами остаются
     * позади, и выехавший из тоннеля вагон за ними не прячется.
     */
    const drawTunnelFront = (t: Tunnel) => {
      if (!visible(t.c - t.half - 1.2, t.c + t.half + 1.2)) return;
      ctx.save();
      ctx.beginPath();
      ctx.rect(sx(t.c - t.half) - 0.22 * U, -10, (2 * t.half + 0.44) * U, h + 20);
      ctx.rect(-10, -10, w + 20, sy(-1.75) + 10);
      ctx.clip();
      drawMountain(t);
      ctx.restore();
    };
    const drawMountain = (t: Tunnel) => {
      const x0 = t.c - t.half - 1.2;
      const x1 = t.c + t.half + 1.2;
      const step = 0.2;
      const top = () => {
        for (let X = x0; X <= x1 + 1e-6; X += step) ctx.lineTo(sx(X), sy(mountainY(t, X)));
      };
      ctx.beginPath();
      ctx.moveTo(sx(x0), sy(0.5));
      top();
      ctx.lineTo(sx(x1), sy(0.5));
      ctx.closePath();
      for (const [a0, a1] of portals(t)) archPath(a0, a1);
      const g = ctx.createLinearGradient(0, sy(-t.peak), 0, sy(0.5));
      g.addColorStop(0, '#a08a74');
      g.addColorStop(1, '#6f5d4c');
      ctx.fillStyle = g;
      ctx.fill('evenodd');
      ctx.save();
      ctx.clip('evenodd');
      // Камни-пятна и травяная шапка.
      ctx.fillStyle = 'rgba(70,55,40,0.18)';
      for (let i = 0; i < 9; i++) {
        const X = lerp(x0 + 1, x1 - 1, hash(t.c * 3 + i));
        const Y = lerp(mountainY(t, X) + 0.4, -0.3, hash(t.c * 5 + i));
        ctx.beginPath();
        ctx.ellipse(sx(X), sy(Y), 0.35 * U, 0.18 * U, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.beginPath();
      top();
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#6fbf4a';
      ctx.lineWidth = 0.55 * U;
      ctx.stroke();
      ctx.strokeStyle = '#8fd862';
      ctx.lineWidth = 0.2 * U;
      ctx.stroke();
      ctx.restore();
      // Ёлочки на горе.
      const pine = ok('race-tree-pine');
      if (pine)
        for (const [f, size] of [
          [-0.45, 1.15],
          [0.38, 0.95],
          [0.1, 0.8],
        ] as const) {
          const X = t.c + t.half * f;
          const dh = size * U;
          const dw = (pine.naturalWidth * dh) / pine.naturalHeight;
          ctx.drawImage(pine, sx(X) - dw / 2, sy(mountainY(t, X) + 0.12) - dh, dw, dh);
        }
      for (const [i, [a0, a1]] of portals(t).entries()) {
        // Внутри арки темнеет к глубине — поезд уходит в темноту.
        ctx.save();
        ctx.beginPath();
        archPath(a0, a1);
        ctx.clip();
        const dark = ctx.createLinearGradient(sx(i ? a1 : a0), 0, sx(i ? a0 : a1), 0);
        dark.addColorStop(0, 'rgba(20,14,10,0)');
        dark.addColorStop(1, 'rgba(20,14,10,0.92)');
        ctx.fillStyle = dark;
        ctx.fillRect(sx(a0), sy(-1.6), (a1 - a0) * U, 2.1 * U);
        ctx.restore();
        // Каменное кольцо.
        const l = sx(a0);
        const r = sx(a1);
        const mid = (l + r) / 2;
        const rx = (r - l) / 2 + 0.11 * U;
        const ry = 0.65 * U + 0.11 * U;
        const spring = sy(-0.85);
        const stone = (x: number, y: number, rot: number) => {
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(rot);
          ctx.beginPath();
          ctx.roundRect(-0.12 * U, -0.09 * U, 0.24 * U, 0.18 * U, 0.05 * U);
          ctx.fillStyle = '#d6cdbf';
          ctx.fill();
          ctx.strokeStyle = '#857967';
          ctx.lineWidth = Math.max(1, 0.025 * U);
          ctx.stroke();
          ctx.restore();
        };
        for (let k = 0; k < 9; k++) {
          const a = Math.PI + (Math.PI * (k + 0.5)) / 9;
          stone(mid + Math.cos(a) * rx, spring + Math.sin(a) * ry, a + Math.PI / 2);
        }
        for (let k = 0; k < 3; k++) {
          const y = spring + (k + 0.5) * 0.36 * U;
          stone(l - 0.11 * U, y, Math.PI / 2);
          stone(r + 0.11 * U, y, Math.PI / 2);
        }
      }
    };
    const drawForeground = () => {
      // Внизу стоя много травы — кусты и цветы ближе всех, слой 1,25.
      if (h - sy(2.25 + deep) < 0.9 * U) return;
      const k = 1.25;
      const off = cam * k;
      const step = 2.4;
      for (let i = Math.floor((off - 2) / step); i <= Math.ceil((off + w / U + 2) / step); i++) {
        const name = hash(i + 99) < 0.5 ? 'race-flowers' : 'race-bush';
        const im = ok(name);
        if (!im) continue;
        const dh = (name === 'race-bush' ? 0.95 : 0.7) * U;
        const dw = (im.naturalWidth * dh) / im.naturalHeight;
        const X = i * step + hash(i + 77) * 1.2;
        ctx.drawImage(im, (X - off) * U - dw / 2, h + 0.15 * U - dh, dw, dh);
      }
    };

    // ─── Поезд ───
    const drawTrain = (now: number) => {
      const r = shownRound();
      const H = wagonH();
      const moving = Math.min(1, s.v / 3);
      const cy = -0.14 - H * 0.2;
      for (let j = 0; j < n; j++) {
        const X = wagonX(s.F, j);
        const gap = r.kind === 'missing' && j === r.gap;
        const empty = gap && !s.filled?.done;
        if (empty) {
          // Через пустое место — длинная сцепка, вагоны всё равно едут вместе.
          const to = j + 1 < n ? wagonX(s.F, j + 1) - 0.52 : s.F - LOCO_W + 0.06;
          coupler(sx(X - PITCH + 0.52), sx(to), sy(cy));
        }
        if (j === n - 1 && !empty) coupler(sx(X + 0.5), sx(s.F - LOCO_W + 0.06), sy(cy));
      }
      for (let j = 0; j < n; j++) {
        const X = wagonX(s.F, j);
        const x = sx(X);
        const bob = Math.sin(s.dist * 2.6 + j * 1.7) * 0.022 * moving;
        const bAt = s.bounce.get(j);
        const bk = bAt === undefined ? 1 : (now - bAt) / 1000;
        const jump = bk < 1 ? Math.abs(Math.sin(bk * 12)) * Math.exp(-bk * 5) * 0.16 : 0;
        // Подсказка «считаем»: вагоны до дырки вспыхивают по очереди.
        let pulse = 0;
        if (r.kind === 'missing' && j <= r.gap) {
          const at = s.pulseAt + j * 620 + 200;
          pulse = clamp01(1 - Math.abs(now - at) / 320);
        }
        const yb = sy(-0.14 + bob - jump - pulse * 0.08);
        const gap = r.kind === 'missing' && j === r.gap;
        const num = r.wagons[j]!;
        const helpNow =
          s.help !== null && ((r.kind === 'tickets' && s.help === num && !seatedIn(j)) || false);
        if (helpNow || pulse > 0) {
          const k = helpNow ? 0.55 + 0.45 * Math.sin(now / 160) : pulse;
          halo(x, yb - H * U * 0.5, WAGON_W * U * 0.75, H * U * 1.3, k);
        }
        if (gap && !s.filled?.done) {
          if (!s.filled) drawWagon(x, yb, null, s.dist, 1 + pulse * 0.06);
          continue;
        }
        if (r.kind === 'tickets') {
          const i = r.passengers.findIndex((p) => p.ticket === num);
          const hp = s.seated.get(i);
          if (hp) {
            const k = hopK(hp, now, HOP);
            if (hp.done || k >= 0.6) {
              const seat = { x, y: yb - H * U + 0.22 * U };
              const p = hp.done ? seat : arc(hp, seat, k, hopLift(hp, seat));
              const size = lerp(PASSENGER * pk, SEATED, ease(k)) * U;
              drawAnimal(r.passengers[i]!.animal, p.x, p.y, size, Math.sin(now / 300 + j) * 0.04);
            }
          }
        }
        drawWagon(x, yb, num, s.dist, 1 + pulse * 0.06);
      }
      const lb = Math.sin(s.dist * 3.1) * 0.014 * moving;
      drawLoco(sx(s.F), sy(-0.15 + lb), s.dist);
    };
    const hopLift = (hp: Hop, to: { x: number; y: number }) =>
      Math.max(0.9 * U, (hp.y - to.y) * 0.45 + 0.6 * U);
    const seatedIn = (j: number) => {
      const r = shownRound();
      if (r.kind !== 'tickets') return false;
      const i = r.passengers.findIndex((p) => p.ticket === r.wagons[j]);
      return s.seated.has(i);
    };
    /** Зверята на платформе и запасные вагоны; летящие и в пальце — поверх всего. */
    const drawWaiting = (now: number, t: number) => {
      const r = shownRound();
      if (r.kind === 'tickets') {
        r.passengers.forEach((p, i) => {
          if (s.seated.has(i) || (s.drag?.kind === 'passenger' && s.drag.i === i)) return;
          const home = passengerHome(i);
          const pos = flying(`p${i}`, home, now);
          const atHome = pos === home;
          const lift = atHome ? Math.max(0, Math.sin(t * 2.6 + i * 2.1)) ** 10 * 0.12 * U : 0;
          const size = pu();
          const [dw, dh] = fit(p.animal, size);
          const glowK = s.glow && s.glow.i === i ? clamp01(1 - (now - s.glow.at) / 3500) : 0;
          if (glowK > 0)
            halo(
              pos.x,
              pos.y - dh / 2,
              dw * 0.9,
              dh * 0.8,
              glowK * (0.6 + 0.4 * Math.sin(now / 150)),
            );
          if (atHome) {
            ctx.fillStyle = 'rgba(60,40,20,0.2)';
            ctx.beginPath();
            ctx.ellipse(pos.x, pos.y, dw * 0.38, 0.08 * U, 0, 0, Math.PI * 2);
            ctx.fill();
          }
          drawAnimal(p.animal, pos.x, pos.y - lift, size, Math.sin(t * 1.8 + i * 1.3) * 0.05);
          drawTicket(
            pos.x,
            pos.y - lift - dh - 0.3 * U * pk + Math.sin(t * 2.2 + i) * 0.03 * U,
            p.ticket,
            U * pk,
            Math.sin(t * 1.5 + i) * 0.06,
          );
        });
        // Прыжок, пока зверёк выше вагонов (дальше рисуется в вагоне).
        for (const [i, hp] of s.seated) {
          const k = hopK(hp, now, HOP);
          if (hp.done || k >= 0.6) continue;
          const j = wagonOf(r.passengers[i]!.ticket);
          const seat = seatOf(j);
          const p = arc(hp, seat, k, hopLift(hp, seat));
          drawAnimal(
            r.passengers[i]!.animal,
            p.x,
            p.y,
            lerp(PASSENGER * pk, SEATED, ease(k)) * U,
            k * 0.6,
          );
        }
      } else {
        r.spare.forEach((num, i) => {
          if (s.filled?.i === i || (s.drag?.kind === 'spare' && s.drag.i === i)) return;
          const home = spareHome(i);
          const pos = flying(`s${i}`, home, now);
          if (s.help === num) {
            const k = 0.55 + 0.45 * Math.sin(now / 160);
            halo(pos.x, pos.y - wagonH() * U * 0.5, WAGON_W * U * 0.75, wagonH() * U * 1.3, k);
          }
          drawWagon(pos.x, pos.y, num, 0);
        });
        const f = s.filled;
        if (f && !f.done) {
          const to = { x: sx(wagonX(s.F, r.gap)), y: sy(-0.14) };
          const k = hopK(f, now, FILL);
          const p = arc(f, to, k, 0.5 * U);
          drawWagon(p.x, p.y, r.spare[f.i]!, k * 3);
        }
      }
      const d = s.drag;
      if (d) {
        const x = d.x + d.ox;
        const y = d.y + d.oy;
        ctx.save();
        ctx.shadowColor = 'rgba(40,20,10,0.3)';
        ctx.shadowBlur = 14;
        ctx.shadowOffsetY = 8;
        if (d.kind === 'passenger' && r.kind === 'tickets') {
          const p = r.passengers[d.i]!;
          const size = pu() * 1.08;
          const [, dh] = fit(p.animal, size);
          drawAnimal(p.animal, x, y, size, Math.sin(t * 9) * 0.06);
          ctx.restore();
          drawTicket(x, y - dh - 0.3 * U * pk, p.ticket, U * pk, 0);
        } else if (d.kind === 'spare' && r.kind === 'missing') {
          drawWagon(x, y, r.spare[d.i]!, 0, 1.06);
          ctx.restore();
        } else ctx.restore();
      }
    };

    // ─── Дым ───
    const inTunnel = (X: number) => s.tunnels.some((t) => Math.abs(X - t.c) < t.half - 0.2);
    const puff = (big: boolean) => {
      const X = s.F - LOCO_W + 0.725 * LOCO_W;
      s.puffAt = clock;
      if (inTunnel(X) || s.puffs.length > 50) return;
      s.puffs.push({
        x: X + (Math.random() - 0.5) * 0.05,
        y: -0.98,
        vx: 0.25 + Math.random() * 0.2,
        vy: -(0.7 + Math.random() * 0.4),
        r: big ? 0.13 : 0.09,
        age: 0,
        life: (big ? 1.3 : 0.9) + Math.random() * 0.4,
      });
    };
    const drawSmoke = (dt: number) => {
      for (const p of s.puffs) {
        p.age += dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy *= 1 - dt * 0.5;
      }
      s.puffs = s.puffs.filter((p) => p.age < p.life);
      // Клуб — как ватка: три кружка одним контуром, снизу тень потемнее.
      const cloud = (x: number, y: number, r: number) => {
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.moveTo(x - r * 0.55 + r * 0.62, y + r * 0.3);
        ctx.arc(x - r * 0.55, y + r * 0.3, r * 0.62, 0, Math.PI * 2);
        ctx.moveTo(x + r * 0.55 + r * 0.58, y + r * 0.25);
        ctx.arc(x + r * 0.55, y + r * 0.25, r * 0.58, 0, Math.PI * 2);
        ctx.fill();
      };
      for (const p of s.puffs) {
        const k = p.age / p.life;
        const a = (1 - k) ** 2 * 0.95;
        const r = (p.r + p.age * 0.22) * U;
        const x = sx(p.x);
        const y = sy(p.y);
        ctx.fillStyle = `rgba(196,202,214,${a})`;
        cloud(x + r * 0.1, y + r * 0.16, r);
        ctx.fillStyle = `rgba(252,252,253,${a})`;
        cloud(x, y, r);
      }
    };

    const frame = (raw: number) => {
      const gap = Math.max(0, raw - last);
      const dt = Math.min(0.05, gap / 1000);
      last = raw;
      // Медленные кадры — время идёт как настоящее; долгий перерыв (экран погас) — пауза.
      clock += Math.min(gap, 250);
      const real = Math.min(gap, 250) / 1000;
      const now = clock;
      frameNo++;
      const t = now / 1000;
      const since = (now - s.phaseAt) / 1000;
      view();

      // ─── Движение: мелкими шагами, чтобы торможение было точным ───
      if (s.phase === 'ride' || s.phase === 'finish') {
        const steps = Math.max(1, Math.ceil(real * 60));
        const k = real / steps;
        for (let i = 0; i < steps; i++) {
          let step: number;
          if (s.phase === 'ride') {
            const rem = s.legTo - s.F;
            s.v = Math.max(
              0.4,
              Math.min(s.v + ACC * k, V, Math.sqrt(2 * BRAKE * Math.max(0, rem))),
            );
            step = Math.min(rem, s.v * k);
          } else {
            s.v = Math.min(s.v + ACC * k, V * 1.3);
            step = s.v * k;
          }
          s.F += step;
          s.dist += step;
          s.chug += step;
          s.puffDist += step;
          if (s.phase === 'ride' && !s.swapped && s.F >= (s.legFrom + s.legTo) / 2) swap();
          if (s.phase === 'ride' && s.legTo - s.F <= 1e-4) {
            arrive();
            break;
          }
        }
        const tn = s.tunnels.at(-1);
        if (s.phase === 'ride' && tn && s.F > tn.c - tn.half + 0.4 && s.F < tn.c && once('tunnel'))
          fx.whoosh();
      }
      if (s.chug >= 1.6) {
        s.chug = 0;
        fx.chug(0.06 + 0.14 * Math.min(1, s.v / V));
      }
      while (s.puffDist >= 0.5) {
        s.puffDist -= 0.5;
        puff(true);
      }
      if (now - s.puffAt > 900) puff(false);
      if ((s.phase === 'board' || s.phase === 'fix') && since > 0.35 && once('ding')) fx.bell(2);

      // ─── Прыжки в вагоны и вагон в дырку ───
      const r = shownRound();
      if (s.phase === 'board' && r.kind === 'tickets') {
        for (const [i, hp] of s.seated) {
          if (hp.done || hopK(hp, now, HOP) < 1) continue;
          hp.done = true;
          const j = wagonOf(r.passengers[i]!.ticket);
          s.bounce.set(j, now);
          fx.drop();
          const seat = seatOf(j);
          burst(seat.x, seat.y - 0.3 * U, 10, [
            WAGON_COLORS[(r.wagons[j]! - 1) % WAGON_COLORS.length]!,
            '#fff',
            '#ffe14d',
          ]);
        }
        if (s.seated.size === r.passengers.length && [...s.seated.values()].every((hp) => hp.done))
          complete();
      }
      if (s.phase === 'fix' && r.kind === 'missing' && s.filled && !s.filled.done) {
        if (hopK(s.filled, now, FILL) >= 1) {
          s.filled.done = true;
          fx.snap();
          for (const j of [r.gap - 1, r.gap, r.gap + 1]) if (j >= 0 && j < n) s.bounce.set(j, now);
          burst(sx(wagonX(s.F, r.gap)), sy(-0.4), 16);
          complete();
        }
      }

      // ─── Камера ───
      if (s.phase === 'ride') {
        const D = s.legTo - s.legFrom;
        const C = Math.min(2.5, (0.2 * w) / U);
        cam = s.F - stopOff() - C * Math.sin((2 * Math.PI * (s.F - s.legFrom)) / D);
      } else if (s.phase === 'finish') cam = s.camFix;
      else cam = s.F - stopOff();

      // ─── Экран ───
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawSky();
      drawScenery();
      s.stations.forEach((_, k) => drawStationBack(k));
      for (const tn of s.tunnels) drawTunnelBack(tn);
      drawTrack();
      s.stations.forEach((_, k) => drawStationFront(k));
      drawTrain(now);
      drawSmoke(dt);
      for (const tn of s.tunnels) drawTunnelFront(tn);
      drawForeground();
      if (s.phase !== 'ride' || s.swapped) drawWaiting(now, t);

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
          for (let k = 0; k < 10; k++) {
            const a = (k * Math.PI) / 5 + p.rot;
            const rr = k % 2 ? p.r * 0.45 : p.r;
            ctx.lineTo(p.x + Math.cos(a) * rr, p.y + Math.sin(a) * rr);
          }
          ctx.closePath();
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
      s.particles = s.particles.filter((p) => p.age < p.life);

      // Палец подсказки (IdleHint): от зверька к его вагону / от нужного вагона к дырке.
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
        const H = wagonH() * U;
        if (s.phase === 'board' && r.kind === 'tickets') {
          const i = r.passengers.findIndex((_, k) => !s.seated.has(k));
          const p = r.passengers[i];
          if (p) {
            const home = passengerHome(i);
            const [dw, dh] = fit(p.animal, pu());
            place(hs, home.x, home.y - dh / 2, dw, dh);
            place(ts, sx(wagonX(s.F, wagonOf(p.ticket))), sy(-0.14) - H / 2, WAGON_W * U * 0.7, H);
          }
        } else if (s.phase === 'fix' && r.kind === 'missing' && !s.filled) {
          const i = r.spare.indexOf(r.wagons[r.gap]!);
          const home = spareHome(i);
          place(hs, home.x, home.y - H / 2, WAGON_W * U * 0.7, H);
          place(ts, sx(wagonX(s.F, r.gap)), sy(-0.14) - H / 2, WAGON_W * U * 0.7, H);
        }
      }
      // Для автотестов — каждый кадр: фаза (React) не должна обгонять поезд.
      if (webdriver) {
        const H = wagonH() * U;
        el.dataset.kind = r.kind;
        el.dataset.moving = s.phase === 'ride' || s.phase === 'finish' ? '1' : '0';
        el.dataset.wagons = JSON.stringify(
          r.wagons.map((num, j) => ({
            n: num,
            x: Math.round(sx(wagonX(s.F, j))),
            y: Math.round(sy(-0.14) - H / 2),
            filled: r.kind === 'tickets' ? seatedIn(j) : j !== r.gap || !!s.filled?.done,
          })),
        );
        el.dataset.passengers = JSON.stringify(
          r.kind === 'tickets'
            ? r.passengers.map((p, i) => {
                const home = passengerHome(i);
                const [, dh] = fit(p.animal, pu());
                return {
                  ticket: p.ticket,
                  x: Math.round(home.x),
                  y: Math.round(home.y - dh / 2),
                  seated: s.seated.has(i),
                };
              })
            : [],
        );
        el.dataset.gap =
          r.kind === 'missing'
            ? JSON.stringify({
                x: Math.round(sx(wagonX(s.F, r.gap))),
                y: Math.round(sy(-0.14) - H / 2),
                need: r.wagons[r.gap],
              })
            : '';
        el.dataset.spare = JSON.stringify(
          r.kind === 'missing'
            ? r.spare.map((num, i) => {
                const home = spareHome(i);
                return { n: num, x: Math.round(home.x), y: Math.round(home.y - H / 2) };
              })
            : [],
        );
      }
      raf = requestAnimationFrame(frame);
    };

    // ─── Касания: тянуть зверька в вагон / вагон в дырку ───
    const at = (e: PointerEvent) => {
      const box = el.getBoundingClientRect();
      return { x: e.clientX - box.left, y: e.clientY - box.top };
    };
    const grab = (
      kind: Drag['kind'],
      i: number,
      foot: { x: number; y: number },
      p: { x: number; y: number },
      e: PointerEvent,
    ) => {
      s.drag = {
        kind,
        i,
        x: p.x,
        y: p.y,
        ox: foot.x - p.x,
        oy: foot.y - p.y,
        sx: p.x,
        sy: p.y,
        moved: false,
      };
      s.back.delete(`${kind === 'passenger' ? 'p' : 's'}${i}`);
      el.setPointerCapture?.(e.pointerId);
      fx.tap();
    };
    const down = (e: PointerEvent) => {
      if ((e.target as Element).closest('.corner-button')) return;
      if (s.drag) return;
      const p = at(e);
      const r = shownRound();
      const now = clock;
      if (s.phase === 'board' && r.kind === 'tickets') {
        // Ближайший к пальцу зверёк — вместе с билетом над головой.
        let best = -1;
        let bd = Infinity;
        r.passengers.forEach((pa, i) => {
          if (s.seated.has(i)) return;
          const pos = flying(`p${i}`, passengerHome(i), now);
          const [dw, dh] = fit(pa.animal, pu());
          const half = Math.max(dw / 2, 0.42 * U) + 8;
          if (Math.abs(p.x - pos.x) > half || p.y > pos.y + 10 || p.y < pos.y - dh - 0.6 * U * pk)
            return;
          const d = Math.abs(p.x - pos.x);
          if (d < bd) {
            bd = d;
            best = i;
          }
        });
        if (best >= 0) {
          grab('passenger', best, flying(`p${best}`, passengerHome(best), now), p, e);
          return;
        }
      }
      if (s.phase === 'fix' && r.kind === 'missing' && !s.filled) {
        const H = wagonH() * U;
        const i = r.spare.findIndex((_, k) => {
          const pos = flying(`s${k}`, spareHome(k), now);
          return (
            Math.abs(p.x - pos.x) < WAGON_W * U * 0.45 + 6 &&
            p.y > pos.y - H - 12 &&
            p.y < pos.y + 0.2 * U
          );
        });
        if (i >= 0) {
          grab('spare', i, flying(`s${i}`, spareHome(i), now), p, e);
          return;
        }
      }
      // Паровоз — гудок; вагон — «это вагон три».
      const lx = sx(s.F);
      if (p.x > lx - LOCO_W * U && p.x < lx && p.y > sy(-1.05) && p.y < sy(0.05)) {
        if (s.phase !== 'finish' && now - s.tootAt > 1500) {
          s.tootAt = now;
          fx.toot();
        }
        return;
      }
      if (s.phase !== 'board' && s.phase !== 'fix') return;
      const j = wagonAt(p.x, p.y);
      if (j < 0 || (r.kind === 'missing' && j === r.gap && !s.filled?.done)) return;
      s.bounce.set(j, now);
      fx.knock();
      void say(trainWagon(r.wagons[j]!));
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
      const r = shownRound();
      const now = clock;
      const ax = d.x + d.ox;
      const ay = d.y + d.oy;
      const flyBack = () =>
        s.back.set(`${d.kind === 'passenger' ? 'p' : 's'}${d.i}`, {
          at: now,
          x: ax,
          y: ay,
          done: false,
        });
      if (r.kind === 'tickets' && d.kind === 'passenger') {
        const ticket = r.passengers[d.i]!.ticket;
        if (!d.moved || s.phase !== 'board') {
          flyBack();
          if (!d.moved) void say(trainTicket(ticket));
          return;
        }
        const j = wagonAt(d.x, d.y);
        if (j < 0) return flyBack();
        if (r.wagons[j] === ticket) {
          s.seated.set(d.i, { at: now, x: ax, y: ay, done: false });
          if (s.help === ticket) s.help = null;
          s.glow = null;
          fx.pop();
          return;
        }
        flyBack();
        s.bounce.set(j, now);
        mistake(ticket);
        const wrongNum = r.wagons[j]!;
        void retry(phrases).then(() => say(trainWagon(wrongNum), trainFind(ticket)));
        return;
      }
      if (r.kind === 'missing' && d.kind === 'spare') {
        const num = r.spare[d.i]!;
        if (!d.moved || s.phase !== 'fix' || s.filled) {
          flyBack();
          if (!d.moved) void say(trainWagon(num));
          return;
        }
        const gx = sx(wagonX(s.F, r.gap));
        const onGap = Math.abs(d.x - gx) < 0.8 * U && d.y > sy(-1.75) && d.y < sy(0.45);
        if (!onGap) return flyBack();
        const need = r.wagons[r.gap]!;
        if (num === need) {
          s.filled = { i: d.i, at: now, x: ax, y: ay, done: false };
          s.help = null;
          fx.whoosh();
          return;
        }
        flyBack();
        mistake(need);
        void retry(phrases).then(() => say(trainWagon(num), TRAIN_WHICH));
      }
    };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);

    let raf = 0;
    let last = performance.now();
    let frameNo = 0;
    // Начало: поезд в тоннеле — гудок, и выезжает к первой станции.
    const D0 = legLen();
    startLeg(-D0, 0);
    s.F = -D0 / 2;
    s.v = 3;
    s.swapped = true;
    s.once.add('tunnel');
    fx.toot();
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

  const busy = phase !== 'board' && phase !== 'fix';
  return (
    <div
      className="game train"
      data-testid="game-train"
      data-phase={phase}
      data-round={round}
      data-no-idle={busy || undefined}
      ref={root}
    >
      <canvas ref={canvas} className="train-canvas" />
      <div ref={hint} className="train-hint" data-hint={!busy || undefined} />
      <div ref={target} className="train-hint" data-hint-target={!busy || undefined} />
    </div>
  );
}
