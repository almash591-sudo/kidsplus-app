// «Катись, шарик» (этап 59). Глиняная дощечка на весь экран: ребёнок двумя руками наклоняет
// телефон, шарик катится к лунке с флажком, в обход перегородок и ямок. Старшим шарик собирает числа
// и буквы по порядку. Нет датчика, не дали разрешение или телефон лежит на столе — катим пальцем с
// той же физикой. Всё — один canvas.
import { useEffect, useRef, useState } from 'react';
import { fx } from '../fx';
import { setKeepAwake } from '../kiosk';
import {
  MARBLE_ASK,
  MARBLE_COUNT,
  MARBLE_END,
  MARBLE_FINGER,
  MARBLE_GO,
  MARBLE_HOLE,
  MARBLE_ORDER,
  MARBLE_PIT,
  MARBLE_TILT,
  MARBLE_WIN,
  marbleWord,
} from '../phrases';
import {
  afterSpeech,
  bump,
  clayUrl,
  NUMBERS,
  praise,
  say,
  setTask,
  type GameProps,
} from './common';
import {
  aimFrom,
  BALL_R,
  flowTo,
  fingerWish,
  fromPx,
  heightFor,
  HOLE_R,
  inHole,
  inPit,
  makeBoard,
  marbleSprites,
  onToken,
  pathFrom,
  PIT_R,
  planRounds,
  pull,
  roll,
  slotsFor,
  toBoard,
  TOKEN_R,
  toPx,
  viewFor,
  WALL_R,
  type Ball,
  type Flow,
  type MarbleRound,
  type P,
} from './marbleLogic';
import { askMotion, createTilt, onScreen, screenAngle, type Steer } from './tilt';

type Phase = 'ask' | 'drop' | 'play' | 'fall' | 'done' | 'finish';

const TAU = Math.PI * 2;
const COLORS = ['#ff7a59', '#ffd23f', '#5dd39e', '#57a9ff', '#c58cff', '#ff9ecb'];
/** Шарик падает на дощечку, проваливается в ямку, крутится в лунке, мс. */
const DROP_MS = 520;
const FALL_MS = 460;
const SINK_MS = 540;
/** Без дорожки до цели — сначала столько мс дают разобраться самому. */
const TRAIL_AFTER = 10000;
/** Шарик стоит столько мс — снова показать качающийся телефон. */
const ROCK_AFTER = 6000;
/** Самый длинный шаг физики, с: на редких кадрах шарик не тормозит и не проскакивает сквозь стенки. */
const STEP = 0.02;
/** Телефон взяли со стола: столько мс ждём, пока он ляжет в руки, и только потом берём «ровно». */
const SETTLE_MS = 700;
/** На сколько пикселей дно дощечки плывёт за наклоном. */
const PARALLAX = 5;

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  life: number;
  age: number;
  color: string;
  kind: 'spark' | 'confetti' | 'dust';
  rot: number;
}
type Spot = [number, number, number];

const clamp01 = (k: number) => Math.max(0, Math.min(1, k));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const ease = (k: number) => (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2);
const taskOf = (r: MarbleRound) =>
  r.task === 'hole' ? MARBLE_HOLE : r.task === 'count' ? MARBLE_COUNT : marbleWord(r.word!);

/** Белые крапинки по шарику — по ним видно, что он катится. */
const spots = () =>
  Array.from({ length: 9 }, (_, i): Spot => {
    const z = 1 - (2 * (i + 0.5)) / 9;
    const r = Math.sqrt(1 - z * z);
    const a = i * 2.4;
    return [Math.cos(a) * r, Math.sin(a) * r, z];
  });

/** Повернуть крапинку: шарик прокатился на (dx, dy) по экрану, радиус r. */
function rolled(v: Spot, dx: number, dy: number, r: number): Spot {
  const len = Math.hypot(dx, dy);
  if (len < 1e-4) return v;
  const kx = -dy / len;
  const ky = dx / len;
  const a = len / r;
  const c = Math.cos(a);
  const q = Math.sin(a);
  const dotK = kx * v[0] + ky * v[1];
  return [
    v[0] * c + ky * v[2] * q + kx * dotK * (1 - c),
    v[1] * c - kx * v[2] * q + ky * dotK * (1 - c),
    v[2] * c + (kx * v[1] - ky * v[0]) * q,
  ];
}

