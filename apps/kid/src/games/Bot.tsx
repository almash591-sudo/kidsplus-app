// «Робот и батарейка» (этап 58). Робот на клетчатом коврике должен доехать до батарейки: ребёнок
// выкладывает стрелки-команды в ленту и жмёт «Пуск». Робот едет по шагам, текущая стрелка
// светится; упёрся в коробку или край — бдзынь, глаза крестиками, едет назад на старт. Доехал —
// заряжается: на экране-лице наполняется батарейка, робот пляшет. Старшим робот сам составляет
// программу с одной ошибкой: найти неправильную стрелку и заменить. Всё — один canvas.
import { useEffect, useRef, useState } from 'react';
import { fx } from '../fx';
import {
  BOT_BUMP,
  BOT_EMPTY,
  BOT_END,
  BOT_FIND_FIRST,
  BOT_FIX_FIND,
  BOT_FIX_INTRO,
  BOT_FULL,
  BOT_GO,
  BOT_RIGHT_ARROW,
  BOT_SHORT,
  BOT_WHICH,
  BOT_WIN,
} from '../phrases';
import { afterSpeech, bump, clayUrl, praise, retry, say, setTask, type GameProps } from './common';
import {
  DIRS,
  RIM,
  STEP,
  botSprites,
  cellCenter,
  fixable,
  nextHint,
  planRounds,
  put,
  run,
  stageFor,
  type BotStage,
  type Cell,
  type Dir,
  type Run,
} from './botLogic';

type Phase = 'drop' | 'play' | 'run' | 'done' | 'finish';
type Mood = 'look' | 'ouch' | 'puzzled' | 'happy';

const TAU = Math.PI * 2;
const COLORS = ['#ef4444', '#facc15', '#3b82f6', '#22c55e', '#a855f7', '#fb923c'];
/** Цвет стрелки: у каждой стороны свой. */
const DIR_COLOR: Record<Dir, string> = {
  up: '#42a5f5',
  right: '#ab47bc',
  down: '#ff9f43',
  left: '#26c6da',
};
const DIR_ANGLE: Record<Dir, number> = {
  right: 0,
  down: Math.PI / 2,
  left: Math.PI,
  up: -Math.PI / 2,
};
/** Экран-лицо на картинке робота (доли): там рисуются глаза. */
const SCREEN = { x: 0.152, y: 0.212, w: 0.693, h: 0.333 };
const ROBOT_ASPECT = 349 / 520;
/** Шаг робота, удар, шаг назад на старт, мс. */
const STEP_MS = 520;
const BUMP_MS = 420;
const BACK_MS = 170;
/** Стрелка летит с пульта в ленту; сдвиг ленты, когда стрелку убрали, мс. */
const ADD_MS = 220;
const SLIDE_MS = 160;
/** Появление коврика, коробок, батарейки и робота, мс. */
const ENTER_MS = 900;

/** Стрелка в ленте: куда и откуда прилетела (или сдвинулась). */
interface Item {
  dir: Dir;
  at: number;
  ox: number;
  oy: number;
  dur: number;
}
/** Как робот сейчас едет: от клетки к клетке, к препятствию и обратно. */
interface Move {
  from: Cell;
  to: Cell;
  at: number;
  dur: number;
  kind: 'drive' | 'bump';
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
  kind: 'spark' | 'confetti' | 'dust';
  rot: number;
}

const ease = (k: number) => (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2);
const clamp01 = (k: number) => Math.max(0, Math.min(1, k));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** Выпрыгивает: от нуля с небольшим перелётом за 0.3 с. */
const popIn = (ms: number) => {
  const k = clamp01(ms / 300);
  return k <= 0 ? 0 : k < 1 ? Math.sin((k * Math.PI) / 2) + 0.15 * Math.sin(k * Math.PI) : 1;
};

