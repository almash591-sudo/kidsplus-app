// «Сложи фигуру» (этап 58). Настоящий танграм: по тёмному силуэту собрать домик, рыбку, кошку или
// кораблик из семи деталей. Часть деталей уже стоит, остальные лежат в лотке — их тянут пальцем
// на свои места (одинаковые детали встают на любое из своих), на месте деталь защёлкивается.
// Старшим детали лежат повёрнутыми: нажать — повернётся. Собранная фигура оживает: рыбка машет
// хвостом и уплывает, в домике загорается окошко и идёт дым, кошка мяукает и прыгает, кораблик
// уплывает. Всё — один canvas.
import { useEffect, useRef, useState } from 'react';
import type { FigureShape } from '@kidsplus/shared/games';
import { fx } from '../fx';
import { FIGURE_DONE, FIGURE_END, FIGURE_NOT_HERE, FIGURE_TURN, figureTask } from '../phrases';
import { afterSpeech, clayUrl, praise, retry, say, setTask, type GameProps } from './common';
import {
  ALIVE,
  BACKDROP,
  FIGURES,
  PIECE_COLORS,
  centroid,
  dropAt,
  figureSprites,
  fits,
  planFigure,
  radius,
  rel,
  stageFor,
  toFigure,
  toScreen,
  type FigureStage,
  type Pt,
} from './figureLogic';

type Phase = 'drop' | 'play' | 'done' | 'finish';
type Back = (typeof BACKDROP)[FigureShape];

const TAU = Math.PI * 2;
const QUARTER = Math.PI / 2;
const COLORS = ['#ef4444', '#facc15', '#3b82f6', '#22c55e', '#a855f7', '#fb923c'];
/** Сколько деталь летит на место, обратно в лоток и к месту «почти», мс. */
const SNAP_MS = 240;
const BACK_MS = 380;
const HOVER_MS = 220;
/** Поворот по нажатию, мс. */
const SPIN_MS = 220;
/** «Почти»: деталь над своим местом качается — не так повёрнута, мс. */
const WOBBLE_MS = 750;
/** Пока палец не протащил деталь на столько px, она растёт из лотка до размера в фигуре. */
const GROW_PX = 60;
/** Линия горизонта (луг, море) на картинках фона — доля высоты. */
const HORIZON: Record<Back, { p: number; l: number }> = {
  meadow: { p: 0.45, l: 0.5 },
  sea: { p: 0.69, l: 0.715 },
  deep: { p: 0.5, l: 0.5 },
};
/** Где на фигуре эта линия: домик и кошка стоят на траве, кораблик сидит в воде. */
const LINE: Record<Back, number> = { meadow: 0.6, sea: 0.72, deep: 0.5 };
const BACK_FILL: Record<Back, string> = { meadow: '#9be07a', sea: '#7cc8f2', deep: '#2aa7c9' };

