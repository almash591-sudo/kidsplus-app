// «Ракета: собери и лети» (этап 43). На космодроме ребёнок собирает ракету по цветному чертежу
// (на уровнях — по памяти), потом обратный отсчёт, старт в дыму и пламени, гиперпрыжок сквозь
// звёзды и полёт: ракета идёт за пальцем к планете с ответом («Лети на планету с цифрой пять!»).
// Камни-астероиды отталкивают, не та планета отлетает и возвращается. Посадка — с пылью и флажком.
// Всё — один canvas; детали — белая глина, перекрашенная в цвет чертежа.
import type { RocketColor, RocketPart } from '@kidsplus/shared/games';
import { useEffect, useRef, useState } from 'react';
import { fx } from '../fx';
import {
  ROCKET_BUILT,
  ROCKET_COUNTDOWN,
  ROCKET_LANDED,
  ROCKET_PROMPT,
  ROCKET_REMEMBER,
  ROCKET_ROCK,
  rocketWrongColor,
} from '../phrases';
import { afterSpeech, ask, bump, praise, retry, say, type GameProps } from './common';
import {
  blueprintOf,
  DRAW_ORDER,
  fits,
  flightPhrase,
  flightTasks,
  PART_BOX,
  partsOf,
  planetAnswers,
  planetPhrase,
  ROCKET_HEIGHT,
  taskLabel,
  trayOf,
  type Blueprint,
  type ColoredPart,
  type TrayItem,
} from './rocketLogic';

const SPRITES = [
  'part-nose',
  'part-body',
  'part-fins',
  'part-engine',
  'part-window',
  'planet-ring',
  'planet-ice',
  'planet-lava',
  'planet-green',
  'planet-purple',
  'planet-yellow',
  'asteroid',
  'flag',
  'cosmodrome',
  'space',
] as const;
type Sprite = (typeof SPRITES)[number];
export const rocketUrl = (s: Sprite) => `/games/rocket-${s}.webp`;
const PLANETS: Sprite[] = [
  'planet-ring',
  'planet-ice',
  'planet-lava',
  'planet-green',
  'planet-purple',
  'planet-yellow',
];
/** Свечение атмосферы у планет. */
const GLOW: Partial<Record<Sprite, string>> = {
  'planet-ring': '255,190,120',
  'planet-ice': '170,225,255',
  'planet-lava': '255,120,90',
  'planet-green': '140,240,190',
  'planet-purple': '220,160,255',
  'planet-yellow': '255,235,140',
};
const HEX: Record<RocketColor, string> = {
  red: '#e8453c',
  blue: '#3b82f6',
  yellow: '#facc15',
  green: '#22c55e',
  purple: '#a855f7',
};
const ASTEROID_EVERY = { none: Infinity, few: 2600, many: 1500 } as const;

type Phase = 'build' | 'countdown' | 'launch' | 'warp' | 'fly' | 'land';
type Drawable = HTMLImageElement | HTMLCanvasElement;
const ready = (d: Drawable | undefined): d is Drawable =>
  !!d && (d instanceof HTMLCanvasElement || (d.complete && d.naturalWidth > 0));
const sizeOf = (d: Drawable): [number, number] =>
  d instanceof HTMLCanvasElement ? [d.width, d.height] : [d.naturalWidth, d.naturalHeight];
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const ease = (k: number) => 1 - (1 - clamp(k, 0, 1)) ** 3;

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  grow: number;
  life: number;
  age: number;
  kind: 'smoke' | 'spark' | 'dust';
  color: string;
}
interface Planet {
  value: number | string;
  sprite: Sprite;
  lane: number;
}
interface Trio {
  planets: Planet[];
  y: number;
  retreat: boolean;
}
interface Rock {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  size: number;
}

