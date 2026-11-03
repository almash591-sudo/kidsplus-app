// «Смешай краски» (этап 57). На столе тюбики, посередине стеклянная баночка, сверху листок с
// серым предметом. Ребёнок нажимает на тюбик — капля летит в баночку, по краске бегут волны,
// новый цвет расплывается завитками и смешивается. Получился нужный цвет — кисточка макает в
// баночку и раскрашивает предмет (тыква становится оранжевой), предмет оживает. Лишняя краска —
// водоворот, баночка пустеет, и совёнок подсказывает, что смешать. Со ступенями — лишние тюбики,
// «что получится?», оттенки с белым и коричневый из трёх красок. Всё — один canvas.
import { useEffect, useRef, useState } from 'react';
import { PAINT_RECIPES, type PaintTarget, type PaintTube } from '@kidsplus/shared/games';
import { fx } from '../fx';
import {
  PAINTS_OTHER,
  PAINTS_PROMPT,
  paintName,
  paintsGot,
  paintsGuess,
  paintsIs,
  paintsMore,
  paintsNeed,
  paintsOver,
  paintsRecipe,
  paintsTask,
  paintsYes,
} from '../phrases';
import { afterSpeech, bump, nice, praise, retry, say, setTask, type GameProps } from './common';
import {
  CAPACITY,
  css,
  guessChoices,
  hintNow,
  judge,
  mixColor,
  NO_DROPS,
  planRounds,
  targetRgb,
  TUBE_RGB,
  tubesFor,
  type Drops,
  type Rgb,
} from './paintsLogic';

