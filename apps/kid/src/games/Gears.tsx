// «Шестерёнки» (этап 57). В мастерской игрушек на стене висит цепочка шестерёнок: слева —
// большая с ручкой, справа — та, что крутит мельницу, колесо обозрения или вертушку. Два
// задания: «собери» (на пустые гвоздики — шестерёнки из коробки, пока зубчики не сцепятся от
// ручки до машины, и покрутить ручку) и «в какую сторону» (ручку крутят по стрелке — куда
// повернётся машина?). Зубчики сцепляются по-настоящему: каждая следующая крутится в обратную
// сторону и во столько раз медленнее, во сколько у неё больше зубцов. Всё — один canvas.
import { useEffect, useRef, useState } from 'react';
import { fx } from '../fx';
import {
  GEARS_BIG,
  GEARS_END,
  GEARS_GAP,
  GEARS_LOOK,
  GEARS_RIGHT,
  GEARS_SMALL,
  GEARS_TURN,
  gearsBuild,
  gearsBuildAgain,
  gearsDir,
  gearsWhich,
  gearsWhichAgain,
  gearsWorks,
} from '../phrases';
import { afterSpeech, clayUrl, praise, retry, say, setTask, type GameProps } from './common';
import {
  DEDENDUM,
  chainAngles,
  fitRound,
  gearOutline,
  gearsSprites,
  layoutChain,
  machineDir,
  outer,
  pitch,
  planGears,
  spinOf,
  stageFor,
  trayLayout,
  type Box,
  type GearsRound,
  type GearsStage,
  type Pt,
} from './gearsLogic';

type Phase = 'drop' | 'play' | 'done' | 'finish';

const TAU = Math.PI * 2;
/** С ручкой — фиолетовая (видна на деревянной стене), у машины — красная, между — по размеру. */
const DRIVER = '#a78bfa';
const RED = '#ef4444';
const SIZE_COLORS: Record<number, string> = { 8: '#4ade80', 12: '#60a5fa', 16: '#fbbf24' };
const COLORS = ['#ef4444', '#facc15', '#3b82f6', '#22c55e', '#a855f7', '#fb923c'];
/** Сколько летит шестерёнка из коробки на гвоздик и обратно, мс. */
const FLY = 420;
const BACK = 380;
/** Сколько не подошедшая шестерёнка трясётся на гвоздике, мс. */
const SHAKE = 700;
/** Ручку нажали, не покрутив, — толчок (рад/с) и как быстро затухает: хватает на оборот. */
const PUSH = 10.5;
const FRICTION = 1.5;
/** Машина заработала — крутится сама (рад/с у ручки). */
const MOTOR = 2.4;

interface Piece {
  teeth: number;
  /** На гвоздике, летит или трясётся — в коробке пусто. */
  used: boolean;
  /** Когда появилась в коробке (в начале задания, вернулась) — «выпрыгивает». */
  at: number;
  rot: number;
}
interface Flight {
  piece: number;
  peg: number;
  from: { x: number; y: number; scale: number; rot: number };
  /** До какого угла довернётся к концу полёта. */
  rot1: number;
  at: number;
  dur: number;
  /** Обратно в коробку (не подошла, мимо гвоздика). */
  back: boolean;
}
interface Drag {
  i: number;
  x: number;
  y: number;
  /** От пальца до середины шестерёнки. */
  ox: number;
  oy: number;
  sx: number;
  sy: number;
  moved: boolean;
}
interface Crank {
  last: number;
  turned: number;
  vel: number;
  t: number;
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
const wrapPi = (a: number) => a - TAU * Math.round(a / TAU);
const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
/** Выпрыгивает: от нуля с небольшим перелётом за 0.3 с. */
const popIn = (ms: number) => {
  const k = clamp01(ms / 300);
  return k <= 0 ? 0 : k < 1 ? Math.sin((k * Math.PI) / 2) + 0.15 * Math.sin(k * Math.PI) : 1;
};
/** Цвет светлее (k > 0) или темнее (k < 0). */
const shade = (hex: string, k: number) => {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) =>
    Math.round(k > 0 ? c + (255 - c) * k : c * (1 + k)),
  );
  return `rgb(${ch[0]},${ch[1]},${ch[2]})`;
};
const colorOf = (r: GearsRound, i: number) =>
  i === 0 ? DRIVER : i === r.chain.length - 1 ? RED : SIZE_COLORS[r.chain[i]!]!;