export function Bot({ spec, phrases, onFinish }: GameProps<'bot'>) {
  const [rounds] = useState(() => planRounds(spec));
  const [round, setRound] = useState(0);
  const [phase, setPhase] = useState<Phase>('drop');
  const root = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const hint = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = root.current!;
    const cv = canvas.current!;
    const ctx = cv.getContext('2d')!;
    const img = new Map<string, HTMLImageElement>();
    for (const name of botSprites()) {
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

    const s = {
      round: 0,
      phase: 'drop' as Phase,
      R: rounds[0]!,
      prog: [] as (Item | null)[],
      /** «Найди ошибку»: дырка в ленте на месте неправильной стрелки и что там было. */
      hole: -1,
      holeWas: 'up' as Dir,
      /** Где робот (клетка) и как едет. */
      cell: rounds[0]!.field.start as Cell,
      move: null as Move | null,
      face: 'right' as Dir,
      mood: 'look' as Mood,
      moodAt: 0,
      /** Какая стрелка ленты сейчас работает, на какой упёрся. */
      active: -1,
      hit: -1,
      /** Нажатая кнопка пульта или стрелка ленты «вздрагивает». */
      pressed: new Map<string, number>(),
      shakeSocket: -1,
      shakeAt: -1e9,
      enterAt: 0,
      leaveAt: -1,
      doneAt: -1,
      wrong: 0,
      glowAt: -1e9,
      timers: [] as { at: number; fn: () => void }[],
      particles: [] as Particle[],
      stopped: false,
      /** Для автотестов, только растут. */
      runs: 0,
      bumps: 0,
      shorts: 0,
      holes: 0,
      misses: 0,
      wins: 0,
    };
    const go = (p: Phase) => {
      s.phase = p;
      setPhase(p);
    };
    const later = (ms: number, fn: () => void) => s.timers.push({ at: clock + ms, fn });
    const mood = (m: Mood) => {
      s.mood = m;
      s.moodAt = clock;
    };

    /** Коврик, лента и пульт на этот размер экрана (пересчёт — только когда что-то поменялось). */
    let st: BotStage = stageFor(w, h, s.R.field.n, s.R.slots);
    let stKey = '';
    const stage = () => {
      const key = `${w}x${h}:${s.round}`;
      if (key !== stKey) {
        stKey = key;
        st = stageFor(w, h, s.R.field.n, s.R.slots);
      }
      return st;
    };
    const keyOf = (d: Dir) => st.keys.find((k) => k.dir === d)!;
    const keyCenter = (d: Dir) => {
      const k = keyOf(d);
      return { x: k.x + k.w / 2, y: k.y + k.h / 2 };
    };
    const goCenter = () => ({ x: st.go.x + st.go.w / 2, y: st.go.y + st.go.h / 2 });
    const dirs = () => s.prog.map((p) => p?.dir);
    const full = () => s.prog.every(Boolean) && s.prog.length > 0;
    const item = (dir: Dir, from: { x: number; y: number }, dur: number): Item => ({
      dir,
      at: clock,
      ox: from.x,
      oy: from.y,
      dur,
    });

    // ─── Задания ───
    const prompt = () => (s.R.task === 'go' ? BOT_GO : s.hole >= 0 ? BOT_WHICH : BOT_FIX_FIND);
    const start = (k: number) => {
      s.round = k;
      setRound(k);
      s.R = rounds[k]!;
      stKey = '';
      stage();
      s.prog = s.R.program.map((d, i) => item(d, st.sockets[i]!, 0));
      s.hole = -1;
      s.cell = s.R.field.start;
      s.move = null;
      // Робот смотрит туда, куда ему ехать.
      s.face = s.R.field.path[0] ?? 'right';
      mood('look');
      s.active = -1;
      s.hit = -1;
      s.wrong = 0;
      s.glowAt = -1e9;
      s.enterAt = clock;
      s.leaveAt = -1;
      s.doneAt = -1;
      go('drop');
      later(250, () => fx.drop());
      if (s.R.task === 'go') {
        void say(BOT_GO);
        later(ENTER_MS, () => go('play'));
        return;
      }
      // «Найди ошибку»: робот сам едет по своей программе — и не доезжает.
      void afterSpeech(say(BOT_FIX_INTRO), 1500, 7000).then(() => {
        if (!s.stopped && s.round === k) runNow(true);
      });
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
    const dust = (x: number, y: number, count: number) => {
      for (let i = 0; i < count; i++)
        s.particles.push({
          x: x + (Math.random() - 0.5) * st.cell * 0.4,
          y,
          vx: (Math.random() - 0.5) * 60,
          vy: -20 - Math.random() * 40,
          r: st.cell * (0.05 + Math.random() * 0.05),
          life: 0.6,
          age: 0,
          color: 'rgba(255,255,255,0.75)',
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

    // ─── Робот едет ───
    const drive = (to: Cell, dir: Dir, dur: number) => {
      s.face = dir;
      s.move = { from: s.cell, to, at: clock, dur, kind: 'drive' };
      s.cell = to;
    };
    /** Проехать программу; demo — робот сам показывает свою (неправильную) программу. */
    const runNow = (demo: boolean) => {
      const prog = dirs() as Dir[];
      const r = run(s.R.field, prog);
      if (!demo) s.runs++;
      go('run');
      mood('look');
      fx.click();
      let t = 300;
      r.cells.slice(1).forEach((c, i) => {
        later(t, () => {
          s.active = i;
          drive(c, prog[i]!, STEP_MS);
          fx.motor();
        });
        t += STEP_MS + 70;
      });
      later(t, () => stop(r, prog, demo));
    };
    const stop = (r: Run, prog: Dir[], demo: boolean) => {
      if (r.result === 'goal') {
        s.active = -1;
        return win();
      }
      let wait = 900;
      if (r.result === 'short') {
        s.active = -1;
        mood('puzzled');
        if (demo) fx.soft();
        else s.shorts++;
      } else {
        // Упёрся: подъехал, бдзынь — и назад.
        s.active = r.at;
        s.hit = r.at;
        s.face = prog[r.at]!;
        const [dx, dy] = STEP[s.face];
        s.move = {
          from: s.cell,
          to: [s.cell[0] + dx, s.cell[1] + dy],
          at: clock,
          dur: BUMP_MS,
          kind: 'bump',
        };
        later(BUMP_MS * 0.4, () => {
          fx.clang();
          mood('ouch');
          const [x, y] = cellCenter(st, s.cell);
          burst(x + dx * st.cell * 0.45, y + dy * st.cell * 0.45 - st.cell * 0.2, 9, [
            '#fff',
            '#ffe14d',
            '#ff8a80',
          ]);
        });
        if (!demo) s.bumps++;
        wait = 1200;
      }
      if (!demo) {
        bump();
        s.wrong++;
      }
      void say(demo ? BOT_FIX_FIND : r.result === 'short' ? BOT_SHORT : BOT_BUMP);
      later(wait, () => home(r));
    };
    /** Назад на старт по своим следам. */
    const home = (r: Run) => {
      const back = r.cells.slice(0, -1).reverse();
      let t = 0;
      back.forEach((c) => {
        later(t, () => {
          const [dx, dy] = [c[0] - s.cell[0], c[1] - s.cell[1]];
          const dir = DIRS.find((d) => STEP[d][0] === dx && STEP[d][1] === dy)!;
          drive(c, dir, BACK_MS);
          s.face = dir;
        });
        t += BACK_MS;
      });
      later(t + 120, () => {
        s.active = -1;
        s.hit = -1;
        s.face = s.R.field.path[0] ?? s.face;
        mood('look');
        go('play');
      });
    };
    const win = () => {
      go('done');
      s.doneAt = clock;
      s.wins++;
      s.wrong = 0;
      fx.charge();
      const [x, y] = cellCenter(st, s.R.field.goal);
      later(1000, () => {
        mood('happy');
        burst(x, y - st.cell * 0.4, 18, ['#ffe14d', '#7cf08a', '#fff']);
      });
      const k = s.round;
      void afterSpeech(praise(phrases, undefined, [BOT_WIN]), 2800).then(() => next(k));
    };
    /** Похвалили — следующее поле или конец игры. */
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
      void afterSpeech(say(BOT_END), 2600).then(() => {
        if (!s.stopped) onFinish();
      });
    };

    // ─── Пульт и лента ───
    const press = (id: string) => s.pressed.set(id, clock);
    const tapKey = (d: Dir) => {
      press(d);
      const from = keyCenter(d);
      if (s.R.task === 'fix') {
        if (s.hole < 0) {
          fx.soft();
          void say(BOT_FIND_FIRST);
          return;
        }
        s.prog[s.hole] = item(d, from, ADD_MS);
        s.hole = -1;
        fx.beep(DIRS.indexOf(d));
        return;
      }
      if (s.prog.length >= s.R.slots) {
        fx.soft();
        void say(BOT_FULL);
        return;
      }
      s.prog.push(item(d, from, ADD_MS));
      fx.beep(DIRS.indexOf(d));
    };
    const tapSocket = (i: number) => {
      const it = s.prog[i];
      press(`s${i}`);
      if (s.R.task === 'go') {
        if (!it) return;
        // Убрать стрелку: остальные сдвигаются.
        const [x, y] = [st.sockets[i]!.x, st.sockets[i]!.y];
        burst(x, y, 8, [DIR_COLOR[it.dir], '#fff']);
        fx.pop();
        s.prog.splice(i, 1);
        s.prog = s.prog.map((p, j) =>
          j < i || !p ? p : { ...p, ...item(p.dir, st.sockets[j + 1]!, SLIDE_MS) },
        );
        return;
      }
      // «Найди ошибку»: открытая дырка закрывается старой стрелкой.
      if (s.hole >= 0) {
        const hl = s.hole;
        s.prog[hl] = item(s.holeWas, st.sockets[hl]!, 0);
        s.hole = -1;
        if (hl === i) {
          fx.pop();
          return;
        }
      }
      const prog = dirs() as Dir[];
      if (run(s.R.field, prog).result === 'goal') {
        // Программа уже правильная — «Пуск» светится.
        fx.soft();
        s.glowAt = clock;
        return;
      }
      if (fixable(s.R.field, prog).includes(i)) {
        s.holeWas = prog[i]!;
        s.prog[i] = null;
        s.hole = i;
        s.holes++;
        fx.pop();
        burst(st.sockets[i]!.x, st.sockets[i]!.y, 8, [DIR_COLOR[s.holeWas], '#fff']);
        void say(BOT_WHICH);
        return;
      }
      s.misses++;
      s.wrong++;
      s.shakeSocket = i;
      s.shakeAt = clock;
      void retry(phrases).then(() => say(BOT_RIGHT_ARROW));
    };
    const tapGo = () => {
      press('go');
      if (s.R.task === 'fix' && s.hole >= 0) {
        fx.soft();
        void say(BOT_WHICH);
        return;
      }
      if (!s.prog.length) {
        fx.soft();
        void say(BOT_EMPTY);
        return;
      }
      runNow(false);
    };

    /** Что подсказать пальцем: кнопку пульта, стрелку в ленте или «Пуск». */
    const helpAt = (): { x: number; y: number; r: number; what: string } | null => {
      const f = s.R.field;
      const key = (d: Dir) => ({ ...keyCenter(d), r: keyOf(d).w * 0.6, what: `key:${d}` });
      const sock = (i: number) => ({ ...st.sockets[i]!, r: st.socket * 0.6, what: `socket:${i}` });
      const goBtn = () => ({ ...goCenter(), r: st.go.h * 0.7, what: 'go' });
      if (s.R.task === 'go') {
        const hn = nextHint(f, dirs() as Dir[], s.R.slots);
        return hn.kind === 'add' ? key(hn.dir) : hn.kind === 'remove' ? sock(hn.index) : goBtn();
      }
      const prog = dirs();
      if (s.hole >= 0) {
        const right = DIRS.find((o) => run(f, put(prog as Dir[], s.hole, o)).result === 'goal');
        return right ? key(right) : null;
      }
      if (run(f, prog as Dir[]).result === 'goal') return goBtn();
      const bad = fixable(f, prog as Dir[])[0];
      return bad === undefined ? null : sock(bad);
    };

    /** «Ушко» и подсказка при бездействии: задание ещё раз, нужная кнопка светится. */
    const remind = () => {
      s.glowAt = clock;
      return say(prompt());
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
    /** Глиняная плитка: тень, цвет, объём (свет сверху-слева), светлая кромка. */
    const tile = (x: number, y: number, bw: number, bh: number, color: string, lift = 1) => {
      const r = Math.min(bw, bh) * 0.24;
      ctx.save();
      rr(x, y, bw, bh, r);
      ctx.shadowColor = 'rgba(40,30,20,0.3)';
      ctx.shadowBlur = Math.min(bw, bh) * 0.12 * lift;
      ctx.shadowOffsetY = Math.min(bw, bh) * 0.06 * lift;
      ctx.fillStyle = color;
      ctx.fill();
      ctx.shadowColor = 'transparent';
      const g = ctx.createLinearGradient(x, y, x + bw * 0.4, y + bh);
      g.addColorStop(0, 'rgba(255,255,255,0.4)');
      g.addColorStop(0.5, 'rgba(255,255,255,0.05)');
      g.addColorStop(1, 'rgba(0,0,0,0.16)');
      ctx.fillStyle = g;
      ctx.fill();
      ctx.lineWidth = Math.max(1.5, Math.min(bw, bh) * 0.04);
      ctx.strokeStyle = 'rgba(255,255,255,0.6)';
      ctx.stroke();
      ctx.restore();
    };
    /** Белая стрелка в квадрате size с серединой (x, y). */
    const arrow = (x: number, y: number, size: number, d: Dir, color = '#fff') => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(DIR_ANGLE[d]);
      const u = size / 2;
      ctx.beginPath();
      ctx.moveTo(-u * 0.55, -u * 0.17);
      ctx.lineTo(u * 0.05, -u * 0.17);
      ctx.lineTo(u * 0.05, -u * 0.48);
      ctx.lineTo(u * 0.6, 0);
      ctx.lineTo(u * 0.05, u * 0.48);
      ctx.lineTo(u * 0.05, u * 0.17);
      ctx.lineTo(-u * 0.55, u * 0.17);
      ctx.closePath();
      ctx.lineJoin = 'round';
      ctx.lineWidth = u * 0.12;
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.stroke();
      ctx.fill();
      ctx.restore();
    };
    /** Стрелка-плитка: цветная глина и белая стрелка. */
    const arrowTile = (x: number, y: number, size: number, d: Dir, alpha = 1, lift = 1) => {
      ctx.globalAlpha = alpha;
      tile(x - size / 2, y - size / 2, size, size, DIR_COLOR[d], lift);
      arrow(x, y, size * 0.8, d);
      ctx.globalAlpha = 1;
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
    const shadow = (x: number, y: number, rx: number, a = 0.25) => {
      ctx.fillStyle = `rgba(60,40,20,${a})`;
      ctx.beginPath();
      ctx.ellipse(x, y, rx, rx * 0.28, 0, 0, TAU);
      ctx.fill();
    };

    const drawRoom = () => {
      ctx.fillStyle = '#e9c08c';
      ctx.fillRect(0, 0, w, h);
      const im = ok(`bot-room-${st.land ? 'l' : 'p'}`);
      if (!im) return;
      const k = Math.max(w / im.naturalWidth, h / im.naturalHeight);
      const dw = im.naturalWidth * k;
      const dh = im.naturalHeight * k;
      ctx.drawImage(im, (w - dw) / 2, h - dh, dw, dh);
    };
    /** Коврик: войлочный край, клетки двух цветов. */
    const drawMat = (a: number) => {
      const b = st.board;
      const c = st.cell;
      const rim = c * RIM;
      ctx.globalAlpha = a;
      tile(b.x - rim, b.y - rim, b.w + rim * 2, b.h + rim * 2, '#6fb07e', 1.6);
      const n = s.R.field.n;
      const gap = c * 0.05;
      for (let y = 0; y < n; y++)
        for (let x = 0; x < n; x++) {
          rr(b.x + x * c + gap, b.y + y * c + gap, c - gap * 2, c - gap * 2, c * 0.18);
          ctx.fillStyle = (x + y) % 2 ? '#fff4d6' : '#c4ebc9';
          ctx.fill();
        }
      // Старт — голубая площадка.
      const [sx, sy] = cellCenter(st, s.R.field.start);
      ctx.strokeStyle = 'rgba(66,165,245,0.6)';
      ctx.lineWidth = c * 0.05;
      ctx.setLineDash([c * 0.1, c * 0.07]);
      ctx.beginPath();
      ctx.arc(sx, sy + c * 0.12, c * 0.33, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    };
    /** Следы: путь до батарейки бледными стрелками (после двух неудач). */
    const drawTrail = (a: number) => {
      const f = s.R.field;
      let c: Cell = f.start;
      f.path.forEach((d, i) => {
        const [x, y] = cellCenter(st, c);
        const [dx, dy] = STEP[d];
        ctx.globalAlpha = a * (0.55 + 0.25 * Math.sin(clock / 220 - i * 0.7));
        arrow(x + dx * st.cell * 0.5, y + dy * st.cell * 0.5, st.cell * 0.42, d, DIR_COLOR[d]);
        c = [c[0] + dx, c[1] + dy];
      });
      ctx.globalAlpha = 1;
    };

    /** Где робот: середина клетки (px) с учётом езды. */
    const botAt = (): { x: number; y: number; moving: boolean } => {
      const m = s.move;
      if (m && clock < m.at + m.dur) {
        const k = clamp01((clock - m.at) / m.dur);
        const [ax, ay] = cellCenter(st, m.from);
        const [bx, by] = cellCenter(st, m.to);
        const e = m.kind === 'bump' ? 0.38 * Math.sin(Math.PI * k) : ease(k);
        return { x: lerp(ax, bx, e), y: lerp(ay, by, e), moving: true };
      }
      const [x, y] = cellCenter(st, s.cell);
      return { x, y, moving: false };
    };
    /** Глаза на экране робота: смотрят по ходу, моргают; ой — крестики, радость — ^^. */
    const drawFace = (x0: number, y0: number, bw: number, bh: number, t: number) => {
      const sx = x0 + SCREEN.x * bw;
      const sy = y0 + SCREEN.y * bh;
      const sw = SCREEN.w * bw;
      const sh = SCREEN.h * bh;
      ctx.save();
      ctx.shadowColor = 'rgba(127,232,255,0.9)';
      ctx.shadowBlur = sw * 0.08;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      const cx = sx + sw / 2;
      const cy = sy + sh / 2;
      const ex = sw * 0.2;
      const charge = s.doneAt >= 0 ? (clock - s.doneAt) / 1000 : -1;
      if (charge >= 0 && charge < 1) {
        // Заряжается: батарейка на экране наполняется.
        const bw2 = sw * 0.5;
        const bh2 = sh * 0.46;
        ctx.strokeStyle = '#b8f5c4';
        ctx.lineWidth = sw * 0.04;
        rr(cx - bw2 / 2, cy - bh2 / 2, bw2, bh2, bh2 * 0.15);
        ctx.stroke();
        ctx.fillStyle = '#b8f5c4';
        ctx.fillRect(cx + bw2 / 2, cy - bh2 * 0.18, sw * 0.05, bh2 * 0.36);
        const bars = Math.min(4, Math.floor(charge * 5));
        ctx.fillStyle = '#5ff07a';
        for (let i = 0; i < bars; i++)
          ctx.fillRect(
            cx - bw2 / 2 + bw2 * 0.08 + i * bw2 * 0.215,
            cy - bh2 * 0.3,
            bw2 * 0.17,
            bh2 * 0.6,
          );
        ctx.restore();
        return;
      }
      if (s.mood === 'happy') {
        ctx.strokeStyle = '#7fe8ff';
        ctx.lineWidth = sw * 0.07;
        for (const k of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(cx + k * ex - sw * 0.1, cy + sh * 0.1);
          ctx.quadraticCurveTo(cx + k * ex, cy - sh * 0.3, cx + k * ex + sw * 0.1, cy + sh * 0.1);
          ctx.stroke();
        }
        ctx.restore();
        return;
      }
      if (s.mood === 'ouch' && clock - s.moodAt < 1300) {
        ctx.strokeStyle = '#ff8a80';
        ctx.shadowColor = 'rgba(255,120,120,0.9)';
        ctx.lineWidth = sw * 0.06;
        const q = sw * 0.08;
        for (const k of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(cx + k * ex - q, cy - q);
          ctx.lineTo(cx + k * ex + q, cy + q);
          ctx.moveTo(cx + k * ex + q, cy - q);
          ctx.lineTo(cx + k * ex - q, cy + q);
          ctx.stroke();
        }
        ctx.restore();
        return;
      }
      // Обычные глаза-капсулы, смотрят туда, куда едет робот; иногда моргают.
      const [lx, ly] = s.mood === 'puzzled' ? [0, -1] : STEP[s.face];
      const blink = t % 3400 < 130 ? 0.15 : 1;
      const ew = sw * 0.13;
      const eh = sh * 0.42 * blink;
      ctx.fillStyle = '#7fe8ff';
      for (const k of [-1, 1]) {
        const small = s.mood === 'puzzled' && k > 0 ? 0.7 : 1;
        const x = cx + k * ex + lx * sw * 0.07 - (ew * small) / 2;
        const y = cy + ly * sh * 0.1 - (eh * small) / 2;
        rr(x, y, ew * small, eh * small, (ew * small) / 2);
        ctx.fill();
      }
      ctx.restore();
    };
    const drawRobot = () => {
      const p = botAt();
      const c = st.cell;
      const bh = c * 1.2;
      const bw = bh * ROBOT_ASPECT;
      let x = p.x;
      let y = p.y + c * 0.42;
      let rot = 0;
      const t = clock;
      if (p.moving && s.move?.kind === 'drive') {
        y -= Math.abs(Math.sin(t / 55)) * c * 0.025;
        const [dx] = STEP[s.face];
        rot = dx * 0.07;
        if (Math.floor(t / 90) !== Math.floor((t - 16) / 90)) dust(x - dx * c * 0.25, y, 1);
      }
      if (s.mood === 'ouch' && t - s.moodAt < 450)
        x += Math.sin((t - s.moodAt) / 22) * c * 0.04 * (1 - (t - s.moodAt) / 450);
      const charge = s.doneAt >= 0 ? (t - s.doneAt) / 1000 : -1;
      if (charge > 1) {
        // Пляшет от радости.
        y -= Math.abs(Math.sin((charge - 1) * 7)) * c * 0.14;
        rot = Math.sin((charge - 1) * 7) * 0.1;
      }
      // Появляется: падает сверху и пружинит.
      const k = clamp01((clock - s.enterAt - 250) / 450);
      y -= (1 - ease(k)) * c * 2.2;
      ctx.globalAlpha = k > 0 ? 1 : 0;
      shadow(p.x, p.y + c * 0.42, bw * 0.42 * (0.6 + 0.4 * k));
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rot);
      sprite('bot-robot', 0, 0, bw);
      drawFace(-bw / 2, -bh, bw, bh, t);
      ctx.restore();
      // Не доехал — над головой «?».
      if (s.mood === 'puzzled' && s.phase === 'run') {
        const a = popIn(t - s.moodAt);
        ctx.save();
        ctx.translate(x + bw * 0.45, y - bh * 1.02);
        ctx.scale(a, a);
        ctx.fillStyle = '#fff';
        ctx.shadowColor = 'rgba(0,0,0,0.2)';
        ctx.shadowBlur = 6;
        ctx.beginPath();
        ctx.arc(0, 0, c * 0.22, 0, TAU);
        ctx.fill();
        ctx.shadowColor = 'transparent';
        ctx.fillStyle = '#7b61ff';
        ctx.font = `bold ${Math.round(c * 0.32)}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('?', 0, c * 0.02);
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    };
    /** Коробки, батарейка и робот — сверху вниз, чтобы нижние закрывали верхние. */
    const drawThings = () => {
      const f = s.R.field;
      const c = st.cell;
      const things: { y: number; draw: () => void }[] = [];
      f.blocks.forEach((b, i) => {
        const [x, y] = cellCenter(st, b.c);
        const k = popIn(clock - s.enterAt - 120 - i * 80);
        things.push({
          y: y + c * 0.4,
          draw: () => {
            if (k <= 0) return;
            shadow(x, y + c * 0.36, c * 0.36 * k);
            sprite(`bot-${b.kind}`, x, y + c * 0.4, c * 0.8 * k);
          },
        });
      });
      const [gx, gy] = cellCenter(st, f.goal);
      const kb = popIn(clock - s.enterAt - 300);
      const charge = s.doneAt >= 0 ? (clock - s.doneAt) / 1000 : -1;
      // Робот заряжается — батарейка уменьшается и уходит в него.
      const gone = charge >= 0 ? clamp01(charge / 0.9) : 0;
      things.push({
        y: gy + c * 0.39,
        draw: () => {
          if (kb <= 0 || gone >= 1) return;
          const sway = Math.sin(clock / 400) * 0.06;
          const k = kb * (1 - gone);
          if (s.phase === 'play' || s.phase === 'run') halo(gx, gy, c * 0.55, 0.35);
          shadow(gx, gy + c * 0.36, c * 0.24 * k);
          sprite('bot-battery', gx, gy + c * 0.4 - gone * c * 0.5, c * 0.46 * k, sway);
        },
      });
      const p = botAt();
      // Робот, въезжающий в клетку батарейки, — поверх неё.
      things.push({ y: p.y + c * 0.42 + 0.5, draw: drawRobot });
      things.sort((a, b) => a.y - b.y);
      for (const t of things) t.draw();
    };
    /** Лента: панель с гнёздами и стрелками; работающая светится, на которой упёрся — красная. */
    const drawStrip = (a: number) => {
      const sk = st.socket;
      const pad = sk * 0.18;
      const xs = st.sockets.map((p) => p.x);
      const ys = st.sockets.map((p) => p.y);
      const x0 = Math.min(...xs) - sk / 2 - pad;
      const y0 = Math.min(...ys) - sk / 2 - pad;
      const x1 = Math.max(...xs) + sk / 2 + pad;
      const y1 = Math.max(...ys) + sk / 2 + pad;
      ctx.globalAlpha = a;
      tile(x0, y0, x1 - x0, y1 - y0, '#fff6e2', 1.2);
      st.sockets.forEach((p, i) => {
        rr(p.x - sk * 0.46, p.y - sk * 0.46, sk * 0.92, sk * 0.92, sk * 0.2);
        ctx.fillStyle = 'rgba(150,110,70,0.14)';
        ctx.fill();
        if (s.R.task === 'fix' && i === s.hole) {
          const k = 0.5 + 0.5 * Math.sin(clock / 160);
          ctx.strokeStyle = `rgba(255,152,0,${0.5 + 0.5 * k})`;
          ctx.lineWidth = Math.max(3, sk * 0.07);
          ctx.setLineDash([sk * 0.12, sk * 0.08]);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      });
      ctx.globalAlpha = 1;
      s.prog.forEach((it, i) => {
        if (!it) return;
        const p = st.sockets[i]!;
        const k = it.dur ? ease(clamp01((clock - it.at) / it.dur)) : 1;
        let x = lerp(it.ox, p.x, k);
        const y = lerp(it.oy, p.y, k) - (it.dur === ADD_MS ? Math.sin(Math.PI * k) * sk * 0.6 : 0);
        let size = sk * 0.86;
        if (i === s.active && s.phase === 'run') {
          size *= 1.12;
          halo(p.x, p.y, sk * 0.85, i === s.hit ? 0 : 0.7);
        }
        if (i === s.shakeSocket && clock - s.shakeAt < 500)
          x += Math.sin((clock - s.shakeAt) / 25) * sk * 0.06;
        const pr = s.pressed.get(`s${i}`);
        if (pr !== undefined && clock - pr < 150) size *= 0.9;
        arrowTile(x, y, size, it.dir, a);
        if (i === s.hit) {
          ctx.strokeStyle = '#ff5252';
          ctx.lineWidth = Math.max(3, sk * 0.08);
          rr(p.x - size / 2 - 3, p.y - size / 2 - 3, size + 6, size + 6, size * 0.26);
          ctx.stroke();
        }
      });
    };
    /** Пульт: четыре стрелки и зелёный «Пуск». */
    const drawKeys = (a: number, helpWhat: string) => {
      const dim = s.R.task === 'fix' && s.hole < 0 ? 0.55 : 1;
      for (const k of st.keys) {
        const pr = s.pressed.get(k.dir);
        const sc = pr !== undefined && clock - pr < 150 ? 0.9 : 1;
        arrowTile(k.x + k.w / 2, k.y + k.h / 2, k.w * sc, k.dir, a * dim, 1.4);
      }
      const g = st.go;
      const pr = s.pressed.get('go');
      const ready = helpWhat === 'go' && s.phase === 'play';
      const sc =
        (pr !== undefined && clock - pr < 150 ? 0.92 : 1) *
        (ready ? 1 + 0.05 * Math.sin(clock / 150) : 1);
      const gw = g.w * sc;
      const gh = g.h * sc;
      const cx = g.x + g.w / 2;
      const cy = g.y + g.h / 2;
      ctx.globalAlpha = a;
      tile(cx - gw / 2, cy - gh / 2, gw, gh, '#43c463', 1.4);
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      const u = gh * 0.26;
      ctx.moveTo(cx - u * 0.75, cy - u);
      ctx.lineTo(cx + u, cy);
      ctx.lineTo(cx - u * 0.75, cy + u);
      ctx.closePath();
      ctx.lineJoin = 'round';
      ctx.lineWidth = u * 0.3;
      ctx.strokeStyle = '#fff';
      ctx.stroke();
      ctx.fill();
      ctx.globalAlpha = 1;
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
      const help = s.phase === 'play' ? helpAt() : null;
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
      const leave = s.leaveAt >= 0 ? ease(clamp01((clock - s.leaveAt) / 320)) : 0;
      const enter = clamp01((clock - s.enterAt) / 300);
      const a = enter * (1 - leave);
      drawMat(a);
      if (s.R.task === 'go' && s.wrong >= 2 && s.phase === 'play') drawTrail(a);
      if (a > 0) {
        ctx.globalAlpha = a;
        drawThings();
        ctx.globalAlpha = 1;
      }
      if (help && glow > 0) halo(help.x, help.y, help.r * 1.6, glow);
      drawStrip(a);
      drawKeys(a, help?.what ?? '');

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

      // Палец подсказки (IdleHint): что нажать дальше.
      if (frameNo % 6 === 0 && hint.current) {
        const hs = hint.current.style;
        if (help && !busyNow()) {
          hs.display = 'block';
          hs.left = `${help.x - help.r}px`;
          hs.top = `${help.y - help.r}px`;
          hs.width = `${help.r * 2}px`;
          hs.height = `${help.r * 2}px`;
        } else hs.display = 'none';
      }
      // Для автотестов — каждый кадр.
      if (webdriver) {
        const pt = (p: { x: number; y: number }) => ({ x: Math.round(p.x), y: Math.round(p.y) });
        el.dataset.task = s.R.task;
        el.dataset.busy = busyNow() ? '1' : '0';
        el.dataset.prog = JSON.stringify(dirs().map((d) => d ?? null));
        el.dataset.slots = String(s.R.slots);
        el.dataset.n = String(s.R.field.n);
        el.dataset.steps = String(s.R.field.path.length);
        el.dataset.blocks = String(s.R.field.blocks.length);
        el.dataset.path = JSON.stringify(s.R.field.path);
        el.dataset.bot = s.cell.join(',');
        el.dataset.start = s.R.field.start.join(',');
        el.dataset.goal = s.R.field.goal.join(',');
        el.dataset.hole = String(s.hole);
        el.dataset.keys = JSON.stringify(
          st.keys.map((k) => ({ dir: k.dir, ...pt(keyCenter(k.dir)) })),
        );
        el.dataset.go = JSON.stringify(pt(goCenter()));
        el.dataset.sockets = JSON.stringify(st.sockets.map(pt));
        el.dataset.next = JSON.stringify(help ? { ...pt(help), what: help.what } : null);
        el.dataset.fixable =
          s.R.task === 'fix' && full() ? JSON.stringify(fixable(s.R.field, dirs() as Dir[])) : '[]';
        el.dataset.runs = String(s.runs);
        el.dataset.bumps = String(s.bumps);
        el.dataset.shorts = String(s.shorts);
        el.dataset.holes = String(s.holes);
        el.dataset.misses = String(s.misses);
        el.dataset.wins = String(s.wins);
      }
      raf = requestAnimationFrame(frame);
    };

    // ─── Касания: кнопки пульта, стрелки ленты, «Пуск» ───
    const at = (e: PointerEvent) => {
      const box = el.getBoundingClientRect();
      return { x: e.clientX - box.left, y: e.clientY - box.top };
    };
    const busyNow = () => s.phase !== 'play';
    const inBox = (
      p: { x: number; y: number },
      b: { x: number; y: number; w: number; h: number },
      m = 6,
    ) => p.x >= b.x - m && p.x <= b.x + b.w + m && p.y >= b.y - m && p.y <= b.y + b.h + m;
    const down = (e: PointerEvent) => {
      if ((e.target as Element).closest('.corner-button')) return;
      if (busyNow()) return;
      const p = at(e);
      const key = st.keys.find((k) => inBox(p, k));
      if (key) return tapKey(key.dir);
      if (inBox(p, st.go)) return tapGo();
      const sk = st.socket;
      const i = st.sockets.findIndex(
        (c) => Math.abs(p.x - c.x) <= sk * 0.5 + 3 && Math.abs(p.y - c.y) <= sk * 0.5 + 3,
      );
      if (i >= 0 && i < s.prog.length) tapSocket(i);
    };
    el.addEventListener('pointerdown', down);

    start(0);
    raf = requestAnimationFrame(frame);
    return () => {
      s.stopped = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      el.removeEventListener('pointerdown', down);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const busy = phase !== 'play';
  return (
    <div
      className="game bot"
      data-testid="game-bot"
      data-phase={phase}
      data-round={round}
      data-no-idle={busy || undefined}
      ref={root}
    >
      <canvas ref={canvas} className="bot-canvas" />
      <div ref={hint} className="bot-hint" data-hint={!busy || undefined} />
    </div>
  );
}