/** Деталь на экране: середина, px в единице фигуры, угол. */
interface Pose {
  x: number;
  y: number;
  u: number;
  a: number;
}
/** Деталь в лотке. */
interface Loose {
  /** Какая это деталь фигуры (её вид и цвет). */
  idx: number;
  /** Как повёрнута сейчас (четверти) и угол на экране — к нему плавно доворачивается. */
  k: number;
  ang: number;
  spinFrom: number;
  spinAt: number;
  /** На месте, в полёте или ещё не появилась — в лотке её нет. */
  used: boolean;
  /** Когда появилась в лотке — «выпрыгивает»; качнулась от нажатия. */
  at: number;
  wiggleAt: number;
}
interface Placed {
  idx: number;
  a: number;
  at: number;
}
interface Flight {
  n: number;
  from: Pose;
  /** На место, обратно в лоток или к месту «почти» (покачаться и обратно). */
  to: 'slot' | 'tray' | 'hover';
  slot: number;
  aTo: number;
  at: number;
  dur: number;
}
interface Drag {
  n: number;
  x: number;
  y: number;
  /** От пальца до середины детали в лотке. */
  ox: number;
  oy: number;
  sx: number;
  sy: number;
  moved: boolean;
  /** Сколько px протащили (деталь растёт). */
  went: number;
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
/** Пузырьки рыбки, дым из трубы, пена за корабликом. */
interface Puff {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  age: number;
  life: number;
  kind: 'bubble' | 'smoke' | 'foam';
}

const ease = (k: number) => (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2);
const clamp01 = (k: number) => Math.max(0, Math.min(1, k));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** Выпрыгивает: от нуля с небольшим перелётом за 0.3 с. */
const popIn = (ms: number) => {
  const k = clamp01(ms / 300);
  return k <= 0 ? 0 : k < 1 ? Math.sin((k * Math.PI) / 2) + 0.15 * Math.sin(k * Math.PI) : 1;
};
/** Тот из углов a + 2πm, что ближе всего к b. */
const nearAngle = (a: number, b: number) => a + Math.round((b - a) / TAU) * TAU;

export function Figure({ spec, phrases, onFinish }: GameProps<'figure'>) {
  const [rounds] = useState(() => planFigure(spec));
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
    // Силуэт рисуется отдельно и целиком кладётся полупрозрачным — без светлых швов между деталями.
    const sil = document.createElement('canvas');
    const sctx = sil.getContext('2d')!;
    const img = new Map<string, HTMLImageElement>();
    for (const name of figureSprites()) {
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
      sil.width = cv.width;
      sil.height = cv.height;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    const webdriver = navigator.webdriver;
    /** Часы игры, мс: идут только с кадрами — погашенный экран ставит игру на паузу. */
    let clock = 0;

    const s = {
      round: 0,
      phase: 'drop' as Phase,
      phaseAt: 0,
      R: rounds[0]!,
      fig: FIGURES[rounds[0]!.figure],
      tray: [] as Loose[],
      /** Места заняты: деталь стоит или летит туда. */
      filled: new Set<number>(),
      placed: new Map<number, Placed>(),
      flights: [] as Flight[],
      /** «Почти»: деталь качается над местом. */
      wobble: null as { n: number; slot: number; a: number; at: number } | null,
      /** Нажали деталь, когда поворачивать не нужно: её место на миг светится. */
      peek: null as { n: number; at: number } | null,
      drag: null as Drag | null,
      enterAt: 0,
      leaveAt: -1,
      doneAt: -1,
      lockUntil: 0,
      wrong: 0,
      glowAt: -1e9,
      back: 'meadow' as Back,
      backFrom: null as Back | null,
      backAt: -1e9,
      timers: [] as { at: number; fn: () => void }[],
      particles: [] as Particle[],
      puffs: [] as Puff[],
      puffAt: 0,
      stopped: false,
      /** Для автотестов, только растут: защёлкнулось, повернули, «почти», ошибок. */
      snaps: 0,
      turns: 0,
      almost: 0,
      misses: 0,
    };
    const go = (p: Phase) => {
      s.phase = p;
      s.phaseAt = clock;
      setPhase(p);
    };
    const later = (ms: number, fn: () => void) => s.timers.push({ at: clock + ms, fn });

    /** Фигура и лоток на этот размер экрана (пересчёт — только когда что-то поменялось). */
    let st: FigureStage = stageFor(w, h, s.fig, s.R.loose);
    let stKey = '';
    const stage = () => {
      const key = `${w}x${h}:${s.round}`;
      if (key !== stKey) {
        stKey = key;
        st = stageFor(w, h, s.fig, s.R.loose);
      }
      return st;
    };

    // ─── Где детали ───
    /** Цвет детали: у двух одинаковых — разные. */
    const colorOf = (idx: number) => {
      const p = s.fig.pieces;
      const type = p[idx]!.type;
      const nth = p.slice(0, idx).filter((q) => q.type === type).length;
      const cs = PIECE_COLORS[type];
      return cs[nth % cs.length]!;
    };
    const slotCenter = (j: number) => toScreen(st, centroid(s.fig.pieces[j]!.v));
    const angNow = (t: Loose) =>
      lerp(t.spinFrom, t.ang, ease(clamp01((clock - t.spinAt) / SPIN_MS)));
    const trayPose = (n: number): Pose => {
      const c = st.cells[n]!;
      return { x: c.x, y: c.y, u: st.tunit, a: angNow(s.tray[n]!) };
    };
    const slotPose = (j: number, a: number): Pose => {
      const [x, y] = slotCenter(j);
      return { x, y, u: st.unit, a };
    };
    /** Деталь под пальцем: середина над пальцем — чтобы палец её не закрывал. */
    const lift = () => Math.min(st.unit * 0.25, 22);
    const dragPose = (d: Drag): Pose => {
      const g = ease(clamp01(d.went / GROW_PX));
      const t = s.tray[d.n]!;
      return {
        x: d.x + d.ox * (1 - g),
        y: d.y + d.oy * (1 - g) - lift() * g,
        u: lerp(st.tunit, st.unit, g),
        a: t.ang,
      };
    };
    const flightPose = (f: Flight): Pose => {
      const k = clamp01((clock - f.at) / f.dur);
      const e = ease(k);
      const to = f.to === 'tray' ? trayPose(f.n) : slotPose(f.slot, f.aTo);
      const arc = f.to === 'tray' ? Math.sin(Math.PI * k) * 0.08 * Math.min(w, h) : 0;
      return {
        x: lerp(f.from.x, to.x, e),
        y: lerp(f.from.y, to.y, e) - arc,
        u: lerp(f.from.u, to.u, e),
        a: lerp(f.from.a, to.a, e),
      };
    };
    const shown = (t: Loose) => !t.used && clock >= t.at;
    /**
     * Куда эту деталь и сколько раз нажать, чтобы повернулась как надо: пустое место того же
     * вида, где поворотов меньше (её собственное — если свободно).
     */
    const goal = (n: number) => {
      const t = s.tray[n]!;
      const type = s.fig.pieces[t.idx]!.type;
      let best: { slot: number; taps: number } | null = null;
      s.fig.pieces.forEach((p, j) => {
        if (p.type !== type || s.filled.has(j)) return;
        const taps = spec.turn
          ? ([0, 1, 2, 3].find((q) => fits(s.fig, t.idx, (t.k + q) % 4, j)) ?? 4)
          : 0;
        if (taps > 3) return;
        if (!best || taps < best.taps || (taps === best.taps && j === t.idx))
          best = { slot: j, taps };
      });
      return best as { slot: number; taps: number } | null;
    };

    // ─── Задания ───
    const prompt = () => figureTask(s.R.figure, spec.turn);
    const start = (k: number) => {
      s.round = k;
      setRound(k);
      s.R = rounds[k]!;
      s.fig = FIGURES[s.R.figure];
      stKey = '';
      stage();
      const nextBack = BACKDROP[s.R.figure];
      s.backFrom = k > 0 && nextBack !== s.back ? s.back : null;
      s.back = nextBack;
      s.backAt = clock;
      const loose = new Set(s.R.loose);
      s.filled = new Set(s.fig.pieces.map((_, j) => j).filter((j) => !loose.has(j)));
      s.placed = new Map(
        [...s.filled].map((j, i) => [j, { idx: j, a: 0, at: clock + 150 + i * 70 }]),
      );
      const after = 250 + s.filled.size * 70;
      s.tray = s.R.loose.map((idx, n) => {
        const a = s.R.turns[n]! * QUARTER;
        return {
          idx,
          k: s.R.turns[n]!,
          ang: a,
          spinFrom: a,
          spinAt: -1e9,
          used: false,
          at: clock + after + n * 90,
          wiggleAt: -1e9,
        };
      });
      s.flights = [];
      s.wobble = null;
      s.peek = null;
      s.drag = null;
      s.puffs = [];
      s.wrong = 0;
      s.glowAt = -1e9;
      s.lockUntil = 0;
      s.enterAt = clock;
      s.leaveAt = -1;
      s.doneAt = -1;
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

    /** Похвалили — следующая фигура или конец игры. */
    const next = (k: number) => {
      if (s.stopped || s.round !== k) return;
      if (k + 1 < rounds.length) {
        s.leaveAt = clock;
        fx.whoosh();
        later(520, () => start(k + 1));
        return;
      }
      confetti();
      go('finish');
      void afterSpeech(say(FIGURE_END), 2600).then(() => {
        if (!s.stopped) onFinish();
      });
    };
    /** Все детали на местах: фигура оживает. */
    const done = () => {
      const f = s.R.figure;
      go('done');
      s.doneAt = clock;
      s.wrong = 0;
      later(450, () => {
        if (f === 'cat') fx.meow();
        else if (f === 'fish') fx.bubble();
        else if (f === 'boat') fx.toot();
        else fx.sparkle();
      });
      const k = s.round;
      void afterSpeech(praise(phrases, undefined, [FIGURE_DONE[f]]), 2600).then(() => next(k));
    };
    const fly = (n: number, from: Pose, to: Flight['to'], slot = -1, aTo = from.a) => {
      s.tray[n]!.used = true;
      const dur = to === 'slot' ? SNAP_MS : to === 'hover' ? HOVER_MS : BACK_MS;
      s.flights.push({ n, from, to, slot, aTo, at: clock, dur });
    };
    const arrive = (f: Flight) => {
      const t = s.tray[f.n]!;
      if (f.to === 'tray') {
        t.used = false;
        return;
      }
      if (f.to === 'hover') {
        s.wobble = { n: f.n, slot: f.slot, a: f.from.a, at: clock };
        later(WOBBLE_MS, () => {
          const wb = s.wobble;
          if (!wb || s.stopped) return;
          s.wobble = null;
          fly(wb.n, slotPose(wb.slot, wb.a), 'tray');
        });
        return;
      }
      s.placed.set(f.slot, { idx: t.idx, a: f.aTo, at: clock });
      s.snaps++;
      fx.snap();
      const [x, y] = slotCenter(f.slot);
      burst(x, y, 10, [colorOf(t.idx), '#fff', '#ffe14d']);
      if (s.placed.size === s.fig.pieces.length) done();
    };
    /** Отпустили деталь над фигурой. */
    const drop = (n: number, from: Pose) => {
      const t = s.tray[n]!;
      const r = dropAt(s.fig, s.filled, t.idx, t.k, toFigure(st, from.x, from.y), spec.turn);
      if (r.kind === 'snap') {
        s.filled.add(r.slot);
        // Повёрнутая уже лежит как надо; без поворотов — сама доворачивается, на ближайший угол.
        const ks = spec.turn ? [t.k] : [0, 1, 2, 3].filter((q) => fits(s.fig, t.idx, q, r.slot));
        const aTo = ks
          .map((q) => nearAngle(q * QUARTER, from.a))
          .reduce((a, b) => (Math.abs(b - from.a) < Math.abs(a - from.a) ? b : a));
        fly(n, from, 'slot', r.slot, aTo);
        return;
      }
      if (r.kind === 'turn') {
        s.almost++;
        s.wrong++;
        s.lockUntil = clock + HOVER_MS + WOBBLE_MS + BACK_MS;
        fx.soft();
        void say(FIGURE_TURN);
        fly(n, from, 'hover', r.slot, from.a);
        return;
      }
      if (r.kind === 'wrong') {
        s.wrong++;
        s.misses++;
        s.lockUntil = clock + BACK_MS + 500;
        void retry(phrases).then(() => say(FIGURE_NOT_HERE));
      }
      // Мимо — обратно в лоток, это не ошибка.
      fly(n, from, 'tray');
    };
    /** Нажали деталь: повернуть (если повороты есть) или подсказать её место. */
    const tap = (n: number) => {
      const t = s.tray[n]!;
      if (!spec.turn) {
        t.wiggleAt = clock;
        s.peek = { n, at: clock };
        return;
      }
      t.spinFrom = angNow(t);
      t.spinAt = clock;
      t.ang += QUARTER;
      t.k = (t.k + 1) % 4;
      s.turns++;
      fx.click();
    };

    /** «Ушко» и подсказка при бездействии: задание ещё раз, нужная деталь и место светятся. */
    const remind = () => {
      s.glowAt = clock;
      return say(prompt());
    };
    setTask(remind);

    // ─── Рисование ───
    /** Многоугольник детали на экране: вершины вокруг её середины, повёрнутые и в px. */
    const piecePts = (idx: number, p: Pose, k = 1): Pt[] => {
      const c = Math.cos(p.a);
      const sn = Math.sin(p.a);
      return rel(s.fig.pieces[idx]!.v).map(([x, y]) => [
        p.x + (x * c - y * sn) * p.u * k,
        p.y + (x * sn + y * c) * p.u * k,
      ]);
    };
    /** Контур со скруглёнными углами (глина не бывает острой). */
    const roundPath = (c: CanvasRenderingContext2D, pts: readonly Pt[], r: number) => {
      const n = pts.length;
      const mid = (i: number): Pt => {
        const a = pts[i % n]!;
        const b = pts[(i + 1) % n]!;
        return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      };
      c.beginPath();
      const m0 = mid(n - 1);
      c.moveTo(m0[0], m0[1]);
      for (let i = 0; i < n; i++) {
        const p = pts[i]!;
        const m = mid(i);
        c.arcTo(p[0], p[1], m[0], m[1], r);
      }
      c.closePath();
    };
    /** Глиняная деталь: тень, цвет, объём (свет сверху-слева), блик и светлая кромка. */
    const clay = (pts: readonly Pt[], color: string, u: number, alpha = 1) => {
      if (alpha <= 0) return;
      const xs = pts.map((p) => p[0]);
      const ys = pts.map((p) => p[1]);
      const x0 = Math.min(...xs);
      const y0 = Math.min(...ys);
      const x1 = Math.max(...xs);
      const y1 = Math.max(...ys);
      ctx.save();
      ctx.globalAlpha = alpha;
      roundPath(ctx, pts, u * 0.08);
      ctx.shadowColor = 'rgba(20,30,60,0.3)';
      ctx.shadowBlur = u * 0.14;
      ctx.shadowOffsetY = u * 0.06;
      ctx.fillStyle = color;
      ctx.fill();
      ctx.shadowColor = 'transparent';
      const g = ctx.createLinearGradient(x0, y0, x1, y1);
      g.addColorStop(0, 'rgba(255,255,255,0.38)');
      g.addColorStop(0.45, 'rgba(255,255,255,0.04)');
      g.addColorStop(1, 'rgba(0,0,0,0.2)');
      ctx.fillStyle = g;
      ctx.fill();
      ctx.save();
      ctx.clip();
      const cx = (x0 + x1) / 2;
      const cy = (y0 + y1) / 2;
      const hl = ctx.createRadialGradient(cx - u * 0.2, cy - u * 0.25, 0, cx, cy, u * 0.75);
      hl.addColorStop(0, 'rgba(255,255,255,0.32)');
      hl.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = hl;
      ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
      ctx.restore();
      ctx.lineJoin = 'round';
      ctx.lineWidth = Math.max(1.5, u * 0.035);
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.stroke();
      ctx.restore();
    };
    const drawPiece = (idx: number, p: Pose, alpha = 1, k = 1) =>
      clay(piecePts(idx, p, k), colorOf(idx), p.u * k, alpha);
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
    /** Фон фигуры: картинка накрывает экран, линия горизонта — у низа фигуры. */
    const drawBack = (b: Back, a: number) => {
      ctx.globalAlpha = a;
      ctx.fillStyle = BACK_FILL[b];
      ctx.fillRect(0, 0, w, h);
      const im = ok(`figure-${b}-${st.land ? 'l' : 'p'}`);
      if (im) {
        const k = Math.max(w / im.naturalWidth, h / im.naturalHeight);
        const dw = im.naturalWidth * k;
        const dh = im.naturalHeight * k;
        const line = st.box.y + st.box.h * LINE[b];
        const dy = Math.max(h - dh, Math.min(0, line - HORIZON[b][st.land ? 'l' : 'p'] * dh));
        ctx.drawImage(im, (w - dw) / 2, dy, dw, dh);
      }
      ctx.globalAlpha = 1;
    };
    /** Лоток: светлая полупрозрачная доска. */
    const drawTray = (a: number) => {
      const t = st.tray;
      const m = 6;
      ctx.save();
      ctx.globalAlpha = a;
      roundPath(
        ctx,
        [
          [t.x - m, t.y - m],
          [t.x + t.w + m, t.y - m],
          [t.x + t.w + m, t.y + t.h + m],
          [t.x - m, t.y + t.h + m],
        ],
        18,
      );
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.stroke();
      ctx.restore();
    };
    /** Тёмный силуэт фигуры целиком. */
    const drawSilhouette = (a: number) => {
      if (a <= 0) return;
      sctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      sctx.clearRect(0, 0, w, h);
      sctx.beginPath();
      for (const p of s.fig.pieces) {
        const pts = p.v.map((q) => toScreen(st, q));
        sctx.moveTo(pts[0]![0], pts[0]![1]);
        for (const q of pts.slice(1)) sctx.lineTo(q[0], q[1]);
        sctx.closePath();
      }
      sctx.fillStyle = '#26305c';
      sctx.fill();
      sctx.lineJoin = 'round';
      sctx.lineWidth = 2;
      sctx.strokeStyle = '#26305c';
      sctx.stroke();
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 0.66 * a;
      ctx.drawImage(sil, 0, 0);
      ctx.restore();
    };
    /** Контур пустого места: белый пунктир чуть внутри. */
    const drawOutline = (j: number, a: number, fill = 0) => {
      const p = s.fig.pieces[j]!;
      const [cx, cy] = centroid(p.v);
      const k = 1 - 0.07 / radius(s.fig, j);
      const pts = p.v.map(([x, y]) => toScreen(st, [cx + (x - cx) * k, cy + (y - cy) * k]));
      ctx.save();
      ctx.globalAlpha = a;
      roundPath(ctx, pts, st.unit * 0.05);
      if (fill > 0) {
        ctx.fillStyle = `rgba(255,255,255,${fill})`;
        ctx.fill();
      }
      ctx.setLineDash([st.unit * 0.13, st.unit * 0.1]);
      ctx.lineWidth = Math.max(2, st.unit * 0.04);
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.stroke();
      ctx.restore();
    };

    // ─── Фигура оживает ───
    /** Как сдвинута вся фигура (в секундах от «собрана»): плывёт, прыгает, качается. */
    const aliveMove = (t: number) => {
      const b = st.box;
      const f = s.R.figure;
      const away = (from: number, dur: number) => {
        const k = clamp01((t - from) / dur);
        return k * k * (w - b.x + 40);
      };
      if (f === 'fish')
        return { dx: away(0.9, 1.6), dy: Math.sin(t * 4) * 0.05 * b.h, rot: 0, sy: 1 };
      if (f === 'boat')
        return {
          dx: away(1.1, 1.9),
          dy: Math.sin(t * 2.6) * 0.02 * b.h,
          rot: Math.sin(t * 3) * 0.06,
          sy: 1,
        };
      if (f === 'cat') {
        const k = t < 1.7 ? Math.abs(Math.sin(t * Math.PI * 1.2)) * (1 - t / 1.7) : 0;
        return { dx: 0, dy: -k * 0.2 * b.h, rot: 0, sy: 1 };
      }
      return { dx: 0, dy: 0, rot: 0, sy: 1 + 0.06 * Math.sin(t * 12) * Math.exp(-t * 2.2) };
    };
    /** Вся собранная фигура: детали на местах; ожившая — двигается, хвост качается, глаза. */
    const drawPlaced = (alpha: number) => {
      const t = s.doneAt >= 0 ? (clock - s.doneAt) / 1000 : -1;
      const alive = ALIVE[s.R.figure];
      const b = st.box;
      ctx.save();
      if (t >= 0) {
        const m = aliveMove(t);
        const ox = b.x + b.w / 2;
        const oy = b.y + b.h;
        ctx.translate(ox + m.dx, oy + m.dy);
        ctx.rotate(m.rot);
        ctx.scale(1 / m.sy, m.sy);
        ctx.translate(-ox, -oy);
      }
      const wag =
        t >= 0 && alive.pivot
          ? Math.sin(t * (s.R.figure === 'fish' ? 13 : 8)) * (s.R.figure === 'fish' ? 0.3 : 0.35)
          : 0;
      const [px, py] = alive.pivot ? toScreen(st, alive.pivot) : [0, 0];
      for (const [j, p] of s.placed) {
        const k = clock < p.at ? 0 : popIn(clock - p.at);
        if (k <= 0) continue;
        const pulse = 1 + 0.08 * Math.sin(Math.PI * clamp01((clock - p.at) / 260));
        const swing = wag && alive.wag.includes(j);
        if (swing) {
          ctx.save();
          ctx.translate(px, py);
          ctx.rotate(wag);
          ctx.translate(-px, -py);
        }
        drawPiece(p.idx, slotPose(j, p.a), alpha, k * pulse);
        if (swing) ctx.restore();
      }
      if (t >= 0) {
        // Окошко домика загорается: тёплый свет и рама крестом.
        if (alive.window !== undefined && s.placed.has(alive.window)) {
          const a = clamp01((t - 0.2) / 0.5) * alpha;
          const pts = s.fig.pieces[alive.window]!.v.map((q) => toScreen(st, q));
          const [cx, cy] = slotCenter(alive.window);
          halo(cx, cy, st.unit * 1.1, a * 0.7);
          ctx.save();
          ctx.globalAlpha = a;
          roundPath(ctx, pts, st.unit * 0.08);
          ctx.fillStyle = 'rgba(255,214,90,0.9)';
          ctx.fill();
          ctx.lineWidth = Math.max(2, st.unit * 0.06);
          ctx.strokeStyle = 'rgba(255,255,255,0.9)';
          ctx.beginPath();
          ctx.moveTo(cx - st.unit * 0.42, cy);
          ctx.lineTo(cx + st.unit * 0.42, cy);
          ctx.moveTo(cx, cy - st.unit * 0.42);
          ctx.lineTo(cx, cy + st.unit * 0.42);
          ctx.stroke();
          ctx.restore();
        }
        // Глаза: появляются, смотрят вперёд, моргают.
        const open = t % 2.4 > 1.3 && t % 2.4 < 1.42 ? 0.12 : 1;
        const k = popIn((t - 0.15) * 1000);
        for (const e of alive.eyes) {
          const [ex, ey] = toScreen(st, e);
          const r = st.unit * 0.17 * k;
          if (r <= 0) continue;
          ctx.save();
          ctx.globalAlpha = alpha;
          ctx.translate(ex, ey);
          ctx.scale(1, open);
          ctx.fillStyle = '#fff';
          ctx.beginPath();
          ctx.arc(0, 0, r, 0, TAU);
          ctx.fill();
          ctx.lineWidth = Math.max(1, r * 0.12);
          ctx.strokeStyle = 'rgba(30,30,50,0.35)';
          ctx.stroke();
          ctx.fillStyle = '#1f2937';
          ctx.beginPath();
          ctx.arc(r * 0.22, r * 0.08, r * 0.55, 0, TAU);
          ctx.fill();
          ctx.fillStyle = '#fff';
          ctx.beginPath();
          ctx.arc(r * 0.05, -r * 0.18, r * 0.18, 0, TAU);
          ctx.fill();
          ctx.restore();
        }
      }
      ctx.restore();
    };
    /** Пузырьки, дым, пена — из ожившей фигуры. */
    const spawnPuffs = (t: number) => {
      if (t < 0.3 || clock < s.puffAt) return;
      const f = s.R.figure;
      const m = aliveMove(t);
      const u = st.unit;
      if (f === 'fish') {
        const e = ALIVE.fish.eyes[0]!;
        const [x, y] = toScreen(st, [e[0] + 0.55, e[1] + 0.35]);
        s.puffs.push({
          x: x + m.dx,
          y: y + m.dy,
          vx: 10,
          vy: -70 - Math.random() * 40,
          r: u * (0.07 + Math.random() * 0.07),
          age: 0,
          life: 1.6,
          kind: 'bubble',
        });
        s.puffAt = clock + 260;
      } else if (f === 'house' && ALIVE.house.smoke) {
        const [x, y] = toScreen(st, ALIVE.house.smoke);
        s.puffs.push({
          x,
          y: y + m.dy,
          vx: 18 + Math.random() * 12,
          vy: -45 - Math.random() * 20,
          r: u * 0.16,
          age: 0,
          life: 2,
          kind: 'smoke',
        });
        s.puffAt = clock + 380;
      } else if (f === 'boat' && t > 1.1) {
        const b = st.box;
        s.puffs.push({
          x: b.x + m.dx + b.w * 0.1,
          y: b.y + b.h * 0.95 + m.dy,
          vx: -30,
          vy: -8,
          r: u * 0.12,
          age: 0,
          life: 0.9,
          kind: 'foam',
        });
        s.puffAt = clock + 90;
      }
    };
    const drawPuffs = (dt: number, alpha: number) => {
      for (const p of s.puffs) {
        p.age += dt;
        p.x += p.vx * dt + (p.kind === 'bubble' ? Math.sin(p.age * 9) * 0.6 : 0);
        p.y += p.vy * dt;
        const k = p.age / p.life;
        ctx.save();
        ctx.globalAlpha = alpha * (1 - k) * (p.kind === 'smoke' ? 0.75 : 0.9);
        const r = p.r * (p.kind === 'bubble' ? 1 : 1 + k * 1.6);
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, TAU);
        if (p.kind === 'bubble') {
          ctx.lineWidth = Math.max(1.5, r * 0.18);
          ctx.strokeStyle = 'rgba(255,255,255,0.9)';
          ctx.stroke();
          ctx.fillStyle = 'rgba(255,255,255,0.18)';
          ctx.fill();
        } else {
          ctx.fillStyle = p.kind === 'smoke' ? '#eef1f6' : '#ffffff';
          ctx.fill();
        }
        ctx.restore();
      }
      s.puffs = s.puffs.filter((p) => p.age < p.life);
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
      stage();

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
      if (s.phase === 'drop' && enterMs > 450 + s.filled.size * 70 + s.tray.length * 90) go('play');

      // ─── Что подсказать: первая деталь в лотке и её место ───
      const helpN = s.tray.findIndex((t) => shown(t));
      const help = helpN >= 0 ? goal(helpN) : null;
      const sinceGlow = (clock - s.glowAt) / 1000;
      const glow =
        s.phase !== 'play'
          ? 0
          : Math.max(
              s.wrong >= 2 ? 0.55 + 0.35 * Math.sin(clock / 180) : 0,
              sinceGlow < 1.8 ? 0.5 + 0.4 * Math.sin(sinceGlow * 9) : 0,
            );
      const peek = s.peek && clock - s.peek.at < 1300 ? s.peek : null;
      const peekGoal = peek ? goal(peek.n) : null;
      const d = s.drag;
      const dp = d && d.moved ? dragPose(d) : null;
      const magnet =
        d && dp && s.phase === 'play'
          ? dropAt(
              s.fig,
              s.filled,
              s.tray[d.n]!.idx,
              s.tray[d.n]!.k,
              toFigure(st, dp.x, dp.y),
              spec.turn,
            )
          : null;

      // ─── Сцена ───
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const fade = clamp01((clock - s.backAt) / 600);
      if (s.backFrom && fade < 1) drawBack(s.backFrom, 1);
      drawBack(s.back, s.backFrom ? fade : 1);
      const leave = s.leaveAt >= 0 ? ease(clamp01((clock - s.leaveAt) / 320)) : 0;
      const enter = clamp01(enterMs / 300);
      const tdone = s.doneAt >= 0 ? (clock - s.doneAt) / 1000 : -1;
      drawTray((s.phase === 'done' || s.phase === 'finish' ? 1 - clamp01(tdone / 0.4) : 1) * enter);
      drawSilhouette(enter * (1 - leave) * (tdone >= 0 ? 1 - clamp01(tdone / 0.5) : 1));
      if (spec.outlines && tdone < 0)
        s.fig.pieces.forEach((_, j) => {
          if (s.filled.has(j)) return;
          const near = magnet?.kind === 'snap' && magnet.slot === j;
          drawOutline(j, enter * (1 - leave), near ? 0.3 : 0);
        });
      else if (magnet?.kind === 'snap') drawOutline(magnet.slot, 0.6, 0.3);
      if (help && glow > 0) {
        const [x, y] = slotCenter(help.slot);
        halo(x, y, radius(s.fig, help.slot) * st.unit * 1.3, glow);
      }
      if (peek && peekGoal) {
        const [x, y] = slotCenter(peekGoal.slot);
        const k = Math.sin(Math.PI * clamp01((clock - peek.at) / 1300));
        halo(x, y, radius(s.fig, peekGoal.slot) * st.unit * 1.3, 0.8 * k);
      }
      if (tdone >= 0) spawnPuffs(tdone);
      if (s.R.figure === 'house') drawPuffs(dt, 1 - leave);
      drawPlaced(1 - leave);
      if (s.R.figure !== 'house') drawPuffs(dt, 1 - leave);

      // Лоток: детали «выпрыгивают», нужная светится, нажатая качается.
      s.tray.forEach((t, n) => {
        if (t.used || (d?.n === n && d.moved)) return;
        const k = popIn(clock - t.at) * (1 - leave);
        if (k <= 0) return;
        const p = trayPose(n);
        if (n === helpN && glow > 0) halo(p.x, p.y, st.cells[n]!.r * 1.5, glow);
        const wig = clock - t.wiggleAt < 450 ? Math.sin((clock - t.wiggleAt) / 30) * 0.12 : 0;
        drawPiece(t.idx, { ...p, a: p.a + wig }, 1, k);
      });
      for (const f of s.flights) drawPiece(s.tray[f.n]!.idx, flightPose(f));
      const wb = s.wobble;
      if (wb) {
        const k = clamp01((clock - wb.at) / WOBBLE_MS);
        const p = slotPose(wb.slot, wb.a + Math.sin(k * Math.PI * 6) * 0.2 * (1 - k));
        drawPiece(s.tray[wb.n]!.idx, p);
      }
      if (d && dp) drawPiece(s.tray[d.n]!.idx, dp);

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

      // Палец подсказки (IdleHint): деталь — на её место; не так повёрнута — нажать на неё.
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
        let drag = false;
        if (s.phase === 'play' && !s.flights.length && !s.wobble && help) {
          const c = st.cells[helpN]!;
          place(hs, c.x, c.y, c.r * 1.2, c.r * 1.2);
          if (!help.taps) {
            const [x, y] = slotCenter(help.slot);
            place(ts, x, y, st.unit * 0.6, st.unit * 0.6);
            drag = true;
          }
        }
        target.current.toggleAttribute('data-hint-target', drag);
      }
      // Для автотестов — каждый кадр.
      if (webdriver) {
        el.dataset.figure = s.R.figure;
        el.dataset.turn = spec.turn ? '1' : '0';
        el.dataset.snaps = String(s.snaps);
        el.dataset.turns = String(s.turns);
        el.dataset.almost = String(s.almost);
        el.dataset.misses = String(s.misses);
        el.dataset.busy = s.flights.length || s.wobble || s.drag || clock < s.lockUntil ? '1' : '0';
        el.dataset.unit = String(Math.round(st.unit));
        el.dataset.lift = String(Math.round(lift()));
        el.dataset.tray = JSON.stringify(
          s.tray.map((t, n) => {
            const c = st.cells[n]!;
            const g = goal(n);
            const [tx, ty] = g ? slotCenter(g.slot) : [0, 0];
            return {
              n,
              type: s.fig.pieces[t.idx]!.type,
              x: Math.round(c.x),
              y: Math.round(c.y),
              ready: shown(t),
              taps: g?.taps ?? 0,
              tx: Math.round(tx),
              ty: Math.round(ty),
            };
          }),
        );
        el.dataset.slots = JSON.stringify(
          s.fig.pieces.flatMap((p, j) => {
            if (s.filled.has(j)) return [];
            const [x, y] = slotCenter(j);
            return [{ j, type: p.type, x: Math.round(x), y: Math.round(y) }];
          }),
        );
      }
      raf = requestAnimationFrame(frame);
    };

    // ─── Касания: деталь тянут на место; нажали — повернулась ───
    const at = (e: PointerEvent) => {
      const box = el.getBoundingClientRect();
      return { x: e.clientX - box.left, y: e.clientY - box.top };
    };
    const busyNow = () =>
      s.phase !== 'play' || clock < s.lockUntil || !!s.wobble || s.flights.length > 0;
    /** Какая деталь лотка под пальцем: ближайшая, в пределах её круга (и не меньше пальца). */
    const trayHit = (p: { x: number; y: number }) => {
      let best = -1;
      let bd = Infinity;
      s.tray.forEach((t, n) => {
        const c = st.cells[n];
        if (!c || !shown(t)) return;
        const dd = Math.hypot(p.x - c.x, p.y - c.y);
        if (dd < Math.max(c.r * 1.05, 30) && dd < bd) {
          best = n;
          bd = dd;
        }
      });
      return best;
    };
    const down = (e: PointerEvent) => {
      if ((e.target as Element).closest('.corner-button')) return;
      if (s.drag || busyNow()) return;
      const p = at(e);
      const n = trayHit(p);
      if (n < 0) return;
      const c = st.cells[n]!;
      s.drag = {
        n,
        x: p.x,
        y: p.y,
        ox: c.x - p.x,
        oy: c.y - p.y,
        sx: p.x,
        sy: p.y,
        moved: false,
        went: 0,
      };
      el.setPointerCapture?.(e.pointerId);
      fx.tap();
    };
    const move = (e: PointerEvent) => {
      const d = s.drag;
      if (!d) return;
      const p = at(e);
      d.x = p.x;
      d.y = p.y;
      d.went = Math.max(d.went, Math.hypot(p.x - d.sx, p.y - d.sy));
      if (d.went > 10) d.moved = true;
    };
    const up = (e: PointerEvent) => {
      const d = s.drag;
      if (!d) return;
      s.drag = null;
      // Где отпустили — по самому событию: последний pointermove мог не дойти.
      if (e.type === 'pointerup') {
        Object.assign(d, at(e));
        d.went = Math.max(d.went, Math.hypot(d.x - d.sx, d.y - d.sy));
        if (d.went > 10) d.moved = true;
      }
      if (busyNow()) return;
      if (!d.moved) return tap(d.n);
      const from = dragPose(d);
      if (e.type === 'pointerup') return drop(d.n, from);
      fly(d.n, from, 'tray');
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
      className="game figure"
      data-testid="game-figure"
      data-phase={phase}
      data-round={round}
      data-no-idle={busy || undefined}
      ref={root}
    >
      <canvas ref={canvas} className="figure-canvas" />
      <div ref={hint} className="figure-hint" data-hint={!busy || undefined} />
      <div ref={target} className="figure-hint" />
    </div>
  );
}
