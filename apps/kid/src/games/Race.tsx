// «Гонки» (этап 43). Машинка с совёнком мчится по дороге с поворотами и горками (псевдо-3D, как
// в старых аркадах): ребёнок ведёт её пальцем и проезжает в ворота с ответом — «Проезжай в
// красные ворота!», «…с цифрой три!». Верные ворота — рывок и обгон соперников, не те — машинка
// притормаживает, и задание повторяется у следующих ворот. Конусы только мешают. На финише —
// конфетти. Всё — один canvas: дорога из отрезков, деревья и домики вдоль неё, туман вдали.
import type { RaceColor } from '@kidsplus/shared/games';
import { useEffect, useRef, useState } from 'react';
import { fx } from '../fx';
import { RACE_CONE, RACE_FINISH, RACE_START } from '../phrases';
import { afterSpeech, ask, bump, praise, say, type GameProps } from './common';
import {
  buildTrack,
  gateValues,
  laneOf,
  LANES,
  raceTasks,
  ROAD,
  SEG,
  SPEED,
  steer,
  taskPhrase,
  wrongPhrase,
  type GateTask,
  type GateValue,
  type Scenery,
} from './raceLogic';

const SPRITES = [
  'car',
  'tree-round',
  'tree-pine',
  'tree-apple',
  'bush',
  'flowers',
  'rock',
  'house',
  'windmill',
  'gate',
  'finish',
  'cone',
  'sky',
] as const;
type Sprite = (typeof SPRITES)[number];
export const raceUrl = (s: Sprite) => `/games/race-${s}.webp`;
/** Ширина в мире — в долях полуширины дороги. */
const WIDTH: Record<Scenery | 'gate' | 'finish' | 'cone' | 'car', number> = {
  'tree-round': 1.15,
  'tree-pine': 0.85,
  'tree-apple': 1.15,
  bush: 0.6,
  flowers: 0.55,
  rock: 0.5,
  house: 1.2,
  windmill: 1.3,
  gate: 0.6,
  finish: 2.5,
  cone: 0.17,
  car: 0.56,
};
/** Табличка на воротах: центр (cx — доля ширины, cy — доля высоты) и радиус (доля ширины). */
const SIGN = { cx: 0.5, cy: 0.165, r: 0.1 };
const HEX: Record<RaceColor, string> = {
  red: '#ef4444',
  yellow: '#facc15',
  blue: '#3b82f6',
  green: '#22c55e',
  purple: '#a855f7',
  orange: '#fb923c',
};
const CAR_COLORS = ['#ef4444', '#3b82f6', '#22c55e'] as const;
const CAMERA_H = 1000;
const DEPTH = 1 / Math.tan((50 * Math.PI) / 180);
const PLAYER_Z = CAMERA_H * DEPTH;
const DRAW = 150;
/** Камера идёт за машинкой не полностью — машинка заметно ездит по экрану. */
const FOLLOW = 0.55;
const SKY = '#bfe6ff';
const FOG = [205, 232, 250];

type Phase = 'ready' | 'race' | 'finish';
type Drawable = HTMLImageElement | HTMLCanvasElement;
const ready = (d: Drawable | undefined): d is Drawable =>
  !!d && (d instanceof HTMLCanvasElement || (d.complete && d.naturalWidth > 0));
const sizeOf = (d: Drawable): [number, number] =>
  d instanceof HTMLCanvasElement ? [d.width, d.height] : [d.naturalWidth, d.naturalHeight];
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

interface Rival {
  z: number;
  x: number;
  target: number;
  color: number;
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
  kind: 'dust' | 'spark' | 'confetti';
  rot: number;
}

