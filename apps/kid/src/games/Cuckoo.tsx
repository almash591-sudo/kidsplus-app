// «Часы с кукушкой» (этап 58). Большие глиняные часы-домик с маятником и гирьками-шишками.
// «Который час?» — стрелки сами бегут к новому времени, ребёнок нажимает число, куда показывает
// маленькая стрелка. «Покажи три часа!» — ребёнок пальцем ставит стрелку (с половинами — обе).
// «Режим дня» — карточка мишки: в семь утра просыпается, в девять вечера ложится спать. Угадал —
// открывается дверца, и кукушка кукует столько раз, который час. Всё — один canvas.
import { useEffect, useRef, useState } from 'react';
import { fx } from '../fx';
import {
  CUCKOO_BIG_HAND,
  CUCKOO_DAY,
  CUCKOO_DAY_INTRO,
  CUCKOO_END,
  CUCKOO_GO,
  CUCKOO_HALF_HINT,
  CUCKOO_LOOK,
  CUCKOO_NOW_BIG,
  CUCKOO_NOW_SMALL,
  CUCKOO_READ,
  CUCKOO_READ_INTRO,
  CUCKOO_SET_HALF_INTRO,
  CUCKOO_SET_INTRO,
  CUCKOO_WHOLE_HINT,
  clockAnswer,
  cuckooShow,
} from '../phrases';
import { afterSpeech, clayUrl, praise, retry, say, setTask, type GameProps } from './common';
import {
  BIG_LEN,
  DOOR,
  FACE,
  NUM_R,
  SMALL_LEN,
  cuckooSprites,
  grabHand,
  hourTurn,
  judge,
  minuteTurn,
  numberAt,
  planRounds,
  pointAt,
  release,
  sameTime,
  settle,
  stageFor,
  turnAt,
  turnDelta,
  type CuckooStage,
  type DayPart,
  type Hand,
  type Time,
} from './cuckooLogic';

type Phase = 'turn' | 'play' | 'settle' | 'cuckoo' | 'finish';

const TAU = Math.PI * 2;
const COLORS = ['#ef4444', '#facc15', '#3b82f6', '#22c55e', '#a855f7', '#fb923c'];
const SMALL_COLOR = '#c0452f';
const BIG_COLOR = '#2f4a7a';
const INK = '#4a2c14';
/** Стрелки бегут к новому времени не дольше, мс. */
const SPIN_MAX = 2400;
/** Стрелка ложится на место, мс. */
const SETTLE_MS = 220;
/** Часы переезжают, когда появляется или уходит карточка режима дня, мс. */
const MORPH_MS = 600;
/** Маятник: полный размах туда-обратно, мс; угол, рад. */
const SWING_MS = 1200;
const SWING = 0.12;