export function Gears({ spec, phrases, onFinish }: GameProps<'gears'>) {
  const [rounds] = useState(() => planGears(spec));
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
    for (const name of gearsSprites()) {
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

    /** Мастерская на этот кадр; u — пикселей в радиусе средней шестерёнки. */
    let st: GearsStage = stageFor(w, h, rounds[0]!.machine);
    let u = st.u;

    const s = {
      round: 0,
      phase: 'drop' as Phase,
      phaseAt: 0,
      /** Задание, подогнанное под экран: цепочка могла стать другой, если не поместилась. */
      R: rounds[0]!,
      /** Центры шестерёнок цепочки, единицы; для какого экрана посчитаны. */
      pos: [] as Pt[],
      key: '',
      filled: [] as boolean[],
      /** Углы шестерёнок (плюс — по часовой) и плавный доворот, который тает. */
      ang: [] as number[],
      nudge: [] as number[],
      pieces: [] as Piece[],
      flight: null as Flight | null,
      /** Не подошла: трясётся на гвоздике, потом обратно в коробку. */
      bad: null as { piece: number; peg: number; at: number; rot: number } | null,
      /** Где показать пунктиром, какая шестерёнка нужна. */
      ghost: new Set<number>(),
      /** Ручка: скорость после толчка, мотор (машина работает сама), куда крутили. */
      omega: 0,
      motor: 0,
      lastDir: 1 as 1 | -1,
      /** Сколько ручка провернулась при собранной цепочке, рад: оборот — машина заработала. */
      spun: 0,
      tickAcc: 0,
      tickAt: -1e9,
      crank: null as Crank | null,
      drag: null as Drag | null,
      gapTold: false,
      /** Когда цепочка собралась (−1 — ещё нет). */
      readyAt: -1,
      /** «В какую сторону»: когда машина закрутилась и стрелки побежали (−1 — ещё нет). */
      shown: -1,
      enterAt: 0,
      leaveAt: -1,
      lockUntil: 0,
      wrong: 0,
      glowAt: -1e9,
      /** Когда нажали стрелку: 0 — против часовой, 1 — по часовой. */
      tapAt: [-1e9, -1e9],
      told: new Set<string>(),
      timers: [] as { at: number; fn: () => void }[],
      particles: [] as Particle[],
      stopped: false,
      /** Для автотестов, только растут: шестерёнок встало, машин заработало. */
      places: 0,
      turns: 0,
      /** Кабинки колеса качаются, когда оно разгоняется. */
      swing: 0,
      swingV: 0,
      prevOut: 0,
    };
    const go = (p: Phase) => {
      s.phase = p;
      s.phaseAt = clock;
      setPhase(p);
    };
    const later = (ms: number, fn: () => void) => s.timers.push({ at: clock + ms, fn });
    const n = () => s.R.chain.length;
    const teeth = (i: number) => s.R.chain[i]!;
    /** До какой шестерёнки цепочка сцеплена с ручкой (первая пустая; n — вся). */
    const linked = () => {
      const k = s.filled.indexOf(false);
      return k < 0 ? n() : k;
    };
    const ready = () => linked() === n();
    const px = (p: Pt) => ({ x: p.x * u, y: p.y * u });
    const gearPx = (i: number) => px(s.pos[i]!);
    const shown = (i: number) => s.ang[i]! + s.nudge[i]!;

    // ─── Сцепление ───
    /** Угол шестерёнки i, чтобы зубцы вошли во впадины предыдущей (повёрнутой на a). */
    const meshNext = (i: number, a: number) => {
      const p = s.pos[i - 1]!;
      const q = s.pos[i]!;
      const th = Math.atan2(q.y - p.y, q.x - p.x);
      return th + Math.PI - Math.PI / teeth(i) + ((th - a) * teeth(i - 1)) / teeth(i);
    };
    /** То же — по следующей (повёрнутой на b). */
    const meshPrev = (i: number, b: number) => {
      const p = s.pos[i]!;
      const q = s.pos[i + 1]!;
      const th = Math.atan2(q.y - p.y, q.x - p.x);
      return th - ((b - th - Math.PI + Math.PI / teeth(i + 1)) * teeth(i + 1)) / teeth(i);
    };
    /** Как повернуть шестерёнку на гвоздике i, чтобы сцепилась с соседкой. */
    const meshAngle = (i: number) =>
      s.filled[i - 1]
        ? meshNext(i, s.ang[i - 1]!)
        : s.filled[i + 1]
          ? meshPrev(i, s.ang[i + 1]!)
          : (s.ang[i] ?? 0);
    /**
     * Встала шестерёнка i между двумя: правая часть цепочки доворачивается до ближайшего зубца,
     * чтобы сцепиться (на экране — плавно).
     */
    const snapRight = (i: number) => {
      const j = i + 1;
      const step = TAU / teeth(j);
      const d = s.ang[j]! - meshNext(j, s.ang[i]!);
      const delta = -(d - step * Math.round(d / step));
      for (let k = j; k < n() && s.filled[k]; k++) {
        const dk = (((k - j) % 2 ? -1 : 1) * delta * teeth(j)) / teeth(k);
        s.ang[k] = s.ang[k]! + dk;
        s.nudge[k] = s.nudge[k]! - dk;
      }
    };
    /** Ручку повернули на da: крутится всё, что с ней сцеплено. */
    const turn = (da: number) => {
      if (!da) return;
      const end = linked();
      for (let i = 0; i < end; i++)
        s.ang[i] = s.ang[i]! + ((i % 2 ? -1 : 1) * da * teeth(0)) / teeth(i);
      s.tickAcc += Math.abs(da);
      const step = TAU / teeth(0);
      if (s.tickAcc >= step) {
        s.tickAcc %= step;
        if (clock - s.tickAt > 75) {
          s.tickAt = clock;
          fx.tick(s.motor ? 0.07 : 0.11);
        }
      }
      if (s.R.kind === 'build' && s.phase === 'play' && ready()) {
        s.spun += Math.abs(da);
        if (s.spun >= TAU) works();
      }
    };

    // ─── Задания ───
    const prompt = (r: GearsRound, again: boolean) =>
      r.kind === 'build'
        ? again
          ? gearsBuildAgain(r.machine)
          : gearsBuild(r.machine)
        : again
          ? gearsWhichAgain(r.machine)
          : gearsWhich(r.machine);
    /** Задание на этот экран: где висят шестерёнки, что в коробке. */
    const setup = (base: GearsRound) => {
      st = stageFor(w, h, base.machine);
      u = st.u;
      const f = fitRound(base, st.layout, spec.sizes);
      s.R = f.round;
      s.pos = f.pos;
      s.key = `${w}x${h}`;
      s.filled = f.round.chain.map((_, i) => !f.round.empty.includes(i));
      s.ang = chainAngles(f.round.chain, f.pos, Math.random() * TAU);
      s.nudge = f.round.chain.map(() => 0);
      s.pieces = f.round.tray.map((t, i) => ({
        teeth: t,
        used: false,
        at: clock + 350 + i * 90,
        rot: Math.random() * TAU,
      }));
    };
    /** Экран повернули: та же цепочка на новых местах (или задание заново, если не влезла). */
    const relayout = () => {
      const pos = layoutChain(s.R.chain, st.layout);
      if (!pos) {
        setup(rounds[s.round]!);
        s.flight = null;
        s.bad = null;
        s.readyAt = -1;
        return;
      }
      s.pos = pos;
      s.key = `${w}x${h}`;
      s.ang = chainAngles(s.R.chain, pos, s.ang[0]!);
      s.nudge = s.R.chain.map(() => 0);
    };
    const start = (k: number) => {
      s.round = k;
      setRound(k);
      setup(rounds[k]!);
      s.flight = null;
      s.bad = null;
      s.ghost = new Set();
      s.omega = 0;
      s.motor = 0;
      s.spun = 0;
      s.gapTold = false;
      s.readyAt = s.R.kind === 'build' ? -1 : 0;
      s.shown = -1;
      s.wrong = 0;
      s.glowAt = -1e9;
      s.lockUntil = 0;
      s.enterAt = clock;
      s.leaveAt = -1;
      s.prevOut = shown(n() - 1);
      go('drop');
      const again = s.told.has(s.R.kind);
      s.told.add(s.R.kind);
      void say(prompt(s.R, again));
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

    /** Похвалили — следующее задание (шестерёнки лопаются с искрами) или конец игры. */
    const next = (k: number) => {
      if (s.stopped || s.round !== k) return;
      if (k + 1 < rounds.length) {
        s.leaveAt = clock;
        s.motor = 0;
        s.omega = 0;
        fx.pop();
        s.R.chain.forEach((_, i) => {
          const c = gearPx(i);
          burst(c.x, c.y, 4);
        });
        later(480, () => start(k + 1));
        return;
      }
      confetti();
      go('finish');
      void afterSpeech(say(GEARS_END), 2600).then(() => {
        if (!s.stopped) onFinish();
      });
    };
    /** Цепочка собрана и ручку провернули: машина заработала. */
    const works = () => {
      go('done');
      s.turns++;
      s.motor = s.lastDir;
      s.omega = 0;
      fx.tinkle();
      const o = px(st.layout.to);
      burst(o.x, o.y, 16);
      const k = s.round;
      void afterSpeech(praise(phrases, undefined, [gearsWorks(s.R.machine)]), 2600).then(() =>
        next(k),
      );
    };
    /** «В какую сторону»: нажали стрелку. */
    const answer = (dir: 1 | -1) => {
      const want = machineDir(s.R);
      s.tapAt[dir > 0 ? 1 : 0] = clock;
      fx.tap();
      if (dir === want) {
        go('done');
        s.turns++;
        fx.sparkle();
        if (s.shown < 0) spin();
        const first = !s.told.has('right');
        s.told.add('right');
        const k = s.round;
        void afterSpeech(
          praise(phrases, undefined, [gearsDir(want), ...(first ? [GEARS_RIGHT] : [])]),
          2600,
        ).then(() => next(k));
        return;
      }
      s.wrong++;
      s.lockUntil = clock + 1200;
      void retry(phrases).then(() => say(GEARS_LOOK));
      if (s.shown < 0) later(500, spin);
    };
    /** Ручку крутят по стрелке — цепочка показывает, куда что крутится. */
    const spin = () => {
      if (s.stopped || s.shown >= 0) return;
      s.shown = clock;
      s.motor = s.R.crank;
    };

    // ─── Коробка с шестерёнками ───
    const trayInner = (): Box => {
      const t = st.tray;
      return { x: t.x + 0.22, y: t.y + 0.22, w: t.w - 0.44, h: t.h - 0.4 };
    };
    let tray = { scale: 1, at: [] as Pt[] };
    const placeTray = () => {
      tray = trayLayout(
        s.pieces.map((p) => p.teeth),
        trayInner(),
      );
    };
    const pieceAt = (i: number) => px(tray.at[i]!);
    const pieceR = (i: number) => outer(s.pieces[i]!.teeth) * tray.scale * u;
    const pieceHit = (p: Pt) =>
      s.pieces.findIndex((pc, i) => !pc.used && dist(p, pieceAt(i)) < pieceR(i) + 0.18 * u);
    /** Гвоздики, которые ещё пустые (и куда ничего не летит). */
    const freePegs = () =>
      s.R.empty.filter((i) => !s.filled[i] && s.flight?.peg !== i && s.bad?.peg !== i);
    const canSend = () =>
      s.R.kind === 'build' &&
      s.phase === 'play' &&
      clock >= s.lockUntil &&
      !s.flight &&
      !s.bad &&
      freePegs().length > 0;
    /** Шестерёнку i — на гвоздик peg (from — откуда летит, px). */
    const fly = (i: number, peg: number, from: Flight['from']) => {
      const p = s.pieces[i]!;
      p.used = true;
      const a = meshAngle(peg);
      s.flight = {
        piece: i,
        peg,
        from,
        rot1: from.rot + wrapPi(a - from.rot),
        at: clock,
        dur: FLY,
        back: false,
      };
      fx.whoosh();
    };
    /** Обратно в коробку — с гвоздика или из пальца. */
    const flyBack = (i: number, from: Flight['from']) => {
      const p = s.pieces[i]!;
      p.used = true;
      s.flight = { piece: i, peg: -1, from, rot1: p.rot, at: clock, dur: BACK, back: true };
    };
    /** Где шестерёнка в полёте сейчас. */
    const flightAt = (f: Flight) => {
      const k = clamp01((clock - f.at) / f.dur);
      const e = ease(k);
      const to = f.back
        ? { ...pieceAt(f.piece), scale: tray.scale }
        : { ...gearPx(f.peg), scale: 1 };
      return {
        x: lerp(f.from.x, to.x, e),
        y: lerp(f.from.y, to.y, e) - Math.sin(Math.PI * k) * 1.2 * u,
        scale: lerp(f.from.scale, to.scale, e),
        rot: lerp(f.from.rot, f.rot1, e),
      };
    };
    /** Долетела: подошла — встаёт и сцепляется, не подошла — трясётся и обратно. */
    const arrive = (f: Flight) => {
      const p = s.pieces[f.piece]!;
      if (f.back) {
        p.used = false;
        p.at = clock;
        return;
      }
      const need = teeth(f.peg);
      if (p.teeth !== need) {
        s.bad = { piece: f.piece, peg: f.peg, at: clock, rot: f.rot1 };
        s.wrong++;
        s.ghost.add(f.peg);
        s.lockUntil = clock + SHAKE + BACK;
        fx.knock();
        void retry(phrases).then(() => say(p.teeth > need ? GEARS_BIG : GEARS_SMALL));
        later(SHAKE, () => {
          const b = s.bad;
          if (!b || s.stopped) return;
          s.bad = null;
          flyBack(b.piece, { ...gearPx(b.peg), scale: 1, rot: b.rot });
        });
        return;
      }
      const peg = f.peg;
      const a = meshAngle(peg);
      s.filled[peg] = true;
      s.ang[peg] = a;
      s.nudge[peg] = wrapPi(f.rot1 - a);
      if (s.filled[peg - 1] && s.filled[peg + 1]) snapRight(peg);
      s.places++;
      fx.snap();
      const c = gearPx(peg);
      burst(c.x, c.y, 8);
      if (ready()) {
        s.readyAt = clock;
        later(350, () => {
          if (!s.stopped && s.phase === 'play') void say(GEARS_TURN);
        });
      }
    };

    /** «Ушко» и подсказка при бездействии: задание ещё раз, нужное светится. */
    const remind = () => {
      s.glowAt = clock;
      return say(prompt(s.R, false));
    };
    setTask(remind);

    // ─── Рисование ───
    /** Испечённые шестерёнки и их тени: рисуются один раз на размер экрана, потом — поворотом. */
    const baked = new Map<string, HTMLCanvasElement>();
    let bakedP = 0;
    const outline = new Map<number, [number, number][]>();
    const outlineOf = (t: number) => {
      let o = outline.get(t);
      if (!o) outline.set(t, (o = gearOutline(t)));
      return o;
    };
    const gearPath = (t: number, cx: number, cy: number, a: number, k: number) => {
      const path = new Path2D();
      for (const [ang, r] of outlineOf(t))
        path.lineTo(cx + Math.cos(ang + a) * r * k, cy + Math.sin(ang + a) * r * k);
      path.closePath();
      return path;
    };
    const bakeCheck = () => {
      const P = u * dpr;
      if (Math.abs(P - bakedP) > 0.5) {
        baked.clear();
        bakedP = P;
      }
      return bakedP;
    };
    /** Шестерёнка из пластилина: выпуклая, с ободком, крапинками, дырками и болтом посередине. */
    const gearImage = (t: number, color: string) => {
      const P = bakeCheck();
      const key = `${t}${color}`;
      let c = baked.get(key);
      if (c) return c;
      const ro = outer(t) * P;
      const S = Math.ceil(2 * ro + 0.3 * P);
      c = document.createElement('canvas');
      c.width = S;
      c.height = S;
      const g = c.getContext('2d')!;
      const m = S / 2;
      const r = pitch(t) * P;
      const root = (pitch(t) - DEDENDUM) * P;
      const path = gearPath(t, m, m, 0, P);
      const body = g.createRadialGradient(m - 0.25 * r, m - 0.3 * r, 0.1 * r, m, m, ro);
      body.addColorStop(0, shade(color, 0.35));
      body.addColorStop(0.6, color);
      body.addColorStop(1, shade(color, -0.28));
      g.fillStyle = body;
      g.fill(path);
      g.lineJoin = 'round';
      g.lineWidth = 0.045 * P;
      g.strokeStyle = shade(color, -0.45);
      g.stroke(path);
      // Канавка у основания зубцов — с тенью и бликом.
      g.lineWidth = 0.05 * P;
      g.strokeStyle = 'rgba(0,0,0,0.14)';
      g.beginPath();
      g.arc(m, m, root - 0.1 * P, 0, TAU);
      g.stroke();
      g.lineWidth = 0.03 * P;
      g.strokeStyle = 'rgba(255,255,255,0.22)';
      g.beginPath();
      g.arc(m, m, root - 0.16 * P, 0, TAU);
      g.stroke();
      // Крапинки — как на пластилине (одни и те же у шестерёнок одного размера).
      let seed = t * 97 + color.length;
      const rnd = () => {
        seed = (seed * 16807) % 2147483647;
        return seed / 2147483647;
      };
      for (let k = 0; k < t * 7; k++) {
        const a = rnd() * TAU;
        const d = Math.sqrt(rnd()) * (root - 0.05 * P);
        g.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.08)';
        g.beginPath();
        g.arc(m + Math.cos(a) * d, m + Math.sin(a) * d, (0.012 + rnd() * 0.02) * P, 0, TAU);
        g.fill();
      }
      // Дырки в больших — насквозь, видно стену.
      if (t >= 12) {
        const holes = t === 16 ? 5 : 4;
        const hd = 0.52 * r;
        const hr = 0.15 * r;
        for (let k = 0; k < holes; k++) {
          const a = (k * TAU) / holes + 0.4;
          const x = m + Math.cos(a) * hd;
          const y = m + Math.sin(a) * hd;
          g.globalCompositeOperation = 'destination-out';
          g.beginPath();
          g.arc(x, y, hr, 0, TAU);
          g.fill();
          g.globalCompositeOperation = 'source-over';
          g.lineWidth = 0.05 * P;
          g.strokeStyle = shade(color, -0.4);
          g.beginPath();
          g.arc(x, y, hr, 0, TAU);
          g.stroke();
        }
      }
      // Втулка и болт: шестигранник видно, как крутится.
      const hub = g.createRadialGradient(m - 0.06 * P, m - 0.06 * P, 0, m, m, 0.26 * P);
      hub.addColorStop(0, shade(color, -0.05));
      hub.addColorStop(1, shade(color, -0.35));
      g.fillStyle = hub;
      g.beginPath();
      g.arc(m, m, 0.26 * P, 0, TAU);
      g.fill();
      g.lineWidth = 0.03 * P;
      g.strokeStyle = shade(color, -0.5);
      g.stroke();
      const bolt = g.createLinearGradient(m - 0.12 * P, m - 0.12 * P, m + 0.12 * P, m + 0.12 * P);
      bolt.addColorStop(0, '#f3f4f6');
      bolt.addColorStop(1, '#6b7280');
      g.fillStyle = bolt;
      g.beginPath();
      for (let k = 0; k < 6; k++)
        g.lineTo(m + Math.cos((k * TAU) / 6) * 0.13 * P, m + Math.sin((k * TAU) / 6) * 0.13 * P);
      g.closePath();
      g.fill();
      g.strokeStyle = '#4b5563';
      g.lineWidth = 0.02 * P;
      g.stroke();
      baked.set(key, c);
      return c;
    };
    /** Мягкая тень шестерёнки: форма за краем картинки, на картинку падает только её тень. */
    const shadowImage = (t: number) => {
      const P = bakeCheck();
      const key = `shadow${t}`;
      let c = baked.get(key);
      if (c) return c;
      const S = Math.ceil(2 * outer(t) * P + 0.6 * P);
      c = document.createElement('canvas');
      c.width = S;
      c.height = S;
      const g = c.getContext('2d')!;
      g.shadowColor = 'rgba(60,30,8,1)';
      g.shadowBlur = 0.12 * P;
      g.shadowOffsetX = S * 2;
      g.fillStyle = '#000';
      g.fill(gearPath(t, S / 2 - S * 2, S / 2, 0, P));
      baked.set(key, c);
      return c;
    };
    const drawGear = (t: number, color: string, x: number, y: number, a: number, k = 1) => {
      if (k <= 0) return;
      const im = gearImage(t, color);
      const S = im.width / dpr;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(a);
      ctx.scale(k, k);
      ctx.drawImage(im, -S / 2, -S / 2, S, S);
      ctx.restore();
      // Свет из окна — сверху слева, не крутится вместе с шестерёнкой.
      const rr = (pitch(t) - DEDENDUM) * u * k * 0.97;
      const g = ctx.createRadialGradient(x - rr * 0.45, y - rr * 0.5, rr * 0.05, x, y, rr);
      g.addColorStop(0, 'rgba(255,255,255,0.34)');
      g.addColorStop(0.55, 'rgba(255,255,255,0.06)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, rr, 0, TAU);
      ctx.fill();
    };
    const drawShadow = (t: number, x: number, y: number, a: number, k = 1, alpha = 0.32) => {
      if (k <= 0) return;
      const im = shadowImage(t);
      const S = im.width / dpr;
      ctx.save();
      ctx.globalAlpha *= alpha;
      ctx.translate(x + 0.1 * u * k, y + 0.15 * u * k);
      ctx.rotate(a);
      ctx.scale(k, k);
      ctx.drawImage(im, -S / 2, -S / 2, S, S);
      ctx.restore();
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
    const ellipseShadow = (x: number, y: number, rx: number, ry: number, a: number) => {
      ctx.fillStyle = `rgba(70,35,10,${a})`;
      ctx.beginPath();
      ctx.ellipse(x, y, rx, ry, 0, 0, TAU);
      ctx.fill();
    };
    /** Стрелка по дуге: середина mid, длина span (рад); dir 1 — по часовой. */
    const arcArrow = (
      x: number,
      y: number,
      r: number,
      mid: number,
      span: number,
      dir: number,
      color: string,
      lw: number,
    ) => {
      const a0 = mid - (dir * span) / 2;
      const a1 = mid + (dir * span) / 2;
      const head = lw * 1.9;
      // Дуга кончается чуть раньше — там остриё.
      const a1s = a1 - (dir * head * 0.6) / r;
      const hx = x + Math.cos(a1) * r;
      const hy = y + Math.sin(a1) * r;
      const tx = -Math.sin(a1) * dir;
      const ty = Math.cos(a1) * dir;
      const nx = Math.cos(a1);
      const ny = Math.sin(a1);
      const tip = new Path2D();
      tip.moveTo(hx + tx * head, hy + ty * head);
      tip.lineTo(hx - tx * head * 0.35 + nx * head * 0.9, hy - ty * head * 0.35 + ny * head * 0.9);
      tip.lineTo(hx - tx * head * 0.35 - nx * head * 0.9, hy - ty * head * 0.35 - ny * head * 0.9);
      tip.closePath();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (const [c, extra] of [
        ['rgba(60,25,5,0.55)', lw * 0.7],
        [color, 0],
      ] as const) {
        ctx.strokeStyle = c;
        ctx.fillStyle = c;
        ctx.lineWidth = lw + extra;
        ctx.beginPath();
        ctx.arc(x, y, r, a0, a1s, dir < 0);
        ctx.stroke();
        ctx.fill(tip);
        if (extra) ctx.stroke(tip);
      }
    };

    const drawBack = () => {
      ctx.fillStyle = '#e2a868';
      ctx.fillRect(0, 0, w, h);
      const im = ok(st.land ? 'gears-bg-l' : 'gears-bg-p');
      if (im) ctx.drawImage(im, (w - st.back.w) / 2, st.back.y, st.back.w, st.back.h);
    };
    /** Машина: неподвижное (башня, стойка, палочка) и то, что крутит шестерёнка, — вокруг оси. */
    const drawMachine = (a: number, alpha: number) => {
      if (alpha <= 0) return;
      const o = px(st.layout.to);
      const m = s.R.machine;
      ctx.save();
      ctx.globalAlpha = alpha;
      ellipseShadow(o.x, (st.bench + 0.32) * u, (m === 'pinwheel' ? 0.9 : 1.7) * u, 0.2 * u, 0.25);
      if (m === 'mill') {
        const H = 4.55 * u;
        const W = (H * 375) / 560;
        const tower = ok('gears-mill');
        if (tower) ctx.drawImage(tower, o.x - 0.5 * W, o.y - 0.34 * H, W, H);
        const bl = ok('gears-blades');
        const bw = 4.4 * u;
        const bh = (bw * 640) / 637;
        ctx.save();
        ctx.translate(o.x, o.y);
        ctx.rotate(a);
        if (bl) ctx.drawImage(bl, -0.49 * bw, -0.5 * bh, bw, bh);
        else {
          ctx.fillStyle = '#c08040';
          for (let k = 0; k < 4; k++) {
            ctx.rotate(TAU / 4);
            ctx.fillRect(-0.2 * u, 0, 0.4 * u, 2.1 * u);
          }
        }
        ctx.restore();
      } else if (m === 'wheel') {
        const sh = 3.33 * u;
        const sw = (sh * 560) / 543;
        const stand = ok('gears-wstand');
        if (stand) ctx.drawImage(stand, o.x - 0.5 * sw, o.y - 0.098 * sh, sw, sh);
        const wh = ok('gears-wheel');
        const ww = 3.9 * u;
        const whh = (ww * 640) / 635;
        ctx.save();
        ctx.translate(o.x, o.y);
        ctx.rotate(a);
        if (wh) ctx.drawImage(wh, -0.5 * ww, -0.505 * whh, ww, whh);
        else {
          ctx.strokeStyle = '#ec4899';
          ctx.lineWidth = 0.15 * u;
          ctx.beginPath();
          ctx.arc(0, 0, 1.8 * u, 0, TAU);
          ctx.stroke();
        }
        ctx.restore();
        // Кабинки висят прямо — только качаются, когда колесо разгоняется.
        const cab = ok('gears-cabin');
        const ch = 0.95 * u;
        const cw = (ch * 160) / 220;
        for (let k = 0; k < 8; k++) {
          const ka = a - Math.PI / 2 + (k * TAU) / 8;
          const kx = o.x + Math.cos(ka) * 0.445 * ww;
          const ky = o.y + Math.sin(ka) * 0.445 * ww;
          ctx.save();
          ctx.translate(kx, ky);
          ctx.rotate(s.swing * (0.8 + 0.4 * ((k * 37) % 5) * 0.25));
          if (cab) ctx.drawImage(cab, -cw / 2, -0.03 * ch, cw, ch);
          else {
            ctx.fillStyle = COLORS[k % COLORS.length]!;
            ctx.fillRect(-cw / 2, 0, cw, ch * 0.8);
          }
          ctx.restore();
        }
      } else {
        // Вертушка на палочке, палочка — в деревянной подставке на верстаке.
        const foot = (st.bench + 0.25) * u;
        const sw = 0.2 * u;
        const stick = ctx.createLinearGradient(o.x - sw / 2, 0, o.x + sw / 2, 0);
        stick.addColorStop(0, '#b77a3c');
        stick.addColorStop(0.45, '#f1c48b');
        stick.addColorStop(1, '#94592a');
        ctx.fillStyle = stick;
        ctx.beginPath();
        ctx.roundRect(o.x - sw / 2, o.y, sw, foot - o.y, sw / 2);
        ctx.fill();
        const base = ctx.createLinearGradient(0, foot - 0.4 * u, 0, foot);
        base.addColorStop(0, '#e9a85e');
        base.addColorStop(1, '#a8652c');
        ctx.fillStyle = base;
        ctx.beginPath();
        ctx.roundRect(o.x - 0.6 * u, foot - 0.4 * u, 1.2 * u, 0.42 * u, 0.14 * u);
        ctx.fill();
        ctx.strokeStyle = 'rgba(90,45,15,0.45)';
        ctx.lineWidth = Math.max(1, 0.03 * u);
        ctx.stroke();
        const pw = ok('gears-pinwheel');
        const W = 3.4 * u;
        const H = (W * 520) / 510;
        ctx.save();
        ctx.translate(o.x, o.y);
        ctx.rotate(a);
        if (pw) ctx.drawImage(pw, -0.49 * W, -0.49 * H, W, H);
        else
          for (let k = 0; k < 6; k++) {
            ctx.fillStyle = COLORS[k]!;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.arc(0, 0, 1.6 * u, (k * TAU) / 6, ((k + 0.6) * TAU) / 6);
            ctx.fill();
          }
        ctx.restore();
      }
      ctx.restore();
    };
    /** Деревянный гвоздик на стене — сюда вешают шестерёнку. */
    const drawPeg = (x: number, y: number, k = 1) => {
      ellipseShadow(x + 0.05 * u, y + 0.08 * u, 0.2 * u * k, 0.17 * u * k, 0.25);
      const g = ctx.createRadialGradient(x - 0.06 * u, y - 0.06 * u, 0, x, y, 0.19 * u * k);
      g.addColorStop(0, '#f6cf98');
      g.addColorStop(1, '#9a5a26');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, 0.18 * u * k, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = 'rgba(80,40,10,0.5)';
      ctx.lineWidth = Math.max(1, 0.025 * u);
      ctx.stroke();
    };
    /** Пунктир: какая шестерёнка сюда нужна. */
    const drawGhost = (i: number, k: number) => {
      const c = gearPx(i);
      const path = gearPath(teeth(i), c.x, c.y, meshAngle(i), u);
      ctx.save();
      ctx.globalAlpha = k;
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      ctx.fill(path);
      ctx.setLineDash([0.13 * u, 0.09 * u]);
      ctx.lineWidth = Math.max(2, 0.05 * u);
      ctx.strokeStyle = 'rgba(255,255,255,0.95)';
      ctx.stroke(path);
      ctx.setLineDash([]);
      ctx.restore();
    };
    /** Где ручка (шарик на рычаге большой шестерёнки) — px. */
    const knobAt = () => {
      const c = gearPx(0);
      const L = 0.92 * pitch(teeth(0)) * u;
      const a = shown(0);
      return { x: c.x + Math.cos(a) * L, y: c.y + Math.sin(a) * L };
    };
    const drawCrank = (k: number) => {
      if (k <= 0) return;
      const c = gearPx(0);
      const a = shown(0);
      const L = 0.92 * pitch(teeth(0)) * u * k;
      const t = 0.26 * u * k;
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.rotate(a);
      const g = ctx.createLinearGradient(0, -t / 2, 0, t / 2);
      g.addColorStop(0, '#c98a4b');
      g.addColorStop(1, '#7a4a1f');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.roundRect(-t / 2, -t / 2, L + t / 2, t, t / 2);
      ctx.fill();
      ctx.strokeStyle = '#5b3410';
      ctx.lineWidth = Math.max(1, 0.03 * u);
      ctx.stroke();
      ctx.restore();
      const kn = { x: c.x + Math.cos(a) * L, y: c.y + Math.sin(a) * L };
      const R = 0.32 * u * k;
      ellipseShadow(kn.x + 0.08 * u, kn.y + 0.12 * u, R, R * 0.9, 0.3);
      const kg = ctx.createRadialGradient(kn.x - R * 0.35, kn.y - R * 0.4, R * 0.1, kn.x, kn.y, R);
      kg.addColorStop(0, '#fca5a5');
      kg.addColorStop(0.5, '#ef4444');
      kg.addColorStop(1, '#991b1b');
      ctx.fillStyle = kg;
      ctx.beginPath();
      ctx.arc(kn.x, kn.y, R, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = '#7f1d1d';
      ctx.lineWidth = Math.max(1, 0.03 * u);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.beginPath();
      ctx.arc(kn.x - R * 0.35, kn.y - R * 0.4, R * 0.18, 0, TAU);
      ctx.fill();
    };
    /** Ящик на верстаке: деревянный, внутри темнее. */
    const drawTrayBox = (alpha: number) => {
      const t = st.tray;
      const x = t.x * u;
      const y = t.y * u;
      const bw = t.w * u;
      const bh = t.h * u;
      ctx.save();
      ctx.globalAlpha = alpha;
      ellipseShadow(x + bw / 2, y + bh, bw * 0.52, 0.18 * u, 0.25);
      const g = ctx.createLinearGradient(0, y, 0, y + bh);
      g.addColorStop(0, '#d9a063');
      g.addColorStop(1, '#9c5f2c');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.roundRect(x, y, bw, bh, 0.25 * u);
      ctx.fill();
      ctx.strokeStyle = '#6b3d16';
      ctx.lineWidth = Math.max(1.5, 0.05 * u);
      ctx.stroke();
      const inset = 0.16 * u;
      const ig = ctx.createLinearGradient(0, y + inset, 0, y + bh - inset);
      ig.addColorStop(0, '#6e3f19');
      ig.addColorStop(0.25, '#8a5427');
      ig.addColorStop(1, '#a66a35');
      ctx.fillStyle = ig;
      ctx.beginPath();
      ctx.roundRect(x + inset, y + inset, bw - 2 * inset, bh - 2 * inset, 0.16 * u);
      ctx.fill();
      // Доски дна.
      ctx.strokeStyle = 'rgba(60,30,8,0.22)';
      ctx.lineWidth = Math.max(1, 0.03 * u);
      const planks = Math.max(2, Math.round(t.h / 0.9));
      for (let k = 1; k < planks; k++) {
        const py = y + inset + ((bh - 2 * inset) * k) / planks;
        ctx.beginPath();
        ctx.moveTo(x + inset, py);
        ctx.lineTo(x + bw - inset, py);
        ctx.stroke();
      }
      ctx.restore();
    };
    /** Две стрелки на ящике — «против часовой» и «по часовой». */
    const buttons = () => {
      const t = st.tray;
      const r = Math.min(t.h * 0.38, t.w * 0.2, 1.25) * u;
      const cx = (t.x + t.w / 2) * u;
      const cy = (t.y + t.h / 2) * u;
      const dx = Math.max(r * 1.35, Math.min(t.w * 0.24, 2.3) * u);
      return [
        { dir: -1 as const, x: cx - dx, y: cy, r },
        { dir: 1 as const, x: cx + dx, y: cy, r },
      ];
    };
    const drawButton = (b: ReturnType<typeof buttons>[number], glow: number) => {
      const tap = (clock - s.tapAt[b.dir > 0 ? 1 : 0]!) / 260;
      const k = tap >= 0 && tap < 1 ? 1 - 0.1 * Math.sin(tap * Math.PI) : 1;
      if (glow > 0) halo(b.x, b.y, b.r * 1.6, glow);
      const r = b.r * k;
      ellipseShadow(b.x + 0.06 * u, b.y + 0.12 * u, r, r * 0.95, 0.35);
      const g = ctx.createRadialGradient(b.x - r * 0.35, b.y - r * 0.4, r * 0.1, b.x, b.y, r);
      g.addColorStop(0, '#fef3c7');
      g.addColorStop(0.55, '#fbbf24');
      g.addColorStop(1, '#d97706');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(b.x, b.y, r, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = '#92400e';
      ctx.lineWidth = Math.max(2, 0.05 * u);
      ctx.stroke();
      arcArrow(b.x, b.y, r * 0.55, b.dir > 0 ? 0.3 : Math.PI - 0.3, 4.6, b.dir, '#fff', r * 0.17);
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
      st = stageFor(w, h, s.R.machine);
      u = st.u;
      if (s.key !== `${w}x${h}`) relayout();
      placeTray();
      const r = s.R;
      const N = n();

      const due = s.timers.filter((t) => t.at <= clock);
      if (due.length) {
        s.timers = s.timers.filter((t) => t.at > clock);
        for (const t of due) if (!s.stopped) t.fn();
      }

      // ─── Ручка: мотор, толчок с затуханием ───
      if (s.motor) turn(s.motor * MOTOR * dt);
      else if (s.omega && !s.crank) {
        turn(s.omega * dt);
        s.omega *= Math.exp(-FRICTION * dt);
        if (Math.abs(s.omega) < 0.05) s.omega = 0;
      }
      const fade = Math.exp(-12 * dt);
      for (let i = 0; i < N; i++) s.nudge[i] = s.nudge[i]! * fade;
      // Кабинки колеса: пружинка к наклону от разгона.
      const outA = shown(N - 1);
      const wv = dt > 0 ? wrapPi(outA - s.prevOut) / dt : 0;
      s.prevOut = outA;
      const want = Math.max(-0.35, Math.min(0.35, -0.06 * wv));
      s.swingV += (30 * (want - s.swing) - 3 * s.swingV) * dt;
      s.swing += s.swingV * dt;

      if (s.flight && clock >= s.flight.at + s.flight.dur) {
        const f = s.flight;
        s.flight = null;
        arrive(f);
      }
      const enterMs = clock - s.enterAt;
      if (s.phase === 'drop' && enterMs > 650 + N * 70) go('play');

      // ─── Что подсказать ───
      const pegs = freePegs();
      const firstPeg = pegs[0] ?? -1;
      const helpPiece =
        firstPeg >= 0 ? s.pieces.findIndex((p) => !p.used && p.teeth === teeth(firstPeg)) : -1;
      const sinceGlow = (clock - s.glowAt) / 1000;
      const glow =
        s.phase !== 'play'
          ? 0
          : Math.max(
              s.wrong >= 2 ? 0.55 + 0.35 * Math.sin(clock / 180) : 0,
              sinceGlow < 1.8 ? 0.5 + 0.4 * Math.sin(sinceGlow * 9) : 0,
            );
      const want0 = machineDir(r);

      // ─── Сцена ───
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawBack();
      const leave = s.leaveAt >= 0 ? clamp01((clock - s.leaveAt) / 320) : 0;
      const alpha = Math.min(clamp01(enterMs / 300), 1 - leave);
      drawMachine(outA, alpha);
      const scaleOf = (i: number) => popIn(enterMs - i * 70) * (1 - ease(leave));
      // Тени, гвоздики, пунктир, шестерёнки, ручка.
      for (let i = 0; i < N; i++) {
        if (!s.filled[i]) continue;
        const c = gearPx(i);
        drawShadow(teeth(i), c.x, c.y, shown(i), scaleOf(i));
      }
      const bad = s.bad;
      if (bad) {
        const c = gearPx(bad.peg);
        drawShadow(s.pieces[bad.piece]!.teeth, c.x, c.y, bad.rot);
      }
      for (let i = 0; i < N; i++) {
        if (s.filled[i]) continue;
        const c = gearPx(i);
        const k = scaleOf(i);
        drawPeg(c.x, c.y, k);
        if (i === firstPeg && s.phase === 'play' && !s.flight) {
          const pulse = 0.5 + 0.5 * Math.sin(clock / 260);
          halo(c.x, c.y, (0.55 + 0.15 * pulse) * u, 0.35 + 0.3 * pulse + glow * 0.5);
        }
        const ghost = !spec.sizes || s.ghost.has(i) || (sinceGlow < 3 && s.phase === 'play');
        if (ghost && s.leaveAt < 0) drawGhost(i, Math.min(1, k) * (spec.sizes ? 0.9 : 0.6));
      }
      for (let i = 0; i < N; i++) {
        if (!s.filled[i]) continue;
        const c = gearPx(i);
        drawGear(teeth(i), colorOf(r, i), c.x, c.y, shown(i), scaleOf(i));
      }
      if (bad) {
        const c = gearPx(bad.peg);
        const k = clamp01((clock - bad.at) / SHAKE);
        const p = s.pieces[bad.piece]!;
        const wob = 0.1 * Math.sin(k * 30) * (1 - k);
        drawGear(
          p.teeth,
          SIZE_COLORS[p.teeth]!,
          c.x + Math.sin(k * 40) * (1 - k) * 0.06 * u,
          c.y,
          bad.rot + wob,
        );
      }
      const readyGlow =
        r.kind === 'build' && s.readyAt >= 0 && s.phase === 'play'
          ? 0.45 + 0.35 * Math.sin(clock / 200)
          : 0;
      if (readyGlow > 0) {
        const kn = knobAt();
        halo(kn.x, kn.y, 0.85 * u, readyGlow);
      }
      drawCrank(scaleOf(0));

      // «В какую сторону»: стрелка у ручки; машина закрутилась — стрелки по цепочке.
      if (r.kind === 'direction' && s.leaveAt < 0) {
        const c = gearPx(0);
        const pulse = 1 + 0.06 * Math.sin(clock / 170);
        arcArrow(
          c.x,
          c.y,
          (outer(teeth(0)) + 0.32) * u * pulse,
          // Чуть вправо: ручка у левого края — стрелка не уходит за экран.
          -Math.PI / 2 + 0.35,
          1.7,
          r.crank,
          '#f97316',
          0.2 * u,
        );
        if (s.shown >= 0)
          for (let i = 1; i < N; i++) {
            const k = clamp01((clock - s.shown - 250 - i * 260) / 250);
            if (k <= 0) continue;
            const g = gearPx(i);
            const last = i === N - 1;
            ctx.save();
            ctx.globalAlpha = k;
            // У машины — большая жёлтая снизу: сверху к ней подходит цепочка.
            arcArrow(
              g.x,
              g.y,
              last ? (r.machine === 'pinwheel' ? 1.75 : 2.05) * u : (outer(teeth(i)) + 0.24) * u,
              last ? Math.PI / 2 : -Math.PI / 2,
              last ? 1.6 : 1.5,
              spinOf(r.crank, i),
              last ? '#facc15' : '#fff',
              (last ? 0.24 : 0.16) * u,
            );
            ctx.restore();
          }
      }

      // Ящик: шестерёнки или стрелки «в какую сторону».
      drawTrayBox(alpha);
      if (r.kind === 'build') {
        s.pieces.forEach((p, i) => {
          if (p.used || (s.drag?.i === i && s.drag.moved)) return;
          const c = pieceAt(i);
          const k = popIn(clock - p.at) * (1 - ease(leave));
          if (i === helpPiece && glow > 0) halo(c.x, c.y, pieceR(i) * 1.5, glow);
          drawShadow(p.teeth, c.x, c.y, p.rot, tray.scale * k, 0.4);
          drawGear(p.teeth, SIZE_COLORS[p.teeth]!, c.x, c.y, p.rot, tray.scale * k);
        });
      } else if (s.leaveAt < 0) {
        const showWant = s.wrong > 0 || glow > 0;
        for (const b of buttons()) {
          const g =
            s.phase === 'play' && b.dir === want0 && showWant
              ? Math.max(glow, 0.5 + 0.35 * Math.sin(clock / 180))
              : 0;
          drawButton(b, g);
        }
      }
      if (s.flight) {
        const f = s.flight;
        const p = s.pieces[f.piece]!;
        const at = flightAt(f);
        drawShadow(p.teeth, at.x, at.y, at.rot, at.scale);
        drawGear(p.teeth, SIZE_COLORS[p.teeth]!, at.x, at.y, at.rot, at.scale);
      }
      const d = s.drag;
      if (d && d.moved) {
        const p = s.pieces[d.i]!;
        const x = d.x + d.ox;
        const y = d.y + d.oy;
        drawShadow(p.teeth, x + 0.1 * u, y + 0.15 * u, p.rot, 1.05, 0.4);
        drawGear(p.teeth, SIZE_COLORS[p.teeth]!, x, y, p.rot, 1.05);
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

      // Палец подсказки (IdleHint): от нужной шестерёнки к пустому гвоздику, на ручку, на стрелку.
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
        if (s.phase === 'play') {
          if (r.kind === 'direction') {
            const b = buttons().find((x) => x.dir === want0)!;
            place(hs, b.x, b.y, b.r, b.r);
          } else if (s.readyAt >= 0) {
            const kn = knobAt();
            place(hs, kn.x, kn.y, 0.5 * u, 0.5 * u);
          } else if (helpPiece >= 0 && canSend()) {
            const c = pieceAt(helpPiece);
            const pg = gearPx(firstPeg);
            const pr = pieceR(helpPiece);
            place(hs, c.x, c.y, pr, pr);
            place(ts, pg.x, pg.y, 0.6 * u, 0.6 * u);
          }
        }
      }
      // Для автотестов — каждый кадр.
      if (webdriver) {
        el.dataset.kind = r.kind;
        el.dataset.machine = r.machine;
        el.dataset.dir = String(want0);
        el.dataset.crank = String(r.crank);
        el.dataset.ready = ready() ? '1' : '0';
        el.dataset.places = String(s.places);
        el.dataset.turns = String(s.turns);
        el.dataset.busy = s.flight || s.bad || s.drag || clock < s.lockUntil ? '1' : '0';
        const c0 = gearPx(0);
        el.dataset.driver = JSON.stringify({
          x: Math.round(c0.x),
          y: Math.round(c0.y),
          r: Math.round(outer(teeth(0)) * u),
        });
        el.dataset.pegs = JSON.stringify(
          r.empty.map((i) => {
            const c = gearPx(i);
            return {
              i,
              x: Math.round(c.x),
              y: Math.round(c.y),
              need: teeth(i),
              filled: s.filled[i],
            };
          }),
        );
        el.dataset.tray = JSON.stringify(
          s.pieces.map((p, i) => {
            const c = pieceAt(i);
            return { teeth: p.teeth, x: Math.round(c.x), y: Math.round(c.y), used: p.used };
          }),
        );
        el.dataset.buttons = JSON.stringify(
          r.kind === 'direction'
            ? buttons().map((b) => ({ dir: b.dir, x: Math.round(b.x), y: Math.round(b.y) }))
            : [],
        );
      }
      raf = requestAnimationFrame(frame);
    };

    // ─── Касания: шестерёнку — на гвоздик, ручку — крутить, стрелку — нажать ───
    const at = (e: PointerEvent) => {
      const box = el.getBoundingClientRect();
      return { x: e.clientX - box.left, y: e.clientY - box.top };
    };
    const down = (e: PointerEvent) => {
      if ((e.target as Element).closest('.corner-button')) return;
      if (s.drag || s.crank || s.phase !== 'play') return;
      const p = at(e);
      const r = s.R;
      if (r.kind === 'direction') {
        if (clock < s.lockUntil) return;
        const b = buttons().find((x) => dist(p, x) < x.r * 1.15);
        if (b) answer(b.dir);
        return;
      }
      if (clock < s.lockUntil) return;
      const i = pieceHit(p);
      if (i >= 0) {
        if (!canSend()) return;
        const c = pieceAt(i);
        s.drag = {
          i,
          x: p.x,
          y: p.y,
          ox: c.x - p.x,
          oy: c.y - p.y,
          sx: p.x,
          sy: p.y,
          moved: false,
        };
        el.setPointerCapture?.(e.pointerId);
        fx.tap();
        return;
      }
      const c = gearPx(0);
      if (dist(p, c) < (outer(teeth(0)) + 0.4) * u || dist(p, knobAt()) < 0.6 * u) {
        s.crank = {
          last: Math.atan2(p.y - c.y, p.x - c.x),
          turned: 0,
          vel: 0,
          t: performance.now(),
        };
        s.omega = 0;
        el.setPointerCapture?.(e.pointerId);
        if (!ready() && !s.gapTold) {
          s.gapTold = true;
          void say(GEARS_GAP);
        }
      }
    };
    const move = (e: PointerEvent) => {
      const p = at(e);
      const d = s.drag;
      if (d) {
        d.x = p.x;
        d.y = p.y;
        if (Math.hypot(p.x - d.sx, p.y - d.sy) > 10) d.moved = true;
        return;
      }
      const cr = s.crank;
      if (!cr) return;
      const c = gearPx(0);
      if (dist(p, c) < 0.25 * u) return;
      const a = Math.atan2(p.y - c.y, p.x - c.x);
      const da = wrapPi(a - cr.last);
      cr.last = a;
      cr.turned += Math.abs(da);
      const now = performance.now();
      const inst = da / Math.max(0.008, (now - cr.t) / 1000);
      cr.vel = 0.6 * cr.vel + 0.4 * inst;
      cr.t = now;
      if (da) s.lastDir = da > 0 ? 1 : -1;
      if (s.phase === 'play') turn(da);
    };
    const up = (e: PointerEvent) => {
      const cr = s.crank;
      if (cr) {
        s.crank = null;
        if (s.phase !== 'play') return;
        // Нажали, не покрутив, — толчок; отпустили на ходу — крутится дальше сама.
        if (cr.turned < 0.15) s.omega = PUSH * s.lastDir;
        else if (performance.now() - cr.t < 120) s.omega = Math.max(-PUSH, Math.min(PUSH, cr.vel));
        return;
      }
      const d = s.drag;
      if (!d) return;
      s.drag = null;
      // Где отпустили — по самому событию: последний pointermove мог не дойти.
      if (e.type === 'pointerup') {
        Object.assign(d, at(e));
        if (Math.hypot(d.x - d.sx, d.y - d.sy) > 10) d.moved = true;
      }
      if (!canSend()) return;
      const p = s.pieces[d.i]!;
      if (!d.moved) {
        const c = pieceAt(d.i);
        return fly(d.i, freePegs()[0]!, { ...c, scale: tray.scale, rot: p.rot });
      }
      const g = { x: d.x + d.ox, y: d.y + d.oy };
      const from = { ...g, scale: 1.05, rot: p.rot };
      const peg = freePegs()
        .map((i) => ({ i, d: dist(g, gearPx(i)) }))
        .filter((x) => x.d < (pitch(teeth(x.i)) + 0.45) * u)
        .sort((a, b) => a.d - b.d)[0];
      if (e.type === 'pointerup' && peg) return fly(d.i, peg.i, from);
      // Мимо гвоздика — обратно в коробку, это не ошибка.
      flyBack(d.i, from);
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
      className="game gears"
      data-testid="game-gears"
      data-phase={phase}
      data-round={round}
      data-no-idle={busy || undefined}
      ref={root}
    >
      <canvas ref={canvas} className="gears-canvas" />
      <div ref={hint} className="gears-hint" data-hint={!busy || undefined} />
      <div ref={target} className="gears-hint" data-hint-target={!busy || undefined} />
    </div>
  );
}
