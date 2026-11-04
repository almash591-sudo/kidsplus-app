// «Одень мишку» (этап 58). Мишка собирается гулять, а за окном погода: дождь, снег, жара или
// ветер — и она идёт по-настоящему (капли, снежинки, лучи, листья). Ребёнок берёт вещи из шкафа
// и надевает на мишку (нажать или перетащить): подходящая садится на место, неподходящая —
// мишка мотает головой, вещь возвращается в шкаф, и голос говорит почему. Старшим — «Что не
// так?»: мишка оделся сам и одну вещь перепутал (ему жарко, холодно или он мокнет) — её снять и
// надеть нужную. Всё — один canvas.
import { useEffect, useRef, useState } from 'react';
import type { DressWeather } from '@kidsplus/shared/games';
import { fx } from '../fx';
import {
  DRESS_DONE,
  DRESS_END,
  DRESS_FITS,
  DRESS_INSTEAD,
  DRESS_MORE,
  dressGood,
  dressOdd,
  dressTask,
  dressWhy,
} from '../phrases';
import { afterSpeech, clayUrl, praise, retry, say, setTask, type GameProps } from './common';
import {
  DRAW_ORDER,
  FITS,
  HEAD,
  ITEM_AR,
  SLOT,
  UMBRELLA,
  UMB_SPRITE,
  dressSprites,
  planDress,
  spriteOf,
  stageFor,
  wornBox,
  type Box,
  type DressStage,
  type ItemId,
  type Slot,
} from './dressLogic';

type Phase = 'drop' | 'play' | 'done' | 'finish';
/** «Одень» — take; «Что не так?» — сначала найти лишнее на мишке (see), потом надеть нужное (fix). */
type Step = 'take' | 'see' | 'fix';

const TAU = Math.PI * 2;
const COLORS = ['#ef4444', '#facc15', '#3b82f6', '#22c55e', '#a855f7', '#fb923c'];
const LEAVES = ['#f97316', '#facc15', '#ef4444', '#f59e0b'];
/** Сколько вещь летит из шкафа на мишку, обратно и снятая — в шкаф, мс. */
const FLY = 440;
const BACK = 400;
const OFF = 560;
/** Сколько мишка мотает головой в неподходящей вещи, мс. */
const SHAKE = 850;
/** Какую часть вида из окна оставить, если он шире окна (на солнце — само солнышко справа). */
const VIEW_FOCUS: Record<DressWeather, number> = { rain: 0.3, snow: 0.62, sun: 0.78, wind: 0.5 };
/** Солнце на картинке пляжа (доли картинки). */
const SUN = { x: 0.88, y: 0.18 };
/** «Что не так?»: как мишке в перепутанной вещи. */
const MOOD: Record<DressWeather, 'hot' | 'cold' | 'wet'> = {
  sun: 'hot',
  snow: 'cold',
  wind: 'cold',
  rain: 'wet',
};