export function Rocket({ spec, phrases, onFinish }: GameProps<'rocket'>) {
  const [setup] = useState(() => {
    const bp = blueprintOf(spec);
    const parts = partsOf(spec);
    return { bp, parts, tray: trayOf(bp, parts), tasks: flightTasks(spec) };
  });
  const [phase, setPhase] = useState<Phase>('build');
  const [round, setRound] = useState(0);
  const [hidden, setHidden] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const live = useRef({
    phase: 'build' as Phase,
    phaseAt: 0,
    round: 0,
    placed: new Set<RocketPart>(),
    /** Деталь в пальце: какая, где палец, где её «взяли». */
    drag: null as null | { item: TrayItem; x: number; y: number; ox: number; oy: number },
    /** Детали, что возвращаются на стол: откуда и когда. */
    back: new Map<number, { x: number; y: number; at: number }>(),
    placedAt: new Map<RocketPart, number>(),
    hidden: false,
    peekUntil: 0,
    rocket: { x: 0.5, vx: 0 },
    targetX: 0.5,
    trio: null as Trio | null,
    trioAt: 0,
    rocks: [] as Rock[],
    rockAt: 0,
    safeUntil: 0,
    shakeUntil: 0,
    rockSaid: false,
    landed: null as null | { planet: Planet; from: { x: number; y: number }; at: number },
    flagAt: -1,
    leaving: null as null | { planet: Planet; at: number },
    particles: [] as Particle[],
    /** Сдвиг камеры на прошлом кадре старта — дым остаётся на земле. */
    lastCam: 0,
    /** Когда встала последняя деталь (0 — ещё собираем). */
    builtAt: 0,
  });

  const go = (p: Phase) => {
    live.current.phase = p;
    live.current.phaseAt = performance.now();
    setPhase(p);
  };

  useEffect(() => {
    if (!spec.memory) {
      void ask(ROCKET_PROMPT);
      return;
    }
    void ask(ROCKET_PROMPT, ROCKET_REMEMBER);
    const t = setTimeout(() => {
      live.current.hidden = true;
      setHidden(true);
    }, 5500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const el = root.current!;
    const cv = canvas.current!;
    const ctx = cv.getContext('2d')!;
    const img = new Map<Sprite, HTMLImageElement>();
    for (const s of SPRITES) {
      const i = new Image();
      i.src = rocketUrl(s);
      img.set(s, i);
    }
    /** Белая деталь, перекрашенная в цвет (тени глины остаются). */
    const tints = new Map<string, HTMLCanvasElement>();
    const partImg = (part: RocketPart, color: RocketColor | null): Drawable | undefined => {
      const base = img.get(`part-${part}`);
      if (!ready(base) || !color) return base;
      const key = `${part}:${color}`;
      let c = tints.get(key);
      if (!c) {
        const [iw, ih] = sizeOf(base);
        c = document.createElement('canvas');
        c.width = iw;
        c.height = ih;
        const x = c.getContext('2d')!;
        x.drawImage(base, 0, 0);
        x.globalCompositeOperation = 'multiply';
        x.fillStyle = HEX[color];
        x.fillRect(0, 0, iw, ih);
        x.globalCompositeOperation = 'destination-in';
        x.drawImage(base, 0, 0);
        tints.set(key, c);
      }
      return c;
    };
    const colorOf = (bp: Blueprint, part: RocketPart) =>
      part === 'window' ? null : (bp[part as ColoredPart] ?? null);

    // Звёзды трёх слоёв и звёзды гиперпрыжка.
    const layers = [0.25, 0.55, 1].map((speed, li) => ({
      speed,
      stars: Array.from({ length: 50 - li * 12 }, () => ({
        x: Math.random(),
        y: Math.random(),
        r: 0.6 + li * 0.7 + Math.random() * 0.8,
        tw: Math.random() * 6.28,
      })),
    }));
    const warp = Array.from({ length: 170 }, () => ({
      x: (Math.random() - 0.5) * 2,
      y: (Math.random() - 0.5) * 2,
      z: 0.2 + Math.random() * 3,
    }));

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
    const font = getComputedStyle(el).fontFamily || 'sans-serif';
    const webdriver = navigator.webdriver;

    /** Раскладка сборки: чертёж, ракета на столе, клетки стола. */
    const layout = () => {
      const n = setup.tray.length;
      if (w > h) {
        const B = Math.min((h * 0.6) / ROCKET_HEIGHT, w * 0.1);
        const cols = 3;
        const rows = Math.ceil(n / cols);
        const cell = Math.min((w * 0.36) / cols, (h * 0.74) / rows);
        return {
          B,
          base: { x: w * 0.43, y: h * 0.86 - 0.46 * B },
          card: { x: w * 0.04, y: h * 0.26, w: w * 0.2, h: h * 0.62 },
          cell,
          cellAt: (i: number) => ({
            x: w * 0.79 + ((i % cols) - (cols - 1) / 2) * cell,
            y: h * 0.56 + (Math.floor(i / cols) - (rows - 1) / 2) * cell,
          }),
        };
      }
      const B = Math.min((h * 0.34) / ROCKET_HEIGHT, w * 0.19);
      const cols = 5;
      const rows = Math.ceil(n / cols);
      const cell = Math.min(w / 5.3, (h * 0.19) / rows);
      const cw = Math.min(w * 0.42, h * 0.16);
      return {
        B,
        base: { x: w * 0.5, y: h * 0.71 },
        card: { x: (w - cw) / 2, y: h * 0.1, w: cw, h: h * 0.21 },
        cell,
        cellAt: (i: number) => {
          const inRow = Math.min(cols, n - Math.floor(i / cols) * cols);
          return {
            x: w / 2 + ((i % cols) - (inRow - 1) / 2) * cell,
            y: h * 0.88 + (Math.floor(i / cols) - (rows - 1) / 2) * cell,
          };
        },
      };
    };

    const drawFit = (d: Drawable, cx: number, cy: number, box: number, alpha = 1) => {
      const [iw, ih] = sizeOf(d);
      const k = box / Math.max(iw, ih);
      ctx.globalAlpha = alpha;
      ctx.drawImage(d, cx - (iw * k) / 2, cy - (ih * k) / 2, iw * k, ih * k);
      ctx.globalAlpha = 1;
    };
    /** Ракета: низ корпуса в (x, y), ширина корпуса B. ghost — контуры недостающих деталей. */
    const drawRocket = (
      x: number,
      y: number,
      B: number,
      angle: number,
      show: (p: RocketPart) => 'on' | 'ghost' | 'off',
      t: number,
    ) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);
      for (const part of DRAW_ORDER) {
        if (!setup.parts.includes(part)) continue;
        const mode = show(part);
        if (mode === 'off') continue;
        const d = partImg(part, mode === 'on' ? colorOf(setup.bp, part) : null);
        if (!ready(d)) continue;
        const b = PART_BOX[part];
        // Только что встала — чуть «подпрыгивает».
        const at = live.current.placedAt.get(part);
        const pop = at && mode === 'on' ? 1 + Math.max(0, 0.18 * (1 - (t - at) / 300)) : 1;
        ctx.globalAlpha = mode === 'ghost' ? 0.22 + 0.08 * Math.sin(t / 300) : 1;
        const cx = (b.x + b.w / 2) * B;
        const cy = (b.y + b.h / 2) * B;
        ctx.drawImage(
          d,
          cx - (b.w * B * pop) / 2,
          cy - (b.h * B * pop) / 2,
          b.w * B * pop,
          b.h * B * pop,
        );
        ctx.globalAlpha = 1;
      }
      ctx.restore();
    };
    /** Пламя из сопла: три слоя, дрожит. */
    /** Пламя из сопла: три слоя-капли, дрожит; без двигателя — прямо из корпуса. */
    const drawFlame = (
      x: number,
      y: number,
      B: number,
      angle: number,
      power: number,
      t: number,
    ) => {
      const engine = setup.parts.includes('engine');
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);
      ctx.translate(0, engine ? 0.4 * B : -0.02 * B);
      ctx.globalCompositeOperation = 'lighter';
      const nozzle = engine ? 0.3 : 0.4;
      const layersF: [number, number, string, string][] = [
        [1, 1, 'rgba(255,90,20,0.8)', 'rgba(255,60,20,0)'],
        [0.72, 0.72, 'rgba(255,190,40,0.95)', 'rgba(255,170,40,0)'],
        [0.45, 0.42, 'rgba(255,255,225,1)', 'rgba(255,255,225,0)'],
      ];
      for (const [len, wid, c0, c1] of layersF) {
        const L =
          B * (0.7 + Math.min(power, 2) * 1.05) * len * (1 + 0.12 * Math.sin(t / 37 + len * 9));
        const W = B * nozzle * wid * (0.9 + Math.min(power, 2) * 0.25);
        const g = ctx.createLinearGradient(0, 0, 0, L);
        g.addColorStop(0, c0);
        g.addColorStop(0.55, c0.replace(/[\d.]+\)$/, '0.55)'));
        g.addColorStop(1, c1);
        ctx.fillStyle = g;
        // Капля: у сопла по ширине сопла, раздувается и сходится в острый хвост.
        ctx.beginPath();
        ctx.moveTo(-W, 0);
        ctx.bezierCurveTo(-W * 1.7, L * 0.22, -W * 0.7, L * 0.7, 0, L);
        ctx.bezierCurveTo(W * 0.7, L * 0.7, W * 1.7, L * 0.22, W, 0);
        ctx.closePath();
        ctx.fill();
      }
      // Яркое ядро у сопла.
      const core = ctx.createRadialGradient(0, 0, 0, 0, 0, B * nozzle * 1.4);
      core.addColorStop(0, 'rgba(255,255,240,0.9)');
      core.addColorStop(1, 'rgba(255,200,80,0)');
      ctx.fillStyle = core;
      ctx.fillRect(-B, -B * 0.5, B * 2, B * 1.9);
      ctx.restore();
    };
    const emit = (p: Omit<Particle, 'age'>) => {
      if (live.current.particles.length < 320) live.current.particles.push({ ...p, age: 0 });
    };
    const sparkle = (x: number, y: number, n: number, color = '#ffe14d') => {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const v = 90 + Math.random() * 240;
        emit({
          x,
          y,
          vx: Math.cos(a) * v,
          vy: Math.sin(a) * v,
          r: 3 + Math.random() * 4,
          grow: 0,
          life: 0.7,
          kind: 'spark',
          color: i % 3 ? color : '#fff',
        });
      }
    };
    const smoke = (x: number, y: number, spread: number, r: number) =>
      emit({
        x: x + (Math.random() - 0.5) * spread * 0.3,
        y,
        vx: (Math.random() - 0.5) * spread,
        vy: -10 - Math.random() * 30,
        r,
        grow: r * 1.6,
        life: 1.6 + Math.random(),
        kind: 'smoke',
        color: '',
      });

    const rocketScreen = () => {
      // Где ракета в полёте: внизу экрана, за пальцем по горизонтали.
      const B = Math.min(w * 0.09, h * 0.075);
      return { B, x: live.current.rocket.x * w, y: h * (w > h ? 0.84 : 0.82) };
    };
    const lanes = () => (w > h ? [0.27, 0.5, 0.73] : [1 / 6, 0.5, 5 / 6]).map((k) => k * w);
    const planetR = () => Math.min((w / 3) * 0.4, h * (w > h ? 0.15 : 0.11));

    const newTrio = (): Trio => {
      const task = setup.tasks[live.current.round]!;
      const kinds = [...PLANETS].sort(() => Math.random() - 0.5);
      return {
        planets: planetAnswers(task, spec).map((value, lane) => ({
          value,
          lane,
          sprite: kinds[lane]!,
        })),
        y: -planetR() * 1.4,
        retreat: false,
      };
    };

    const startRound = () => {
      const s = live.current;
      s.trio = null;
      s.rocks = [];
      s.trioAt = performance.now() + 2600;
      s.rockAt = performance.now() + 900;
      void ask(flightPhrase(setup.tasks[s.round]!));
      go('fly');
    };

    const frame = (now: number) => {
      const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
      last = now;
      frameNo++;
      const s = live.current;
      const L = layout();

      // ─── Переходы фаз (за кадр — не больше одного) ───
      const was = (now - s.phaseAt) / 1000;
      if (s.phase === 'build' && s.builtAt && now - s.builtAt > 2000) {
        go('countdown');
        void say(ROCKET_COUNTDOWN);
      } else if (s.phase === 'countdown' && was > 3) go('launch');
      else if (s.phase === 'launch' && was > 2.6) go('warp');
      else if (s.phase === 'warp' && was > 1.6) startRound();
      const since = Math.max(0, (now - s.phaseAt) / 1000);

      // ─── Частицы ───
      for (const p of s.particles) {
        p.age += dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.r += p.grow * dt;
        if (p.kind === 'spark' || p.kind === 'dust') {
          p.vx *= 1 - dt * 2.5;
          p.vy = p.vy * (1 - dt * 2.5) + (p.kind === 'dust' ? 60 * dt : 0);
        } else p.vx *= 1 - dt * 0.8;
      }
      s.particles = s.particles.filter((p) => p.age < p.life);

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (now < s.shakeUntil) {
        const k = (s.shakeUntil - now) / 400;
        ctx.translate((Math.random() - 0.5) * 16 * k, (Math.random() - 0.5) * 12 * k);
      }

      // ─── Небо и космос ───
      const space = img.get('space');
      const ground = img.get('cosmodrome');
      const onEarth = s.phase === 'build' || s.phase === 'countdown' || s.phase === 'launch';
      const launchT = s.phase === 'launch' ? since : 0;
      const alt = 0.5 * h * 1.1 * launchT * launchT;
      const cam = Math.max(0, alt - h * 0.32);
      if (onEarth) {
        // Над картинкой — небо её же верхнего цвета, выше темнеет: шва при взлёте не видно.
        ctx.fillStyle = '#a97ccf';
        ctx.fillRect(-20, -20, w + 40, h + 40);
        if (ready(ground)) {
          // Стартовый стол картинки (84 % высоты, середина) — ровно под ракетой.
          const [iw, ih] = sizeOf(ground);
          const bx = L.base.x;
          const by = L.base.y + 0.46 * L.B;
          const k = Math.max(
            w / iw,
            h / ih,
            by / (0.84 * ih),
            (h - by) / (0.16 * ih),
            (2 * bx) / iw,
            (2 * (w - bx)) / iw,
          );
          const top = by - 0.84 * ih * k + cam;
          ctx.drawImage(ground, bx - 0.5 * iw * k, top, iw * k, ih * k);
          if (top > 0) {
            const sky = ctx.createLinearGradient(0, top - h, 0, top + 2);
            sky.addColorStop(0, '#2a1d63');
            sky.addColorStop(1, '#a97ccf');
            ctx.fillStyle = sky;
            ctx.fillRect(-20, top - h, w + 40, h + 2);
            ctx.fillStyle = '#2a1d63';
            if (top - h > -20) ctx.fillRect(-20, -20, w + 40, top - h + 20);
          }
        }
        // Чем выше — тем темнее: небо переходит в космос.
        const toSpace = clamp(cam / (h * 1.6), 0, 1);
        if (toSpace > 0) {
          ctx.globalAlpha = toSpace;
          ctx.fillStyle = '#0b1030';
          ctx.fillRect(-20, -20, w + 40, h + 40);
          if (ready(space)) drawCover(space, 0);
          ctx.globalAlpha = 1;
        }
      } else {
        ctx.fillStyle = '#0b1030';
        ctx.fillRect(-20, -20, w + 40, h + 40);
        if (ready(space)) drawCover(space, (now / 1000) * h * 0.03);
        // Звёзды слоями — летим вверх, они вниз.
        const fly = s.phase === 'warp' ? 0 : s.phase === 'land' ? 0.15 : 0.5;
        for (const layer of layers) {
          for (const st of layer.stars) {
            st.y = (st.y + layer.speed * fly * dt) % 1;
            const a = 0.55 + 0.45 * Math.sin(now / 400 + st.tw);
            ctx.fillStyle = `rgba(255,255,255,${a})`;
            ctx.beginPath();
            ctx.arc(st.x * w, st.y * h, st.r, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
      if (s.phase === 'warp') {
        // Гиперпрыжок: звёзды летят из центра полосами.
        const cx = w / 2;
        const cy = h * 0.42;
        const f = Math.max(w, h) * 0.5;
        const speed = 2.4 * Math.sin(Math.min(1, since / 1.6) * Math.PI) + 0.3;
        ctx.globalCompositeOperation = 'lighter';
        ctx.lineCap = 'round';
        for (const st of warp) {
          const z0 = st.z;
          st.z -= speed * dt;
          if (st.z < 0.05) {
            st.z = 3;
            st.x = (Math.random() - 0.5) * 2;
            st.y = (Math.random() - 0.5) * 2;
            continue;
          }
          const a = clamp(1.4 - st.z / 2.4, 0, 1);
          ctx.strokeStyle = `rgba(190,220,255,${a})`;
          ctx.lineWidth = 1 + (3 - st.z) * 0.9;
          ctx.beginPath();
          ctx.moveTo(cx + (st.x / z0) * f, cy + (st.y / z0) * f);
          ctx.lineTo(cx + (st.x / st.z) * f, cy + (st.y / st.z) * f);
          ctx.stroke();
        }
        ctx.globalCompositeOperation = 'source-over';
      }

      // ─── Сборка ───
      if (onEarth) {
        const { B, base } = L;
        const padY = base.y + 0.46 * B + cam;
        let rx = base.x;
        let ry = base.y + cam;
        if (s.phase === 'countdown') {
          const shake = (since / 3) * B * 0.05;
          rx += (Math.random() - 0.5) * shake;
          if (since > 1.2 && Math.random() < 0.7) smoke(base.x, padY, B * 3, B * 0.35);
        }
        if (s.phase === 'launch') {
          ry = base.y - Math.min(alt, h * 0.32);
          rx += (Math.random() - 0.5) * B * 0.04;
          if (Math.random() < 0.9) smoke(rx, ry + 0.6 * B, B * 1.5, B * 0.3);
          for (const p of s.particles) if (p.kind === 'smoke') p.y += cam - s.lastCam;
        }
        s.lastCam = cam;
        drawSmoke();
        if (s.phase === 'countdown' && since > 2.2)
          drawFlame(rx, ry, B, 0, (since - 2.2) * 0.5, now);
        if (s.phase === 'launch') drawFlame(rx, ry, B, 0, 1 + Math.min(1, launchT), now);
        drawRocket(
          rx,
          ry,
          B,
          0,
          (p) => (s.placed.has(p) ? 'on' : s.phase === 'build' ? 'ghost' : 'off'),
          now,
        );

        if (s.phase === 'build') {
          // Чертёж.
          const c = L.card;
          ctx.fillStyle = 'rgba(255,255,255,0.9)';
          ctx.strokeStyle = '#7aa7ff';
          ctx.lineWidth = 3;
          roundRect(c.x, c.y, c.w, c.h, 18);
          ctx.fill();
          ctx.stroke();
          ctx.strokeStyle = 'rgba(122,167,255,0.25)';
          ctx.lineWidth = 1;
          for (let gx = c.x + 14; gx < c.x + c.w; gx += 14) line(gx, c.y + 4, gx, c.y + c.h - 4);
          for (let gy = c.y + 14; gy < c.y + c.h; gy += 14) line(c.x + 4, gy, c.x + c.w - 4, gy);
          const show = !s.hidden || now < s.peekUntil;
          if (show) {
            const mb = Math.min((c.h * 0.84) / ROCKET_HEIGHT, c.w / 2.4);
            drawRocket(c.x + c.w / 2, c.y + c.h * 0.08 + 2.4 * mb, mb, 0, () => 'on', now);
          } else {
            ctx.fillStyle = '#7aa7ff';
            ctx.font = `900 ${Math.round(c.h * 0.42)}px ${font}`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('?', c.x + c.w / 2, c.y + c.h / 2);
          }
          // Стол с деталями.
          for (const item of setup.tray) {
            if (s.placed.has(item.part) && fits(setup.bp, item)) continue;
            if (s.drag?.item.id === item.id) continue;
            const d = partImg(item.part, item.color);
            if (!ready(d)) continue;
            const home = L.cellAt(item.id);
            let { x, y } = home;
            const back = s.back.get(item.id);
            if (back) {
              const k = ease((now - back.at) / 320);
              x = back.x + (home.x - back.x) * k;
              y = back.y + (home.y - back.y) * k;
              if (k >= 1) s.back.delete(item.id);
            }
            ctx.fillStyle = 'rgba(255,255,255,0.55)';
            ctx.beginPath();
            ctx.arc(x, y, L.cell * 0.44, 0, Math.PI * 2);
            ctx.fill();
            drawFit(d, x, y, L.cell * 0.74);
          }
          if (s.drag) {
            const d = partImg(s.drag.item.part, s.drag.item.color);
            if (ready(d)) {
              ctx.shadowColor = 'rgba(0,0,0,0.3)';
              ctx.shadowBlur = 16;
              ctx.shadowOffsetY = 8;
              drawFit(d, s.drag.x, s.drag.y, L.cell * 0.95);
              ctx.shadowColor = 'transparent';
            }
          }
        }
        if (s.phase === 'countdown') {
          // Большие цифры отсчёта.
          const step = Math.floor(since / 0.75);
          const label = ['3', '2', '1', 'Пуск!'][Math.min(3, step)]!;
          const k = (since % 0.75) / 0.75;
          ctx.globalAlpha = step >= 3 ? 1 : 1 - k * 0.6;
          ctx.fillStyle = '#fff';
          ctx.strokeStyle = 'rgba(40,20,80,0.6)';
          ctx.lineWidth = 8;
          ctx.font = `900 ${Math.round(Math.min(w, h) * (0.22 + k * 0.08))}px ${font}`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.strokeText(label, w / 2, h * 0.24);
          ctx.fillText(label, w / 2, h * 0.24);
          ctx.globalAlpha = 1;
        }
      }

      // ─── Полёт ───
      if (!onEarth) {
        const R = rocketScreen();
        const s2 = live.current;
        if (s.phase === 'fly' || s.phase === 'warp') {
          const k = 26;
          s2.rocket.vx += ((s2.targetX - s2.rocket.x) * k - s2.rocket.vx * 2 * Math.sqrt(k)) * dt;
          s2.rocket.x = clamp(s2.rocket.x + s2.rocket.vx * dt, 0.1, 0.9);
        }
        let rx = R.x;
        let ry = R.y;
        let angle = clamp(s2.rocket.vx * 0.5, -0.4, 0.4);
        if (s.phase === 'warp') {
          // После старта ракета въезжает снизу на своё место.
          const k = ease(since / 0.8);
          ry = h * 1.25 + (R.y - h * 1.25) * k;
          rx = w * 0.5 + (R.x - w * 0.5) * k;
        }

        // Планета с прошлой посадки уезжает вниз.
        if (s.leaving) {
          const k = (now - s.leaving.at) / 1200;
          const big = Math.max(w, h) * 0.9;
          if (k < 1) drawPlanet(s.leaving.planet, w / 2, h + big * 0.55 + k * big, big, null, now);
          else s.leaving = null;
        }

        // Камни.
        if (s.phase === 'fly' && now >= s.rockAt && (!s.trio || s.trio.y < 0)) {
          s.rockAt = now + ASTEROID_EVERY[spec.asteroids] * (0.7 + Math.random() * 0.6);
          if (Number.isFinite(s.rockAt)) {
            const size = Math.min(w, h) * (0.1 + Math.random() * 0.06);
            s.rocks.push({
              x: w * (0.1 + Math.random() * 0.8),
              y: -size,
              vx: (Math.random() - 0.5) * w * 0.12,
              vy: h * (0.22 + Math.random() * 0.12),
              rot: Math.random() * 6.28,
              vr: (Math.random() - 0.5) * 2,
              size,
            });
          }
        }
        const rock = img.get('asteroid');
        for (const r of s.rocks) {
          r.x += r.vx * dt;
          r.y += r.vy * dt;
          r.rot += r.vr * dt;
          if (ready(rock)) {
            ctx.save();
            ctx.translate(r.x, r.y);
            ctx.rotate(r.rot);
            drawFit(rock, 0, 0, r.size);
            ctx.restore();
          }
          if (
            s.phase === 'fly' &&
            now >= s.safeUntil &&
            Math.hypot(r.x - rx, r.y - (ry - 1.2 * R.B)) < r.size * 0.4 + R.B * 0.7
          ) {
            s.safeUntil = now + 1300;
            s.shakeUntil = now + 400;
            s.rocket.vx = r.x > rx ? -1.2 : 1.2;
            bump();
            sparkle(r.x, r.y, 12, '#ffb36b');
            if (!s.rockSaid) void say(ROCKET_ROCK);
            s.rockSaid = true;
          }
        }
        s.rocks = s.rocks.filter((r) => r.y < h + r.size);

        // Планеты с ответами.
        if (s.phase === 'fly' && !s.trio && now >= s.trioAt) s.trio = newTrio();
        const pr = planetR();
        if (s.trio && s.phase === 'fly') {
          const t3 = s.trio;
          t3.y += (t3.retreat ? -h * 0.9 : h * 0.12) * dt;
          if (t3.retreat && t3.y < -pr * 1.6) {
            s.trio = null;
            s.trioAt = now + 1200;
          } else if (!t3.retreat && t3.y + pr * 0.85 >= ry - 2.4 * R.B) {
            const xs = lanes();
            const lane = xs.reduce(
              (best, x, i) => (Math.abs(x - rx) < Math.abs(xs[best]! - rx) ? i : best),
              0,
            );
            const planet = t3.planets.find((p) => p.lane === lane)!;
            const task = setup.tasks[s.round]!;
            if (planet.value === task.answer) {
              s.landed = { planet, from: { x: xs[lane]!, y: t3.y }, at: now };
              s.flagAt = -1;
              go('land');
              fx.snap();
            } else {
              t3.retreat = true;
              s.shakeUntil = now + 300;
              bump();
              sparkle(xs[lane]!, t3.y + pr * 0.8, 14, '#9ad0ff');
              void say(planetPhrase(planet.value), flightPhrase(task));
            }
          }
        }
        if (s.trio && s.phase === 'fly') {
          const xs = lanes();
          for (const p of s.trio.planets) drawPlanet(p, xs[p.lane]!, s.trio.y, pr, p.value, now);
        }

        // Посадка: планета растёт снизу, ракета садится, пыль, флажок.
        if (s.phase === 'land' && s.landed) {
          const k = ease((now - s.landed.at) / 1400);
          const big = Math.max(w, h) * 0.9;
          const cx = s.landed.from.x + (w / 2 - s.landed.from.x) * k;
          const cy = s.landed.from.y + (h + big * 0.55 - s.landed.from.y) * k;
          const r = pr + (big - pr) * k;
          drawPlanet(s.landed.planet, cx, cy, r, k < 0.5 ? s.landed.planet.value : null, now);
          const surface = cy - r * 0.97;
          rx = R.x + (w / 2 - R.x) * k;
          ry = R.y + (surface - 0.46 * R.B - R.y) * k;
          angle *= 1 - k;
          s.rocket.x = rx / w;
          s.rocket.vx = 0;
          if (k >= 1 && s.flagAt < 0) {
            s.flagAt = now;
            for (let i = 0; i < 26; i++) {
              const dir = i % 2 ? 1 : -1;
              emit({
                x: rx + dir * R.B * 0.5,
                y: surface,
                vx: dir * (60 + Math.random() * 200),
                vy: -40 - Math.random() * 90,
                r: R.B * (0.12 + Math.random() * 0.15),
                grow: R.B * 0.4,
                life: 1.2,
                kind: 'dust',
                color: '',
              });
            }
            sparkle(rx, surface - R.B * 1.5, 26);
            const last = s.round + 1 >= setup.tasks.length;
            void afterSpeech(praise(phrases, undefined, [ROCKET_LANDED]), 2400).then(() => {
              if (last) return onFinish();
              s.leaving = { planet: s.landed!.planet, at: performance.now() };
              s.landed = null;
              s.round++;
              setRound(s.round);
              go('warp');
            });
          }
          const flag = img.get('flag');
          if (s.flagAt >= 0 && ready(flag)) {
            const fk = ease((now - s.flagAt) / 350);
            const fh = R.B * 1.6 * fk;
            const [iw, ih] = sizeOf(flag);
            ctx.drawImage(flag, rx + R.B * 1.3, surface - fh + 2, (fh * iw) / ih, fh);
          }
        }

        drawSmoke();
        const power =
          s.phase === 'land'
            ? Math.max(0, 0.6 - ((now - (s.landed?.at ?? now)) / 1400) * 0.6)
            : s.phase === 'warp'
              ? 1.6
              : 0.9;
        if (power > 0.05) drawFlame(rx, ry, R.B, angle, power, now);
        if (s.phase === 'fly' && Math.random() < 0.5) {
          emit({
            x: rx + (Math.random() - 0.5) * R.B * 0.3,
            y: ry + R.B * 0.9,
            vx: (Math.random() - 0.5) * 30,
            vy: 120 + Math.random() * 90,
            r: 1.5 + Math.random() * 2.5,
            grow: 0,
            life: 0.5,
            kind: 'spark',
            color: '#ffb340',
          });
        }
        if (now < s.safeUntil) ctx.globalAlpha = Math.floor(now / 120) % 2 ? 0.4 : 1;
        drawRocket(rx, ry, R.B, angle, () => 'on', now);
        ctx.globalAlpha = 1;

        if (webdriver && frameNo % 5 === 0) {
          const xs = lanes();
          el.dataset.planets = JSON.stringify(
            s.trio && !s.trio.retreat
              ? s.trio.planets.map((p) => ({
                  x: Math.round(xs[p.lane]!),
                  good: p.value === setup.tasks[s.round]!.answer,
                }))
              : [],
          );
          el.dataset.rocket = `${Math.round(rx)},${Math.round(ry)}`;
        }
      }

      // Искры поверх всего.
      for (const p of s.particles) {
        if (p.kind !== 'spark') continue;
        const fade = 1 - p.age / p.life;
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = fade;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        const r = p.r * (0.5 + fade * 0.5);
        for (let k = 0; k < 8; k++) {
          const a = (k * Math.PI) / 4 + p.age * 5;
          const rr = k % 2 ? r * 0.4 : r;
          ctx.lineTo(p.x + Math.cos(a) * rr, p.y + Math.sin(a) * rr);
        }
        ctx.closePath();
        ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
      }

      if (webdriver && frameNo % 5 === 0 && s.phase === 'build') {
        el.dataset.tray = JSON.stringify(
          setup.tray
            .filter((it) => !(s.placed.has(it.part) && fits(setup.bp, it)))
            .map((it) => {
              const c = L.cellAt(it.id);
              return {
                x: Math.round(c.x),
                y: Math.round(c.y),
                part: it.part,
                good: fits(setup.bp, it),
              };
            }),
        );
        el.dataset.drop = `${Math.round(L.base.x)},${Math.round(L.base.y - 1.2 * L.B)}`;
      }
      raf = requestAnimationFrame(frame);
    };

    function drawCover(d: Drawable, scroll: number) {
      const [iw, ih] = sizeOf(d);
      const k = Math.max(w / iw, h / ih);
      const dw = iw * k;
      const dh = ih * k;
      const off = scroll % (dh * 2);
      for (let i = -1; i < 2; i++) {
        const y = i * dh + off - dh;
        ctx.save();
        if (((i % 2) + 2) % 2) {
          ctx.translate((w - dw) / 2, y + dh);
          ctx.scale(1, -1);
          ctx.drawImage(d, 0, 0, dw, dh);
        } else ctx.drawImage(d, (w - dw) / 2, y, dw, dh);
        ctx.restore();
      }
    }
    function drawSmoke() {
      for (const p of live.current.particles) {
        if (p.kind === 'spark') continue;
        const fade = 1 - p.age / p.life;
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
        const c = p.kind === 'dust' ? '230,200,170' : '245,245,250';
        g.addColorStop(0, `rgba(${c},${0.75 * fade})`);
        g.addColorStop(1, `rgba(${c},0)`);
        ctx.fillStyle = g;
        ctx.fillRect(p.x - p.r, p.y - p.r, p.r * 2, p.r * 2);
      }
    }
    function drawPlanet(
      p: Planet,
      x: number,
      y: number,
      r: number,
      label: number | string | null,
      now: number,
    ) {
      const d = img.get(p.sprite);
      const glow = GLOW[p.sprite] ?? '255,255,255';
      const g = ctx.createRadialGradient(x, y, r * 0.6, x, y, r * 1.35);
      g.addColorStop(0, `rgba(${glow},0.45)`);
      g.addColorStop(1, `rgba(${glow},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(x - r * 1.4, y - r * 1.4, r * 2.8, r * 2.8);
      if (ready(d)) {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(Math.sin(now / 2000 + p.lane) * 0.06);
        drawFit(d, 0, 0, r * 2.1);
        ctx.restore();
      }
      if (label === null) return;
      const br = r * 0.42;
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.strokeStyle = 'rgba(30,30,70,0.35)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x, y, br, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#1d2346';
      ctx.font = `900 ${Math.round(br * 1.25)}px ${font}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(label), x, y + br * 0.06);
    }
    function roundRect(x: number, y: number, ww: number, hh: number, r: number) {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + ww, y, x + ww, y + hh, r);
      ctx.arcTo(x + ww, y + hh, x, y + hh, r);
      ctx.arcTo(x, y + hh, x, y, r);
      ctx.arcTo(x, y, x + ww, y, r);
      ctx.closePath();
    }
    function line(x0: number, y0: number, x1: number, y1: number) {
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
    }

    // ─── Касания ───
    /** Палец на экране в полёте (e.buttons в WebKit во время движения бывает 0). */
    let steering = false;
    const at = (e: PointerEvent) => {
      const box = el.getBoundingClientRect();
      return { x: e.clientX - box.left, y: e.clientY - box.top };
    };
    const down = (e: PointerEvent) => {
      if ((e.target as Element).closest('.corner-button')) return;
      const s = live.current;
      const p = at(e);
      el.setPointerCapture?.(e.pointerId);
      if (s.phase === 'fly' || s.phase === 'warp') {
        s.targetX = clamp(p.x / w, 0.1, 0.9);
        steering = true;
        return;
      }
      if (s.phase !== 'build') return;
      const L = layout();
      const c = L.card;
      if (s.hidden && p.x > c.x && p.x < c.x + c.w && p.y > c.y && p.y < c.y + c.h) {
        // Подсмотреть чертёж на миг.
        s.peekUntil = performance.now() + 1500;
        return;
      }
      for (const item of setup.tray) {
        if (s.placed.has(item.part) && fits(setup.bp, item)) continue;
        const home = L.cellAt(item.id);
        if (Math.abs(p.x - home.x) < L.cell / 2 && Math.abs(p.y - home.y) < L.cell / 2) {
          s.drag = { item, x: p.x, y: p.y, ox: home.x, oy: home.y };
          fx.snap();
          return;
        }
      }
    };
    const move = (e: PointerEvent) => {
      const s = live.current;
      const p = at(e);
      if (steering && (s.phase === 'fly' || s.phase === 'warp'))
        s.targetX = clamp(p.x / w, 0.1, 0.9);
      if (s.drag) {
        s.drag.x = p.x;
        s.drag.y = p.y;
      }
    };
    const up = (e: PointerEvent) => {
      steering = false;
      const s = live.current;
      const drag = s.drag;
      if (!drag) return;
      s.drag = null;
      // Где отпустили — по самому событию: последний pointermove мог не дойти.
      if (e.type === 'pointerup') Object.assign(drag, at(e));
      const { B, base } = layout();
      const onRocket =
        Math.abs(drag.x - base.x) < 1.4 * B &&
        drag.y > base.y - 2.7 * B &&
        drag.y < base.y + 0.9 * B;
      if (!onRocket) {
        s.back.set(drag.item.id, { x: drag.x, y: drag.y, at: performance.now() });
        return;
      }
      const item = drag.item;
      if (s.placed.has(item.part)) {
        s.back.set(item.id, { x: drag.x, y: drag.y, at: performance.now() });
        return;
      }
      if (!fits(setup.bp, item)) {
        s.back.set(item.id, { x: drag.x, y: drag.y, at: performance.now() });
        const want = setup.bp[item.part as ColoredPart]!;
        void retry(phrases).then(() => say(rocketWrongColor(item.part as ColoredPart, want)));
        return;
      }
      s.placed.add(item.part);
      s.placedAt.set(item.part, performance.now());
      fx.snap();
      const b = PART_BOX[item.part];
      sparkle(
        base.x + (b.x + b.w / 2) * B,
        base.y + (b.y + b.h / 2) * B,
        16,
        HEX[item.color ?? 'blue'],
      );
      if (s.placed.size === setup.parts.length) {
        s.builtAt = performance.now();
        void say(ROCKET_BUILT);
      }
    };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);

    let raf = 0;
    let last = performance.now();
    let frameNo = 0;
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const task = setup.tasks[round]!;
  return (
    <div
      className="game rocket"
      data-testid="game-rocket"
      data-phase={phase}
      data-round={round}
      data-hidden={hidden || undefined}
      data-no-idle={phase !== 'build' || undefined}
      ref={root}
    >
      <canvas ref={canvas} className="rocket-canvas" />
      {(phase === 'fly' || phase === 'land') && (
        <div className="rocket-task" data-testid="rocket-task">
          {taskLabel(task)}
        </div>
      )}
    </div>
  );
}