export function Marble({ spec, phrases, onFinish }: GameProps<'marble'>) {
  const [rounds] = useState(() => planRounds(spec));
  const [round, setRound] = useState(0);
  const [phase, setPhase] = useState<Phase>('drop');
  const [steer, setSteer] = useState<Steer>('tilt');
  const root = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const hint = useRef<HTMLDivElement>(null);
  const hintTo = useRef<HTMLDivElement>(null);
  const press = useRef<() => void>(() => {});

  useEffect(() => {
    const el = root.current!;
    const cv = canvas.current!;
    const ctx = cv.getContext('2d')!;
    const img = new Map<string, HTMLImageElement>();
    for (const name of marbleSprites()) {
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
    const measure = () => {
      const box = el.getBoundingClientRect();
      w = box.width || window.innerWidth;
      h = box.height || window.innerHeight;
      dpr = Math.min(2, window.devicePixelRatio || 1);
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
    };
    measure();

    const webdriver = navigator.webdriver;
    const tilt = createTilt();
    /** Часы игры, мс: идут только с кадрами — погашенный экран ставит игру на паузу. */
    let clock = 0;
    const first = makeBoard(rounds[0]!, heightFor(w, h));
    const atStart = (): Ball => ({ ...first.start, vx: 0, vy: 0 });
    const s = {
      k: 0,
      R: rounds[0]!,
      board: first,
      view: viewFor(w, h, first.h),
      ball: atStart(),
      phase: 'drop' as Phase,
      mode: 'tilt' as Steer,
      launched: false,
      greeted: false,
      fingerTold: false,
      tiltTold: false,
      orderTold: false,
      /** Шарик уже катился за эту игру: качающийся телефон больше не нужен сразу. */
      rolled: false,
      rollAt: 0,
      shownAt: 0,
      got: 0,
      over: -1,
      falls: 0,
      fallsAll: 0,
      wins: 0,
      fallAt: -1,
      fallFrom: { x: 0, y: 0 } as P,
      fallPit: { x: 0, y: 0 } as P,
      dropAt: 0,
      sinkAt: -1,
      sinkFrom: { x: 0, y: 0 } as P,
      enterAt: 0,
      leaveAt: -1,
      hitAt: -1e9,
      soundAt: -1e9,
      wobble: { i: -1, at: -1e9 },
      closing: [] as { p: P; at: number }[],
      flying: [] as { i: number; at: number }[],
      settleAt: -1,
      dragging: false,
      pointer: -1,
      finger: null as P | null,
      flow: null as Flow | null,
      aim: first.start as P,
      trail: [] as P[],
      spots: spots(),
      timers: [] as { at: number; fn: () => void }[],
      particles: [] as Particle[],
      stopped: false,
    };
    const resize = () => {
      measure();
      s.view = viewFor(w, h, s.board.h);
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);

    const go = (p: Phase) => {
      s.phase = p;
      setPhase(p);
    };
    const later = (ms: number, fn: () => void) => s.timers.push({ at: clock + ms, fn });
    const target = () => s.board.tokens[s.got]?.at ?? s.board.goal;
    const retarget = () => {
      const t = target();
      s.flow = t ? flowTo(s.board, t) : null;
    };

    const burst = (x: number, y: number, count: number, colors?: string[]) => {
      for (let i = 0; i < count; i++) {
        const a = Math.random() * TAU;
        const v = 120 + Math.random() * 240;
        s.particles.push({
          x,
          y,
          vx: Math.cos(a) * v,
          vy: Math.sin(a) * v - 50,
          r: 4 + Math.random() * 4,
          life: 0.9,
          age: 0,
          color: colors ? colors[i % colors.length]! : i % 3 ? '#ffe14d' : '#fff',
          kind: 'spark',
          rot: Math.random() * 6,
        });
      }
    };
    const dust = (x: number, y: number, count: number) => {
      for (let i = 0; i < count; i++)
        s.particles.push({
          x: x + (Math.random() - 0.5) * s.view.cell * 0.4,
          y: y + (Math.random() - 0.5) * s.view.cell * 0.4,
          vx: (Math.random() - 0.5) * 70,
          vy: (Math.random() - 0.5) * 70,
          r: s.view.cell * (0.04 + Math.random() * 0.05),
          life: 0.45,
          age: 0,
          color: 'rgba(255,240,215,0.75)',
          kind: 'dust',
          rot: 0,
        });
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

    // ─── Раунды ───
    const play = () => {
      go('play');
      s.rollAt = clock;
      tilt.center();
    };
    const start = (k: number) => {
      s.k = k;
      setRound(k);
      s.R = rounds[k]!;
      if (k > 0) {
        s.board = makeBoard(s.R, heightFor(w, h));
        s.view = viewFor(w, h, s.board.h);
      }
      s.ball = { ...s.board.start, vx: 0, vy: 0 };
      s.got = 0;
      s.over = -1;
      s.falls = 0;
      s.tiltTold = false;
      s.orderTold = false;
      s.sinkAt = -1;
      s.leaveAt = -1;
      s.closing = [];
      s.flying = [];
      s.trail = [];
      s.finger = null;
      s.dragging = false;
      s.dropAt = clock;
      s.enterAt = clock;
      s.shownAt = clock;
      retarget();
      s.aim = s.board.start;
      go('drop');
      if (k > 0) void say(taskOf(s.R));
      later(DROP_MS, () => {
        if (s.stopped || s.k !== k) return;
        fx.drop();
        play();
      });
    };
    const next = (k: number) => {
      if (s.stopped || s.k !== k) return;
      if (k + 1 < rounds.length) {
        s.leaveAt = clock;
        fx.whoosh();
        later(520, () => start(k + 1));
        return;
      }
      confetti();
      go('finish');
      void afterSpeech(say(MARBLE_END), 2600).then(() => {
        if (!s.stopped) onFinish();
      });
    };
    const win = () => {
      const k = s.k;
      const last = s.board.tokens[s.board.tokens.length - 1];
      const answer =
        s.R.task === 'hole'
          ? [MARBLE_WIN]
          : s.R.task === 'count'
            ? [NUMBERS[Number(last!.label)]!]
            : [s.R.word!];
      s.wins++;
      go('done');
      const cheer = () =>
        void afterSpeech(praise(phrases, undefined, answer), 2800).then(() => next(k));
      if (!s.board.goal) {
        cheer();
        return;
      }
      s.sinkAt = clock;
      s.sinkFrom = { x: s.ball.x, y: s.ball.y };
      fx.sink();
      later(SINK_MS, () => {
        const at = toPx(s.view, s.board.goal!);
        burst(at.x, at.y, 26, COLORS);
        cheer();
      });
    };
    const fall = (pit: P) => {
      s.falls++;
      s.fallsAll++;
      s.fallAt = clock;
      s.fallPit = pit;
      s.fallFrom = { x: s.ball.x, y: s.ball.y };
      s.finger = null;
      s.dragging = false;
      go('fall');
      bump();
      fx.plop();
      if (s.fallsAll <= 2) void say(MARBLE_PIT);
      later(FALL_MS, () => {
        // Третий раз подряд в ямку — маленьким рукам трудно: ямка затягивается.
        if (s.falls % 3 === 0) {
          s.closing.push({ p: pit, at: clock });
          s.board.pits = s.board.pits.filter((c) => c !== pit);
          retarget();
        }
        s.ball = { ...s.board.start, vx: 0, vy: 0 };
        s.dropAt = clock;
        s.over = -1;
        go('drop');
        later(DROP_MS, () => {
          if (s.stopped) return;
          fx.drop();
          go('play');
          s.rollAt = clock;
        });
      });
    };
    const collect = () => {
      const i = s.got++;
      const t = s.board.tokens[i]!;
      const at = toPx(s.view, t.at);
      fx.pick(i);
      burst(at.x, at.y, 12);
      s.flying.push({ i, at: clock });
      s.shownAt = clock;
      if (s.got >= s.board.tokens.length) {
        win();
        return;
      }
      if (s.R.task === 'count') void say(NUMBERS[Number(t.label)]!);
      retarget();
    };
    const checkTokens = () => {
      const { tokens } = s.board;
      let over = -1;
      for (let i = s.got; i < tokens.length; i++)
        if (onToken(s.ball, tokens[i]!)) {
          over = i;
          break;
        }
      if (over === s.got && over >= 0) {
        collect();
        s.over = -1;
        return;
      }
      if (over > s.got && over !== s.over) {
        // Не та: покачается и подскажет, но это не ошибка.
        s.wobble = { i: over, at: clock };
        fx.soft();
        if (!s.orderTold) {
          s.orderTold = true;
          void say(MARBLE_ORDER);
        }
      }
      s.over = over;
    };

    const remind = () => {
      void say(s.phase === 'ask' ? MARBLE_ASK : taskOf(s.R));
    };
    setTask(remind);

    // ─── Запуск: на iPhone датчик разрешают нажатием ───
    // Ответу системы не верим на слово: requestPermission есть и в новом Chrome, а решает то, отзовётся
    // ли датчик. Отказ на iPhone — датчик молчит, и через LOST_MS играем пальцем.
    const launch = () => {
      if (s.stopped || s.launched) return;
      s.launched = true;
      tilt.start();
      start(0);
    };
    press.current = () => {
      fx.click();
      void askMotion().then(launch);
    };
    void askMotion().then((a) => {
      if (s.stopped) return;
      if (a !== 'gesture') {
        launch();
        return;
      }
      go('ask');
      void say(MARBLE_ASK);
    });

    // Погашенный экран: датчик не читаем, а на возврате считаем его заново.
    const onVisibility = () => {
      if (!s.launched) return;
      if (document.hidden) tilt.stop();
      else tilt.start();
    };
    document.addEventListener('visibilitychange', onVisibility);
    // Наклоном играют без касаний: иначе экран погаснет посреди дощечки.
    setKeepAwake(true);

    // ─── Палец ───
    const at = (e: PointerEvent) => {
      const box = el.getBoundingClientRect();
      return { x: e.clientX - box.left, y: e.clientY - box.top };
    };
    const down = (e: PointerEvent) => {
      if ((e.target as Element).closest('.corner-button, .marble-start')) return;
      if (s.phase !== 'play') return;
      if (s.mode === 'tilt') {
        // Наклоном играют, а ребёнок жмёт на экран: один раз за дощечку подскажем.
        if (!s.tiltTold) {
          s.tiltTold = true;
          void say(MARBLE_TILT);
        }
        return;
      }
      s.dragging = true;
      s.pointer = e.pointerId;
      s.finger = fromPx(s.view, at(e));
    };
    const move = (e: PointerEvent) => {
      if (s.dragging && e.pointerId === s.pointer) s.finger = fromPx(s.view, at(e));
    };
    const up = (e: PointerEvent) => {
      if (e.pointerId !== s.pointer) return;
      s.dragging = false;
      s.finger = null;
    };
    el.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);

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
      g.addColorStop(0, `rgba(255,250,200,${0.9 * k})`);
      g.addColorStop(0.6, `rgba(255,250,200,${0.45 * k})`);
      g.addColorStop(1, 'rgba(255,250,200,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.fill();
    };
    /** Картинка по центру (x, y), шириной bw. */
    const centered = (name: string, x: number, y: number, bw: number) => {
      const im = ok(name);
      if (!im) return false;
      const bh = (bw * im.naturalHeight) / im.naturalWidth;
      ctx.drawImage(im, x - bw / 2, y - bh / 2, bw, bh);
      return true;
    };
    /** Картинка заполняет прямоугольник без растяжения. */
    const cover = (name: string, x: number, y: number, bw: number, bh: number) => {
      const im = ok(name);
      if (!im) return false;
      const k = Math.max(bw / im.naturalWidth, bh / im.naturalHeight);
      const dw = im.naturalWidth * k;
      const dh = im.naturalHeight * k;
      ctx.drawImage(im, x + (bw - dw) / 2, y + (bh - dh) / 2, dw, dh);
      return true;
    };
    const token = (x: number, y: number, size: number, label: string, alpha = 1) => {
      ctx.globalAlpha = alpha;
      if (!centered('marble-token', x, y, size)) {
        ctx.fillStyle = '#f6e6c8';
        ctx.beginPath();
        ctx.arc(x, y, size / 2, 0, TAU);
        ctx.fill();
      }
      ctx.fillStyle = '#7a4a22';
      ctx.font = `bold ${size * 0.52}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, x, y + size * 0.03);
      ctx.globalAlpha = 1;
    };

    const drawBack = (land: boolean) => {
      const { floor: f, rim } = s.view;
      ctx.fillStyle = '#b97c4a';
      ctx.fillRect(0, 0, w, h);
      if (cover(`marble-board-${land ? 'l' : 'p'}`, 0, 0, w, h)) {
        ctx.fillStyle = 'rgba(96,52,22,0.55)';
        ctx.fillRect(0, 0, w, h);
      }
      // Рамка дощечки: глиняный бортик со светом сверху.
      const r = rim * 1.3;
      ctx.save();
      rr(f.x - rim, f.y - rim, f.w + rim * 2, f.h + rim * 2, r);
      ctx.shadowColor = 'rgba(40,20,5,0.45)';
      ctx.shadowBlur = 16;
      ctx.shadowOffsetY = 6;
      ctx.fillStyle = '#9a5f34';
      ctx.fill();
      ctx.shadowColor = 'transparent';
      const g = ctx.createLinearGradient(0, f.y - rim, 0, f.y + f.h + rim);
      g.addColorStop(0, 'rgba(255,225,185,0.5)');
      g.addColorStop(0.25, 'rgba(255,225,185,0.08)');
      g.addColorStop(1, 'rgba(50,20,0,0.25)');
      ctx.fillStyle = g;
      ctx.fill();
      ctx.restore();
    };
    /** Дно: дерево, тень от бортика и светлая сторона, поднятая наклоном. */
    const drawFloor = (t: P, land: boolean) => {
      const { floor: f } = s.view;
      const pad = PARALLAX + 2;
      ctx.fillStyle = '#e9a94f';
      ctx.fillRect(f.x - pad, f.y - pad, f.w + pad * 2, f.h + pad * 2);
      cover(`marble-board-${land ? 'l' : 'p'}`, f.x - pad, f.y - pad, f.w + pad * 2, f.h + pad * 2);
      const len = Math.hypot(t.x, t.y);
      if (len > 0.02) {
        const cx = f.x + f.w / 2;
        const cy = f.y + f.h / 2;
        const R = Math.max(f.w, f.h) / 2;
        const g = ctx.createLinearGradient(
          cx - (t.x / len) * R,
          cy - (t.y / len) * R,
          cx + (t.x / len) * R,
          cy + (t.y / len) * R,
        );
        g.addColorStop(0, `rgba(255,245,215,${0.22 * len})`);
        g.addColorStop(1, `rgba(70,30,5,${0.26 * len})`);
        ctx.fillStyle = g;
        ctx.fillRect(f.x - pad, f.y - pad, f.w + pad * 2, f.h + pad * 2);
      }
    };
    const drawTrail = (a: number) => {
      const step = 3;
      const glow = 0.5 + 0.2 * Math.sin(a / 300);
      ctx.fillStyle = `rgba(255,252,235,${glow})`;
      for (let i = step; i < s.trail.length - 1; i += step) {
        const p = toPx(s.view, s.trail[i]!);
        ctx.beginPath();
        ctx.arc(p.x, p.y, s.view.cell * 0.09, 0, TAU);
        ctx.fill();
      }
    };
    const drawPit = (p: P, r: number, k = 1) => {
      const at = toPx(s.view, p);
      const size = r * 2 * s.view.cell * 1.2 * k;
      if (centered('marble-pit', at.x, at.y, size)) return;
      ctx.fillStyle = '#3a1c0c';
      ctx.beginPath();
      ctx.arc(at.x, at.y, size / 2, 0, TAU);
      ctx.fill();
    };
    const drawWalls = () => {
      const { cell } = s.view;
      const width = WALL_R * 2 * cell;
      ctx.lineCap = 'round';
      const pass = (dx: number, dy: number, color: string, lw: number) => {
        ctx.strokeStyle = color;
        ctx.lineWidth = lw;
        ctx.beginPath();
        for (const wall of s.board.walls) {
          const a = toPx(s.view, wall.a);
          const b = toPx(s.view, wall.b);
          ctx.moveTo(a.x + dx, a.y + dy);
          ctx.lineTo(b.x + dx, b.y + dy);
        }
        ctx.stroke();
      };
      pass(width * 0.18, width * 0.34, 'rgba(70,35,10,0.35)', width * 1.05);
      pass(0, 0, '#a5633a', width);
      pass(-width * 0.1, -width * 0.14, '#c98858', width * 0.62);
      pass(-width * 0.16, -width * 0.24, 'rgba(255,232,195,0.6)', width * 0.14);
    };
    const drawBall = (x: number, y: number, r: number, alpha = 1, shadow = 1) => {
      ctx.globalAlpha = alpha;
      if (shadow > 0) {
        ctx.fillStyle = `rgba(50,25,10,${0.32 * shadow})`;
        ctx.beginPath();
        ctx.ellipse(x + r * 0.2, y + r * 0.34, r * 0.98, r * 0.82, 0, 0, TAU);
        ctx.fill();
      }
      if (!centered('marble-ball', x, y, r * 2.2)) {
        ctx.fillStyle = '#e4453a';
        ctx.beginPath();
        ctx.arc(x, y, r, 0, TAU);
        ctx.fill();
      }
      for (const [sx, sy, sz] of s.spots) {
        if (sz < 0.12) continue;
        ctx.fillStyle = `rgba(255,255,255,${0.7 * sz})`;
        ctx.beginPath();
        ctx.ellipse(
          x + sx * r * 0.82,
          y + sy * r * 0.82,
          r * 0.15 * (0.55 + 0.45 * sz),
          r * 0.15,
          Math.atan2(sy, sx) + Math.PI / 2,
          0,
          TAU,
        );
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    };
    /** Где сейчас шарик и какого он размера: падает на дощечку, в ямку, крутится в лунке. */
    const ballNow = () => {
      const { cell } = s.view;
      const r = BALL_R * cell;
      const here = toPx(s.view, s.ball);
      if (s.phase === 'fall') {
        const k = clamp01((clock - s.fallAt) / FALL_MS);
        const p = toPx(s.view, {
          x: lerp(s.fallFrom.x, s.fallPit.x, clamp01(k * 2)),
          y: lerp(s.fallFrom.y, s.fallPit.y, clamp01(k * 2)),
        });
        return { ...p, r: r * (1 - 0.75 * ease(k)), alpha: 1 - k * k, shadow: 0 };
      }
      if (s.sinkAt >= 0 && s.board.goal) {
        const k = clamp01((clock - s.sinkAt) / SINK_MS);
        const goal = s.board.goal;
        const a = k * k * 9;
        const dx = (s.sinkFrom.x - goal.x) * (1 - k);
        const dy = (s.sinkFrom.y - goal.y) * (1 - k);
        const p = toPx(s.view, {
          x: goal.x + dx * Math.cos(a) - dy * Math.sin(a),
          y: goal.y + dx * Math.sin(a) + dy * Math.cos(a),
        });
        return { ...p, r: r * (1 - 0.7 * k), alpha: k >= 1 ? 0 : 1, shadow: 0 };
      }
      if (s.phase === 'drop') {
        const k = clamp01((clock - s.dropAt) / DROP_MS);
        const up = 1 + 0.9 * (1 - ease(k));
        return { ...here, r: r * up, alpha: Math.min(1, k * 3), shadow: k };
      }
      return { ...here, r, alpha: 1, shadow: 1 };
    };
    const drawSlots = () => {
      const { tokens } = s.board;
      if (!tokens.length) return;
      const slots = slotsFor(w, h, tokens.length);
      tokens.forEach((t, i) => {
        const slot = slots[i]!;
        const fly = s.flying.find((f) => f.i === i);
        const k = fly ? clamp01((clock - fly.at) / 340) : 0;
        // Ещё не собранное видно бледно: так понятен порядок.
        token(slot.x, slot.y, slot.size * 0.92, t.label, k >= 1 ? 1 : 0.42);
        if (fly && k < 1) {
          const from = toPx(s.view, t.at);
          const size = lerp(TOKEN_R * 2.3 * s.view.cell, slot.size * 0.92, k);
          token(lerp(from.x, slot.x, ease(k)), lerp(from.y, slot.y, ease(k)), size, t.label);
        }
      });
    };
    /** Качающийся телефон: как играть, пока шарик стоит. */
    const drawRocking = (a: number) => {
      const { floor: f, cell } = s.view;
      const bh = cell * 2.6;
      const bw = bh * 0.56;
      const x = f.x + f.w / 2;
      const y = f.y + f.h / 2;
      halo(x, y, bh * 1.1, 0.8);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(Math.sin(a / 340) * 0.34);
      rr(-bw / 2, -bh / 2, bw, bh, bw * 0.18);
      ctx.fillStyle = '#4b5a78';
      ctx.fill();
      rr(-bw * 0.4, -bh * 0.42, bw * 0.8, bh * 0.84, bw * 0.08);
      ctx.fillStyle = '#ffe9b8';
      ctx.fill();
      ctx.fillStyle = '#e4453a';
      ctx.beginPath();
      ctx.arc(Math.sin(a / 340) * bw * 0.22, 0, bw * 0.15, 0, TAU);
      ctx.fill();
      ctx.restore();
    };

    // ─── Кадр ───
    let raf = 0;
    let last = 0;
    let frameNo = 0;
    const frame = (raw: number) => {
      const gap = Math.max(0, raw - (last || raw));
      const dt = Math.min(0.05, gap / 1000);
      const span = Math.min(gap, 250);
      last = raw;
      clock += span;
      frameNo++;
      const due = s.timers.filter((t) => t.at <= clock);
      s.timers = s.timers.filter((t) => t.at > clock);
      for (const t of due) t.fn();

      // Чем управляем. Палец на экране держит режим, даже если телефон качнулся от нажатия.
      const mode: Steer = s.dragging ? 'finger' : tilt.steer();
      if (s.launched && mode !== s.mode) {
        s.mode = mode;
        setSteer(mode);
        if (mode === 'tilt') s.settleAt = clock + SETTLE_MS;
      }
      if (s.settleAt >= 0 && clock >= s.settleAt) {
        s.settleAt = -1;
        tilt.center();
      }
      if (s.phase === 'play') {
        if (!s.greeted && (s.mode === 'finger' || tilt.heard())) {
          s.greeted = true;
          s.fingerTold = s.mode === 'finger';
          void say(s.fingerTold ? MARBLE_FINGER : MARBLE_GO, taskOf(s.R));
        } else if (s.greeted && s.mode === 'finger' && !s.fingerTold) {
          s.fingerTold = true;
          void say(MARBLE_FINGER);
        }
      }

      const sensed = s.mode === 'tilt' && s.settleAt < 0;
      const t = onScreen(sensed ? tilt.read() : { x: 0, y: 0 }, screenAngle());
      const before = toPx(s.view, s.ball);
      if (s.phase === 'play') {
        const steps = Math.max(1, Math.ceil(span / 1000 / STEP));
        const h = span / 1000 / steps;
        let hit = 0;
        for (let i = 0; i < steps && s.phase === 'play'; i++) {
          const wish =
            s.mode === 'tilt'
              ? toBoard(s.view, t)
              : s.finger
                ? fingerWish(s.ball, s.finger)
                : { x: 0, y: 0 };
          hit = Math.max(hit, roll(s.ball, wish, h, s.board));
          if (s.board.goal) pull(s.ball, s.board.goal, h);
          const pit = s.board.pits.find((c) => inPit(s.ball, c));
          if (s.board.goal && inHole(s.ball, s.board.goal)) win();
          else if (pit) fall(pit);
          else checkTokens();
        }
        const speed = Math.hypot(s.ball.vx, s.ball.vy);
        if (speed > 0.5) {
          s.rollAt = clock;
          s.rolled = true;
          if (clock - s.soundAt > 110) {
            s.soundAt = clock;
            fx.rolling(Math.min(1, speed / 8));
          }
        }
        if (hit > 2 && clock - s.hitAt > 90) {
          s.hitAt = clock;
          fx.rap(Math.min(1, hit / 8));
          const p = toPx(s.view, s.ball);
          dust(p.x, p.y, 4);
        }
      }
      const after = toPx(s.view, s.ball);
      const moved = { x: after.x - before.x, y: after.y - before.y };
      if (moved.x || moved.y) {
        const r = BALL_R * s.view.cell;
        s.spots = s.spots.map((v) => rolled(v, moved.x, moved.y, r));
      }

      // Куда катить: для подсказки пальца и дорожки — не каждый кадр.
      const trailOn =
        s.phase === 'play' && (s.k === 0 || clock - s.shownAt > TRAIL_AFTER) && !!s.flow;
      if ((frameNo % 6 === 0 || webdriver) && s.flow) {
        if (s.mode === 'finger' || webdriver) s.aim = aimFrom(s.board, s.flow, s.ball);
        if (trailOn) s.trail = pathFrom(s.flow, s.ball);
      }

      // ─── Сцена ───
      const a = clock;
      const { floor: f, rim, cell, land } = s.view;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawBack(land);
      ctx.save();
      rr(f.x, f.y, f.w, f.h, rim * 0.7);
      ctx.clip();
      ctx.translate(t.x * PARALLAX, t.y * PARALLAX);
      drawFloor(t, land);
      if (trailOn) drawTrail(a);
      for (const c of s.closing) {
        const k = 1 - clamp01((clock - c.at) / 420);
        if (k > 0) drawPit(c.p, PIT_R, k);
      }
      for (const pit of s.board.pits) drawPit(pit, PIT_R);
      const goal = s.board.goal;
      if (goal) {
        const p = toPx(s.view, goal);
        halo(p.x, p.y, HOLE_R * cell * (2 + 0.2 * Math.sin(a / 320)), 0.75);
        drawPit(goal, HOLE_R);
      }
      s.board.tokens.forEach((tk, i) => {
        if (i < s.got) return;
        const p = toPx(s.view, tk.at);
        const next = i === s.got;
        if (next) halo(p.x, p.y, TOKEN_R * cell * 2, 0.6 + 0.3 * Math.sin(a / 260));
        const shake = clamp01(1 - (clock - s.wobble.at) / 500);
        const dx = s.wobble.i === i ? Math.sin(a / 26) * shake * cell * 0.14 : 0;
        const size = TOKEN_R * 2.3 * cell * (next ? 1 + 0.06 * Math.sin(a / 260) : 1);
        ctx.fillStyle = 'rgba(70,35,10,0.25)';
        ctx.beginPath();
        ctx.ellipse(p.x + dx + size * 0.05, p.y + size * 0.08, size * 0.46, size * 0.42, 0, 0, TAU);
        ctx.fill();
        token(p.x + dx, p.y, size, tk.label);
      });
      drawWalls();
      const b = ballNow();
      if (b.alpha > 0) drawBall(b.x, b.y, b.r, b.alpha, b.shadow);
      if (goal) {
        const p = toPx(s.view, goal);
        const bw = cell * 1.05;
        const bh = (bw * 260) / 151;
        centered('marble-flag', p.x + cell * 0.3, p.y - bh / 2 - HOLE_R * cell * 0.1, bw);
      }
      ctx.restore();
      // Тень бортика на дне.
      ctx.save();
      rr(f.x, f.y, f.w, f.h, rim * 0.7);
      ctx.strokeStyle = 'rgba(60,28,8,0.4)';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.restore();
      drawSlots();

      // Смена дощечки: дно темнеет и проявляется заново.
      const leave = s.leaveAt >= 0 ? clamp01((clock - s.leaveAt) / 500) : 0;
      const enter = 1 - clamp01((clock - s.enterAt) / 320);
      const veil = Math.max(leave, enter);
      if (veil > 0) {
        ctx.fillStyle = `rgba(150,92,48,${veil})`;
        rr(f.x, f.y, f.w, f.h, rim * 0.7);
        ctx.fill();
      }
      const rock = s.rolled ? ROCK_AFTER : 300;
      if (s.phase === 'play' && s.mode === 'tilt' && clock - s.rollAt > rock) drawRocking(a);

      // ─── Искры, пыль и конфетти ───
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
        } else if (p.kind === 'dust') {
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r * (1 + p.age), 0, TAU);
          ctx.fill();
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

      // Палец подсказки (IdleHint): от шарика туда, куда катить.
      if (frameNo % 6 === 0 && hint.current && hintTo.current) {
        const show = s.phase === 'play' && s.mode === 'finger';
        const size = BALL_R * 2 * cell;
        const put = (div: HTMLDivElement, p: P) => {
          div.style.display = 'block';
          div.style.left = `${p.x - size / 2}px`;
          div.style.top = `${p.y - size / 2}px`;
          div.style.width = `${size}px`;
          div.style.height = `${size}px`;
        };
        if (show) {
          put(hint.current, toPx(s.view, s.ball));
          put(hintTo.current, toPx(s.view, s.aim));
        } else {
          hint.current.style.display = 'none';
          hintTo.current.style.display = 'none';
        }
        hint.current.toggleAttribute('data-hint', show);
        hintTo.current.toggleAttribute('data-hint-target', show);
      }
      // Для автотестов — каждый кадр.
      if (webdriver) {
        const pt = (p: P) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
        const px = (p: P) => pt(toPx(s.view, p));
        const ball = s.ball;
        el.dataset.ball = pt(ball);
        el.dataset.v = pt({ x: ball.vx, y: ball.vy });
        el.dataset.aim = pt(s.aim);
        el.dataset.ballPx = px(ball);
        el.dataset.aimPx = px(s.aim);
        const zero = toPx(s.view, { x: 0, y: 0 });
        const vel = toPx(s.view, { x: ball.vx, y: ball.vy });
        el.dataset.vPx = pt({ x: vel.x - zero.x, y: vel.y - zero.y });
        el.dataset.steer = s.mode;
        el.dataset.sensed = String(sensed);
        el.dataset.task = s.R.task;
        el.dataset.word = s.R.word ?? '';
        el.dataset.walls = String(s.board.walls.length);
        el.dataset.pits = JSON.stringify(s.board.pits.map(px));
        el.dataset.tokens = JSON.stringify(
          s.board.tokens.map((tk) => ({ label: tk.label, at: px(tk.at) })),
        );
        el.dataset.got = String(s.got);
        el.dataset.falls = String(s.fallsAll);
        el.dataset.wins = String(s.wins);
        el.dataset.goal = s.board.goal ? px(s.board.goal) : '';
        el.dataset.h = String(s.board.h);
        el.dataset.cell = String(s.view.cell);
        el.dataset.tiltTold = String(s.tiltTold);
        el.dataset.orderTold = String(s.orderTold);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      s.stopped = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      tilt.stop();
      setKeepAwake(false);
      document.removeEventListener('visibilitychange', onVisibility);
      el.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const busy = phase !== 'play';
  return (
    <div
      className="game marble"
      data-testid="game-marble"
      data-phase={phase}
      data-round={round}
      data-no-idle={busy || steer === 'tilt' || undefined}
      ref={root}
    >
      <canvas ref={canvas} className="marble-canvas" />
      <div ref={hint} className="marble-hint" />
      <div ref={hintTo} className="marble-hint" />
      {phase === 'ask' && (
        <button
          type="button"
          className="marble-start"
          data-testid="marble-start"
          aria-label="Начать"
          onClick={() => press.current()}
        >
          ▶
        </button>
      )}
    </div>
  );
}
