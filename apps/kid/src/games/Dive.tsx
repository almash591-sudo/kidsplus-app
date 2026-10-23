// «Подводное плавание» (этап 43): батискаф с совёнком плывёт за пальцем по морскому дну и ловит
// рыбок по заданию — «три жёлтые рыбки», «рыбка с цифрой пять». Не та рыбка уплывает, медуза
// отталкивает («бом»), проиграть нельзя. Всё море — один canvas: дальний фон и средний план с
// параллаксом, лучи света, песок с бликами, качающиеся водоросли, пузыри, искры, виньетка.
import { useEffect, useRef, useState } from 'react';
import type { DiveFish } from '@kidsplus/shared/games';
import { DIVE_DONE, DIVE_JELLY, DIVE_PROMPT } from '../phrases';
import { afterSpeech, ask, bump, NUMBERS, praise, say, type GameProps } from './common';
import { fx } from '../fx';
import {
  diveTasks,
  isGood,
  needOf,
  nextSwimmer,
  SEA_SPEED,
  steer,
  taskPhrase,
  WATER,
  wrongPhrase,
  type DiveTask,
  type Swimmer,
} from './diveLogic';

const SPRITES = [
  'sub',
  'jelly',
  'fish-red',
  'fish-yellow',
  'fish-blue',
  'fish-green',
  'fish-purple',
  'fish-orange',
  'weed1',
  'weed2',
  'coral1',
  'coral2',
  'rock',
  'star',
  'shell',
  'chest',
  'pearl',
  'far',
] as const;
type Sprite = (typeof SPRITES)[number];
export const diveUrl = (s: Sprite) => `/games/dive-${s}.webp`;

/** Цвет искр пойманной рыбки. */
const SPARK: Record<DiveFish, string> = {
  red: '#ff6b5e',
  yellow: '#ffe14d',
  blue: '#5aa9ff',
  green: '#5be08a',
  purple: '#c18bff',
  orange: '#ffad42',
};

/** Предметы на дне: что, где (в долях ширины мира), какого размера (доля высоты экрана). */
interface Prop {
  sprite: Sprite;
  x: number;
  h: number;
  /** Водоросли качаются. */
  sway: boolean;
  phase: number;
  flip: boolean;
}

/** Мелочь на дне — вдвое меньше кораллов. */
const SMALL: Sprite[] = ['star', 'shell'];

/** Ряд предметов дна на всё плавание: детерминированно, чтобы при прокрутке ничего не прыгало. */
function seabed(seed: number, step: number, kinds: Sprite[], size: [number, number]): Prop[] {
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
  const props: Prop[] = [];
  for (let x = 0.1; x < 200; x += step * (0.6 + rnd() * 0.8)) {
    const sprite = kinds[Math.floor(rnd() * kinds.length)]!;
    props.push({
      sprite,
      x,
      h: (size[0] + rnd() * (size[1] - size[0])) * (SMALL.includes(sprite) ? 0.5 : 1),
      sway: sprite.startsWith('weed'),
      phase: rnd() * 6.28,
      flip: rnd() < 0.5,
    });
  }
  return props;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  life: number;
  age: number;
  kind: 'bubble' | 'spark' | 'pearl' | 'mote';
  color: string;
}

/** Картинка, перекрашенная цветом воды (для дальних планов). */
function tinted(img: HTMLImageElement, color: string, alpha: number) {
  const c = document.createElement('canvas');
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const x = c.getContext('2d')!;
  x.drawImage(img, 0, 0);
  x.globalCompositeOperation = 'source-atop';
  x.globalAlpha = alpha;
  x.fillStyle = color;
  x.fillRect(0, 0, c.width, c.height);
  return c;
}

type Drawable = HTMLImageElement | HTMLCanvasElement;
const ready = (d: Drawable | undefined): d is Drawable =>
  !!d && (d instanceof HTMLCanvasElement || (d.complete && d.naturalWidth > 0));