/** Стрелки движутся сами: бегут к новому времени (spin) или ложатся на место (settle). */
interface Anim {
  fs: number;
  fb: number;
  ts: number;
  tb: number;
  at: number;
  dur: number;
  kind: 'spin' | 'settle';
}
interface Drag {
  hand: Hand;
  /** Время на часах до касания: не сдвинул — не проверяем. */
  before: Time;
  went: number;
  sx: number;
  sy: number;
  num: number;
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
const easeOut = (k: number) => 1 - (1 - k) ** 3;
const clamp01 = (k: number) => Math.max(0, Math.min(1, k));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const frac = (x: number) => x - Math.floor(x);
/** Выпрыгивает: от нуля с небольшим перелётом за 0.3 с. */
const popIn = (ms: number) => {
  const k = clamp01(ms / 300);
  return k <= 0 ? 0 : k < 1 ? Math.sin((k * Math.PI) / 2) + 0.15 * Math.sin(k * Math.PI) : 1;
};
/** Раскладка посередине переезда: корпус плавно, циферблат и дверца — за ним. */
const mix = (a: CuckooStage, b: CuckooStage, k: number): CuckooStage => {
  const c = {
    x: lerp(a.case.x, b.case.x, k),
    y: lerp(a.case.y, b.case.y, k),
    w: lerp(a.case.w, b.case.w, k),
    h: lerp(a.case.h, b.case.h, k),
  };
  return {
    land: b.land,
    case: c,
    hang: lerp(a.hang, b.hang, k),
    face: { x: c.x + FACE.x * c.w, y: c.y + FACE.y * c.h, r: FACE.r * c.w },
    door: { x: c.x + DOOR.x * c.w, y: c.y + DOOR.y * c.h, w: DOOR.w * c.w, h: DOOR.h * c.h },
    card: b.card,
  };
};
const timeText = (t: Time) => `${t.h}:${t.m ? '30' : '00'}`;

export function Cuckoo({ spec, phrases, onFinish }: GameProps<'cuckoo'>) {
  const [rounds] = useState(() => planRounds(spec));
  const [round, setRound] = useState(0);
  const [phase, setPhase] = useState<Phase>('turn');
  const root = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const hint = useRef<HTMLDivElement>(null);
  const target = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = root.current!;
    const cv = canvas.current!;
    const ctx = cv.getContext('2d')!;
    const img = new Map<string, HTMLImageElement>();
    for (const name of cuckooSprites()) {
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
    const half = spec.half;

    const s = {
      round: 0,
      phase: 'turn' as Phase,
      R: rounds[0]!,
      /** Стрелки: поворот от «12» по часовой (может уходить за 1 — рисуется так же). */
      small: 0,
      big: 0,
      anim: null as Anim | null,
      lastHour: 0,
      drag: null as Drag | null,
      lastNotch: -1e9,
      /** Нажатое число светится зелёным или красным. */
      mark: null as { n: number; ok: boolean; at: number } | null,
      /** Дверца открылась / закрывается; сколько раз уже прокуковала. */
      doorAt: -1,
      closeAt: -1,
      coo: -1e9,
      coos: 0,
      floats: [] as { text: string; at: number }[],
      cardAt: -1e9,
      leaveAt: -1e9,
      wrong: 0,
      glowAt: -1e9,
      swingSide: 0,
      timers: [] as { at: number; fn: () => void }[],
      particles: [] as Particle[],
      stopped: false,
      /** Для автотестов, только растут. */
      taps: 0,
      drops: 0,
      misses: 0,
      wins: 0,
      cuckoos: 0,
    };
    const go = (p: Phase) => {
      s.phase = p;
      setPhase(p);
    };
    const later = (ms: number, fn: () => void) => s.timers.push({ at: clock + ms, fn });

    /** Часы на этот размер экрана; карточка режима дня появилась или ушла — часы переезжают. */
    const withCard = () => s.R.task === 'day';
    let stTo: CuckooStage = stageFor(w, h, withCard());
    let st = stTo;
    let stFrom: CuckooStage | null = null;
    let stAt = 0;
    let stKey = `${w}x${h}:${withCard()}`;
    const stage = () => {
      const key = `${w}x${h}:${withCard()}`;
      if (key !== stKey) {
        // Тот же экран, другая карточка — переезд; повернули телефон — сразу на место.
        const morph = stKey.split(':')[0] === key.split(':')[0];
        stKey = key;
        stFrom = morph ? st : null;
        stTo = stageFor(w, h, withCard());
        stAt = clock;
      }
      if (stFrom) {
        const k = ease(clamp01((clock - stAt) / MORPH_MS));
        st = k >= 1 ? stTo : mix(stFrom, stTo, k);
        if (k >= 1) stFrom = null;
      } else st = stTo;
      return st;
    };
    const now = () => settle(s.small, s.big, half);

    // ─── Стрелки движутся сами ───
    /** Стрелки бегут вперёд к времени t (большая крутится, маленькая за ней); сколько мс. */
    const spin = (t: Time) => {
      const from = Math.round(frac(s.small) * 720);
      const to = (t.h % 12) * 60 + t.m;
      const d = (to - from + 720) % 720;
      if (!d) return 0;
      const dur = Math.min(SPIN_MAX, 500 + (d / 60) * 220);
      s.lastHour = Math.floor(s.big + 1e-6);
      s.anim = {
        fs: s.small,
        fb: s.big,
        ts: s.small + d / 720,
        tb: s.big + d / 60,
        at: clock,
        dur,
        kind: 'spin',
      };
      return dur;
    };
    /** Стрелки ложатся точно на время t. */
    const settleTo = (t: Time) => {
      s.anim = {
        fs: s.small,
        fb: s.big,
        ts: s.small + turnDelta(s.small, hourTurn(t)),
        tb: s.big + turnDelta(s.big, minuteTurn(t)),
        at: clock,
        dur: SETTLE_MS,
        kind: 'settle',
      };
      return SETTLE_MS;
    };

    // ─── Задания ───
    /** Что сказать в начале раунда (и по «ушку»): first — ещё и как играть. */
    const taskLines = (first: boolean) => {
      const R = s.R;
      const k = s.round;
      if (R.task === 'read') return [first ? CUCKOO_READ_INTRO : CUCKOO_READ];
      const firstDrag = rounds.findIndex((r) => r.task !== 'read') === k;
      const firstDay = rounds.findIndex((r) => r.task === 'day') === k;
      return [
        ...(R.day && first && firstDay ? [CUCKOO_DAY_INTRO] : []),
        ...(R.day ? [CUCKOO_DAY[R.day.id][0]] : []),
        cuckooShow(R.target),
        ...(first && firstDrag ? [half ? CUCKOO_SET_HALF_INTRO : CUCKOO_SET_INTRO] : []),
      ];
    };
    const start = (k: number) => {
      s.round = k;
      setRound(k);
      s.R = rounds[k]!;
      const R = s.R;
      s.wrong = 0;
      s.glowAt = -1e9;
      s.mark = null;
      s.doorAt = -1;
      s.closeAt = -1;
      s.floats = [];
      if (R.day) s.cardAt = clock + 250;
      go('turn');
      const firstRead = rounds.findIndex((r) => r.task === 'read') === k;
      const lines = R.task === 'read' ? taskLines(firstRead) : taskLines(true);
      void say(...(k === 0 ? [CUCKOO_GO] : []), ...lines);
      // «Который час?» — стрелки бегут к загаданному времени; «Покажи» — с того, что на часах.
      const dur = spin(R.task === 'read' ? R.target : R.start);
      // Карточка появилась или ушла — часы переезжают; нажимать, когда доехали.
      const moves = k > 0 && Boolean(rounds[k - 1]!.day) !== Boolean(R.day);
      later(Math.max(dur + 120, moves ? MORPH_MS + 60 : R.day ? 450 : 200), () => go('play'));
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
    /** Точка на экране (для искр похвалы): от холста к окну. */
    const onScreen = (x: number, y: number) => {
      const b = el.getBoundingClientRect();
      return { x: b.left + x, y: b.top + y };
    };

    // ─── Угадал: кукушка ───
    const win = () => {
      go('cuckoo');
      s.wins++;
      s.wrong = 0;
      s.mark = s.R.task === 'read' ? s.mark : null;
      const R = s.R;
      const times = R.target.m ? 1 : R.target.h;
      const gap = times <= 4 ? 750 : times <= 8 ? 600 : 500;
      later(150, () => {
        fx.latch();
        s.doorAt = clock;
      });
      for (let i = 0; i < times; i++)
        later(850 + i * gap, () => {
          fx.cuckoo();
          s.coo = clock;
          s.coos = i + 1;
          s.cuckoos++;
          s.floats.push({ text: String(i + 1), at: clock });
          const d = st.door;
          burst(d.x + d.w / 2, d.y + d.h * 0.4, 5, ['#fff', '#ffe14d']);
        });
      const end = 850 + times * gap + 200;
      later(end, () => (s.closeAt = clock));
      later(end + 560, () => {
        fx.latch();
        s.doorAt = -1;
        s.closeAt = -1;
        const answer = clockAnswer(R.target.h, R.target.m === 30);
        const at = onScreen(st.face.x, st.face.y - st.face.r * 0.4);
        const k = s.round;
        void afterSpeech(
          praise(phrases, at, R.day ? [answer[0]!, CUCKOO_DAY[R.day.id][1]] : answer),
          2600,
        ).then(() => next(k));
      });
    };
    /** Похвалили — следующее время или конец игры. */
    const next = (k: number) => {
      if (s.stopped || s.round !== k) return;
      if (k + 1 < rounds.length) {
        if (s.R.day) {
          s.leaveAt = clock;
          fx.whoosh();
        }
        later(s.R.day ? 380 : 100, () => start(k + 1));
        return;
      }
      confetti();
      go('finish');
      void afterSpeech(say(CUCKOO_END), 2600).then(() => {
        if (!s.stopped) onFinish();
      });
    };

    // ─── Ответы ───
    const mistake = (...lines: string[]) => {
      s.misses++;
      s.wrong++;
      void retry(phrases).then(() => say(...lines));
    };
    /** «Который час?»: нажали число. */
    const tapNumber = (n: number) => {
      const right = n === s.R.target.h;
      s.mark = { n, ok: right, at: clock };
      if (right) {
        s.taps++;
        return win();
      }
      // На «12» показывает большая стрелка — её часто путают с маленькой.
      mistake(n === 12 ? CUCKOO_BIG_HAND : CUCKOO_LOOK);
    };
    /** «Покажи»: стрелку отпустили — легла на место, что теперь показывают часы. */
    const drop = (d: Drag) => {
      const t = release(s.R.target, s.small, s.big, half, d.hand);
      go('settle');
      later(settleTo(t) + 30, () => {
        if (s.stopped) return;
        // Покрутил и вернул как было — не ответ.
        if (sameTime(t, d.before)) return go('play');
        s.drops++;
        const v = judge(s.R.target, t, d.hand);
        if (v === 'win') return win();
        go('play');
        if (v === 'needBig') return void say(CUCKOO_NOW_BIG);
        if (v === 'needSmall') return void say(CUCKOO_NOW_SMALL);
        if (v === 'hour') return mistake(clockAnswer(t.h, t.m === 30)[0]!, cuckooShow(s.R.target));
        mistake(s.R.target.m ? CUCKOO_HALF_HINT : CUCKOO_WHOLE_HINT);
      });
    };

    /** Что подсказать пальцем: число («Который час?») или какую стрелку куда тянуть. */
    const helpAt = (): {
      x: number;
      y: number;
      r: number;
      what: string;
      to?: { x: number; y: number };
    } | null => {
      const R = s.R;
      const f = st.face;
      if (R.task === 'read') {
        const [x, y] = pointAt(f, R.target.h / 12, NUM_R);
        return { x, y, r: f.r * 0.17, what: `num:${R.target.h}` };
      }
      const t = now();
      // С половинами — сначала большая стрелка, потом маленькая.
      if (half && t.m !== R.target.m) {
        const [x, y] = pointAt(f, s.big, BIG_LEN * 0.85);
        const [tx, ty] = pointAt(f, minuteTurn(R.target), BIG_LEN * 0.85);
        return { x, y, r: f.r * 0.16, what: 'big', to: { x: tx, y: ty } };
      }
      const [x, y] = pointAt(f, s.small, SMALL_LEN * 0.8);
      const [tx, ty] = pointAt(f, hourTurn({ h: R.target.h, m: t.m }), SMALL_LEN * 0.8);
      return { x, y, r: f.r * 0.16, what: 'small', to: { x: tx, y: ty } };
    };

    /** «Ушко» и подсказка при бездействии: задание ещё раз, подсказка светится. */
    const remind = () => {
      s.glowAt = clock;
      return say(...taskLines(false));
    };
    setTask(remind);

    // ─── Рисование ───
    /** Прямоугольник со скруглёнными углами (свой — roundRect нет в старом Safari). */
    const rr = (x: number, y: number, bw: number, bh: number, r: number) => {
      const q = Math.min(r, bw / 2, bh / 2);
      ctx.beginPath();
      ctx.moveTo(x + q, y);
      ctx.arcTo(x + bw, y, x + bw, y + bh, q);
      ctx.arcTo(x + bw, y + bh, x, y + bh, q);
      ctx.arcTo(x, y + bh, x, y, q);
      ctx.arcTo(x, y, x + bw, y, q);
      ctx.closePath();
    };
    /** Мягкое светлое пятно — подсказка «сюда». */
    const halo = (x: number, y: number, r: number, k: number) => {
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(255,236,140,${0.9 * k})`);
      g.addColorStop(0.6, `rgba(255,236,140,${0.45 * k})`);
      g.addColorStop(1, 'rgba(255,236,140,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.fill();
    };
    /** Картинка по ширине bw, низом в точке (x, y). */
    const sprite = (name: string, x: number, y: number, bw: number, rot = 0) => {
      const im = ok(name);
      if (!im) return;
      const bh = (bw * im.naturalHeight) / im.naturalWidth;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rot);
      ctx.drawImage(im, -bw / 2, -bh, bw, bh);
      ctx.restore();
    };

    const drawRoom = () => {
      ctx.fillStyle = '#f3e3c4';
      ctx.fillRect(0, 0, w, h);
      const im = ok(`cuckoo-room-${st.land ? 'l' : 'p'}`);
      if (!im) return;
      const k = Math.max(w / im.naturalWidth, h / im.naturalHeight);
      const dw = im.naturalWidth * k;
      const dh = im.naturalHeight * k;
      ctx.drawImage(im, (w - dw) / 2, h - dh, dw, dh);
    };
    /** Цепочка из звеньев от (x, y0) вниз до y1. */
    const chain = (x: number, y0: number, y1: number, link: number) => {
      ctx.lineWidth = Math.max(1.2, link * 0.32);
      for (let y = y0, i = 0; y < y1; y += link * 0.9, i++) {
        ctx.strokeStyle = i % 2 ? '#8a6420' : '#c99a3a';
        ctx.beginPath();
        if (i % 2) ctx.ellipse(x, y + link / 2, link * 0.12, link * 0.5, 0, 0, TAU);
        else ctx.ellipse(x, y + link / 2, link * 0.32, link * 0.5, 0, 0, TAU);
        ctx.stroke();
      }
    };
    /** Маятник-листик и гирьки-шишки на цепочках — за корпусом. */
    const drawHanging = () => {
      const c = st.case;
      const f = st.face;
      const bottom = c.y + c.h;
      const link = Math.max(5, c.w * 0.02);
      // Гирьки: левая ниже, правая выше (часы «заводили»).
      const cone = ok('cuckoo-cone');
      const ch = Math.min(c.h * 0.26, st.hang * 0.92);
      const cw = cone ? (ch * cone.naturalWidth) / cone.naturalHeight : ch * 0.27;
      for (const [dx, k] of [
        [-0.24, 0.97],
        [0.24, 0.62],
      ] as const) {
        const x = f.x + dx * c.w;
        const yb = bottom + st.hang * k;
        const yTop = Math.max(yb - ch, c.y + c.h * 0.8);
        chain(x, c.y + c.h * 0.85, yTop + ch * 0.04, link);
        sprite('cuckoo-cone', x, yb, cw);
      }
      // Маятник качается; на каждом краю — тихое «тик».
      const sw = Math.sin((clock / SWING_MS) * TAU);
      const side = Math.sign(Math.cos((clock / SWING_MS) * TAU));
      if (side !== s.swingSide) {
        if (s.swingSide !== 0 && s.phase !== 'cuckoo') fx.swing();
        s.swingSide = side;
      }
      const px = f.x;
      const py = c.y + c.h * 0.8;
      const L = bottom + st.hang * 0.92 - py;
      const bob = ok('cuckoo-bob');
      const bh = Math.min(c.h * 0.22, st.hang * 0.8);
      const bw = bob ? (bh * bob.naturalWidth) / bob.naturalHeight : bh * 0.57;
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(sw * SWING);
      const g = ctx.createLinearGradient(-c.w * 0.01, 0, c.w * 0.01, 0);
      g.addColorStop(0, '#8a6420');
      g.addColorStop(0.5, '#e8c46a');
      g.addColorStop(1, '#8a6420');
      ctx.fillStyle = g;
      ctx.fillRect(-Math.max(1.5, c.w * 0.008), 0, Math.max(3, c.w * 0.016), L - bh * 0.9);
      sprite('cuckoo-bob', 0, L, bw);
      ctx.restore();
    };
    /** Дверца открывается створками наружу (из той же картинки), в проёме — темно, кукушка. */
    const drawDoor = () => {
      if (s.doorAt < 0) return;
      const d = st.door;
      const t = clock;
      const closing = s.closeAt >= 0 ? t - s.closeAt : -1;
      const open =
        closing >= 0
          ? 1 - ease(clamp01((closing - 230) / 300))
          : easeOut(clamp01((t - s.doorAt) / 320));
      const out =
        closing >= 0
          ? 1 - ease(clamp01(closing / 280))
          : easeOut(clamp01((t - s.doorAt - 220) / 380));
      if (open <= 0.01) return;
      // Тёмный проём под аркой.
      const cx = d.x + d.w / 2;
      const ar = d.w / 2;
      ctx.save();
      ctx.globalAlpha = clamp01(open * 3);
      ctx.beginPath();
      ctx.moveTo(d.x, d.y + d.h);
      ctx.lineTo(d.x, d.y + ar);
      ctx.arc(cx, d.y + ar, ar, Math.PI, 0);
      ctx.lineTo(d.x + d.w, d.y + d.h);
      ctx.closePath();
      const g = ctx.createLinearGradient(0, d.y, 0, d.y + d.h);
      g.addColorStop(0, '#1d0f07');
      g.addColorStop(1, '#3d2414');
      ctx.fillStyle = g;
      ctx.fill();
      ctx.restore();
      // Створки: половинки нарисованной дверцы поворачиваются на петлях.
      const im = ok('cuckoo-case');
      const phi = open * ((115 * Math.PI) / 180);
      const cos = Math.cos(phi);
      if (im) {
        const iw = im.naturalWidth;
        const ih = im.naturalHeight;
        const sx = DOOR.x * iw;
        const sy = DOOR.y * ih;
        const sw = (DOOR.w / 2) * iw;
        const sh = DOOR.h * ih;
        for (const side of [-1, 1]) {
          ctx.save();
          ctx.translate(side < 0 ? d.x : d.x + d.w, 0);
          ctx.scale(Math.abs(cos) < 0.04 ? 0.04 * Math.sign(cos || 1) : cos, 1);
          const dx = side < 0 ? 0 : -d.w / 2;
          ctx.drawImage(im, side < 0 ? sx : sx + sw, sy, sw, sh, dx, d.y, d.w / 2, d.h);
          // Повёрнутая створка темнее.
          ctx.fillStyle = `rgba(40,20,5,${0.35 * Math.sin(phi)})`;
          ctx.fillRect(dx, d.y, d.w / 2, d.h);
          ctx.restore();
        }
      }
      // Кукушка выезжает из проёма и кукует: на каждое «ку-ку» кланяется.
      if (out > 0.01) {
        const since = t - s.coo;
        const bow = since < 320 ? Math.sin((since / 320) * Math.PI) : 0;
        const sc = (0.55 + 0.45 * out) * (1 + 0.08 * bow);
        ctx.save();
        ctx.globalAlpha = clamp01(out * 2);
        sprite('cuckoo-bird', cx - d.w * 0.12 * bow, d.y + d.h * 1.02, d.w * 1.9 * sc, -0.22 * bow);
        ctx.restore();
      }
      // Счёт «ку-ку»: числа всплывают над дверцей.
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `bold ${Math.round(d.w * 0.6)}px system-ui, sans-serif`;
      ctx.lineJoin = 'round';
      for (const fl of s.floats) {
        const k = (t - fl.at) / 1000;
        if (k > 1) continue;
        ctx.globalAlpha = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
        const y = d.y - d.h * 0.2 - easeOut(k) * d.h * 0.9;
        const x = cx + d.w * 1.1;
        ctx.lineWidth = d.w * 0.12;
        ctx.strokeStyle = '#6b3a17';
        ctx.strokeText(fl.text, x, y);
        ctx.fillStyle = '#fff';
        ctx.fillText(fl.text, x, y);
      }
      ctx.restore();
    };
    /** Стрелка: от хвостика за серединой до острия, белая обводка; в пальце — приподнята. */
    const drawHand = (turn: number, len: number, width: number, color: string, lift: boolean) => {
      const f = st.face;
      const L = len * f.r;
      const hw = (width * f.r) / 2;
      const tail = L * 0.18;
      ctx.save();
      ctx.translate(f.x, f.y);
      ctx.rotate(turn * TAU);
      if (lift) ctx.scale(1.05, 1.05);
      ctx.beginPath();
      ctx.moveTo(-hw, tail);
      ctx.lineTo(-hw * 0.75, -L + hw * 2.8);
      ctx.lineTo(-hw * 1.9, -L + hw * 2.8);
      ctx.lineTo(0, -L);
      ctx.lineTo(hw * 1.9, -L + hw * 2.8);
      ctx.lineTo(hw * 0.75, -L + hw * 2.8);
      ctx.lineTo(hw, tail);
      ctx.closePath();
      ctx.shadowColor = 'rgba(40,20,5,0.35)';
      ctx.shadowBlur = f.r * (lift ? 0.1 : 0.04);
      ctx.shadowOffsetX = f.r * (lift ? 0.04 : 0.015);
      ctx.shadowOffsetY = f.r * (lift ? 0.06 : 0.025);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.shadowColor = 'transparent';
      const g = ctx.createLinearGradient(-hw * 2, 0, hw * 2, 0);
      g.addColorStop(0, 'rgba(255,255,255,0.35)');
      g.addColorStop(0.5, 'rgba(255,255,255,0)');
      g.addColorStop(1, 'rgba(0,0,0,0.18)');
      ctx.fillStyle = g;
      ctx.fill();
      ctx.lineJoin = 'round';
      ctx.lineWidth = Math.max(1.5, f.r * 0.022);
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.stroke();
      ctx.restore();
    };
    /** Циферблат: точки минут, крупные числа, отметки нажатий, стрелки и золотая серединка. */
    const drawFace = (help: ReturnType<typeof helpAt>, glow: number) => {
      const f = st.face;
      ctx.fillStyle = 'rgba(120,80,40,0.55)';
      for (let i = 0; i < 60; i++) {
        const [x, y] = pointAt(f, i / 60, 0.93);
        ctx.beginPath();
        ctx.arc(x, y, i % 5 ? f.r * 0.011 : f.r * 0.026, 0, TAU);
        ctx.fill();
      }
      // Подсказка после двух ошибок и по «ушку» — светится нужное число или место стрелки.
      if (help && glow > 0) {
        const p = help.to ?? help;
        halo(p.x, p.y, f.r * 0.3, glow);
      }
      const m = s.mark;
      if (m && clock - m.at < 1400) {
        const [x, y] = pointAt(f, m.n / 12, NUM_R);
        const k = clamp01((clock - m.at) / 1400);
        ctx.globalAlpha = 1 - k * k;
        ctx.fillStyle = m.ok ? 'rgba(80,200,110,0.3)' : 'rgba(230,70,70,0.25)';
        ctx.strokeStyle = m.ok ? '#3fbf5f' : '#e5484d';
        ctx.lineWidth = f.r * 0.035;
        ctx.beginPath();
        ctx.arc(x, y, f.r * (0.15 + 0.03 * popIn(clock - m.at)), 0, TAU);
        ctx.fill();
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      ctx.fillStyle = INK;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `bold ${Math.round(f.r * 0.21)}px system-ui, sans-serif`;
      for (let n = 1; n <= 12; n++) {
        const [x, y] = pointAt(f, n / 12, NUM_R);
        ctx.fillText(String(n), x, y + f.r * 0.012);
      }
      // После двух ошибок — бледная стрелка там, где ей надо быть.
      if (help?.to && s.wrong >= 2 && s.phase === 'play') {
        ctx.globalAlpha = 0.3 + 0.15 * Math.sin(clock / 200);
        const t = s.R.target;
        if (help.what === 'big') drawHand(minuteTurn(t), BIG_LEN, 0.065, BIG_COLOR, false);
        else drawHand(hourTurn({ h: t.h, m: now().m }), SMALL_LEN, 0.1, SMALL_COLOR, false);
        ctx.globalAlpha = 1;
      }
      const held = s.drag?.hand;
      drawHand(s.big, BIG_LEN, 0.065, BIG_COLOR, held === 'big');
      drawHand(s.small, SMALL_LEN, 0.1, SMALL_COLOR, held === 'small');
      const g = ctx.createRadialGradient(
        f.x - f.r * 0.03,
        f.y - f.r * 0.03,
        0,
        f.x,
        f.y,
        f.r * 0.09,
      );
      g.addColorStop(0, '#fff3c0');
      g.addColorStop(0.5, '#e0b040');
      g.addColorStop(1, '#a87a20');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r * 0.085, 0, TAU);
      ctx.fill();
    };
    /** Солнышко (утро — пониже и розовое небо, день — высоко) или луна со звёздочкой. */
    const drawBadge = (x: number, y: number, r: number, part: DayPart) => {
      ctx.save();
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.fillStyle = part === 'evening' ? '#2c3e75' : part === 'morning' ? '#ffd9b0' : '#8fd3ff';
      ctx.shadowColor = 'rgba(40,20,5,0.3)';
      ctx.shadowBlur = r * 0.3;
      ctx.fill();
      ctx.shadowColor = 'transparent';
      ctx.lineWidth = r * 0.12;
      ctx.strokeStyle = '#fff';
      ctx.stroke();
      ctx.clip();
      if (part === 'evening') {
        ctx.fillStyle = '#ffe680';
        ctx.beginPath();
        ctx.arc(x - r * 0.1, y, r * 0.5, 0, TAU);
        ctx.fill();
        ctx.fillStyle = '#2c3e75';
        ctx.beginPath();
        ctx.arc(x + r * 0.12, y - r * 0.12, r * 0.42, 0, TAU);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(x + r * 0.45, y + r * 0.35, r * 0.07, 0, TAU);
        ctx.arc(x + r * 0.5, y - r * 0.45, r * 0.05, 0, TAU);
        ctx.fill();
      } else {
        const sy = part === 'morning' ? y + r * 0.3 : y;
        const sr = r * 0.36;
        ctx.strokeStyle = '#ffb020';
        ctx.lineWidth = r * 0.1;
        ctx.lineCap = 'round';
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * TAU + clock / 3000;
          ctx.beginPath();
          ctx.moveTo(x + Math.cos(a) * sr * 1.3, sy + Math.sin(a) * sr * 1.3);
          ctx.lineTo(x + Math.cos(a) * sr * 1.7, sy + Math.sin(a) * sr * 1.7);
          ctx.stroke();
        }
        ctx.fillStyle = '#ffcc33';
        ctx.beginPath();
        ctx.arc(x, sy, sr, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    };
    /** Карточка режима дня: что делает мишка; утро, день или вечер — значок в углу. */
    const drawCard = () => {
      const R = s.R;
      const c = st.card;
      if (!R.day || !c) return;
      const leaving = s.leaveAt > s.cardAt ? 1 - ease(clamp01((clock - s.leaveAt) / 300)) : 1;
      const k = popIn(clock - s.cardAt) * leaving;
      if (k <= 0.01) return;
      const won = s.phase === 'cuckoo' ? Math.abs(Math.sin((clock - s.doorAt) / 180)) * 0.04 : 0;
      ctx.save();
      ctx.translate(c.x + c.w / 2, c.y + c.h / 2);
      ctx.scale(k * (1 + won), k * (1 + won));
      ctx.translate(-c.w / 2, -c.h / 2);
      const r = c.w * 0.12;
      rr(0, 0, c.w, c.h, r);
      ctx.shadowColor = 'rgba(40,20,5,0.35)';
      ctx.shadowBlur = c.w * 0.08;
      ctx.shadowOffsetY = c.w * 0.03;
      ctx.fillStyle = '#fff';
      ctx.fill();
      ctx.shadowColor = 'transparent';
      const pad = c.w * 0.045;
      const im = ok(`cuckoo-day-${R.day.id}`);
      if (im) {
        ctx.save();
        rr(pad, pad, c.w - pad * 2, c.h - pad * 2, r * 0.75);
        ctx.clip();
        ctx.drawImage(im, pad, pad, c.w - pad * 2, c.h - pad * 2);
        ctx.restore();
      }
      drawBadge(c.w * 0.14, c.h * 0.14, c.w * 0.12, R.day.part);
      ctx.restore();
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
      // Стрелки бегут сами: на каждом часе — «тк».
      const a = s.anim;
      if (a) {
        const k = clamp01((clock - a.at) / a.dur);
        const e = a.kind === 'spin' ? ease(k) : easeOut(k);
        s.small = lerp(a.fs, a.ts, e);
        s.big = lerp(a.fb, a.tb, e);
        if (a.kind === 'spin') {
          const hr = Math.floor(s.big + 1e-6);
          if (hr !== s.lastHour) {
            s.lastHour = hr;
            fx.notch();
          }
        }
        if (k >= 1) s.anim = null;
      }
      const help = s.phase === 'play' && !s.drag ? helpAt() : null;
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
      drawRoom();
      drawHanging();
      const c = st.case;
      const im = ok('cuckoo-case');
      if (im) ctx.drawImage(im, c.x, c.y, c.w, c.h);
      drawDoor();
      drawFace(help, glow);
      drawCard();

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
            const an = (q * Math.PI) / 5 + p.rot;
            const r = q % 2 ? p.r * 0.45 : p.r;
            ctx.lineTo(p.x + Math.cos(an) * r, p.y + Math.sin(an) * r);
          }
          ctx.closePath();
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
      s.particles = s.particles.filter((p) => p.age < p.life);

      // Палец подсказки (IdleHint): число — нажать; стрелку — дотянуть до места.
      if (frameNo % 6 === 0 && hint.current && target.current) {
        const hs = hint.current.style;
        const ts = target.current.style;
        const place = (st2: CSSStyleDeclaration, x: number, y: number, r: number) => {
          st2.display = 'block';
          st2.left = `${x - r}px`;
          st2.top = `${y - r}px`;
          st2.width = `${r * 2}px`;
          st2.height = `${r * 2}px`;
        };
        hs.display = 'none';
        ts.display = 'none';
        if (help && !busyNow()) {
          place(hs, help.x, help.y, help.r);
          if (help.to) place(ts, help.to.x, help.to.y, help.r);
        }
        target.current.toggleAttribute('data-hint-target', Boolean(help?.to));
      }
      // Для автотестов — каждый кадр.
      if (webdriver) {
        const pt = (p: { x: number; y: number }) => ({ x: Math.round(p.x), y: Math.round(p.y) });
        const f = st.face;
        el.dataset.task = s.R.task;
        el.dataset.busy = busyNow() ? '1' : '0';
        el.dataset.half = half ? '1' : '0';
        el.dataset.target = timeText(s.R.target);
        el.dataset.time = timeText(now());
        el.dataset.day = s.R.day?.id ?? '';
        el.dataset.face = JSON.stringify({ ...pt(f), r: Math.round(f.r) });
        el.dataset.small = frac(s.small).toFixed(3);
        el.dataset.big = frac(s.big).toFixed(3);
        el.dataset.next = JSON.stringify(
          help ? { ...pt(help), what: help.what, ...(help.to ? { to: pt(help.to) } : {}) } : null,
        );
        el.dataset.taps = String(s.taps);
        el.dataset.drops = String(s.drops);
        el.dataset.misses = String(s.misses);
        el.dataset.wins = String(s.wins);
        el.dataset.cuckoos = String(s.cuckoos);
      }
      raf = requestAnimationFrame(frame);
    };

    // ─── Касания: число на циферблате или стрелка ───
    const at = (e: PointerEvent) => {
      const box = el.getBoundingClientRect();
      return { x: e.clientX - box.left, y: e.clientY - box.top };
    };
    const busyNow = () => s.phase !== 'play';
    /** Стрелка в пальце поворачивается туда, где палец; большая тянет за собой маленькую. */
    const turnTo = (p: { x: number; y: number }) => {
      const d = s.drag;
      const f = st.face;
      if (!d || Math.hypot(p.x - f.x, p.y - f.y) < f.r * 0.14) return;
      const t = turnAt(f, p.x, p.y);
      if (d.hand === 'small') s.small += turnDelta(s.small, t);
      else {
        const dd = turnDelta(s.big, t);
        s.big += dd;
        s.small += dd / 12;
      }
      // Стрелка проходит число — «тк».
      const num = Math.round(frac(d.hand === 'small' ? s.small : s.big) * 12) % 12;
      if (num !== d.num) {
        d.num = num;
        if (clock - s.lastNotch > 40) {
          s.lastNotch = clock;
          fx.notch();
        }
      }
    };
    const down = (e: PointerEvent) => {
      if ((e.target as Element).closest('.corner-button')) return;
      if (s.drag || busyNow()) return;
      const p = at(e);
      const f = st.face;
      if (s.R.task === 'read') {
        const n = numberAt(f, p.x, p.y);
        if (n !== null) tapNumber(n);
        return;
      }
      if (Math.hypot(p.x - f.x, p.y - f.y) > f.r * 1.25) return;
      const hand = grabHand(f, s.small, s.big, p.x, p.y, half);
      s.drag = {
        hand,
        before: now(),
        went: 0,
        sx: p.x,
        sy: p.y,
        num: Math.round(frac(hand === 'small' ? s.small : s.big) * 12) % 12,
      };
      el.setPointerCapture?.(e.pointerId);
      fx.tap();
      turnTo(p);
    };
    const move = (e: PointerEvent) => {
      const d = s.drag;
      if (!d) return;
      const p = at(e);
      d.went = Math.max(d.went, Math.hypot(p.x - d.sx, p.y - d.sy));
      turnTo(p);
    };
    const up = (e: PointerEvent) => {
      const d = s.drag;
      if (!d) return;
      // Где отпустили — по самому событию: последний pointermove мог не дойти.
      if (e.type === 'pointerup') turnTo(at(e));
      s.drag = null;
      if (busyNow()) return;
      drop(d);
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
      className="game cuckoo"
      data-testid="game-cuckoo"
      data-phase={phase}
      data-round={round}
      data-no-idle={busy || undefined}
      ref={root}
    >
      <canvas ref={canvas} className="cuckoo-canvas" />
      <div ref={hint} className="cuckoo-hint" data-hint={!busy || undefined} />
      <div ref={target} className="cuckoo-hint" />
    </div>
  );
}