export function Race({ spec, phrases, onFinish }: GameProps<'race'>) {
  const [setup] = useState(() => {
    const track = buildTrack(spec);
    const tasks = raceTasks(spec);
    return { track, tasks, values: tasks.map((t) => gateValues(t, spec)) };
  });
  const [phase, setPhase] = useState<Phase>('ready');
  const [gate, setGate] = useState(0);
  const [results, setResults] = useState<boolean[]>([]);
  const root = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const el = root.current!;
    const cv = canvas.current!;
    const ctx = cv.getContext('2d')!;
    const img = new Map<Sprite, HTMLImageElement>();
    for (const s of SPRITES) {
      const i = new Image();
      i.src = raceUrl(s);
      img.set(s, i);
    }
    /** Белая машинка, перекрашенная в цвет (тени глины и чёрные колёса остаются). */
    const cars: (HTMLCanvasElement | undefined)[] = [];
    const carImg = (c: number): Drawable | undefined => {
      const base = img.get('car');
      if (!ready(base)) return undefined;
      if (!cars[c]) {
        const [iw, ih] = sizeOf(base);
        const k = document.createElement('canvas');
        k.width = iw;
        k.height = ih;
        const x = k.getContext('2d')!;
        x.drawImage(base, 0, 0);
        x.globalCompositeOperation = 'multiply';
        x.fillStyle = CAR_COLORS[c]!;
        x.fillRect(0, 0, iw, ih);
        x.globalCompositeOperation = 'destination-in';
        x.drawImage(base, 0, 0);
        // Совёнок вклеен в картинку — его не красим: рисуем исходник поверх по маске головы.
        if (c === 0) {
          x.globalCompositeOperation = 'source-over';
          x.save();
          x.beginPath();
          x.ellipse(iw * 0.5, ih * 0.17, iw * 0.094, ih * 0.148, 0, 0, Math.PI * 2);
          x.clip();
          x.drawImage(base, 0, 0);
          x.restore();
        }
        cars[c] = k;
      }
      return cars[c];
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
    const font = getComputedStyle(el).fontFamily || 'sans-serif';
    const webdriver = navigator.webdriver;

    const { track, tasks, values } = setup;
    const segs = track.segments;
    const s = {
      phase: 'ready' as Phase,
      phaseAt: performance.now(),
      /** Где камера (мировая z); машинка — на PLAYER_Z впереди. */
      pos: 0,
      x: 0,
      vx: 0,
      targetX: 0,
      speed: 0,
      boostUntil: 0,
      slowUntil: 0,
      shakeUntil: 0,
      gate: 0,
      coneSaid: false,
      hitCones: new Set<number>(),
      flying: [] as { seg: number; x: number; at: number }[],
      rivals: spec.rivals
        ? [
            { z: 9 * SEG, x: LANES[0]!, target: LANES[0]!, color: 1 },
            { z: 17 * SEG, x: LANES[2]!, target: LANES[2]!, color: 2 },
          ]
        : ([] as Rival[]),
      particles: [] as Particle[],
      skyX: 0,
      finishedAt: 0,
    };
    const go = (p: Phase) => {
      s.phase = p;
      s.phaseAt = performance.now();
      setPhase(p);
    };
    void ask(RACE_START);

    /** Масштаб проекции и горизонт под экран. */
    const view = () => {
      // S — масштаб по горизонтали, Sy — по вертикали: машинка стоит низко у края экрана,
      // а дорога у неё — не шире экрана (на узком телефоне перспектива круче).
      const S = w > h ? Math.min(w * 0.42, h * 0.62) : Math.min(w * 0.62, h * 0.34);
      const horizon = w > h ? h * 0.36 : h * 0.42;
      const Sy = (w > h ? h * 0.92 : h * 0.86) - horizon;
      return { S, Sy, horizon };
    };
    const segAt = (z: number) => segs[clamp(Math.floor(z / SEG), 0, segs.length - 1)]!;
    const heightAt = (z: number) => {
      const g = segAt(z);
      const k = (z % SEG) / SEG;
      return g.y1 + (g.y2 - g.y1) * k;
    };
    const emit = (p: Omit<Particle, 'age' | 'rot'>) => {
      if (s.particles.length < 260) s.particles.push({ ...p, age: 0, rot: Math.random() * 6 });
    };
    const sparkle = (x: number, y: number, n: number, color = '#ffe14d') => {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const v = 120 + Math.random() * 260;
        emit({
          x,
          y,
          vx: Math.cos(a) * v,
          vy: Math.sin(a) * v - 80,
          r: 3 + Math.random() * 4,
          life: 0.8,
          color: i % 3 ? color : '#fff',
          kind: 'spark',
        });
      }
    };

    /** Машинка проехала ворота g: верные — рывок, не те — тормоз, задание у следующих — то же. */
    const passGate = (g: number, now: number) => {
      const lane = laneOf(s.x);
      const task = tasks[g]!;
      const value = values[g]![lane]!;
      const good = value === task.answer;
      const { S, Sy, horizon } = view();
      const cx = w / 2 + (1 - FOLLOW) * s.x * S;
      setResults((r) => [...r, good]);
      s.gate = g + 1;
      setGate(g + 1);
      if (good) {
        s.boostUntil = now + 1400;
        fx.snap();
        sparkle(cx, horizon + Sy * 0.85, 26);
      } else {
        s.slowUntil = now + 1300;
        s.shakeUntil = now + 350;
        bump();
        // Задание повторится у следующих ворот.
        if (g + 1 < tasks.length) {
          tasks[g + 1] = task;
          values[g + 1] = gateValues(task, spec);
        }
      }
      const next = tasks[g + 1];
      const wrong = good ? [] : [wrongPhrase(task, value)];
      if (next) void ask(...wrong, taskPhrase(next));
      else if (wrong.length) void say(...wrong);
    };

    const project = (
      wx: number,
      wy: number,
      wz: number,
      cam: { x: number; y: number; z: number },
      S: number,
      Sy: number,
      horizon: number,
    ) => {
      const tz = wz - cam.z;
      const scale = DEPTH / tz;
      return {
        x: w / 2 + scale * (wx - cam.x) * S,
        y: horizon - scale * (wy - cam.y) * Sy,
        scale,
        r: scale * ROAD * S,
      };
    };
    const poly = (
      x1: number,
      y1: number,
      w1: number,
      x2: number,
      y2: number,
      w2: number,
      color: string,
    ) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(x1 - w1, y1 + 1);
      ctx.lineTo(x2 - w2, y2);
      ctx.lineTo(x2 + w2, y2);
      ctx.lineTo(x1 + w1, y1 + 1);
      ctx.closePath();
      ctx.fill();
    };
    /** Спрайт стоит низом на (x, y), ширина width px; всё ниже clipY (за горкой) срезается. */
    const sprite = (d: Drawable, x: number, y: number, width: number, clipY: number, alpha = 1) => {
      const [iw, ih] = sizeOf(d);
      const height = (width * ih) / iw;
      const top = y - height;
      if (top >= clipY || width < 1) return;
      const visible = Math.min(height, clipY - top);
      ctx.globalAlpha = alpha;
      ctx.drawImage(d, 0, 0, iw, (ih * visible) / height, x - width / 2, top, width, visible);
      ctx.globalAlpha = 1;
    };
    const drawSign = (value: GateValue, task: GateTask, x: number, y: number, r: number) => {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      if (task.kind === 'color') {
        ctx.fillStyle = HEX[value as RaceColor];
        ctx.fill();
        ctx.lineWidth = Math.max(1, r * 0.12);
        ctx.strokeStyle = 'rgba(255,255,255,0.9)';
        ctx.stroke();
        return;
      }
      ctx.fillStyle = '#fff';
      ctx.fill();
      if (r < 4) return;
      ctx.fillStyle = '#1d2346';
      ctx.font = `900 ${Math.round(r * 1.3)}px ${font}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(value), x, y + r * 0.08);
    };

    const frame = (now: number) => {
      const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
      last = now;
      frameNo++;
      const { S, Sy, horizon } = view();
      const base = SPEED[spec.speed] * SEG;

      // ─── Фазы и скорость ───
      const since = (now - s.phaseAt) / 1000;
      if (s.phase === 'ready' && since > 3.2) {
        go('race');
        void ask(taskPhrase(tasks[0]!));
      }
      let want = 0;
      if (s.phase === 'race') want = now < s.slowUntil ? 0.45 : now < s.boostUntil ? 1.6 : 1;
      if (s.phase === 'finish') want = 0;
      const mult = s.speed / base || 0;
      const k = want > mult ? 1.6 : 2.6;
      s.speed = base * (mult + (want - mult) * Math.min(1, k * dt));
      s.pos += s.speed * dt;
      const playerZ = s.pos + PLAYER_Z;
      const st = steer(s.x, s.vx, s.targetX, dt);
      s.x = st.x;
      s.vx = st.vx;

      // Ворота, конусы, финиш.
      if (s.phase === 'race') {
        const g = track.gates[s.gate];
        if (g !== undefined && playerZ >= (g + 1) * SEG) passGate(s.gate, now);
        const seg = segAt(playerZ);
        if (
          seg.cone !== undefined &&
          !s.hitCones.has(seg.index) &&
          Math.abs(seg.cone - s.x) < 0.24
        ) {
          s.hitCones.add(seg.index);
          s.flying.push({ seg: seg.index, x: seg.cone, at: now });
          s.slowUntil = now + 900;
          s.shakeUntil = now + 300;
          bump();
          if (!s.coneSaid) void say(RACE_CONE);
          s.coneSaid = true;
        }
        if (playerZ >= (track.finish + 1) * SEG) {
          go('finish');
          s.finishedAt = now;
          fx.snap();
          for (let i = 0; i < 90; i++) {
            const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2;
            const v = 300 + Math.random() * 500;
            emit({
              x: w * (0.2 + Math.random() * 0.6),
              y: h * 0.75,
              vx: Math.cos(a) * v,
              vy: Math.sin(a) * v,
              r: 5 + Math.random() * 5,
              life: 2.6,
              color: Object.values(HEX)[i % 6]!,
              kind: 'confetti',
            });
          }
          void afterSpeech(praise(phrases, undefined, [RACE_FINISH]), 2600).then(() => onFinish());
        }
      }

      // Соперники: чуть медленнее, обгоняются рывком; уступают дорогу и не финишируют первыми.
      for (const r of s.rivals) {
        const ahead = r.z - playerZ;
        let v = base * 0.9;
        if (ahead > 26 * SEG) v = base * 0.7;
        if (ahead < -8 * SEG) v = base * 0.8;
        if (r.z > (track.finish - 12) * SEG && ahead > 0) v = base * 0.45;
        if (s.phase === 'ready') v = 0;
        if (s.phase === 'finish') v = Math.max(0, base * 0.9 * (1 - (now - s.finishedAt) / 2500));
        r.z += v * dt;
        if (ahead > -1.5 * SEG && ahead < 4 * SEG && Math.abs(r.x - s.x) < 0.5) {
          r.target = LANES.reduce(
            (far, l) => (Math.abs(l - s.x) > Math.abs(far - s.x) ? l : far),
            LANES[0]!,
          );
        }
        r.x += (r.target - r.x) * Math.min(1, 3 * dt);
      }

      // ─── Небо ───
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (now < s.shakeUntil) ctx.translate((Math.random() - 0.5) * 10, (Math.random() - 0.5) * 6);
      ctx.fillStyle = SKY;
      ctx.fillRect(-20, -20, w + 40, h + 40);
      const baseSeg = segAt(s.pos);
      s.skyX += baseSeg.curve * (s.speed / base || 0) * dt * 0.012;
      const sky = img.get('sky');
      const camY = CAMERA_H + heightAt(playerZ);
      if (ready(sky)) {
        // Луг на картинке начинается на 2/3 высоты — ставим его на горизонт; по повороту сдвигаем.
        const [iw, ih] = sizeOf(sky);
        const dh = Math.max(horizon / 0.62, h * 0.5);
        const dw = (iw * dh) / ih;
        const top = horizon - dh * 0.65 + (camY - CAMERA_H) * 0.02;
        const off = (((s.skyX * dw) % (dw * 2)) + dw * 2) % (dw * 2);
        for (let x = -off; x < w; x += dw) {
          const flip = Math.round((x + off) / dw) % 2 === 1;
          if (flip) {
            ctx.save();
            ctx.translate(x + dw, top);
            ctx.scale(-1, 1);
            ctx.drawImage(sky, 0, 0, dw, dh);
            ctx.restore();
          } else ctx.drawImage(sky, x, top, dw, dh);
        }
        // Ниже картинки — луг.
        ctx.fillStyle = '#86c95f';
        ctx.fillRect(-20, top + dh - 1, w + 40, h);
      }

      // ─── Дорога ───
      const basePercent = (s.pos % SEG) / SEG;
      const camX = s.x * ROAD * FOLLOW;
      let x = 0;
      let dx = -(baseSeg.curve * basePercent);
      let maxy = h;
      const drawn: {
        seg: number;
        x1: number;
        y1: number;
        scale: number;
        clip: number;
        camX: number;
      }[] = [];
      for (let n = 0; n < DRAW; n++) {
        const seg = segs[baseSeg.index + n];
        if (!seg) break;
        const cam = { x: camX - x, y: camY, z: s.pos };
        const cam2 = { x: camX - x - dx, y: camY, z: s.pos };
        const p1 = project(0, seg.y1, seg.index * SEG, cam, S, Sy, horizon);
        const p2 = project(0, seg.y2, (seg.index + 1) * SEG, cam2, S, Sy, horizon);
        x += dx;
        dx += seg.curve;
        drawn.push({
          seg: seg.index,
          x1: p1.x,
          y1: p1.y,
          scale: p1.scale,
          clip: maxy,
          camX: cam.x,
        });
        if (seg.index * SEG <= s.pos - SEG || p2.y >= maxy || p1.y <= p2.y) continue;
        const band = Math.floor(seg.index / 3) % 2;
        const fog = 1 - Math.exp(-((n / DRAW) ** 2) * 4);
        ctx.fillStyle = band ? '#93d36b' : '#84c75c';
        ctx.fillRect(0, p2.y, w, p1.y - p2.y + 1);
        poly(p1.x, p1.y, p1.r * 1.14, p2.x, p2.y, p2.r * 1.14, band ? '#ef4444' : '#ffffff');
        poly(p1.x, p1.y, p1.r, p2.x, p2.y, p2.r, band ? '#a3a8b1' : '#9aa0a9');
        if (band) {
          // Пунктир между полосами.
          for (const l of [-0.32, 0.32]) {
            poly(p1.x + l * p1.r, p1.y, p1.r * 0.022, p2.x + l * p2.r, p2.y, p2.r * 0.022, '#fff');
          }
        }
        if (seg.finish || seg.index === 6) {
          // Клетчатая линия старта и финиша.
          const cells = 10;
          for (let c = 0; c < cells; c++) {
            const a = -1 + (2 * c) / cells;
            const b = a + 2 / cells;
            ctx.fillStyle = (c + (seg.index % 2)) % 2 ? '#222' : '#fff';
            ctx.beginPath();
            ctx.moveTo(p1.x + a * p1.r, p1.y);
            ctx.lineTo(p2.x + a * p2.r, p2.y);
            ctx.lineTo(p2.x + b * p2.r, p2.y);
            ctx.lineTo(p1.x + b * p1.r, p1.y);
            ctx.fill();
          }
        }
        if (fog > 0.02) {
          ctx.fillStyle = `rgba(${FOG[0]},${FOG[1]},${FOG[2]},${fog})`;
          ctx.fillRect(0, p2.y, w, p1.y - p2.y + 1);
        }
        maxy = p2.y;
      }

      // ─── Всё, что стоит на дороге и у дороги, — от дальнего к ближнему ───
      const rivalsBySeg = new Map<number, Rival[]>();
      for (const r of s.rivals) {
        const i = Math.floor(r.z / SEG);
        rivalsBySeg.set(i, [...(rivalsBySeg.get(i) ?? []), r]);
      }
      for (let n = drawn.length - 1; n > 0; n--) {
        const d = drawn[n]!;
        const seg = segs[d.seg]!;
        if (d.seg * SEG < s.pos) continue;
        const at = (offset: number) => d.x1 + d.scale * offset * ROAD * S;
        const px = (worldW: number) => d.scale * worldW * ROAD * S;
        const fog = 1 - Math.exp(-((n / DRAW) ** 2) * 4);
        const alpha = 1 - fog * 0.8;
        for (const sc of seg.scenery) {
          const im = img.get(sc.kind);
          if (ready(im)) sprite(im, at(sc.offset), d.y1, px(WIDTH[sc.kind]), d.clip, alpha);
        }
        if (seg.cone !== undefined) {
          const cone = img.get('cone');
          const hit = s.flying.find((f) => f.seg === seg.index);
          if (ready(cone) && !hit) sprite(cone, at(seg.cone), d.y1, px(WIDTH.cone), d.clip, alpha);
        }
        for (const r of rivalsBySeg.get(seg.index) ?? []) {
          const c = carImg(r.color);
          if (c) sprite(c, at(r.x), d.y1, px(WIDTH.car), d.clip, alpha);
        }
        if (seg.gate !== undefined) {
          const gateImg = img.get('gate');
          const g = seg.gate;
          if (ready(gateImg)) {
            const [iw, ih] = sizeOf(gateImg);
            for (let lane = 0; lane < 3; lane++) {
              const gx = at(LANES[lane]!);
              const gw = px(WIDTH.gate);
              const passed = g < s.gate;
              sprite(gateImg, gx, d.y1, gw, d.clip, passed ? alpha * 0.5 : alpha);
              const gh = (gw * ih) / iw;
              const sy = d.y1 - gh + gh * SIGN.cy;
              if (sy < d.clip && !passed)
                drawSign(values[g]![lane]!, tasks[g]!, gx, sy, gw * SIGN.r);
            }
          }
        }
        if (seg.finish) {
          const f = img.get('finish');
          if (ready(f)) sprite(f, at(0), d.y1, px(WIDTH.finish), d.clip, alpha);
        }
      }

      // ─── Машинка ───
      const carW = WIDTH.car * S;
      const cx = w / 2 + (1 - FOLLOW) * s.x * S;
      const bounce = s.speed > 0 ? Math.sin(now / 70) * 1.2 * Math.min(1, s.speed / base) : 0;
      const cy = horizon + Sy + bounce;
      // Тень.
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.beginPath();
      ctx.ellipse(cx, cy - carW * 0.02, carW * 0.52, carW * 0.08, 0, 0, Math.PI * 2);
      ctx.fill();
      // Пыль из-под колёс, искры при рывке.
      if (s.speed > base * 0.3 && Math.random() < 0.6) {
        for (const side of [-1, 1]) {
          emit({
            x: cx + side * carW * 0.38,
            y: cy - 4,
            vx: side * 20 + (Math.random() - 0.5) * 40,
            vy: 30 + Math.random() * 40,
            r: carW * 0.05,
            life: 0.6,
            color: '',
            kind: 'dust',
          });
        }
      }
      if (now < s.boostUntil && Math.random() < 0.8) {
        emit({
          x: cx + (Math.random() - 0.5) * carW * 0.6,
          y: cy - carW * 0.15,
          vx: (Math.random() - 0.5) * 60,
          vy: 160 + Math.random() * 120,
          r: 3 + Math.random() * 3,
          life: 0.5,
          color: '#ffd84d',
          kind: 'spark',
        });
      }
      for (const p of s.particles) {
        if (p.kind !== 'dust') continue;
        const fade = 1 - p.age / p.life;
        ctx.fillStyle = `rgba(235,225,205,${0.28 * fade})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * (1 + p.age * 2), 0, Math.PI * 2);
        ctx.fill();
      }
      const car = carImg(0);
      if (car) {
        const [iw, ih] = sizeOf(car);
        const tilt = clamp(s.vx * 0.12, -0.12, 0.12);
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(tilt);
        ctx.drawImage(car, -carW / 2, -(carW * ih) / iw, carW, (carW * ih) / iw);
        ctx.restore();
      }
      // Сбитые конусы улетают в сторону.
      const coneImg = img.get('cone');
      for (const f of s.flying) {
        const t = (now - f.at) / 1000;
        if (t > 1 || !ready(coneImg)) continue;
        const dir = f.x >= s.x ? 1 : -1;
        ctx.save();
        ctx.translate(
          cx + dir * (carW * 0.4 + t * w * 0.5),
          cy - carW * 0.3 - Math.sin(t * Math.PI) * h * 0.15,
        );
        ctx.rotate(dir * t * 8);
        const cw = carW * 0.32;
        const [iw, ih] = sizeOf(coneImg);
        ctx.drawImage(coneImg, -cw / 2, -(cw * ih) / iw / 2, cw, (cw * ih) / iw);
        ctx.restore();
      }

      // ─── Светофор на старте ───
      if (s.phase === 'ready' || (s.phase === 'race' && since < 0.8)) {
        const lit = s.phase === 'race' ? 3 : Math.min(2, Math.floor(since / 1.05));
        const r = Math.min(w, h) * 0.055;
        const bx = w / 2;
        const by = h * 0.2;
        ctx.fillStyle = '#2b2f3a';
        ctx.beginPath();
        ctx.roundRect(bx - r * 4.2, by - r * 1.4, r * 8.4, r * 2.8, r);
        ctx.fill();
        for (let i = 0; i < 3; i++) {
          const on = s.phase === 'race' ? true : i <= lit;
          const color = s.phase === 'race' ? '#22c55e' : i === 2 ? '#facc15' : '#ef4444';
          ctx.fillStyle = on ? color : '#4b5060';
          if (on) {
            ctx.shadowColor = color;
            ctx.shadowBlur = r;
          }
          ctx.beginPath();
          ctx.arc(bx + (i - 1) * r * 2.7, by, r, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
        }
      }

      // ─── Частицы поверх ───
      for (const p of s.particles) {
        p.age += dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.rot += dt * 6;
        if (p.kind === 'confetti') {
          p.vx *= 1 - dt * 1.2;
          p.vy = p.vy * (1 - dt * 1.2) + 420 * dt;
        } else {
          p.vx *= 1 - dt * 2;
          p.vy *= 1 - dt * 2;
        }
        if (p.kind === 'dust') continue;
        const fade = 1 - p.age / p.life;
        ctx.globalAlpha = Math.min(1, fade * 1.5);
        ctx.fillStyle = p.color;
        if (p.kind === 'confetti') {
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.fillRect(-p.r, -p.r * 0.4, p.r * 2, p.r * 0.8);
          ctx.restore();
        } else {
          ctx.beginPath();
          for (let k2 = 0; k2 < 8; k2++) {
            const a = (k2 * Math.PI) / 4 + p.rot;
            const rr = k2 % 2 ? p.r * 0.4 : p.r;
            ctx.lineTo(p.x + Math.cos(a) * rr, p.y + Math.sin(a) * rr);
          }
          ctx.closePath();
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
      s.particles = s.particles.filter((p) => p.age < p.life);

      if (webdriver && frameNo % 5 === 0) {
        const g = s.gate < tasks.length ? s.gate : -1;
        const good = g >= 0 ? values[g]!.indexOf(tasks[g]!.answer) : -1;
        el.dataset.target =
          good >= 0 ? String(Math.round(w / 2 + (1 - FOLLOW) * LANES[good]! * S)) : '';
        el.dataset.wrongTarget =
          good >= 0 ? String(Math.round(w / 2 + (1 - FOLLOW) * LANES[(good + 1) % 3]! * S)) : '';
        el.dataset.car = String(Math.round(cx));
      }
      raf = requestAnimationFrame(frame);
    };

    // ─── Касания: машинка едет туда, где палец ───
    let steering = false;
    const toX = (e: PointerEvent) => {
      const box = el.getBoundingClientRect();
      const { S } = view();
      return clamp((e.clientX - box.left - w / 2) / ((1 - FOLLOW) * S), -0.95, 0.95);
    };
    const down = (e: PointerEvent) => {
      if ((e.target as Element).closest('.corner-button')) return;
      steering = true;
      el.setPointerCapture?.(e.pointerId);
      s.targetX = toX(e);
    };
    const move = (e: PointerEvent) => {
      if (steering) s.targetX = toX(e);
    };
    const up = () => {
      steering = false;
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

  const task = setup.tasks[Math.min(gate, setup.tasks.length - 1)]!;
  return (
    <div
      className="game race"
      data-testid="game-race"
      data-phase={phase}
      data-gate={gate}
      data-no-idle={phase !== 'ready' || undefined}
      ref={root}
    >
      <canvas ref={canvas} className="race-canvas" />
      {phase === 'race' && gate < setup.tasks.length && (
        <div className="race-task" data-testid="race-task">
          {task.kind === 'color' ? (
            <span
              className="race-dot"
              style={{ background: HEX[task.answer] }}
              data-color={task.answer}
            />
          ) : (
            String(task.answer)
          )}
        </div>
      )}
      <div className="race-gates" aria-hidden>
        {setup.tasks.map((_, i) => (
          <span
            key={i}
            className={
              i < results.length ? (results[i] ? 'race-flag good' : 'race-flag miss') : 'race-flag'
            }
          />
        ))}
      </div>
    </div>
  );
}