type Phase = 'enter' | 'guess' | 'mix' | 'drain' | 'paint' | 'alive' | 'next' | 'finish';
const url = (s: string) => `/games/paints-${s}.webp`;
const COLORS = ['#ef4444', '#facc15', '#3b82f6', '#22c55e', '#a855f7', '#fb923c'];
/** Точек на поверхности краски (волны — пружинки между соседями). */
const WAVE = 24;
/** Полёт капли, с. */
const FLY = 0.42;
/** Кисточка: к баночке, макнуть, к листку, раскрасить, улететь (секунды от начала). */
const BRUSH = { jar: 0.5, dip: 0.9, card: 1.4, done: 3.2, away: 3.6 };
/** Мазки кисточки по предмету (доли картинки) — зигзагом сверху вниз. */
const STROKES: readonly [number, number][] = [
  [0.2, 0.1],
  [0.8, 0.18],
  [0.15, 0.34],
  [0.85, 0.44],
  [0.15, 0.6],
  [0.85, 0.7],
  [0.25, 0.86],
  [0.75, 0.92],
];

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
/** Капля краски в полёте от тюбика к баночке. */
interface Flying {
  tube: PaintTube;
  x0: number;
  y0: number;
  x1: number;
  at: number;
}
/** Брызги в баночке и завитки нового цвета в краске. */
interface Splash {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  age: number;
  color: string;
}
interface Swirl {
  x: number;
  y: number;
  age: number;
  color: Rgb;
  spin: number;
}
interface Bubble {
  x: number;
  y: number;
  r: number;
  vy: number;
}
interface Jar {
  /** Середина. */
  x: number;
  /** Дно. */
  y: number;
  w: number;
  h: number;
}
interface Lay {
  card: { x: number; y: number; s: number };
  jar: Jar;
  /** Тюбики: середина, низ, высота. */
  tubes: { x: number; y: number; h: number }[];
  chips: { x: number; y: number };
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const mixRgb = (a: Rgb, b: Rgb, t: number): Rgb => [
  lerp(a[0], b[0], t),
  lerp(a[1], b[1], t),
  lerp(a[2], b[2], t),
];
const WHITE: Rgb = [255, 255, 255];
const BLACK: Rgb = [20, 10, 30];
const ease = (k: number) => (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2);
const easeOut = (k: number) => 1 - (1 - k) ** 3;
const back = (k: number) => 1 + 2.7 * (k - 1) ** 3 + 1.7 * (k - 1) ** 2;
const clamp01 = (k: number) => Math.max(0, Math.min(1, k));
const total = (d: Drops) => d.red + d.yellow + d.blue + d.white;
/** Сколько баночки занято: уже одна капля — заметная лужица. */
const levelOf = (d: Drops) => (total(d) ? 0.14 + (0.86 * total(d)) / CAPACITY : 0);

export function Paints({ spec, phrases, onFinish }: GameProps<'paints'>) {
  const [rounds] = useState(() => planRounds(spec));
  const [round, setRound] = useState(0);
  const [phase, setPhase] = useState<Phase>('enter');
  const [choices, setChoices] = useState<PaintTarget[]>([]);
  const root = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const hint = useRef<HTMLDivElement>(null);
  const pick = useRef<(c: PaintTarget, el: HTMLElement) => void>(() => {});

  useEffect(() => {
    const el = root.current!;
    const cv = canvas.current!;
    const ctx = cv.getContext('2d')!;
    const img = new Map<string, HTMLImageElement>();
    const load = (name: string) => {
      if (img.has(name)) return;
      const i = new Image();
      i.src = url(name);
      img.set(name, i);
    };
    ['bg', 'tube', 'brush'].forEach(load);
    rounds.forEach((r) => load(r.object.id));
    const sizeOf = (im: HTMLImageElement | HTMLCanvasElement): [number, number] =>
      im instanceof HTMLImageElement ? [im.naturalWidth, im.naturalHeight] : [im.width, im.height];
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
    const webdriver = navigator.webdriver;
    /** Часы игры, мс: идут только с кадрами — погашенный экран ставит игру на паузу. */
    let clock = 0;

    const s = {
      round: 0,
      phase: 'enter' as Phase,
      phaseAt: 0,
      roundAt: 0,
      drops: { ...NO_DROPS } as Drops,
      tubes: [] as PaintTube[],
      /** Цвет в баночке сейчас (плавно идёт к цвету смеси). */
      shown: null as Rgb | null,
      level: 0,
      drainFrom: 0,
      whirl: 0,
      /** Как сильно краска взболтана — завитки и пузырьки. */
      stir: 0,
      u: new Float32Array(WAVE),
      v: new Float32Array(WAVE),
      flying: [] as Flying[],
      splash: [] as Splash[],
      swirls: [] as Swirl[],
      bubbles: [] as Bubble[],
      particles: [] as Particle[],
      squeeze: new Map<PaintTube, number>(),
      /** Показывать ли «красная + жёлтая» над баночкой. */
      showRecipe: false,
      named: false,
      lastMore: null as PaintTube | null,
      lastMoreAt: 0,
      hintTube: null as PaintTube | null,
      hintAt: 0,
      /** Разовые события фазы (звук водоворота, мазок кисточки) — сбрасываются в go. */
      once: new Set<string>(),
      stopped: false,
    };
    const once = (key: string) => !s.once.has(key) && !!s.once.add(key);
    const cur = () => rounds[s.round]!;
    const need = () => PAINT_RECIPES[cur().target];
    const go = (p: Phase) => {
      s.phase = p;
      s.phaseAt = clock;
      s.once.clear();
      setPhase(p);
    };
    const taskText = () => paintsTask(cur().object, cur().target);

    /** «Ушко» и подсказка при бездействии: что делать сейчас. */
    const remind = () => {
      const t = cur().target;
      if (s.phase === 'guess' || (spec.guess && s.phase === 'enter')) return say(paintsGuess(t));
      if (s.phase !== 'mix') return say(taskText());
      const now = clock;
      const d = s.drops;
      if (!total(d)) {
        s.showRecipe = true;
        s.hintTube = need()[0]!;
        s.hintAt = now;
        return say(taskText(), paintsRecipe(t));
      }
      const v = judge(d, t);
      if (v.kind === 'more') {
        s.showRecipe = true;
        s.hintTube = v.tube;
        s.hintAt = now;
        return say(paintsMore(v.tube));
      }
      return say(taskText());
    };

    const startRound = () => {
      const r = cur();
      s.roundAt = clock;
      s.drops = { ...NO_DROPS };
      s.tubes = tubesFor(spec.tubes, r.target);
      s.showRecipe = spec.tubes === 'needed';
      s.named = false;
      s.hintTube = null;
      s.lastMore = null;
      setRound(s.round);
      go('enter');
      if (spec.guess) {
        setChoices(guessChoices(r.target, spec.colors));
        void say(paintsGuess(r.target));
      } else {
        // В первый раз — как играть, потом задание.
        void say(
          ...(s.round === 0 ? [PAINTS_PROMPT] : []),
          taskText(),
          ...(spec.tubes === 'needed' ? [paintsRecipe(r.target)] : []),
        );
      }
      setTask(remind);
    };

    pick.current = (c, btn) => {
      if (s.phase !== 'guess') return;
      const t = cur().target;
      if (c !== t) {
        void retry(phrases);
        return;
      }
      nice(btn);
      s.showRecipe = true;
      go('mix');
      void say(paintsYes(t));
    };

    /** Где что: стоя — листок сверху, баночка посередине, тюбики внизу; лёжа — слева направо. */
    const layout = (): Lay => {
      const n = Math.max(1, s.tubes.length);
      if (w > h) {
        // Слева — совёнок под кнопкой «Домой», правее листок, баночка и тюбики на столе.
        const left = 100;
        const top = 86;
        const bottom = 14;
        const avail = h - top - bottom;
        const cs = Math.min((w - left) * 0.24, avail * 0.62);
        const jh = Math.min(avail * 0.92, (w - left) * 0.34);
        const jw = jh * 0.8;
        const jx = left + cs + 24 + jw / 2;
        const x0 = jx + jw / 2 + 16;
        const slot = (w - 12 - x0) / n;
        const th = Math.min(avail * 0.62, slot * 1.75);
        return {
          card: { x: left + cs / 2 + 4, y: top + cs / 2 + 6, s: cs },
          jar: { x: jx, y: h - bottom - 8, w: jw, h: jh },
          tubes: Array.from({ length: n }, (_, i) => ({
            x: x0 + slot * (i + 0.5),
            y: h - bottom,
            h: th,
          })),
          chips: { x: left + cs / 2 + 4, y: top + cs + 36 },
        };
      }
      // Стоя: совёнок рядом с «Домой» — листок ниже него.
      const top = 96;
      const bottom = 16;
      const avail = h - top - bottom;
      const cs = Math.min(w * 0.56, avail * 0.28);
      const sw = (w - 24) / Math.max(n, 3);
      const th = Math.min(avail * 0.2, sw * 1.3);
      const regionTop = top + cs + 50;
      const regionBot = h - bottom - th - 30;
      const jh = Math.max(80, Math.min(regionBot - regionTop, w * 0.72));
      const tw = (w - 24) / n;
      return {
        card: { x: w / 2, y: top + cs / 2, s: cs },
        jar: { x: w / 2, y: regionTop + (regionBot - regionTop + jh) / 2, w: jh * 0.8, h: jh },
        tubes: Array.from({ length: n }, (_, i) => ({
          x: 12 + tw * (i + 0.5),
          y: h - bottom,
          h: th,
        })),
        chips: { x: w / 2, y: top + cs + 25 },
      };
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(el);

    // ─── Картинки: перекрашенные тюбики и кисточка, серый предмет ───
    const tinted = new Map<string, HTMLCanvasElement>();
    /** Белая глина, перекрашенная в цвет ниже доли from (колпачок тюбика остаётся белым). */
    const tint = (name: string, color: Rgb, from: number) => {
      const base = ok(name);
      if (!base) return undefined;
      const key = `${name}:${color.join(',')}:${from}`;
      let c = tinted.get(key);
      if (!c) {
        c = document.createElement('canvas');
        c.width = base.naturalWidth;
        c.height = base.naturalHeight;
        const x = c.getContext('2d')!;
        x.drawImage(base, 0, 0);
        x.globalCompositeOperation = 'multiply';
        x.fillStyle = css(color);
        x.fillRect(0, c.height * from, c.width, c.height * (1 - from));
        x.globalCompositeOperation = 'destination-in';
        x.drawImage(base, 0, 0);
        tinted.set(key, c);
      }
      return c;
    };
    const tubeImg = (t: PaintTube) =>
      t === 'white' ? ok('tube') : tint('tube', TUBE_RGB[t], 0.14);

    /** Предмет: цветной и серый (некрашеная глина) — уменьшенные копии для листка. */
    const pics = new Map<string, { color: HTMLCanvasElement; gray: HTMLCanvasElement }>();
    const picOf = (id: string) => {
      const have = pics.get(id);
      if (have) return have;
      const base = ok(id);
      if (!base) return undefined;
      const k = Math.min(1, 480 / Math.max(base.naturalWidth, base.naturalHeight));
      const pw = Math.round(base.naturalWidth * k);
      const ph = Math.round(base.naturalHeight * k);
      const make = () => {
        const c = document.createElement('canvas');
        c.width = pw;
        c.height = ph;
        return c;
      };
      const color = make();
      color.getContext('2d')!.drawImage(base, 0, 0, pw, ph);
      // Серый — вручную по пикселям: ctx.filter в WebKit работает не везде.
      const gray = make();
      const gx = gray.getContext('2d')!;
      gx.drawImage(base, 0, 0, pw, ph);
      const data = gx.getImageData(0, 0, pw, ph);
      const p = data.data;
      for (let i = 0; i < p.length; i += 4) {
        const l = 0.299 * p[i]! + 0.587 * p[i + 1]! + 0.114 * p[i + 2]!;
        const g = 0.5 * l + 0.5 * 228;
        p[i] = g;
        p[i + 1] = g;
        p[i + 2] = g + 4;
      }
      gx.putImageData(data, 0, 0);
      const out = { color, gray };
      pics.set(id, out);
      return out;
    };
    /** Маска мазков кисточки и слой «цветное под маской». */
    const mask = document.createElement('canvas');
    const layer = document.createElement('canvas');

    // ─── Баночка ───
    const jarPath = (j: Jar, inset = 0) => {
      const L = j.x - j.w / 2 + inset;
      const R = j.x + j.w / 2 - inset;
      const B = j.y - inset;
      const T = j.y - j.h + inset * 0.5;
      const nw = j.w * 0.34 - inset;
      const sh = T + j.h * 0.2;
      const r = j.w * 0.2;
      ctx.beginPath();
      ctx.moveTo(j.x - nw, T);
      ctx.lineTo(j.x - nw, T + j.h * 0.07);
      ctx.bezierCurveTo(j.x - nw, T + j.h * 0.13, L, T + j.h * 0.1, L, sh);
      ctx.lineTo(L, B - r);
      ctx.quadraticCurveTo(L, B, L + r, B);
      ctx.lineTo(R - r, B);
      ctx.quadraticCurveTo(R, B, R, B - r);
      ctx.lineTo(R, sh);
      ctx.bezierCurveTo(R, T + j.h * 0.1, j.x + nw, T + j.h * 0.13, j.x + nw, T + j.h * 0.07);
      ctx.lineTo(j.x + nw, T);
      ctx.closePath();
    };
    /** Высота полной баночки краской. */
    const fullOf = (j: Jar) => j.h * 0.72;
    const surfaceAt = (j: Jar, x: number) => {
      const i = Math.round(((x - (j.x - j.w / 2)) / j.w) * (WAVE - 1));
      return j.y - s.level * fullOf(j) + (s.u[Math.max(0, Math.min(WAVE - 1, i))] ?? 0);
    };
    /** Капля упала — волна вокруг места падения. */
    const kick = (j: Jar, x: number, power: number) => {
      const c = Math.round(((x - (j.x - j.w / 2)) / j.w) * (WAVE - 1));
      for (let d = -3; d <= 3; d++) {
        const i = c + d;
        if (i < 0 || i >= WAVE) continue;
        s.v[i] = s.v[i]! + power * j.w * (1 - Math.abs(d) / 4);
      }
    };
    const waves = (dt: number) => {
      const steps = 3;
      const k = dt / steps;
      for (let n = 0; n < steps; n++) {
        for (let i = 0; i < WAVE; i++) {
          const l = s.u[Math.max(0, i - 1)]!;
          const r = s.u[Math.min(WAVE - 1, i + 1)]!;
          const a = -70 * s.u[i]! - 3.4 * s.v[i]! + 320 * (l + r - 2 * s.u[i]!);
          s.v[i] = s.v[i]! + a * k;
        }
        for (let i = 0; i < WAVE; i++) s.u[i] = s.u[i]! + s.v[i]! * k;
      }
    };

    const drawJar = (j: Jar, now: number, t: number) => {
      const L = j.x - j.w / 2;
      const R = j.x + j.w / 2;
      const T = j.y - j.h;
      // Тень на столе и задняя стенка.
      ctx.fillStyle = 'rgba(70,40,20,0.22)';
      ctx.beginPath();
      ctx.ellipse(j.x, j.y + 4, j.w * 0.56, j.w * 0.09, 0, 0, Math.PI * 2);
      ctx.fill();
      jarPath(j);
      ctx.fillStyle = 'rgba(235,248,255,0.42)';
      ctx.fill();

      ctx.save();
      jarPath(j, 3);
      ctx.clip();
      const c = s.shown;
      if (c && s.level > 0.004) {
        const top = j.y - s.level * fullOf(j);
        const depth = s.whirl * j.h * 0.22;
        const surf = (i: number) => {
          const x = L + (j.w * i) / (WAVE - 1);
          const g = Math.exp(-(((x - j.x) / (j.w * 0.17)) ** 2));
          return top + s.u[i]! + depth * g;
        };
        ctx.beginPath();
        ctx.moveTo(L - 4, j.y + 4);
        for (let i = 0; i < WAVE; i++) ctx.lineTo(L + (j.w * i) / (WAVE - 1), surf(i));
        ctx.lineTo(R + 4, j.y + 4);
        ctx.closePath();
        const g = ctx.createLinearGradient(0, top, 0, j.y);
        g.addColorStop(0, css(mixRgb(c, WHITE, 0.18)));
        g.addColorStop(0.5, css(c));
        g.addColorStop(1, css(mixRgb(c, BLACK, 0.22)));
        ctx.fillStyle = g;
        ctx.fill();
        ctx.save();
        ctx.clip();
        // Завитки нового цвета: расплываются и тают.
        for (const sw of s.swirls) {
          const k = sw.age / 1.6;
          const r = j.w * (0.08 + 0.3 * easeOut(k));
          const a = sw.spin * sw.age * 3;
          const x = sw.x + Math.cos(a) * r * 0.35;
          const y = sw.y + Math.sin(a) * r * 0.2 + k * j.h * 0.12;
          const rg = ctx.createRadialGradient(x, y, 0, x, y, r);
          rg.addColorStop(0, css(sw.color, 0.85 * (1 - k)));
          rg.addColorStop(1, css(sw.color, 0));
          ctx.fillStyle = rg;
          ctx.fillRect(x - r, y - r, r * 2, r * 2);
        }
        // Светлые струи, пока краска взболтана, и воронка водоворота.
        const swirlA = Math.max(s.stir * 0.5, s.whirl * 0.8);
        if (swirlA > 0.02) {
          ctx.strokeStyle = css(mixRgb(c, WHITE, 0.45), swirlA);
          ctx.lineWidth = Math.max(2, j.w * 0.025);
          ctx.lineCap = 'round';
          const cy = top + (j.y - top) * 0.45;
          for (let i = 0; i < 3; i++) {
            const rx = j.w * (0.36 - i * 0.1) * (1 - s.whirl * 0.4);
            const a0 = t * (2 + s.whirl * 9) + i * 2.1;
            ctx.beginPath();
            ctx.ellipse(j.x, cy + i * j.h * 0.06, rx, rx * 0.28, 0, a0, a0 + 2.2);
            ctx.stroke();
          }
        }
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        for (const b of s.bubbles) {
          ctx.beginPath();
          ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
        // Блестящая кромка поверхности.
        ctx.beginPath();
        for (let i = 0; i < WAVE; i++) ctx.lineTo(L + (j.w * i) / (WAVE - 1), surf(i) + 1.5);
        ctx.strokeStyle = css(mixRgb(c, WHITE, 0.55), 0.8);
        ctx.lineWidth = 3;
        ctx.stroke();
      }
      // Брызги и капли в полёте — внутри стекла.
      for (const sp of s.splash) {
        ctx.fillStyle = sp.color;
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, sp.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      drawFlying(now);

      // Стекло: блики и кромка.
      jarPath(j);
      const gg = ctx.createLinearGradient(L, 0, R, 0);
      gg.addColorStop(0, 'rgba(255,255,255,0.4)');
      gg.addColorStop(0.2, 'rgba(255,255,255,0.08)');
      gg.addColorStop(0.65, 'rgba(255,255,255,0.03)');
      gg.addColorStop(0.9, 'rgba(255,255,255,0.18)');
      gg.addColorStop(1, 'rgba(255,255,255,0.34)');
      ctx.fillStyle = gg;
      ctx.fill();
      ctx.lineWidth = 5;
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.stroke();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = 'rgba(70,100,140,0.55)';
      ctx.stroke();
      ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.lineWidth = j.w * 0.055;
      ctx.beginPath();
      ctx.moveTo(L + j.w * 0.13, T + j.h * 0.3);
      ctx.lineTo(L + j.w * 0.13, j.y - j.h * 0.22);
      ctx.stroke();
      ctx.lineWidth = j.w * 0.03;
      ctx.beginPath();
      ctx.moveTo(R - j.w * 0.12, T + j.h * 0.34);
      ctx.lineTo(R - j.w * 0.12, T + j.h * 0.44);
      ctx.stroke();
      // Горлышко.
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.beginPath();
      ctx.ellipse(j.x, T + 1, j.w * 0.34 + 2, j.h * 0.022, 0, 0, Math.PI * 2);
      ctx.stroke();
    };

    // ─── Капли ───
    const dropPos = (f: Flying, now: number) => {
      const j = layout().jar;
      const k = clamp01((now - f.at) / 1000 / FLY);
      const y1 = surfaceAt(j, f.x1);
      const cx = (f.x0 + f.x1) / 2;
      const cy = Math.min(f.y0, j.y - j.h) - Math.max(60, j.h * 0.35);
      const x = (1 - k) ** 2 * f.x0 + 2 * (1 - k) * k * cx + k * k * f.x1;
      const y = (1 - k) ** 2 * f.y0 + 2 * (1 - k) * k * cy + k * k * y1;
      const vx = 2 * (1 - k) * (cx - f.x0) + 2 * k * (f.x1 - cx);
      const vy = 2 * (1 - k) * (cy - f.y0) + 2 * k * (y1 - cy);
      return { x, y, a: Math.atan2(vy, vx), k };
    };
    const drawFlying = (now: number) => {
      const j = layout().jar;
      for (const f of s.flying) {
        const p = dropPos(f, now);
        const r = Math.max(7, j.w * 0.055);
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.a + Math.PI / 2);
        ctx.fillStyle = css(TUBE_RGB[f.tube]);
        ctx.strokeStyle = 'rgba(60,40,40,0.25)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(0, r * 2.1);
        ctx.bezierCurveTo(r * 0.9, r * 0.9, r, 0, r, -0.1 * r);
        ctx.arc(0, 0, r, 0, Math.PI, true);
        ctx.bezierCurveTo(-r, 0, -r * 0.9, r * 0.9, 0, r * 2.1);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.beginPath();
        ctx.arc(-r * 0.35, -r * 0.3, r * 0.28, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    };
    /** Капля долетела: брызги, волна, завиток, и что сказать. */
    const land = (f: Flying, now: number) => {
      const j = layout().jar;
      const y = surfaceAt(j, f.x1);
      const rgb = TUBE_RGB[f.tube];
      s.drops = { ...s.drops, [f.tube]: s.drops[f.tube] + 1 };
      if (!s.shown) s.shown = rgb;
      fx.drop();
      kick(j, f.x1, 0.55);
      s.stir = 1;
      s.swirls.push({
        x: f.x1,
        y: y + j.h * 0.06,
        age: 0,
        color: rgb,
        spin: Math.random() < 0.5 ? -1 : 1,
      });
      for (let i = 0; i < 9; i++) {
        const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2;
        const v = 140 + Math.random() * 200;
        s.splash.push({
          x: f.x1,
          y,
          vx: Math.cos(a) * v,
          vy: Math.sin(a) * v,
          r: 2 + Math.random() * 3.5,
          age: 0,
          color: css(rgb),
        });
      }
      for (let i = 0; i < 5; i++)
        s.bubbles.push({
          x: j.x + (Math.random() - 0.5) * j.w * 0.6,
          y: j.y - 6 - Math.random() * 10,
          r: 1.5 + Math.random() * 3,
          vy: 30 + Math.random() * 50,
        });

      const t = cur().target;
      const v = judge(s.drops, t);
      if (v.kind === 'done') {
        go('paint');
        s.hintTube = null;
        void say(paintsGot(t));
        return;
      }
      if (v.kind === 'wrong' || v.kind === 'over') {
        bump();
        s.showRecipe = true;
        s.hintTube = null;
        go('drain');
        if (v.kind === 'over') void say(paintsOver(v.tube));
        else if (v.got && v.got in TUBE_RGB) void say(paintsIs(v.got as PaintTube), paintsNeed(t));
        else void say(v.got ? paintsGot(v.got as PaintTarget) : PAINTS_OTHER, paintsNeed(t));
        return;
      }
      if (s.hintTube === v.tube) s.hintTube = null;
      if (hintNow(s.drops, v)) {
        if (v.tube !== s.lastMore || now - s.lastMoreAt > 3000) void say(paintsMore(v.tube));
        s.lastMore = v.tube;
        s.lastMoreAt = now;
      } else if (!s.named) void say(paintsIs(f.tube));
      s.named = true;
    };

    // ─── Листок с предметом и кисточка ───
    /** Где на экране точка предмета (доли картинки). */
    const cardPoint = (lay: Lay, px: number, py: number) => {
      const pic = picOf(cur().object.id);
      const { x, y, s: cs } = lay.card;
      const box = cs * 0.8;
      const ar = pic ? pic.color.width / pic.color.height : 1;
      const dw = ar >= 1 ? box : box * ar;
      const dh = ar >= 1 ? box / ar : box;
      return { x: x + (px - 0.5) * dw, y: y + (py - 0.5) * dh };
    };
    /** Длина зигзага мазков и точка на нём (доля 0..1) — в долях картинки. */
    const strokeAt = (k: number) => {
      const segs = STROKES.slice(1).map((p, i) =>
        Math.hypot(p[0] - STROKES[i]![0], p[1] - STROKES[i]![1]),
      );
      const all = segs.reduce((a, b) => a + b, 0);
      let left = k * all;
      for (let i = 0; i < segs.length; i++) {
        const a = STROKES[i]!;
        const b = STROKES[i + 1]!;
        if (left <= segs[i]!) {
          const q = left / segs[i]!;
          return { x: lerp(a[0], b[0], q), y: lerp(a[1], b[1], q), i };
        }
        left -= segs[i]!;
      }
      const end = STROKES[STROKES.length - 1]!;
      return { x: end[0], y: end[1], i: segs.length };
    };
    const drawCard = (lay: Lay, now: number) => {
      const { x, y, s: cs } = lay.card;
      const since = (now - s.phaseAt) / 1000;
      const sinceRound = (now - s.roundAt) / 1000;
      let dx = 0;
      let dy = 0;
      let rot = -0.035;
      if (s.phase === 'enter' || sinceRound < 0.7) {
        const e = back(clamp01(sinceRound / 0.7));
        dy = -(1 - e) * (y + cs);
        rot += (1 - e) * 0.3;
      }
      if (s.phase === 'next') {
        const k = clamp01(since / 0.7) ** 2;
        dx = -k * (x + cs * 1.2);
        rot -= k * 0.4;
      }
      ctx.save();
      ctx.translate(x + dx, y + dy);
      ctx.rotate(rot);
      ctx.shadowColor = 'rgba(60,30,10,0.3)';
      ctx.shadowBlur = 16;
      ctx.shadowOffsetY = 6;
      ctx.fillStyle = '#fffdf8';
      ctx.beginPath();
      ctx.roundRect(-cs / 2, -cs / 2, cs, cs, cs * 0.07);
      ctx.fill();
      ctx.shadowColor = 'transparent';
      // Полоски скотча по углам.
      ctx.fillStyle = 'rgba(250,230,170,0.75)';
      for (const sx of [-1, 1]) {
        ctx.save();
        ctx.translate((sx * cs) / 2.4, -cs / 2);
        ctx.rotate(sx * 0.6);
        ctx.fillRect(-cs * 0.1, -cs * 0.03, cs * 0.2, cs * 0.06);
        ctx.restore();
      }
      const pic = picOf(cur().object.id);
      if (pic) {
        const box = cs * 0.8;
        const ar = pic.color.width / pic.color.height;
        let dw = ar >= 1 ? box : box * ar;
        let dh = ar >= 1 ? box / ar : box;
        let lift = 0;
        let wob = 0;
        if (s.phase === 'alive' || s.phase === 'finish') {
          const ta = (now - s.phaseAt) / 1000;
          const k = Math.exp(-ta * 2.2);
          const sq = Math.sin(ta * 13) * 0.1 * k;
          dw *= 1 + sq;
          dh *= 1 - sq;
          lift = Math.abs(Math.sin(ta * 6.5)) * cs * 0.09 * k;
          wob = Math.sin(ta * 9) * 0.12 * k;
        }
        ctx.save();
        ctx.translate(0, dh / 2 - lift);
        ctx.rotate(wob);
        const done = s.phase === 'alive' || s.phase === 'next' || s.phase === 'finish';
        if (done) ctx.drawImage(pic.color, -dw / 2, -dh, dw, dh);
        else {
          ctx.drawImage(pic.gray, -dw / 2, -dh, dw, dh);
          const tp = (now - s.phaseAt) / 1000;
          if (s.phase === 'paint' && tp > BRUSH.card) {
            const pw = pic.color.width;
            const ph = pic.color.height;
            if (mask.width !== pw || mask.height !== ph) {
              mask.width = layer.width = pw;
              mask.height = layer.height = ph;
            }
            const k = clamp01((tp - BRUSH.card) / (BRUSH.done - BRUSH.card));
            const m = mask.getContext('2d')!;
            m.clearRect(0, 0, pw, ph);
            m.lineCap = 'round';
            m.lineJoin = 'round';
            m.lineWidth = Math.max(pw, ph) * 0.28;
            m.strokeStyle = '#000';
            const end = strokeAt(k);
            m.beginPath();
            m.moveTo(STROKES[0]![0] * pw, STROKES[0]![1] * ph);
            for (let i = 1; i <= end.i; i++) m.lineTo(STROKES[i]![0] * pw, STROKES[i]![1] * ph);
            m.lineTo(end.x * pw, end.y * ph);
            m.stroke();
            if (k >= 1) {
              m.globalAlpha = clamp01((tp - BRUSH.done) / 0.3);
              m.fillRect(0, 0, pw, ph);
              m.globalAlpha = 1;
            }
            const l = layer.getContext('2d')!;
            l.globalCompositeOperation = 'source-over';
            l.clearRect(0, 0, pw, ph);
            l.drawImage(mask, 0, 0);
            l.globalCompositeOperation = 'source-in';
            l.drawImage(pic.color, 0, 0);
            l.globalCompositeOperation = 'source-over';
            ctx.drawImage(layer, -dw / 2, -dh, dw, dh);
          }
        }
        ctx.restore();
      } else {
        ctx.fillStyle = '#e5e1da';
        ctx.beginPath();
        ctx.arc(0, 0, cs * 0.3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    };
    const drawBrush = (lay: Lay, now: number, t: number) => {
      if (s.phase !== 'paint') return;
      const im = ok('brush');
      if (!im) return;
      const tp = (now - s.phaseAt) / 1000;
      const j = lay.jar;
      const bh = Math.max(j.h * 0.7, lay.card.s * 0.75);
      const bw = (bh * im.naturalWidth) / im.naturalHeight;
      const start = { x: w + bw, y: -bh * 0.2 };
      const mouth = { x: j.x, y: j.y - j.h - 10 };
      const dip = { x: j.x, y: surfaceAt(j, j.x) + 8 };
      const p0 = cardPoint(lay, STROKES[0]![0], STROKES[0]![1]);
      let at: { x: number; y: number };
      let tilt = 0.45;
      if (tp < BRUSH.jar) {
        const k = ease(tp / BRUSH.jar);
        at = { x: lerp(start.x, mouth.x, k), y: lerp(start.y, mouth.y, k) };
      } else if (tp < BRUSH.dip) {
        const k = Math.sin(((tp - BRUSH.jar) / (BRUSH.dip - BRUSH.jar)) * Math.PI);
        at = { x: mouth.x, y: lerp(mouth.y, dip.y, k) };
        tilt = 0.15;
        if (k > 0.95 && once('dip')) kick(j, j.x, 0.25);
      } else if (tp < BRUSH.card) {
        const k = ease((tp - BRUSH.dip) / (BRUSH.card - BRUSH.dip));
        at = { x: lerp(mouth.x, p0.x, k), y: lerp(mouth.y, p0.y, k) };
      } else if (tp < BRUSH.done) {
        const p = strokeAt((tp - BRUSH.card) / (BRUSH.done - BRUSH.card));
        at = cardPoint(lay, p.x, p.y);
        tilt = 0.45 + Math.sin(t * 14) * 0.08;
      } else {
        const k = ease(clamp01((tp - BRUSH.done) / (BRUSH.away - BRUSH.done)));
        const end = cardPoint(lay, STROKES.at(-1)![0], STROKES.at(-1)![1]);
        at = { x: lerp(end.x, start.x, k), y: lerp(end.y, start.y, k) };
      }
      const pic =
        tp > (BRUSH.jar + BRUSH.dip) / 2 ? tint('brush', targetRgb(cur().target), 0.68) : im;
      if (!pic) return;
      ctx.save();
      ctx.translate(at.x, at.y);
      ctx.rotate(tilt);
      ctx.shadowColor = 'rgba(40,20,10,0.3)';
      ctx.shadowBlur = 10;
      ctx.shadowOffsetY = 5;
      ctx.drawImage(pic, -bw / 2, -bh, bw, bh);
      ctx.restore();
    };

    /** «Красная + жёлтая = ?» — кружки краски над баночкой. */
    const drawChips = (lay: Lay) => {
      if (!(s.showRecipe || s.phase === 'guess') || s.phase === 'next' || s.phase === 'finish')
        return;
      const parts = need();
      const r = Math.min(17, lay.card.s * 0.075);
      const gap = r * 1.5;
      const n = parts.length + 1;
      const width = n * 2 * r + (n - 1) * gap;
      const { x, y } = lay.chips;
      ctx.fillStyle = 'rgba(255,255,255,0.82)';
      ctx.beginPath();
      ctx.roundRect(x - width / 2 - r * 0.7, y - r * 1.4, width + r * 1.4, r * 2.8, r * 1.4);
      ctx.fill();
      ctx.font = `800 ${Math.round(r * 1.5)}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      let cx = x - width / 2 + r;
      const blob = (c: Rgb | null) => {
        ctx.beginPath();
        ctx.arc(cx, y, r, 0, Math.PI * 2);
        ctx.fillStyle = c ? css(c) : '#e5e7eb';
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = 'rgba(0,0,0,0.18)';
        ctx.stroke();
        if (!c) {
          ctx.fillStyle = '#6b7280';
          ctx.fillText('?', cx, y + 1);
        }
      };
      parts.forEach((p, i) => {
        blob(TUBE_RGB[p]);
        ctx.fillStyle = '#4b5563';
        ctx.fillText(i < parts.length - 1 ? '+' : '=', cx + r + gap / 2, y + 1);
        cx += 2 * r + gap;
      });
      blob(s.phase === 'guess' ? null : targetRgb(cur().target));
    };

    const drawTubes = (lay: Lay, now: number, t: number) => {
      const sinceRound = (now - s.roundAt) / 1000;
      s.tubes.forEach((tube, i) => {
        const p = lay.tubes[i];
        if (!p) return;
        const im = tubeImg(tube);
        const ar = im ? sizeOf(im)[0] / sizeOf(im)[1] : 0.5;
        const th = p.h;
        const tw = th * ar;
        const pop = back(clamp01((sinceRound - i * 0.08) / 0.45));
        const sq = clamp01(1 - (now - (s.squeeze.get(tube) ?? -1e9)) / 320);
        const toJar = Math.sign(lay.jar.x - p.x) || 1;
        // Подсказка: светлое пятно под нужным тюбиком.
        if (s.hintTube === tube && s.phase === 'mix') {
          const k = 0.5 + 0.5 * Math.sin((now - s.hintAt) / 180);
          ctx.fillStyle = `rgba(255,255,255,${0.35 + 0.4 * k})`;
          ctx.beginPath();
          ctx.ellipse(p.x, p.y - 2, tw * (0.75 + 0.15 * k), tw * 0.24, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.save();
        ctx.translate(p.x, p.y + Math.sin(t * 2.2 + i * 1.3) * 1.5);
        ctx.rotate(toJar * sq * 0.35 + Math.sin(t * 1.7 + i) * 0.015);
        ctx.scale(pop * (1 + sq * 0.16), pop * (1 - sq * 0.12));
        ctx.shadowColor = 'rgba(60,30,10,0.28)';
        ctx.shadowBlur = 8;
        ctx.shadowOffsetY = 4;
        if (im) ctx.drawImage(im, -tw / 2, -th, tw, th);
        else {
          ctx.fillStyle = css(TUBE_RGB[tube]);
          ctx.beginPath();
          ctx.roundRect(-tw / 2, -th, tw, th, tw * 0.2);
          ctx.fill();
        }
        ctx.restore();
      });
    };
    /** Куда смотрит носик тюбика — оттуда вылетает капля. */
    const nozzle = (lay: Lay, i: number) => {
      const p = lay.tubes[i]!;
      return { x: p.x, y: p.y - p.h * 0.95 };
    };

    const burst = (x: number, y: number, n: number, colors?: string[]) => {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const v = 120 + Math.random() * 280;
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
          color: COLORS[i % 6]!,
          kind: 'confetti',
          rot: Math.random() * 6,
        });
      }
    };
    const cover = (im: HTMLImageElement) => {
      const k = Math.max(w / im.naturalWidth, h / im.naturalHeight);
      const dw = im.naturalWidth * k;
      const dh = im.naturalHeight * k;
      ctx.drawImage(im, (w - dw) / 2, h - dh, dw, dh);
    };

    const frame = (raw: number) => {
      const gap = Math.max(0, raw - last);
      const dt = Math.min(0.05, gap / 1000);
      last = raw;
      // Медленные кадры — время идёт как настоящее; долгий перерыв (экран погас) — пауза.
      clock += Math.min(gap, 250);
      const now = clock;
      frameNo++;
      const t = now / 1000;
      const since = (now - s.phaseAt) / 1000;
      const lay = layout();
      const j = lay.jar;

      // ─── Фазы ───
      if (s.phase === 'enter' && since > 0.7) go(spec.guess ? 'guess' : 'mix');
      else if (s.phase === 'drain') {
        // Посмотреть на цвет, потом водоворот, и баночка пустая.
        if (since > 1.3) {
          if (once('whirl')) {
            s.drainFrom = s.level;
            fx.whoosh();
          }
          const k = clamp01((since - 1.3) / 1.1);
          s.whirl = Math.sin(k * Math.PI) * 0.9;
          s.level = s.drainFrom * (1 - k * k);
          if (k >= 1) {
            s.whirl = 0;
            s.level = 0;
            s.shown = null;
            s.drops = { ...NO_DROPS };
            s.swirls = [];
            s.named = false;
            s.lastMore = null;
            go('mix');
          }
        }
      } else if (s.phase === 'paint') {
        if (since > BRUSH.card && since < BRUSH.done) {
          const seg = strokeAt((since - BRUSH.card) / (BRUSH.done - BRUSH.card)).i;
          if (once(`stroke${seg}`)) fx.soft();
        }
        if (since > BRUSH.away) {
          go('alive');
          const c = lay.card;
          burst(c.x, c.y, 24);
          burst(c.x, c.y, 14, [css(targetRgb(cur().target))]);
          fx.sparkle();
          const r = s.round;
          if (r + 1 < rounds.length)
            void afterSpeech(praise(phrases), 1800).then(() => {
              if (!s.stopped && s.round === r) go('next');
            });
          else {
            confetti();
            fx.snap();
            void afterSpeech(praise(phrases), 2400).then(() => {
              if (!s.stopped) onFinish();
            });
            go('finish');
          }
        }
      } else if (s.phase === 'next') {
        if (once('whirl')) fx.whoosh();
        s.level = Math.max(0, s.level - dt * 1.6);
        s.whirl = Math.min(0.6, since);
        if (since > 0.9) {
          s.whirl = 0;
          s.level = 0;
          s.shown = null;
          s.swirls = [];
          s.round++;
          startRound();
        }
      }

      // ─── Краска ───
      const mix = mixColor(s.drops);
      if (mix && s.phase !== 'next' && s.phase !== 'drain')
        s.shown = s.shown ? mixRgb(s.shown, mix, 1 - Math.exp(-dt * 2.6)) : mix;
      if (s.phase !== 'drain' && s.phase !== 'next')
        s.level += (levelOf(s.drops) - s.level) * (1 - Math.exp(-dt * 6));
      s.stir = Math.max(0, s.stir - dt * 0.6);
      waves(dt);
      for (const f of [...s.flying]) {
        if ((now - f.at) / 1000 >= FLY) {
          s.flying = s.flying.filter((x) => x !== f);
          if (s.phase === 'mix') land(f, now);
        }
      }
      for (const sp of s.splash) {
        sp.age += dt;
        sp.x += sp.vx * dt;
        sp.y += sp.vy * dt;
        sp.vy += 900 * dt;
      }
      s.splash = s.splash.filter((sp) => sp.age < 0.7 && sp.y < surfaceAt(j, sp.x) + 4);
      for (const sw of s.swirls) sw.age += dt;
      s.swirls = s.swirls.filter((sw) => sw.age < 1.6);
      if (s.stir > 0.2 && Math.random() < s.stir * 0.3)
        s.bubbles.push({
          x: j.x + (Math.random() - 0.5) * j.w * 0.7,
          y: j.y - 6,
          r: 1.5 + Math.random() * 3,
          vy: 30 + Math.random() * 50,
        });
      for (const b of s.bubbles) {
        b.y -= b.vy * dt;
        b.x += Math.sin(b.y / 9) * 0.3;
      }
      s.bubbles = s.bubbles.filter((b) => b.y > surfaceAt(j, b.x) + b.r);

      // ─── Экран ───
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const bg = ok('bg');
      if (bg) cover(bg);
      else {
        ctx.fillStyle = '#f6e3c8';
        ctx.fillRect(0, 0, w, h);
      }
      ctx.fillStyle = 'rgba(255,248,236,0.3)';
      ctx.fillRect(0, 0, w, h);

      drawCard(lay, now);
      drawChips(lay);
      drawJar(j, now, t);
      drawTubes(lay, now, t);
      drawBrush(lay, now, t);

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

      if (frameNo % 6 === 0) {
        // Кнопки «что получится?» — посередине баночки.
        el.style.setProperty('--jar-x', `${Math.round(j.x)}px`);
        el.style.setProperty('--jar-y', `${Math.round(j.y - j.h * 0.42)}px`);
      }
      // Палец подсказки (IdleHint) показывает на тюбик, который нужен сейчас.
      if (frameNo % 6 === 0 && hint.current) {
        const v = s.phase === 'mix' ? judge(s.drops, cur().target) : null;
        const want = !v ? null : !total(s.drops) ? need()[0]! : v.kind === 'more' ? v.tube : null;
        const i = want ? s.tubes.indexOf(want) : -1;
        const p = lay.tubes[i];
        const hs = hint.current.style;
        if (p) {
          // Верхняя половина тюбика: палец под точкой не уйдёт за нижний край экрана.
          hs.display = 'block';
          hs.left = `${p.x - p.h * 0.3}px`;
          hs.top = `${p.y - p.h}px`;
          hs.width = `${p.h * 0.6}px`;
          hs.height = `${p.h * 0.5}px`;
        } else hs.display = 'none';
      }
      // Для автотестов — каждый кадр: фаза (React) не должна обгонять баночку.
      if (webdriver) {
        el.dataset.target = cur().target;
        el.dataset.need = JSON.stringify(need());
        el.dataset.tubes = JSON.stringify(
          s.tubes.map((tube, i) => {
            const p = lay.tubes[i]!;
            return { tube, x: Math.round(p.x), y: Math.round(p.y - p.h / 2) };
          }),
        );
        el.dataset.drops = JSON.stringify(s.drops);
        el.dataset.flying = String(s.flying.length);
      }
      raf = requestAnimationFrame(frame);
    };

    // ─── Касания: тюбик — капля ───
    const down = (e: PointerEvent) => {
      if ((e.target as Element).closest('.corner-button, .paints-choice')) return;
      if (s.phase !== 'mix' || s.flying.length) return;
      const box = el.getBoundingClientRect();
      const x = e.clientX - box.left;
      const y = e.clientY - box.top;
      const lay = layout();
      const i = lay.tubes.findIndex((p) => {
        const half = Math.max(p.h * 0.32, 34);
        return Math.abs(x - p.x) <= half && y >= p.y - p.h - 12 && y <= p.y + 12;
      });
      const tube = s.tubes[i];
      if (!tube) return;
      const now = clock;
      s.squeeze.set(tube, now);
      fx.tap();
      const from = nozzle(lay, i);
      const j = lay.jar;
      s.flying.push({
        tube,
        x0: from.x,
        y0: from.y,
        x1: j.x + (Math.random() - 0.5) * j.w * 0.3,
        at: now,
      });
    };
    el.addEventListener('pointerdown', down);

    let raf = 0;
    let last = performance.now();
    let frameNo = 0;
    startRound();
    raf = requestAnimationFrame(frame);
    return () => {
      s.stopped = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      el.removeEventListener('pointerdown', down);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const busy = phase !== 'mix' && phase !== 'guess';
  return (
    <div
      className="game paints"
      data-testid="game-paints"
      data-phase={phase}
      data-round={round}
      data-no-idle={busy || undefined}
      ref={root}
    >
      <canvas ref={canvas} className="paints-canvas" />
      <div ref={hint} className="paints-hint" data-hint={phase === 'mix' || undefined} />
      {phase === 'guess' && (
        <div className="paints-guess">
          {choices.map((c) => (
            <button
              key={`${round}-${c}`}
              type="button"
              className="paints-choice"
              data-testid={`paints-choice-${c}`}
              aria-label={paintName(c)}
              style={{ background: css(targetRgb(c)) }}
              onClick={(e) => pick.current(c, e.currentTarget)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