/** Картинка вещи на экране: центр, ширина, поворот, зеркально. */
interface Piece {
  x: number;
  y: number;
  w: number;
  rot: number;
  flip: boolean;
}
interface TrayItem {
  id: ItemId;
  /** На мишке, летит или ещё не появилась — клетка пустая. */
  used: boolean;
  /** Когда появилась в шкафу — «выпрыгивает». */
  at: number;
}
interface Flight {
  id: ItemId;
  /** Клетка шкафа, откуда или куда. */
  cell: number;
  from: Piece[];
  /** На мишку (или обратно в шкаф). */
  bear: boolean;
  at: number;
  dur: number;
}
interface Drag {
  i: number;
  x: number;
  y: number;
  /** От пальца до середины вещи. */
  ox: number;
  oy: number;
  sx: number;
  sy: number;
  moved: boolean;
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
/** Погода в окне: капля, снежинка, блик или листик (в долях окна). */
interface Mote {
  x: number;
  y: number;
  v: number;
  r: number;
  ph: number;
  c: number;
}
/** Пот, капли с мокрой вещи, пар изо рта (px). */
interface Drip {
  x: number;
  y: number;
  vy: number;
  age: number;
  life: number;
  kind: 'sweat' | 'drip' | 'puff';
}

const ease = (k: number) => (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2);
const clamp01 = (k: number) => Math.max(0, Math.min(1, k));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** Выпрыгивает: от нуля с небольшим перелётом за 0.3 с. */
const popIn = (ms: number) => {
  const k = clamp01(ms / 300);
  return k <= 0 ? 0 : k < 1 ? Math.sin((k * Math.PI) / 2) + 0.15 * Math.sin(k * Math.PI) : 1;
};
const inBox = (p: { x: number; y: number }, b: Box) =>
  p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;
const isPair = (id: ItemId) => id !== 'umbrella' && !!FITS[id].pair;
/** Ширина картинки вещи, чтобы влезла в bw×bh. */
const fitW = (id: ItemId, bw: number, bh: number) => Math.min(bw, bh / ITEM_AR[id]);

export function Dress({ spec, phrases, onFinish }: GameProps<'dress'>) {
  const [rounds] = useState(() => planDress(spec));
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
    for (const name of dressSprites()) {
      const i = new Image();
      i.src = clayUrl(name);
      img.set(name, i);
    }
    const ok = (name: string) => {
      const i = img.get(name);
      return i && i.complete && i.naturalWidth > 0 ? i : undefined;
    };

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
    /** Комната на этот кадр. */
    let st: DressStage = stageFor(w, h, rounds[0]!.tray.length);

    const s = {
      round: 0,
      phase: 'drop' as Phase,
      phaseAt: 0,
      R: rounds[0]!,
      step: 'take' as Step,
      tray: [] as TrayItem[],
      /** Что надето и когда надели (вещь «выпрыгивает»). */
      worn: new Map<ItemId, number>(),
      flights: [] as Flight[],
      /** Неподходящая вещь на мишке: он мотает головой, потом она — обратно в шкаф. */
      bad: null as { id: ItemId; cell: number; at: number } | null,
      /** «Что не так?»: нажали подходящую вещь — она качнулась. */
      wiggle: null as { id: ItemId; at: number } | null,
      drag: null as Drag | null,
      enterAt: 0,
      leaveAt: -1,
      lockUntil: 0,
      wrong: 0,
      glowAt: -1e9,
      hopAt: -1e9,
      /** Погода прошлого задания — вид из окна плавно сменяется. */
      viewFrom: null as DressWeather | null,
      viewAt: -1e9,
      motes: [] as Mote[],
      moteW: null as DressWeather | null,
      ripples: [] as { x: number; y: number; age: number }[],
      glass: [] as Mote[],
      gusts: [] as { y: number; at: number; len: number }[],
      gustAt: 0,
      drips: [] as Drip[],
      dripAt: 0,
      puddle: 0,
      brr: false,
      timers: [] as { at: number; fn: () => void }[],
      particles: [] as Particle[],
      stopped: false,
      /** Для автотестов, только растут: вещей долетело до мишки, снято лишних, ошибок. */
      puts: 0,
      removed: 0,
      misses: 0,
    };
    const go = (p: Phase) => {
      s.phase = p;
      s.phaseAt = clock;
      setPhase(p);
    };
    const later = (ms: number, fn: () => void) => s.timers.push({ at: clock + ms, fn });
    /** Что ещё надеть. */
    const needLeft = () => s.R.need.filter((id) => !s.worn.has(id));

    // ─── Где вещи: в шкафу и на мишке ───
    /** Вещь в клетке шкафа — стоит на полке; пара — рядышком. */
    const trayPieces = (id: ItemId, c: Box): Piece[] => {
      const floor = c.y + c.h * 0.97;
      const cx = c.x + c.w / 2;
      if (isPair(id)) {
        const pw = fitW(id, c.w * 0.56, c.h * 0.78);
        const ph = pw * ITEM_AR[id];
        return [
          { x: cx - 0.17 * c.w, y: floor - ph / 2, w: pw, rot: 0, flip: false },
          { x: cx + 0.17 * c.w, y: floor - ph / 2 - 0.03 * c.h, w: pw, rot: 0, flip: true },
        ];
      }
      const pw = fitW(id, c.w * 0.86, c.h * 0.84);
      return [{ x: cx, y: floor - (pw * ITEM_AR[id]) / 2, w: pw, rot: 0, flip: false }];
    };
    /** Зонтик: от кольца ручки в лапе до середины купола. */
    const umbAxis = (b: Box) => {
      const hx = b.x + UMBRELLA.hand.x * b.w;
      const hy = b.y + UMBRELLA.hand.y * b.h;
      const cx = b.x + UMBRELLA.cap.x * b.w;
      const cy = b.y + UMBRELLA.cap.y * b.h;
      return {
        hx,
        hy,
        L: Math.hypot(cx - hx, cy - hy),
        rot: Math.atan2(cx - hx, hy - cy),
        k: (UMBRELLA.w * b.w) / UMB_SPRITE.W,
      };
    };
    /** Вещь на мишке (зонтик — целиком, примерно: так он летит). */
    const wornPieces = (id: ItemId, b: Box): Piece[] => {
      if (id === 'umbrella') {
        const a = umbAxis(b);
        const ly = -a.L + (UMB_SPRITE.H / 2 - UMB_SPRITE.cap) * a.k;
        return [
          {
            x: a.hx - Math.sin(a.rot) * ly,
            y: a.hy + Math.cos(a.rot) * ly,
            w: UMBRELLA.w * b.w,
            rot: a.rot,
            flip: false,
          },
        ];
      }
      const f = FITS[id];
      const one = (x: number, flip: boolean): Piece => ({
        x: b.x + x * b.w,
        y: b.y + f.y * b.h,
        w: f.w * b.w,
        rot: f.rot ?? 0,
        flip,
      });
      return f.pair ? [one(f.x, false), one(1 - f.x, true)] : [one(f.x, false)];
    };
    const center = (b: Box) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });
    const cellCenter = (i: number) => center(st.cells[i]!);
    const shown = (t: TrayItem) => !t.used && clock >= t.at;
    const trayHit = (p: { x: number; y: number }) =>
      s.tray.findIndex((t, i) => shown(t) && st.cells[i] && inBox(p, st.cells[i]!));
    /** Что надето там, куда нажали (мелкое — первым: шарф поверх куртки). */
    const wornHit = (p: { x: number; y: number }) =>
      [...s.worn.keys()]
        .map((id) => ({ id, b: wornBox(id, st.bear) }))
        .filter((x) => inBox(p, x.b))
        .sort((a, b) => a.b.w * a.b.h - b.b.w * b.b.h)[0]?.id;
    /** Куда отпустить вещь, чтобы она наделась: на мишку, с запасом. */
    const onBear = (p: { x: number; y: number }) => {
      const b = st.bear;
      return inBox(p, { x: b.x - 0.15 * b.w, y: b.y - 0.2 * b.h, w: 1.3 * b.w, h: 1.2 * b.h });
    };

    // ─── Задания ───
    const prompt = () =>
      s.R.task === 'odd'
        ? s.step === 'see'
          ? dressOdd(s.R.weather)
          : DRESS_INSTEAD
        : dressTask(s.R.weather, s.R.need.length);
    const initMotes = (wth: DressWeather) => {
      const n = { rain: 70, snow: 55, sun: 14, wind: 16 }[wth];
      s.motes = Array.from({ length: n }, () => ({
        x: Math.random() * 1.2 - 0.1,
        y: Math.random(),
        v: 0.6 + Math.random() * 0.8,
        r: Math.random(),
        ph: Math.random() * TAU,
        c: Math.floor(Math.random() * 4),
      }));
      s.glass =
        wth === 'rain'
          ? Array.from({ length: 8 }, () => ({
              x: 0.05 + Math.random() * 0.9,
              y: Math.random(),
              v: 0,
              r: Math.random(),
              ph: Math.random() * 3,
              c: 0,
            }))
          : [];
      s.ripples = [];
      s.gusts = [];
      s.moteW = wth;
    };
    const start = (k: number) => {
      const prev = k > 0 ? s.R.weather : null;
      s.round = k;
      setRound(k);
      s.R = rounds[k]!;
      const r = s.R;
      st = stageFor(w, h, r.tray.length);
      s.viewFrom = prev && prev !== r.weather ? prev : null;
      s.viewAt = clock;
      if (s.moteW !== r.weather) initMotes(r.weather);
      s.step = r.task === 'odd' ? 'see' : 'take';
      s.tray = r.tray.map((id, i) => ({ id, used: r.task === 'odd', at: clock + 350 + i * 90 }));
      s.worn = new Map(r.wear.map((id, i) => [id, clock + 200 + i * 80]));
      s.flights = [];
      s.bad = null;
      s.wiggle = null;
      s.drag = null;
      s.drips = [];
      s.puddle = 0;
      s.brr = false;
      s.wrong = 0;
      s.glowAt = -1e9;
      s.lockUntil = 0;
      s.enterAt = clock;
      s.leaveAt = -1;
      go('drop');
      void say(prompt());
    };

    const burst = (x: number, y: number, count: number, colors?: string[]) => {
      for (let i = 0; i < count; i++) {
        const a = Math.random() * TAU;
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

    /** Похвалили — следующее задание (одёжка снимается с искрами) или конец игры. */
    const next = (k: number) => {
      if (s.stopped || s.round !== k) return;
      if (k + 1 < rounds.length) {
        s.leaveAt = clock;
        fx.pop();
        for (const id of s.worn.keys()) {
          const c = center(wornBox(id, st.bear));
          burst(c.x, c.y, 4);
        }
        later(520, () => start(k + 1));
        return;
      }
      confetti();
      s.hopAt = clock;
      go('finish');
      void afterSpeech(say(DRESS_END), 2600).then(() => {
        if (!s.stopped) onFinish();
      });
    };
    /** Вещь из клетки i — на мишку. */
    const send = (i: number, from: Piece[]) => {
      const t = s.tray[i]!;
      t.used = true;
      s.flights.push({ id: t.id, cell: i, from, bear: true, at: clock, dur: FLY });
      fx.whoosh();
    };
    const sendBack = (i: number, from: Piece[], dur = BACK) => {
      const t = s.tray[i]!;
      t.used = true;
      s.flights.push({ id: t.id, cell: i, from, bear: false, at: clock, dur });
    };
    /** Долетела: в шкаф — встала на полку; на мишку — подошла или нет. */
    const arrive = (f: Flight) => {
      const t = s.tray[f.cell]!;
      if (!f.bear) {
        t.used = false;
        t.at = clock;
        return;
      }
      s.puts++;
      const r = s.R;
      const id = f.id;
      const c = center(wornBox(id, st.bear));
      if (!r.need.includes(id) || s.worn.has(id)) {
        s.bad = { id, cell: f.cell, at: clock };
        s.wrong++;
        s.misses++;
        s.lockUntil = clock + SHAKE + BACK;
        fx.rustle();
        void retry(phrases).then(() => say(dressWhy(r.weather, id)));
        later(SHAKE, () => {
          const b = s.bad;
          if (!b || s.stopped) return;
          s.bad = null;
          sendBack(b.cell, wornPieces(b.id, st.bear));
        });
        return;
      }
      s.worn.set(id, clock);
      fx.snap();
      fx.rustle();
      burst(c.x, c.y, 10);
      if (needLeft().length) {
        void say(dressGood(r.weather, id), DRESS_MORE);
        return;
      }
      go('done');
      s.hopAt = clock + 150;
      const k = s.round;
      void afterSpeech(
        praise(phrases, undefined, [dressGood(r.weather, id), DRESS_DONE[r.weather]]),
        2600,
      ).then(() => next(k));
    };
    /** «Что не так?»: нажали вещь на мишке. */
    const tapWorn = (id: ItemId) => {
      const r = s.R;
      fx.tap();
      if (id === r.wrong) {
        const cell = s.tray.findIndex((t) => t.id === id);
        s.worn.delete(id);
        sendBack(cell, wornPieces(id, st.bear), OFF);
        s.removed++;
        s.step = 'fix';
        s.wrong = 0;
        s.glowAt = -1e9;
        fx.whoosh();
        fx.sparkle();
        const c = center(wornBox(id, st.bear));
        burst(c.x, c.y, 12);
        s.tray.forEach((t, i) => {
          if (i === cell) return;
          t.used = false;
          t.at = clock + 300 + i * 110;
        });
        void say(dressWhy(r.weather, id), DRESS_INSTEAD);
        return;
      }
      s.wiggle = { id, at: clock };
      s.wrong++;
      s.misses++;
      s.lockUntil = clock + 900;
      void retry(phrases).then(() => say(DRESS_FITS));
    };

    /** «Ушко» и подсказка при бездействии: задание ещё раз, нужное светится. */
    const remind = () => {
      s.glowAt = clock;
      return say(prompt());
    };
    setTask(remind);

    // ─── Рисование ───
    /** Картинка, которая накрывает box целиком (лишнее обрезается; fx — какую часть оставить). */
    const cover = (im: HTMLImageElement, b: Box, fx0 = 0.5, fy0 = 0.5) => {
      const k = Math.max(b.w / im.naturalWidth, b.h / im.naturalHeight);
      const dw = im.naturalWidth * k;
      const dh = im.naturalHeight * k;
      const dx = b.x + (b.w - dw) * fx0;
      const dy = b.y + (b.h - dh) * fy0;
      ctx.drawImage(im, dx, dy, dw, dh);
      return { x: dx, y: dy, w: dw, h: dh };
    };
    /** Комната: коврик — под мишкой. */
    const drawRoom = () => {
      ctx.fillStyle = '#f7d9a6';
      ctx.fillRect(0, 0, w, h);
      const im = ok(st.land ? 'dress-bg-l' : 'dress-bg-p');
      if (!im) return;
      const k = Math.max(w / im.naturalWidth, h / im.naturalHeight);
      const dw = im.naturalWidth * k;
      const dh = im.naturalHeight * k;
      const b = st.bear;
      const dx = Math.max(w - dw, Math.min(0, b.x + b.w / 2 - 0.5 * dw));
      const dy = Math.max(h - dh, Math.min(0, b.y + b.h - 0.86 * dh));
      ctx.drawImage(im, dx, dy, dw, dh);
    };
    /** Солнечный свет из окна на пол. */
    const drawBeam = (a: number) => {
      if (a <= 0) return;
      const wb = st.win;
      const b = st.bear;
      const floor = b.y + b.h;
      const shift = st.land ? 0.35 * w : 0;
      ctx.save();
      ctx.globalAlpha = a;
      const g = ctx.createLinearGradient(0, wb.y + wb.h, 0, floor);
      g.addColorStop(0, 'rgba(255,240,170,0.32)');
      g.addColorStop(1, 'rgba(255,240,170,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(wb.x, wb.y + wb.h);
      ctx.lineTo(wb.x + wb.w, wb.y + wb.h);
      ctx.lineTo(wb.x + wb.w * 1.25 + shift, floor);
      ctx.lineTo(wb.x - wb.w * 0.15 + shift, floor);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    };

    // ─── Окно и погода в нём ───
    const drawView = (wth: DressWeather, a: number) => {
      const im = ok(`dress-view-${wth}`);
      const wb = st.win;
      ctx.globalAlpha = a;
      let v = { x: wb.x, y: wb.y, w: wb.w, h: wb.h };
      if (im) v = cover(im, wb, VIEW_FOCUS[wth], 0.5);
      else {
        ctx.fillStyle = wth === 'sun' ? '#7dd3fc' : wth === 'snow' ? '#e2e8f0' : '#94a3b8';
        ctx.fillRect(wb.x, wb.y, wb.w, wb.h);
      }
      ctx.globalAlpha = 1;
      return v;
    };
    const drawWeather = (dt: number, a: number, view: Box) => {
      const wb = st.win;
      const W = wb.w;
      const H = wb.h;
      const X = (x: number) => wb.x + x * W;
      const Y = (y: number) => wb.y + y * H;
      const wth = s.moteW;
      ctx.save();
      ctx.globalAlpha = a;
      if (wth === 'rain') {
        ctx.fillStyle = 'rgba(55,65,90,0.14)';
        ctx.fillRect(wb.x, wb.y, W, H);
        ctx.strokeStyle = 'rgba(228,236,255,0.62)';
        ctx.lineWidth = Math.max(1.2, H * 0.007);
        ctx.lineCap = 'round';
        ctx.beginPath();
        for (const m of s.motes) {
          m.y += m.v * 1.5 * dt;
          m.x -= m.v * 0.27 * dt;
          if (m.y > 1.08) {
            if (Math.random() < 0.45)
              s.ripples.push({ x: m.x, y: 0.78 + Math.random() * 0.2, age: 0 });
            m.y = -0.1 - Math.random() * 0.2;
            m.x = Math.random() * 1.25;
          }
          const len = (0.05 + 0.04 * m.r) * H;
          ctx.moveTo(X(m.x), Y(m.y));
          ctx.lineTo(X(m.x) + 0.18 * len, Y(m.y) - len);
        }
        ctx.stroke();
        ctx.lineWidth = Math.max(1, H * 0.005);
        for (const p of s.ripples) {
          p.age += dt;
          const k = p.age / 0.45;
          ctx.strokeStyle = `rgba(235,242,255,${0.6 * (1 - k)})`;
          ctx.beginPath();
          ctx.ellipse(X(p.x), Y(p.y), (0.01 + 0.03 * k) * W, (0.004 + 0.01 * k) * W, 0, 0, TAU);
          ctx.stroke();
        }
        s.ripples = s.ripples.filter((p) => p.age < 0.45);
        // Капли на стекле: сидят, потом скатываются.
        for (const d of s.glass) {
          d.ph -= dt;
          if (d.ph < 0) d.v = 0.25 + Math.random() * 0.3;
          if (d.v > 0) {
            d.y += d.v * dt;
            d.v *= 1 - dt * 1.5;
            if (d.v < 0.02) {
              d.v = 0;
              d.ph = 0.8 + Math.random() * 2.5;
            }
          }
          if (d.y > 1.05) {
            d.y = -0.05;
            d.x = 0.05 + Math.random() * 0.9;
          }
          const r = (0.008 + 0.01 * d.r) * Math.min(W, H) + 1;
          const x = X(d.x);
          const y = Y(d.y);
          ctx.strokeStyle = 'rgba(255,255,255,0.18)';
          ctx.lineWidth = r * 0.6;
          ctx.beginPath();
          ctx.moveTo(x, y - r * 4);
          ctx.lineTo(x, y);
          ctx.stroke();
          const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.1, x, y, r);
          g.addColorStop(0, 'rgba(255,255,255,0.9)');
          g.addColorStop(0.5, 'rgba(210,225,245,0.45)');
          g.addColorStop(1, 'rgba(120,140,170,0.35)');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(x, y, r, 0, TAU);
          ctx.fill();
        }
      } else if (wth === 'snow') {
        for (const m of s.motes) {
          m.y += (0.1 + 0.12 * m.v) * dt;
          m.x += Math.sin((clock / 1000) * (0.6 + m.v) + m.ph) * 0.05 * dt;
          if (m.y > 1.05) {
            m.y = -0.05;
            m.x = Math.random() * 1.1 - 0.05;
          }
          const near = m.r > 0.85;
          const r = (near ? 0.022 : 0.007 + 0.011 * m.r) * H;
          ctx.globalAlpha = a * (near ? 0.55 : 0.92);
          const g = ctx.createRadialGradient(X(m.x), Y(m.y), 0, X(m.x), Y(m.y), r);
          g.addColorStop(0, '#fff');
          g.addColorStop(0.6, 'rgba(255,255,255,0.85)');
          g.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(X(m.x), Y(m.y), r, 0, TAU);
          ctx.fill();
        }
      } else if (wth === 'sun') {
        // Лучи вокруг солнышка, оно светится; на воде и песке — блики.
        const sx = view.x + SUN.x * view.w;
        const sy = view.y + SUN.y * view.h;
        const R = Math.max(W, H);
        const turn = clock / 7000;
        for (let i = 0; i < 12; i++) {
          const an = (i * TAU) / 12 + turn;
          const g = ctx.createRadialGradient(sx, sy, 0.05 * R, sx, sy, R);
          g.addColorStop(0, 'rgba(255,248,200,0.38)');
          g.addColorStop(1, 'rgba(255,248,200,0)');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.moveTo(sx, sy);
          ctx.arc(sx, sy, R, an - 0.07, an + 0.07);
          ctx.closePath();
          ctx.fill();
        }
        const pulse = 0.5 + 0.5 * Math.sin(clock / 500);
        const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, (0.3 + 0.04 * pulse) * H);
        glow.addColorStop(0, 'rgba(255,250,210,0.75)');
        glow.addColorStop(1, 'rgba(255,240,160,0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(sx, sy, 0.34 * H, 0, TAU);
        ctx.fill();
        for (const m of s.motes) {
          const tw = Math.max(0, Math.sin((clock / 380) * m.v + m.ph)) ** 4;
          if (tw < 0.02) continue;
          const x = X(m.x * 0.9 + 0.05);
          const y = Y(0.55 + m.y * 0.42);
          const r = (0.012 + 0.012 * m.r) * H * tw;
          ctx.fillStyle = `rgba(255,255,255,${0.9 * tw})`;
          ctx.beginPath();
          for (let q = 0; q < 8; q++) {
            const an = (q * Math.PI) / 4;
            const rr = q % 2 ? r * 0.25 : r;
            ctx.lineTo(x + Math.cos(an) * rr, y + Math.sin(an) * rr);
          }
          ctx.closePath();
          ctx.fill();
        }
      } else if (wth === 'wind') {
        // Порывы — белые завитки, листья летят и кружатся.
        if (clock > s.gustAt) {
          s.gusts.push({
            y: 0.15 + Math.random() * 0.6,
            at: clock,
            len: 0.35 + Math.random() * 0.25,
          });
          s.gustAt = clock + 700 + Math.random() * 700;
        }
        ctx.lineCap = 'round';
        ctx.lineWidth = Math.max(1.5, H * 0.012);
        for (const g of s.gusts) {
          const k = (clock - g.at) / 1600;
          const x0 = -0.3 + k * 1.5;
          ctx.strokeStyle = `rgba(255,255,255,${0.7 * Math.sin(Math.PI * clamp01(k))})`;
          ctx.beginPath();
          ctx.moveTo(X(x0), Y(g.y));
          ctx.bezierCurveTo(
            X(x0 + g.len * 0.5),
            Y(g.y - 0.06),
            X(x0 + g.len),
            Y(g.y + 0.04),
            X(x0 + g.len * 1.05),
            Y(g.y - 0.05),
          );
          ctx.arc(
            X(x0 + g.len * 1.05) - 0.025 * H,
            Y(g.y - 0.05),
            0.025 * H,
            0,
            -Math.PI * 1.4,
            true,
          );
          ctx.stroke();
        }
        s.gusts = s.gusts.filter((g) => clock - g.at < 1600);
        for (const m of s.motes) {
          m.x += (0.3 + 0.35 * m.v) * dt;
          m.y += (Math.sin((clock / 500) * m.v + m.ph) * 0.25 + 0.03) * dt;
          if (m.x > 1.12 || m.y > 1.1 || m.y < -0.1) {
            m.x = -0.1 - Math.random() * 0.3;
            m.y = Math.random() * 0.85;
          }
          const x = X(m.x);
          const y = Y(m.y);
          const r = (0.028 + 0.02 * m.r) * H;
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(m.ph + (clock / 300) * m.v);
          ctx.fillStyle = LEAVES[m.c]!;
          ctx.beginPath();
          ctx.ellipse(0, 0, r, r * 0.5, 0, 0, TAU);
          ctx.fill();
          ctx.strokeStyle = 'rgba(120,60,10,0.5)';
          ctx.lineWidth = Math.max(1, r * 0.12);
          ctx.beginPath();
          ctx.moveTo(-r * 0.9, 0);
          ctx.lineTo(r * 0.9, 0);
          ctx.stroke();
          ctx.restore();
        }
      }
      ctx.restore();
    };
    const drawWindow = (dt: number) => {
      const wb = st.win;
      const ft = Math.max(6, Math.min(wb.w, wb.h) * 0.075);
      // Тень от рамы на стене.
      ctx.fillStyle = 'rgba(110,60,20,0.16)';
      ctx.beginPath();
      ctx.roundRect(wb.x - ft * 0.7, wb.y - ft * 0.4, wb.w + 2 * ft, wb.h + 2 * ft, ft * 0.8);
      ctx.fill();
      const fg = ctx.createLinearGradient(0, wb.y - ft, 0, wb.y + wb.h + ft);
      fg.addColorStop(0, '#fffdf7');
      fg.addColorStop(1, '#eadfca');
      ctx.fillStyle = fg;
      ctx.beginPath();
      ctx.roundRect(wb.x - ft, wb.y - ft, wb.w + 2 * ft, wb.h + 2 * ft, ft * 0.8);
      ctx.fill();
      ctx.strokeStyle = '#cdb994';
      ctx.lineWidth = Math.max(1, ft * 0.12);
      ctx.stroke();
      // Стекло: вид, погода, блики.
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(wb.x, wb.y, wb.w, wb.h, ft * 0.25);
      ctx.clip();
      const fade = s.viewFrom ? clamp01((clock - s.viewAt) / 700) : 1;
      if (s.viewFrom && fade < 1) drawView(s.viewFrom, 1);
      const view = drawView(s.R.weather, fade);
      drawWeather(dt, fade, view);
      ctx.fillStyle = 'rgba(255,255,255,0.13)';
      ctx.beginPath();
      ctx.moveTo(wb.x + wb.w * 0.12, wb.y);
      ctx.lineTo(wb.x + wb.w * 0.32, wb.y);
      ctx.lineTo(wb.x + wb.w * 0.08, wb.y + wb.h);
      ctx.lineTo(wb.x - wb.w * 0.12, wb.y + wb.h);
      ctx.closePath();
      ctx.moveTo(wb.x + wb.w * 0.4, wb.y);
      ctx.lineTo(wb.x + wb.w * 0.46, wb.y);
      ctx.lineTo(wb.x + wb.w * 0.22, wb.y + wb.h);
      ctx.lineTo(wb.x + wb.w * 0.16, wb.y + wb.h);
      ctx.closePath();
      ctx.fill();
      // Тень рамы на стекле.
      ctx.strokeStyle = 'rgba(60,40,20,0.22)';
      ctx.lineWidth = ft * 0.5;
      ctx.strokeRect(wb.x, wb.y, wb.w, wb.h);
      ctx.restore();
      // Перекладины: крестом, как у деревенского окна.
      const bar = ft * 0.55;
      const bx = wb.x + wb.w / 2;
      const by = wb.y + wb.h * 0.36;
      ctx.fillStyle = 'rgba(60,40,20,0.18)';
      ctx.fillRect(bx - bar / 2 + bar * 0.25, wb.y, bar, wb.h);
      ctx.fillRect(wb.x, by - bar / 2 + bar * 0.3, wb.w, bar);
      ctx.fillStyle = '#fbf6ea';
      ctx.fillRect(bx - bar / 2, wb.y, bar, wb.h);
      ctx.fillRect(wb.x, by - bar / 2, wb.w, bar);
      // Подоконник.
      const sy = wb.y + wb.h + ft * 0.55;
      ctx.fillStyle = 'rgba(110,60,20,0.2)';
      ctx.beginPath();
      ctx.roundRect(wb.x - 1.6 * ft, sy + ft * 0.5, wb.w + 3.2 * ft, ft * 1.0, ft * 0.4);
      ctx.fill();
      const sg = ctx.createLinearGradient(0, sy, 0, sy + ft);
      sg.addColorStop(0, '#ffffff');
      sg.addColorStop(1, '#e4d6bb');
      ctx.fillStyle = sg;
      ctx.beginPath();
      ctx.roundRect(wb.x - 1.6 * ft, sy, wb.w + 3.2 * ft, ft * 0.95, ft * 0.4);
      ctx.fill();
    };

    // ─── Шкаф ───
    const drawShelf = (alpha: number) => {
      const sh = st.shelf;
      const cell = st.cells[0]?.w ?? sh.h;
      const fr = cell * 0.1;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = 'rgba(80,40,10,0.22)';
      ctx.beginPath();
      ctx.roundRect(sh.x + fr * 0.6, sh.y + fr, sh.w, sh.h, fr);
      ctx.fill();
      const g = ctx.createLinearGradient(sh.x, 0, sh.x + sh.w, 0);
      g.addColorStop(0, '#dca066');
      g.addColorStop(1, '#bb7a40');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.roundRect(sh.x, sh.y, sh.w, sh.h, fr);
      ctx.fill();
      ctx.strokeStyle = '#8a5428';
      ctx.lineWidth = Math.max(1, fr * 0.22);
      ctx.stroke();
      // Задняя стенка — темнее, с тенью под каждой полкой.
      const ix = sh.x + fr;
      const iw = sh.w - 2 * fr;
      ctx.fillStyle = '#93602f';
      ctx.fillRect(ix, sh.y + fr, iw, sh.h - 2 * fr);
      let top = sh.y + fr;
      for (const b of st.boards) {
        const sg = ctx.createLinearGradient(0, top, 0, top + cell * 0.35);
        sg.addColorStop(0, 'rgba(50,25,5,0.35)');
        sg.addColorStop(1, 'rgba(50,25,5,0)');
        ctx.fillStyle = sg;
        ctx.fillRect(ix, top, iw, cell * 0.35);
        ctx.fillStyle = '#e3aa6e';
        ctx.fillRect(sh.x + fr * 0.4, b, sh.w - fr * 0.8, fr);
        ctx.fillStyle = 'rgba(255,235,200,0.55)';
        ctx.fillRect(sh.x + fr * 0.4, b, sh.w - fr * 0.8, Math.max(1, fr * 0.22));
        top = b + fr;
      }
      // Карниз сверху.
      ctx.fillStyle = '#c98a4c';
      ctx.beginPath();
      ctx.roundRect(sh.x - fr * 0.5, sh.y - fr * 0.5, sh.w + fr, fr * 1.3, fr * 0.4);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,235,200,0.5)';
      ctx.fillRect(sh.x - fr * 0.3, sh.y - fr * 0.42, sh.w + fr * 0.6, Math.max(1, fr * 0.25));
      ctx.restore();
    };

    /** Вещь — картинкой (зеркально, повёрнуто, k — «выпрыгивает»). */
    const drawPiece = (id: ItemId, p: Piece, k = 1, dx = 0, dy = 0, drot = 0) => {
      if (k <= 0) return;
      const im = ok(spriteOf(id));
      const pw = p.w * k;
      const ph = pw * ITEM_AR[id];
      ctx.save();
      ctx.translate(p.x + dx, p.y + dy);
      if (p.rot + drot) ctx.rotate(p.rot + drot);
      if (p.flip) ctx.scale(-1, 1);
      if (im) ctx.drawImage(im, -pw / 2, -ph / 2, pw, ph);
      else {
        ctx.fillStyle = '#e5e7eb';
        ctx.beginPath();
        ctx.roundRect(-pw / 2, -ph / 2, pw, ph, Math.min(pw, ph) * 0.2);
        ctx.fill();
      }
      ctx.restore();
    };
    /** Зонтик в лапе: палка (до головы) или купол с ручкой (после). */
    const drawUmbrella = (b: Box, part: 'shaft' | 'top', k: number) => {
      const im = ok('dress-umbrella');
      if (!im || k <= 0) return;
      const U = UMB_SPRITE;
      const q = im.naturalWidth / U.W;
      const a = umbAxis(b);
      const z = a.k;
      ctx.save();
      ctx.translate(a.hx, a.hy);
      ctx.rotate(a.rot);
      if (k !== 1) ctx.scale(k, k);
      const slice = (sx0: number, sy0: number, sx1: number, sy1: number, y0: number, y1: number) =>
        ctx.drawImage(
          im,
          sx0 * q,
          sy0 * q,
          (sx1 - sx0) * q,
          (sy1 - sy0) * q,
          (sx0 - U.axis) * z,
          y0,
          (sx1 - sx0) * z,
          y1 - y0,
        );
      if (part === 'shaft') {
        const [x0, x1, y0, y1] = U.shaft;
        slice(x0, y0, x1, y1, -a.L + (U.canopy - U.cap) * z - 2, (U.hook[2] - U.ring) * z + 2);
      } else {
        const [x0, x1, y0, y1] = U.hook;
        slice(x0, y0, x1, y1, (y0 - U.ring) * z, (y1 - U.ring) * z);
        slice(0, 0, U.W, U.canopy, -a.L - U.cap * z, -a.L + (U.canopy - U.cap) * z);
      }
      ctx.restore();
    };

    /** Мишка и всё, что на нём; mood — как ему в перепутанной вещи. */
    const drawBear = (leave: number, mood: 'hot' | 'cold' | 'wet' | null) => {
      const b = st.bear;
      const cx = b.x + b.w / 2;
      const feet = b.y + b.h;
      // Тень на полу — на месте, когда мишка подпрыгивает.
      const hk = (clock - s.hopAt) / 900;
      const hop = hk >= 0 && hk < 1 ? Math.abs(Math.sin(hk * TAU)) * (1 - hk) : 0;
      ctx.fillStyle = `rgba(70,35,10,${0.22 - 0.08 * hop})`;
      ctx.beginPath();
      ctx.ellipse(cx, feet - 0.01 * b.h, 0.4 * b.w * (1 - 0.25 * hop), 0.035 * b.h, 0, 0, TAU);
      ctx.fill();
      if (s.puddle > 0) {
        ctx.fillStyle = `rgba(120,160,220,${0.3 * s.puddle})`;
        ctx.beginPath();
        ctx.ellipse(cx, feet - 0.005 * b.h, 0.5 * b.w * s.puddle, 0.04 * b.h * s.puddle, 0, 0, TAU);
        ctx.fill();
      }
      let dx = 0;
      let rot = 0;
      const shiver = mood === 'cold' && clock % 2400 < 900;
      if (shiver) dx = Math.sin(clock * 0.13) * 0.012 * b.w;
      if (s.bad) {
        const k = clamp01((clock - s.bad.at) / SHAKE);
        rot = 0.07 * Math.sin(k * Math.PI * 5) * (1 - 0.6 * k);
      }
      const breathe = 1 + 0.008 * Math.sin(clock / 650);
      ctx.save();
      ctx.translate(cx + dx, feet - hop * 0.07 * b.h);
      ctx.rotate(rot);
      ctx.scale(1 + 0.04 * hop, breathe - 0.04 * hop);
      ctx.translate(-cx, -feet);
      const bear = ok('dress-bear');
      if (bear) ctx.drawImage(bear, b.x, b.y, b.w, b.h);
      else {
        ctx.fillStyle = '#b7793f';
        ctx.beginPath();
        ctx.ellipse(cx, b.y + 0.62 * b.h, 0.42 * b.w, 0.36 * b.h, 0, 0, TAU);
        ctx.ellipse(cx, b.y + 0.22 * b.h, 0.38 * b.w, 0.19 * b.h, 0, 0, TAU);
        ctx.fill();
      }
      if (mood === 'hot') {
        ctx.fillStyle = `rgba(255,90,90,${0.22 + 0.08 * Math.sin(clock / 300)})`;
        for (const x of [0.3, 0.7]) {
          ctx.beginPath();
          ctx.ellipse(b.x + x * b.w, b.y + 0.31 * b.h, 0.075 * b.w, 0.03 * b.h, 0, 0, TAU);
          ctx.fill();
        }
      }
      // Что надето — по местам; неподходящая вещь — вместо той, что на этом месте.
      const bySlot = new Map<Slot, { id: ItemId; at: number; bad: boolean }>();
      for (const [id, at] of s.worn) bySlot.set(SLOT[id], { id, at, bad: false });
      if (s.bad) bySlot.set(SLOT[s.bad.id], { id: s.bad.id, at: s.bad.at, bad: true });
      const out = 1 - ease(leave);
      const kOf = (it: { at: number; bad: boolean }) =>
        (it.bad ? Math.min(1.08, popIn(clock - it.at)) : popIn(clock - it.at)) * out;
      for (const slot of DRAW_ORDER) {
        if (slot === 'head') {
          // Палка зонтика — за головой; голова поверх воротника и шарфа.
          const um = bySlot.get('hand');
          if (um) drawUmbrella(b, 'shaft', kOf(um));
          if (bear && bySlot.size) {
            ctx.save();
            ctx.beginPath();
            ctx.ellipse(
              b.x + HEAD.x * b.w,
              b.y + HEAD.y * b.h,
              HEAD.rx * b.w,
              HEAD.ry * b.h,
              0,
              0,
              TAU,
            );
            ctx.clip();
            ctx.drawImage(bear, b.x, b.y, b.w, b.h);
            ctx.restore();
          }
          if (mood === 'hot') {
            ctx.fillStyle = `rgba(255,90,90,${0.22 + 0.08 * Math.sin(clock / 300)})`;
            for (const x of [0.3, 0.7]) {
              ctx.beginPath();
              ctx.ellipse(b.x + x * b.w, b.y + 0.31 * b.h, 0.075 * b.w, 0.03 * b.h, 0, 0, TAU);
              ctx.fill();
            }
          }
        }
        const it = bySlot.get(slot);
        if (!it) continue;
        const k = kOf(it);
        if (it.id === 'umbrella') {
          drawUmbrella(b, 'top', k);
          continue;
        }
        let ox = 0;
        let oy = 0;
        let orot = 0;
        if (it.bad) {
          const q = clamp01((clock - it.at) / SHAKE);
          ox = Math.sin(q * 40) * (1 - q) * 0.03 * b.w;
        }
        if (s.wiggle?.id === it.id) {
          const q = clamp01((clock - s.wiggle.at) / 600);
          orot = 0.14 * Math.sin(q * 25) * (1 - q);
        }
        // Панамку вот-вот унесёт ветром.
        if (mood === 'cold' && s.R.weather === 'wind' && it.id === s.R.wrong && slot === 'head') {
          oy = -Math.abs(Math.sin(clock / 260)) * 0.03 * b.h;
          orot += 0.12 * Math.sin(clock / 230);
        }
        for (const p of wornPieces(it.id, b)) drawPiece(it.id, p, k, ox, oy, orot);
      }
      ctx.restore();
      // Холодно: дрожь — синие зигзаги по бокам.
      if (shiver) {
        ctx.strokeStyle = 'rgba(96,165,250,0.85)';
        ctx.lineWidth = Math.max(2, 0.012 * b.w);
        ctx.lineCap = 'round';
        for (const side of [-1, 1]) {
          const x0 = cx + side * 0.58 * b.w;
          ctx.beginPath();
          for (let i = 0; i < 5; i++)
            ctx.lineTo(x0 + (i % 2 ? side * 0.05 * b.w : 0), b.y + (0.36 + i * 0.05) * b.h);
          ctx.stroke();
        }
      }
    };
    /** Пот, капли с мокрой вещи и пар изо рта. */
    const drawDrips = (dt: number, mood: 'hot' | 'cold' | 'wet' | null) => {
      const b = st.bear;
      if (mood && clock > s.dripAt) {
        if (mood === 'hot') {
          s.drips.push({
            x: b.x + (Math.random() < 0.5 ? 0.2 : 0.8) * b.w,
            y: b.y + 0.12 * b.h,
            vy: 0.1 * b.h,
            age: 0,
            life: 1.1,
            kind: 'sweat',
          });
          s.dripAt = clock + 550;
        } else if (mood === 'wet' && s.R.wrong) {
          const wb = wornBox(s.R.wrong, b);
          s.drips.push({
            x: wb.x + (0.15 + 0.7 * Math.random()) * wb.w,
            y: wb.y + wb.h * 0.92,
            vy: 0,
            age: 0,
            life: 1.2,
            kind: 'drip',
          });
          s.dripAt = clock + 260;
        } else if (mood === 'cold') {
          s.drips.push({
            x: b.x + 0.5 * b.w,
            y: b.y + 0.34 * b.h,
            vy: -0.08 * b.h,
            age: 0,
            life: 1.3,
            kind: 'puff',
          });
          s.dripAt = clock + 2400;
          if (!s.brr) {
            s.brr = true;
            fx.brr();
          }
        }
      }
      if (mood === 'wet') s.puddle = Math.min(1, s.puddle + dt * 0.3);
      else s.puddle = Math.max(0, s.puddle - dt * 0.6);
      const feet = b.y + b.h;
      for (const d of s.drips) {
        d.age += dt;
        if (d.kind === 'drip') {
          d.vy += 1.6 * b.h * dt;
          d.y = Math.min(feet, d.y + d.vy * dt);
        } else d.y += d.vy * dt;
        const k = d.age / d.life;
        const r = (d.kind === 'puff' ? 0.05 + 0.08 * k : 0.022) * b.w;
        if (d.kind === 'puff') {
          ctx.fillStyle = `rgba(255,255,255,${0.75 * (1 - k)})`;
          for (const [ox, oy, rr] of [
            [0, 0, 1],
            [0.8, 0.2, 0.7],
            [-0.7, 0.3, 0.65],
          ] as const) {
            ctx.beginPath();
            ctx.arc(d.x - k * 0.1 * b.w + ox * r, d.y + oy * r, r * rr, 0, TAU);
            ctx.fill();
          }
          continue;
        }
        ctx.fillStyle =
          d.kind === 'sweat'
            ? `rgba(147,197,253,${0.95 * (1 - k * k)})`
            : `rgba(96,165,250,${0.9 * (1 - k * k)})`;
        ctx.beginPath();
        ctx.moveTo(d.x, d.y - r * 1.8);
        ctx.quadraticCurveTo(d.x + r, d.y - r * 0.2, d.x, d.y + r);
        ctx.quadraticCurveTo(d.x - r, d.y - r * 0.2, d.x, d.y - r * 1.8);
        ctx.fill();
      }
      s.drips = s.drips.filter((d) => d.age < d.life);
    };
    /** Мягкое светлое пятно — подсказка «сюда». */
    const halo = (x: number, y: number, r: number, k: number) => {
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(255,250,200,${0.9 * k})`);
      g.addColorStop(0.6, `rgba(255,250,200,${0.45 * k})`);
      g.addColorStop(1, 'rgba(255,250,200,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.fill();
    };
    /** Где вещь в полёте сейчас: от from к полке или на мишку, дугой. */
    const flightPieces = (f: Flight) => {
      const k = clamp01((clock - f.at) / f.dur);
      const e = ease(k);
      const to = f.bear ? wornPieces(f.id, st.bear) : trayPieces(f.id, st.cells[f.cell]!);
      const lift = Math.sin(Math.PI * k) * 0.12 * Math.min(w, h);
      return to.map((t, i) => {
        const a = f.from[i] ?? f.from[0]!;
        return {
          x: lerp(a.x, t.x, e),
          y: lerp(a.y, t.y, e) - lift,
          w: lerp(a.w, t.w, e),
          rot: lerp(a.rot, t.rot, e),
          flip: t.flip,
        };
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
      const r = s.R;
      st = stageFor(w, h, r.tray.length);

      const due = s.timers.filter((t) => t.at <= clock);
      if (due.length) {
        s.timers = s.timers.filter((t) => t.at > clock);
        for (const t of due) if (!s.stopped) t.fn();
      }
      const landed = s.flights.filter((f) => clock >= f.at + f.dur);
      if (landed.length) {
        s.flights = s.flights.filter((f) => clock < f.at + f.dur);
        for (const f of landed) arrive(f);
      }
      const enterMs = clock - s.enterAt;
      if (s.phase === 'drop' && enterMs > 650 + r.tray.length * 90) go('play');

      // ─── Что подсказать ───
      const helpId =
        s.step === 'see'
          ? null
          : (needLeft().find((id) => {
              const t = s.tray.find((x) => x.id === id);
              return t && shown(t);
            }) ?? null);
      const helpCell = helpId ? s.tray.findIndex((t) => t.id === helpId) : -1;
      const sinceGlow = (clock - s.glowAt) / 1000;
      const glow =
        s.phase !== 'play'
          ? 0
          : Math.max(
              s.wrong >= 2 ? 0.55 + 0.35 * Math.sin(clock / 180) : 0,
              sinceGlow < 1.8 ? 0.5 + 0.4 * Math.sin(sinceGlow * 9) : 0,
            );
      const mood =
        r.task === 'odd' && s.step === 'see' && s.phase === 'play' && s.leaveAt < 0
          ? MOOD[r.weather]
          : null;

      // ─── Сцена ───
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawRoom();
      drawBeam(r.weather === 'sun' ? clamp01((clock - s.viewAt) / 700) : 0);
      drawWindow(dt);
      const leave = s.leaveAt >= 0 ? clamp01((clock - s.leaveAt) / 320) : 0;
      drawShelf(1);
      // Вещи в шкафу: тень на полке, нужная — светится.
      s.tray.forEach((t, i) => {
        const c = st.cells[i];
        if (!c || t.used || (s.drag?.i === i && s.drag.moved)) return;
        const k = popIn(clock - t.at) * (1 - ease(leave));
        if (k <= 0) return;
        if (i === helpCell && glow > 0) halo(c.x + c.w / 2, c.y + c.h / 2, c.w * 0.75, glow);
        ctx.fillStyle = 'rgba(50,25,5,0.3)';
        ctx.beginPath();
        ctx.ellipse(c.x + c.w / 2, c.y + c.h * 0.97, c.w * 0.32 * k, c.h * 0.045, 0, 0, TAU);
        ctx.fill();
        for (const p of trayPieces(t.id, c))
          drawPiece(t.id, { ...p, y: p.y + (1 - k) * p.w * 0.3 }, k);
      });
      // Лишнее на мишке светится, если подсказывают.
      if (s.step === 'see' && r.wrong && s.worn.has(r.wrong) && glow > 0) {
        const c = center(wornBox(r.wrong, st.bear));
        halo(c.x, c.y, st.bear.w * 0.45, glow);
      }
      if (s.drag?.moved && s.phase === 'play') {
        const b = st.bear;
        halo(b.x + b.w / 2, b.y + b.h * 0.5, b.h * 0.55, 0.3 + 0.1 * Math.sin(clock / 200));
      }
      drawBear(leave, mood);
      drawDrips(dt, mood);
      for (const f of s.flights) for (const p of flightPieces(f)) drawPiece(f.id, p);
      const d = s.drag;
      if (d && d.moved) {
        const t = s.tray[d.i]!;
        const c = st.cells[d.i]!;
        const cc = center(c);
        for (const p of trayPieces(t.id, c))
          drawPiece(t.id, {
            ...p,
            x: d.x + d.ox + (p.x - cc.x) * 1.15,
            y: d.y + d.oy + (p.y - cc.y) * 1.15,
            w: p.w * 1.15,
          });
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

      // Палец подсказки (IdleHint): нужную вещь — на мишку; в «Что не так?» — на лишнее.
      if (frameNo % 6 === 0 && hint.current && target.current) {
        const hs = hint.current.style;
        const ts = target.current.style;
        const place = (st2: CSSStyleDeclaration, x: number, y: number, bw: number, bh: number) => {
          st2.display = 'block';
          st2.left = `${x - bw / 2}px`;
          st2.top = `${y - bh / 2}px`;
          st2.width = `${bw}px`;
          st2.height = `${bh}px`;
        };
        hs.display = 'none';
        ts.display = 'none';
        if (s.phase === 'play' && !s.flights.length && !s.bad) {
          if (s.step === 'see' && r.wrong) {
            const b = wornBox(r.wrong, st.bear);
            const c = center(b);
            place(hs, c.x, c.y, Math.min(b.w, b.h) * 0.6, Math.min(b.w, b.h) * 0.6);
          } else if (helpId && helpCell >= 0) {
            const c = cellCenter(helpCell);
            const cw = st.cells[helpCell]!.w;
            place(hs, c.x, c.y, cw * 0.7, cw * 0.7);
            const t = center(wornBox(helpId, st.bear));
            place(ts, t.x, t.y, st.bear.w * 0.3, st.bear.w * 0.3);
          }
        }
      }
      // Для автотестов — каждый кадр.
      if (webdriver) {
        el.dataset.task = r.task;
        el.dataset.weather = r.weather;
        el.dataset.step = s.step;
        el.dataset.need = JSON.stringify(s.step === 'see' ? [] : needLeft());
        el.dataset.wrong = r.wrong ?? '';
        el.dataset.puts = String(s.puts);
        el.dataset.removed = String(s.removed);
        el.dataset.misses = String(s.misses);
        el.dataset.busy = s.flights.length || s.bad || s.drag || clock < s.lockUntil ? '1' : '0';
        const b = st.bear;
        el.dataset.bear = JSON.stringify({
          x: Math.round(b.x + b.w / 2),
          y: Math.round(b.y + b.h / 2),
        });
        el.dataset.tray = JSON.stringify(
          s.tray.map((t, i) => {
            const c = cellCenter(i);
            return { id: t.id, x: Math.round(c.x), y: Math.round(c.y), ready: shown(t) };
          }),
        );
        el.dataset.worn = JSON.stringify(
          [...s.worn.keys()].map((id) => {
            const c = center(wornBox(id, b));
            return { id, x: Math.round(c.x), y: Math.round(c.y) };
          }),
        );
      }
      raf = requestAnimationFrame(frame);
    };

    // ─── Касания: вещь — на мишку (нажать или перетащить); в «Что не так?» — снять лишнее ───
    const at = (e: PointerEvent) => {
      const box = el.getBoundingClientRect();
      return { x: e.clientX - box.left, y: e.clientY - box.top };
    };
    const busyNow = () =>
      s.phase !== 'play' || clock < s.lockUntil || !!s.bad || s.flights.length > 0;
    const down = (e: PointerEvent) => {
      if ((e.target as Element).closest('.corner-button')) return;
      if (s.drag || busyNow()) return;
      const p = at(e);
      if (s.step === 'see') {
        const id = wornHit(p);
        if (id) tapWorn(id);
        return;
      }
      const i = trayHit(p);
      if (i < 0) return;
      const c = cellCenter(i);
      s.drag = { i, x: p.x, y: p.y, ox: c.x - p.x, oy: c.y - p.y, sx: p.x, sy: p.y, moved: false };
      el.setPointerCapture?.(e.pointerId);
      fx.tap();
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
      if (busyNow()) return;
      const t = s.tray[d.i]!;
      const c = st.cells[d.i]!;
      if (!d.moved) return send(d.i, trayPieces(t.id, c));
      const cc = center(c);
      const from = trayPieces(t.id, c).map((p) => ({
        ...p,
        x: d.x + d.ox + (p.x - cc.x) * 1.15,
        y: d.y + d.oy + (p.y - cc.y) * 1.15,
        w: p.w * 1.15,
      }));
      if (e.type === 'pointerup' && onBear(d)) return send(d.i, from);
      // Мимо мишки — обратно на полку, это не ошибка.
      sendBack(d.i, from);
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
      className="game dress"
      data-testid="game-dress"
      data-phase={phase}
      data-round={round}
      data-no-idle={busy || undefined}
      ref={root}
    >
      <canvas ref={canvas} className="dress-canvas" />
      <div ref={hint} className="dress-hint" data-hint={!busy || undefined} />
      <div ref={target} className="dress-hint" data-hint-target={!busy || undefined} />
    </div>
  );
}