const sizeOf = (d: Drawable): [number, number] =>
  d instanceof HTMLCanvasElement ? [d.width, d.height] : [d.naturalWidth, d.naturalHeight];

export function Dive({ spec, phrases, onFinish }: GameProps<'dive'>) {
  const [tasks] = useState(() => diveTasks(spec));
  const [round, setRound] = useState(0);
  const [caught, setCaught] = useState(0);
  const [started, setStarted] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);

  const live = useRef({
    started: false,
    round: 0,
    caught: 0,
    /** Раунд собран — ждём похвалу, новых не ловим. */
    between: false,
    done: false,
    sub: { x: 0.28, y: 0.48, vx: 0, vy: 0 },
    target: { x: 0.28, y: 0.48 },
    scroll: 0,
    swimmers: [] as (Swimmer & { leaving?: boolean; shooed?: boolean })[],
    nextId: 1,
    spawnIn: 0.4,
    particles: [] as Particle[],
    safeUntil: 0,
    shakeUntil: 0,
    jellySaid: false,
    wrongAt: 0,
    /** Сундук с жемчугом в конце раунда: когда появился. */
    chestAt: -1,
  });

  const task = (): DiveTask => tasks[live.current.round]!;

  useEffect(() => {
    void ask(DIVE_PROMPT, taskPhrase(tasks[0]!));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const cv = canvas.current!;
    const ctx = cv.getContext('2d')!;
    const img = new Map<Sprite, HTMLImageElement>();
    for (const s of SPRITES) {
      const i = new Image();
      i.src = diveUrl(s);
      img.set(s, i);
    }
    /** Перекрашенные копии для дальнего плана и тёмных водорослей у самой «камеры». */
    const haze = new Map<Sprite, HTMLCanvasElement>();
    const shade = new Map<Sprite, HTMLCanvasElement>();
    const hazy = (s: Sprite) => {
      if (!haze.has(s) && ready(img.get(s))) haze.set(s, tinted(img.get(s)!, '#1f6f9c', 0.55));
      return haze.get(s);
    };
    const shaded = (s: Sprite) => {
      if (!shade.has(s) && ready(img.get(s))) shade.set(s, tinted(img.get(s)!, '#04263b', 0.82));
      return shade.get(s);
    };

    const mid = seabed(7, 0.32, ['rock', 'coral2', 'weed2', 'coral1', 'rock'], [0.16, 0.26]);
    const near = seabed(
      13,
      0.24,
      ['weed1', 'coral1', 'star', 'weed2', 'shell', 'coral2', 'weed1'],
      [0.1, 0.22],
    );
    const front = seabed(29, 1.6, ['weed2', 'weed1'], [0.3, 0.38]);

    let w = 0;
    let h = 0;
    let dpr = 1;
    let vignette: HTMLCanvasElement | null = null;
    const resize = () => {
      const box = root.current!.getBoundingClientRect();
      w = box.width || window.innerWidth;
      h = box.height || window.innerHeight;
      dpr = Math.min(2, window.devicePixelRatio || 1);
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
      vignette = document.createElement('canvas');
      vignette.width = Math.max(1, Math.round(w / 2));
      vignette.height = Math.max(1, Math.round(h / 2));
      const v = vignette.getContext('2d')!;
      const g = v.createRadialGradient(
        vignette.width / 2,
        vignette.height * 0.45,
        Math.min(vignette.width, vignette.height) * 0.35,
        vignette.width / 2,
        vignette.height * 0.45,
        Math.hypot(vignette.width, vignette.height) * 0.6,
      );
      g.addColorStop(0, 'rgba(0,20,45,0)');
      g.addColorStop(1, 'rgba(0,20,45,0.55)');
      v.fillStyle = g;
      v.fillRect(0, 0, vignette.width, vignette.height);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(root.current!);

    const font = getComputedStyle(root.current!).fontFamily || 'sans-serif';
    const webdriver = navigator.webdriver;
    let raf = 0;
    let last = performance.now();
    let frameNo = 0;

    /** Картинка по высоте hh с центром снизу в (x, bottom). */
    const drawBottom = (d: Drawable, x: number, bottom: number, hh: number, flip: boolean) => {
      const [iw, ih] = sizeOf(d);
      const ww = (hh * iw) / ih;
      ctx.save();
      ctx.translate(x, bottom);
      if (flip) ctx.scale(-1, 1);
      ctx.drawImage(d, -ww / 2, -hh, ww, hh);
      ctx.restore();
    };
    /** Водоросль, нарезанная на полосы: верх качается сильнее низа. */
    const drawSway = (
      d: Drawable,
      x: number,
      bottom: number,
      hh: number,
      flip: boolean,
      t: number,
      phase: number,
    ) => {
      const [iw, ih] = sizeOf(d);
      const ww = (hh * iw) / ih;
      const strips = 10;
      for (let i = 0; i < strips; i++) {
        const k = 1 - (i + 0.5) / strips;
        const off = Math.sin(t * 1.3 + phase + i * 0.35) * hh * 0.07 * k * k;
        const sy = (ih / strips) * i;
        const dy = bottom - hh + (hh / strips) * i;
        ctx.save();
        ctx.translate(x + off, dy);
        if (flip) ctx.scale(-1, 1);
        ctx.drawImage(d, 0, sy, iw, ih / strips + 1, -ww / 2, 0, ww, hh / strips + 0.6);
        ctx.restore();
      }
    };
    /** Ряд предметов с параллаксом par; ширина «мира» в экранах. */
    const drawRow = (
      props: Prop[],
      par: number,
      bottom: number,
      t: number,
      pick: (s: Sprite) => Drawable | undefined,
    ) => {
      const off = (live.current.scroll * par) / w;
      for (const p of props) {
        const sx = (p.x - off) * w;
        if (sx < -w * 0.4) continue;
        if (sx > w * 1.4) break;
        const d = pick(p.sprite);
        if (!ready(d)) continue;
        const hh = p.h * h;
        if (p.sway) drawSway(d, sx, bottom, hh, p.flip, t, p.phase);
        else drawBottom(d, sx, bottom + hh * 0.08, hh, p.flip);
      }
    };
    /** Фон с бесшовной прокруткой: каждая вторая копия — зеркальная. */
    const drawTiled = (d: Drawable, par: number, top: number, hh: number) => {
      const [iw, ih] = sizeOf(d);
      const ww = (hh * iw) / ih;
      const off = (live.current.scroll * par) % (ww * 2);
      for (let k = -1; k * ww - off < w; k++) {
        const x = k * ww - off;
        if (x + ww < 0) continue;
        ctx.save();
        if (((k % 2) + 2) % 2) {
          ctx.translate(x + ww, top);
          ctx.scale(-1, 1);
          ctx.drawImage(d, 0, 0, ww, hh);
        } else ctx.drawImage(d, x, top, ww, hh);
        ctx.restore();
      }
    };

    /** Песок: волнистый край и рябь едут вместе с дном, камешки — из того же «мира». */
    const pebbles = seabed(41, 0.07, ['rock'], [0.2, 1]);
    const drawSand = (top: number) => {
      const off = live.current.scroll;
      const wave = (x: number) =>
        top +
        Math.sin((x + off) / (w * 0.21)) * h * 0.012 +
        Math.sin((x + off) / (w * 0.07)) * h * 0.004;
      const g = ctx.createLinearGradient(0, top, 0, h);
      g.addColorStop(0, '#f1dfaa');
      g.addColorStop(0.4, '#ddc185');
      g.addColorStop(1, '#b8955a');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(-10, h + 20);
      for (let x = -10; x <= w + 10; x += 12) ctx.lineTo(x, wave(x));
      ctx.lineTo(w + 10, h + 20);
      ctx.closePath();
      ctx.fill();
      // Светлая кромка и рябь.
      ctx.strokeStyle = 'rgba(255,250,225,0.7)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (let x = -10; x <= w + 10; x += 12) ctx.lineTo(x, wave(x) + 1);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(150,115,60,0.22)';
      ctx.lineWidth = 2;
      for (let row = 1; row <= 3; row++) {
        const y0 = top + (h - top) * row * 0.24;
        ctx.beginPath();
        for (let x = -10; x <= w + 10; x += 14)
          ctx.lineTo(x, y0 + Math.sin((x + off * 1.05) / (w * 0.05) + row * 2) * h * 0.005);
        ctx.stroke();
      }
      const shift = off / w;
      for (const p of pebbles) {
        const x = (p.x - shift) * w;
        if (x < -20) continue;
        if (x > w + 20) break;
        const y = top + (h - top) * (0.25 + (p.phase / 6.28) * 0.65);
        const r = minSideNow * 0.006 + p.h * minSideNow * 0.012;
        ctx.fillStyle = p.flip ? 'rgba(130,120,115,0.75)' : 'rgba(215,140,95,0.7)';
        ctx.beginPath();
        ctx.ellipse(x, y, r * 1.4, r, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.beginPath();
        ctx.ellipse(x - r * 0.4, y - r * 0.35, r * 0.45, r * 0.25, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    };
    let minSideNow = 400;

    const spawnParticle = (p: Omit<Particle, 'age'>) => {
      if (live.current.particles.length < 260) live.current.particles.push({ ...p, age: 0 });
    };
    const sparkle = (x: number, y: number, color: string, n: number) => {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const v = 80 + Math.random() * 220;
        spawnParticle({
          x,
          y,
          vx: Math.cos(a) * v,
          vy: Math.sin(a) * v,
          r: 3 + Math.random() * 5,
          life: 0.6 + Math.random() * 0.5,
          kind: 'spark',
          color: i % 3 ? color : '#ffffff',
        });
      }
    };

    const frame = (now: number) => {
      const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
      last = now;
      frameNo++;
      const t = now / 1000;
      const s = live.current;
      const minSide = Math.min(w, h);
      minSideNow = minSide;
      const subW = Math.max(110, Math.min(w * 0.36, h * 0.3, 300));

      // ─── Мир ───
      const sea = SEA_SPEED[spec.speed] * w;
      s.scroll += (s.started ? sea : sea * 0.35) * dt;
      if (s.started) {
        const prevX = s.sub.x;
        s.sub = steer(s.sub, s.target, dt);
        // Хвост пузырей за винтом — гуще, когда плывёт быстро.
        const speed = Math.hypot(s.sub.vx, s.sub.vy) + Math.abs(s.sub.x - prevX);
        if (Math.random() < 0.25 + speed * 2) {
          spawnParticle({
            x: s.sub.x * w - subW * 0.48,
            y: s.sub.y * h + (Math.random() - 0.5) * subW * 0.12,
            vx: -40 - Math.random() * 60,
            vy: -20 - Math.random() * 30,
            r: 2 + Math.random() * 5,
            life: 1.4 + Math.random(),
            kind: 'bubble',
            color: '',
          });
        }
      } else {
        s.sub.y = 0.48 + Math.sin(t * 1.6) * 0.012;
      }
      // Пузыри со дна и «снег» планктона.
      if (Math.random() < dt * 3) {
        spawnParticle({
          x: Math.random() * w,
          y: h * (WATER.bottom + 0.04),
          vx: 0,
          vy: -30 - Math.random() * 40,
          r: 2 + Math.random() * 6,
          life: 6,
          kind: 'bubble',
          color: '',
        });
      }
      if (Math.random() < dt * 6) {
        spawnParticle({
          x: w * (1 + Math.random() * 0.1),
          y: Math.random() * h * 0.85,
          vx: -sea * 0.6 - Math.random() * 20,
          vy: (Math.random() - 0.5) * 8,
          r: 0.8 + Math.random() * 1.8,
          life: 14,
          kind: 'mote',
          color: '',
        });
      }

      // ─── Рыбки и медузы ───
      if (s.started && !s.done) {
        s.spawnIn -= dt;
        const active = s.swimmers.filter((f) => !f.leaving && f.caughtAt === null);
        if (s.spawnIn <= 0 && active.length < 7 && !s.between) {
          s.spawnIn = 1.1 / (SEA_SPEED[spec.speed] / SEA_SPEED.slow) ** 0.5;
          s.swimmers.push({
            id: s.nextId++,
            ...nextSwimmer(spec, task(), active),
            x: 1.15,
          });
        }
      }
      const subX = s.sub.x * w;
      const subY = s.sub.y * h;
      for (const f of s.swimmers) {
        if (f.caughtAt !== null) continue;
        const v = f.leaving ? 0.6 : f.shooed ? 0.45 : f.vx;
        f.x -= ((sea + v * w) * dt) / w;
        if (f.kind === 'jelly') f.y += Math.sin(t * 0.9 + f.phase) * 0.03 * dt;
        if (!s.started || s.between || f.leaving || f.shooed) continue;
        const fx_ = f.x * w;
        const fy = (f.y + Math.sin(t * 2 + f.phase) * 0.012) * h;
        const reach = subW * 0.36 + f.size * minSide * 0.32;
        if (Math.hypot(fx_ - subX, (fy - subY) * 1.25) > reach) continue;
        if (f.kind === 'jelly') {
          if (now < s.safeUntil) continue;
          s.safeUntil = now + 1300;
          s.shakeUntil = now + 350;
          s.sub.vx = -1.1;
          bump();
          if (!s.jellySaid) void say(DIVE_JELLY);
          s.jellySaid = true;
          sparkle(fx_, fy, '#ff9ad5', 10);
        } else if (isGood(task(), f)) {
          f.caughtAt = now;
          s.caught++;
          setCaught(s.caught);
          fx.snap();
          sparkle(fx_, fy, SPARK[f.color], 22);
          const need = needOf(task());
          if (s.caught >= need) {
            s.between = true;
            s.chestAt = now;
            for (const o of s.swimmers) if (o.caughtAt === null) o.leaving = true;
            const last = s.round + 1 >= tasks.length;
            void afterSpeech(praise(phrases, undefined, [DIVE_DONE]), 2600).then(() => {
              if (last) {
                s.done = true;
                onFinish();
                return;
              }
              s.round++;
              s.caught = 0;
              s.between = false;
              s.chestAt = -1;
              s.spawnIn = 0.6;
              setRound(s.round);
              setCaught(0);
              void ask(taskPhrase(task()));
            });
          } else if (task().kind === 'color') void say(NUMBERS[s.caught]!);
        } else {
          // Не та: рыбка испуганно уплывает, совёнок говорит, кто это, и повторяет задание.
          f.shooed = true;
          if (now - s.wrongAt > 1500) {
            s.wrongAt = now;
            bump();
            void say(wrongPhrase(task(), f), taskPhrase(task()));
          }
        }
      }
      s.swimmers = s.swimmers.filter(
        (f) => f.x > -0.3 && (f.caughtAt === null || now - f.caughtAt < 500),
      );
      for (const p of s.particles) {
        p.age += dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (p.kind === 'bubble') {
          p.vy = Math.max(p.vy - 40 * dt, -110);
          p.vx *= 1 - dt * 1.5;
          p.x += Math.sin(t * 3 + p.r * 9) * 12 * dt;
        } else if (p.kind === 'spark') {
          p.vx *= 1 - dt * 3;
          p.vy *= 1 - dt * 3;
        } else if (p.kind === 'pearl') {
          p.vy += 520 * dt;
        }
      }
      s.particles = s.particles.filter(
        (p) => p.age < p.life && p.y > -20 && p.x > -40 && p.x < w + 60,
      );

      // ─── Рисование ───
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (now < s.shakeUntil) {
        const k = (s.shakeUntil - now) / 350;
        ctx.translate((Math.random() - 0.5) * 14 * k, (Math.random() - 0.5) * 10 * k);
      }
      const water = ctx.createLinearGradient(0, 0, 0, h);
      water.addColorStop(0, '#3fc1e0');
      water.addColorStop(0.55, '#137fb3');
      water.addColorStop(1, '#0a4f7f');
      ctx.fillStyle = water;
      ctx.fillRect(-20, -20, w + 40, h + 40);
      const far = img.get('far');
      if (ready(far)) {
        ctx.globalAlpha = 0.85;
        drawTiled(far, 0.12, 0, h);
        ctx.globalAlpha = 1;
      }
      // Лучи солнца сквозь воду.
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 6; i++) {
        const x0 = w * (0.08 + i * 0.18) + Math.sin(t * 0.25 + i * 1.7) * w * 0.05;
        const spread = w * (0.08 + (i % 3) * 0.035);
        const g = ctx.createLinearGradient(0, 0, 0, h * 0.95);
        const a = 0.09 + 0.05 * Math.sin(t * 0.6 + i * 2.1);
        g.addColorStop(0, `rgba(255,255,230,${a})`);
        g.addColorStop(1, 'rgba(255,255,230,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(x0 - spread * 0.25, -10);
        ctx.lineTo(x0 + spread * 0.25, -10);
        ctx.lineTo(x0 + spread * 1.4 - w * 0.12, h * 0.95);
        ctx.lineTo(x0 - spread * 0.6 - w * 0.12, h * 0.95);
        ctx.closePath();
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
      // Дальний ряд камней и кораллов — в дымке воды.
      drawRow(mid, 0.45, h * (WATER.bottom + 0.06), t, hazy);
      // Планктон.
      ctx.fillStyle = 'rgba(220,250,255,0.35)';
      for (const p of s.particles) {
        if (p.kind !== 'mote') continue;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
      // Песок с бегающими бликами.
      const sandTop = h * (WATER.bottom + 0.02);
      drawSand(sandTop);
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 7; i++) {
        const cx = ((i * 0.19 + t * 0.03 * (1 + (i % 3) * 0.3)) % 1.2) * w - w * 0.1;
        const cy = sandTop + (h - sandTop) * (0.3 + 0.35 * Math.sin(i * 2.3 + t * 0.4));
        const r = w * (0.08 + 0.03 * Math.sin(t + i));
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        g.addColorStop(0, 'rgba(255,255,220,0.16)');
        g.addColorStop(1, 'rgba(255,255,220,0)');
        ctx.fillStyle = g;
        ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
      }
      ctx.globalCompositeOperation = 'source-over';
      drawRow(near, 1, h * (WATER.bottom + 0.1), t, (sp) => img.get(sp));

      // Сундук в конце раунда: поднимается из песка и сыплет жемчуг.
      const chest = img.get('chest');
      if (s.chestAt >= 0 && ready(chest)) {
        const k = Math.min(1, (now - s.chestAt) / 600);
        const ease = 1 - (1 - k) ** 3;
        const hh = minSide * 0.34 * (0.4 + 0.6 * ease);
        const glow = ctx.createRadialGradient(w / 2, h * 0.7, 0, w / 2, h * 0.7, hh * 1.4);
        glow.addColorStop(0, `rgba(255,240,170,${0.55 * ease})`);
        glow.addColorStop(1, 'rgba(255,240,170,0)');
        ctx.fillStyle = glow;
        ctx.fillRect(0, 0, w, h);
        drawBottom(chest, w / 2, h * (WATER.bottom + 0.08), hh, false);
        if (k > 0.5 && Math.random() < 0.6) {
          spawnParticle({
            x: w / 2 + (Math.random() - 0.5) * hh * 0.4,
            y: h * (WATER.bottom + 0.08) - hh * 0.6,
            vx: (Math.random() - 0.5) * 360,
            vy: -380 - Math.random() * 260,
            r: 5 + Math.random() * 6,
            life: 1.6,
            kind: 'pearl',
            color: '',
          });
        }
      }

      // Медузы — со свечением; рыбки — покачиваются и виляют.
      for (const f of s.swimmers) {
        const sprite = f.kind === 'jelly' ? img.get('jelly') : img.get(`fish-${f.color}`);
        if (!ready(sprite)) continue;
        const [iw, ih] = sizeOf(sprite);
        let x = f.x * w;
        let y = (f.y + Math.sin(t * 2 + f.phase) * 0.012) * h;
        let size = f.size * minSide;
        let alpha = 1;
        if (f.caughtAt !== null) {
          // Пойманная — втягивается в батискаф.
          const k = Math.min(1, (now - f.caughtAt) / 450);
          x += (subX - x) * k;
          y += (subY - y) * k;
          size *= 1 - k * 0.8;
          alpha = 1 - k;
        }
        ctx.globalAlpha = alpha;
        if (f.kind === 'jelly') {
          const glow = ctx.createRadialGradient(x, y, 0, x, y, size * 0.9);
          glow.addColorStop(0, 'rgba(255,150,220,0.35)');
          glow.addColorStop(1, 'rgba(255,150,220,0)');
          ctx.fillStyle = glow;
          ctx.fillRect(x - size, y - size, size * 2, size * 2);
          const pulse = 1 + Math.sin(t * 3 + f.phase) * 0.07;
          const hh = size * pulse;
          const ww = (size * iw) / ih / pulse;
          ctx.drawImage(sprite, x - ww / 2, y - hh / 2, ww, hh);
        } else {
          const ww = size;
          const hh = (size * ih) / iw;
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(Math.sin(t * 2 + f.phase) * 0.08 + (f.shooed ? -0.25 : 0));
          ctx.scale(1 + Math.sin(t * 9 + f.phase) * 0.04, 1);
          ctx.drawImage(sprite, -ww / 2, -hh / 2, ww, hh);
          if (f.n !== null) {
            const r = size * 0.17;
            const bx = size * 0.08;
            ctx.fillStyle = '#ffffff';
            ctx.strokeStyle = 'rgba(0,0,0,0.25)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(bx, 0, r, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = '#1d2a3a';
            ctx.font = `900 ${Math.round(r * 1.45)}px ${font}`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(String(f.n), bx, r * 0.08);
          }
          ctx.restore();
        }
        ctx.globalAlpha = 1;
      }

      // Батискаф: луч фары, сам он (наклон по ходу), мигает после медузы.
      const sub = img.get('sub');
      if (ready(sub)) {
        const [iw, ih] = sizeOf(sub);
        const sw = subW;
        const sh = (sw * ih) / iw;
        const tilt = s.started ? Math.max(-0.35, Math.min(0.35, s.sub.vy * 0.5)) : 0;
        ctx.save();
        ctx.translate(subX, subY);
        ctx.rotate(tilt);
        ctx.globalCompositeOperation = 'lighter';
        const beam = ctx.createLinearGradient(sw * 0.4, 0, sw * 1.6, 0);
        beam.addColorStop(0, 'rgba(255,250,200,0.38)');
        beam.addColorStop(1, 'rgba(255,250,200,0)');
        ctx.fillStyle = beam;
        ctx.beginPath();
        ctx.moveTo(sw * 0.4, -sh * 0.03);
        ctx.lineTo(sw * 1.7, -sh * 0.45);
        ctx.lineTo(sw * 1.7, sh * 0.5);
        ctx.lineTo(sw * 0.4, sh * 0.1);
        ctx.closePath();
        ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
        if (now < s.safeUntil) ctx.globalAlpha = Math.floor(now / 120) % 2 ? 0.35 : 1;
        ctx.drawImage(sub, -sw / 2, -sh / 2, sw, sh);
        ctx.restore();
        ctx.globalAlpha = 1;
      }

      // Пузыри, искры и жемчуг поверх всего.
      for (const p of s.particles) {
        if (p.kind === 'mote') continue;
        const fade = 1 - p.age / p.life;
        if (p.kind === 'bubble') {
          ctx.globalAlpha = Math.min(1, fade * 3) * 0.8;
          ctx.strokeStyle = 'rgba(255,255,255,0.8)';
          ctx.lineWidth = 1.4;
          ctx.fillStyle = 'rgba(200,240,255,0.18)';
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = 'rgba(255,255,255,0.9)';
          ctx.beginPath();
          ctx.arc(p.x - p.r * 0.35, p.y - p.r * 0.35, p.r * 0.25, 0, Math.PI * 2);
          ctx.fill();
        } else if (p.kind === 'spark') {
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = fade;
          ctx.fillStyle = p.color;
          const r = p.r * (0.5 + fade * 0.5);
          ctx.beginPath();
          for (let k = 0; k < 8; k++) {
            const a = (k * Math.PI) / 4 + p.age * 4;
            const rr = k % 2 ? r * 0.4 : r;
            ctx.lineTo(p.x + Math.cos(a) * rr, p.y + Math.sin(a) * rr);
          }
          ctx.closePath();
          ctx.fill();
          ctx.globalCompositeOperation = 'source-over';
        } else {
          const pearl = img.get('pearl');
          ctx.globalAlpha = Math.min(1, fade * 2);
          const g = ctx.createRadialGradient(p.x - p.r * 0.3, p.y - p.r * 0.3, 0, p.x, p.y, p.r);
          g.addColorStop(0, '#ffffff');
          g.addColorStop(1, '#d9d2f0');
          ctx.fillStyle = ready(pearl) ? g : '#fff';
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }

      // Тёмные водоросли у самой «камеры» — для глубины.
      drawRow(front, 1.7, h * 1.04, t, shaded);
      if (vignette) ctx.drawImage(vignette, 0, 0, w, h);

      // Для e2e: где сейчас рыбки (браузер под управлением теста).
      if (webdriver && frameNo % 5 === 0 && root.current) {
        root.current.dataset.swimmers = JSON.stringify(
          s.swimmers
            .filter((f) => f.caughtAt === null && !f.leaving && !f.shooed)
            .map((f) => ({
              x: Math.round(f.x * w),
              y: Math.round(f.y * h),
              good: isGood(task(), f),
              jelly: f.kind === 'jelly',
            })),
        );
        root.current.dataset.sub = `${Math.round(subX)},${Math.round(subY)}`;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const point = (e: React.PointerEvent) => {
    const box = root.current!.getBoundingClientRect();
    live.current.target = {
      x: (e.clientX - box.left) / box.width,
      y: (e.clientY - box.top) / box.height,
    };
  };
  const press = (e: React.PointerEvent) => {
    if ((e.target as Element).closest('.corner-button')) return;
    root.current?.setPointerCapture?.(e.pointerId);
    point(e);
    if (!live.current.started) {
      live.current.started = true;
      setStarted(true);
    }
  };

  const current = tasks[round]!;
  const need = needOf(current);
  return (
    <div
      className="game dive"
      data-testid="game-dive"
      data-round={round}
      data-caught={caught}
      data-need={need}
      data-task={current.kind === 'color' ? `color:${current.color}` : `number:${current.n}`}
      data-no-idle={started || undefined}
      ref={root}
      onPointerDown={press}
      onPointerMove={(e) => (e.buttons || e.pointerType === 'touch') && point(e)}
    >
      <canvas ref={canvas} className="dive-canvas" />
      <div className="dive-count" aria-hidden>
        {Array.from({ length: need }, (_, i) => (
          <span key={`${round}-${i}`} className={i < caught ? 'got' : undefined}>
            {current.kind === 'color' ? (
              <img src={diveUrl(`fish-${current.color}`)} alt="" draggable={false} />
            ) : (
              <>
                <img src={diveUrl('fish-blue')} alt="" draggable={false} />
                <b>{current.n}</b>
              </>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}
