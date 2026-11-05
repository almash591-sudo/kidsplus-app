// «Волшебные пузыри» (этап 59). Передняя камера показывает ребёнка как в зеркале, снизу всплывают
// глиняные пузыри, взмах руки их лопает. Старшим — только нужного цвета или с нужной цифрой. Кадр
// уменьшается до двух серых картинок 96 × 72 и сравнивается с прошлым: так находится движение. Кадры
// не сохраняются и никуда не уходят. Нет камеры или не разрешили — лопаем пальцем на фоне неба.
import { useEffect, useRef, useState } from 'react';
import { fx } from '../fx';
import { setKeepAwake } from '../kiosk';
import {
  BUBBLES_ALL,
  BUBBLES_ASK,
  BUBBLES_END,
  BUBBLES_FINGER,
  BUBBLES_GO,
  BUBBLES_WAVE,
  BUBBLES_WIN,
  bubblesColor,
  bubblesDigit,
} from '../phrases';
import { afterSpeech, bump, clayUrl, praise, say, setTask, type GameProps } from './common';
import {
  bubblesSprites,
  charged,
  coverFit,
  drift,
  frameSize,
  gapMs,
  gone,
  MAX_LIVE,
  motionIn,
  motionOf,
  planRounds,
  POP_AT,
  sameFrame,
  SHAKEN,
  spawn,
  toGray,
  touched,
  type Bubble,
  type BubbleColor,
  type BubblesRound,
} from './bubblesLogic';
import { cameraState, createCamera, type CameraState } from './liveCamera';

type Phase = 'wait' | 'play' | 'done' | 'finish';

const TAU = Math.PI * 2;
const HEX: Record<BubbleColor, string> = {
  red: '#ff7a6b',
  blue: '#57b4ff',
  green: '#6fdc6a',
  yellow: '#ffd23f',
  purple: '#c58cff',
};
const COLORS = Object.values(HEX);
/** Смотрим на кадр раз в столько мс: чаще незачем, а телефон греется. */
const LOOK_MS = 66;
/** Телефон спрашивает про камеру: столько мс молчим, потом зовём взрослого. */
const ASK_AFTER = 1500;
/** Камера всё не отвечает — начинаем пальцем, а появится — перейдём на неё. */
const WAIT_MS = 15000;
/** Без взмаха столько мс — показать руку: в самом начале быстрее, потом реже. */
const HAND_FIRST = 3000;
const HAND_AFTER = 7000;
/** Нажал не на тот пузырь: напоминаем задание не чаще, чем раз в столько мс. */
const TOLD_MS = 4000;

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  life: number;
  age: number;
  color: string;
  kind: 'drop' | 'ring' | 'confetti';
  rot: number;
}

const clamp01 = (k: number) => Math.max(0, Math.min(1, k));
const taskOf = (r: BubblesRound) =>
  r.task === 'color'
    ? bubblesColor(r.color!)
    : r.task === 'digit'
      ? bubblesDigit(r.digit!)
      : BUBBLES_ALL;

export function Bubbles({ spec, phrases, onFinish }: GameProps<'bubbles'>) {
  const [rounds] = useState(() => planRounds(spec));
  const [round, setRound] = useState(0);
  const [phase, setPhase] = useState<Phase>('wait');
  const [cam, setCam] = useState<CameraState>('wait');
  const root = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const hint = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = root.current!;
    const cv = canvas.current!;
    const screen = video.current!;
    const ctx = cv.getContext('2d')!;
    const img = new Map<string, HTMLImageElement>();
    for (const name of bubblesSprites()) {
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
    const ro = new ResizeObserver(measure);
    ro.observe(el);

    const webdriver = navigator.webdriver;
    /** Часы игры, мс: идут только с кадрами — погашенный экран ставит игру на паузу. */
    let clock = 0;
    const s = {
      k: 0,
      R: rounds[0]!,
      phase: 'wait' as Phase,
      camera: 'wait' as CameraState,
      /** Что ответила камера; null — ещё думает или телефон спрашивает разрешение. */
      answer: null as boolean | null,
      answeredAt: 0,
      lastLive: null as number | null,
      asked: false,
      greeted: false,
      fingerTold: false,
      waveTold: false,
      handTold: false,
      got: 0,
      pops: 0,
      nextId: 1,
      spawnAt: 0,
      lookAt: 0,
      poppedAt: 0,
      toldAt: -1e9,
      softAt: -1e9,
      live: [] as Bubble[],
      timers: [] as { at: number; fn: () => void }[],
      particles: [] as Particle[],
      stopped: false,
    };

    const camera = createCamera(screen, 'user', undefined, (granted) => {
      if (s.stopped) return;
      s.answer = granted;
      s.answeredAt = clock;
      s.lastLive = null;
      // Камера вернулась после погашенного экрана: сравнивать со старым кадром нельзя.
      prev = null;
    });
    /** Два маленьких серых кадра — всё, что игра держит от камеры. */
    const small = document.createElement('canvas');
    const pen = small.getContext('2d', { willReadFrequently: true })!;
    let fw = 0;
    let fh = 0;
    let cur = new Uint8Array(0);
    let prev: Uint8Array | null = null;

    const go = (p: Phase) => {
      s.phase = p;
      setPhase(p);
    };
    const later = (ms: number, fn: () => void) => s.timers.push({ at: clock + ms, fn });

    const splash = (b: Bubble) => {
      const color = HEX[b.color];
      for (let i = 0; i < 14; i++) {
        const a = Math.random() * TAU;
        const v = 90 + Math.random() * 220;
        s.particles.push({
          x: b.x + Math.cos(a) * b.r * 0.7,
          y: b.y + Math.sin(a) * b.r * 0.7,
          vx: Math.cos(a) * v,
          vy: Math.sin(a) * v,
          r: 3 + Math.random() * 5,
          life: 0.55,
          age: 0,
          color: i % 3 ? color : '#fff',
          kind: 'drop',
          rot: 0,
        });
      }
      s.particles.push({
        x: b.x,
        y: b.y,
        vx: 0,
        vy: 0,
        r: b.r,
        life: 0.32,
        age: 0,
        color,
        kind: 'ring',
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
    const start = (k: number) => {
      s.k = k;
      setRound(k);
      s.R = rounds[k]!;
      s.got = 0;
      s.live = [];
      s.spawnAt = clock;
      s.poppedAt = clock;
      s.handTold = false;
      go('play');
      if (s.greeted) {
        void say(taskOf(s.R));
        return;
      }
      s.greeted = true;
      const on = s.camera === 'on';
      s.waveTold = on;
      s.fingerTold = !on;
      void say(on ? BUBBLES_GO : BUBBLES_FINGER, taskOf(s.R));
    };
    const next = (k: number) => {
      if (s.stopped || s.k !== k) return;
      if (k + 1 < rounds.length) {
        fx.whoosh();
        later(420, () => start(k + 1));
        return;
      }
      // Игра кончилась — камере здесь больше нечего делать.
      camera.stop();
      s.answer = false;
      confetti();
      go('finish');
      void afterSpeech(say(BUBBLES_END), 2600).then(() => {
        if (!s.stopped) onFinish();
      });
    };
    const win = () => {
      const k = s.k;
      go('done');
      for (const b of s.live) splash(b);
      s.live = [];
      void afterSpeech(praise(phrases, undefined, [BUBBLES_WIN]), 2800).then(() => next(k));
    };
    const pop = (b: Bubble) => {
      s.live = s.live.filter((x) => x !== b);
      s.got++;
      s.pops++;
      s.poppedAt = clock;
      fx.pop();
      splash(b);
      if (s.got >= s.R.goal) win();
    };
    /** Не тот пузырь качнулся: взмах не прицельный, это не ошибка. */
    const shake = (b: Bubble) => {
      b.wobbleAt = clock;
      if (clock - s.softAt > 400) {
        s.softAt = clock;
        fx.soft();
      }
    };

    const remind = () => {
      void say(s.phase === 'wait' ? BUBBLES_ASK : taskOf(s.R));
    };
    setTask(remind);

    // ─── Взмах: чем кадр отличается от прошлого ───
    const look = () => {
      if (s.answer !== true || screen.readyState < 2 || !screen.videoWidth) return;
      const size = frameSize(screen.videoWidth, screen.videoHeight);
      if (size.w !== fw || size.h !== fh) {
        fw = size.w;
        fh = size.h;
        small.width = fw;
        small.height = fh;
        cur = new Uint8Array(fw * fh);
        prev = null;
      }
      pen.drawImage(screen, 0, 0, fw, fh);
      toGray(pen.getImageData(0, 0, fw, fh).data, cur);
      if (!prev) {
        prev = cur.slice();
        s.lastLive = clock;
        return;
      }
      if (sameFrame(prev, cur)) return;
      s.lastLive = clock;
      const { mask, share } = motionOf(prev, cur, fw, fh);
      prev.set(cur);
      if (s.phase !== 'play' || s.camera !== 'on') return;
      if (share > SHAKEN) {
        for (const b of s.live) b.charge = 0;
        return;
      }
      const fit = coverFit(fw, fh, w, h);
      for (const b of [...s.live]) {
        b.charge = charged(b.charge, motionIn(mask, fw, fh, fit, w, b));
        if (b.charge < POP_AT) continue;
        b.charge = 0;
        if (b.target) pop(b);
        else shake(b);
        if (s.phase !== 'play') break;
      }
    };

    // ─── Палец: работает всегда, даже с камерой ───
    const down = (e: PointerEvent) => {
      if ((e.target as Element).closest('.corner-button')) return;
      if (s.phase !== 'play') return;
      const box = el.getBoundingClientRect();
      const x = e.clientX - box.left;
      const y = e.clientY - box.top;
      const hit = s.live.filter((b) => touched(b, x, y));
      const good = hit.find((b) => b.target);
      if (good) {
        pop(good);
        return;
      }
      const bad = hit[0];
      if (!bad) return;
      bad.wobbleAt = clock;
      bump();
      if (clock - s.toldAt > TOLD_MS) {
        s.toldAt = clock;
        void say(taskOf(s.R));
      }
    };
    el.addEventListener('pointerdown', down);

    camera.start();
    // Взмахом играют без касаний: иначе экран погаснет посреди раунда.
    setKeepAwake(true);

    // ─── Рисование ───
    const centered = (name: string, x: number, y: number, bw: number) => {
      const im = ok(name);
      if (!im) return false;
      const bh = (bw * im.naturalHeight) / im.naturalWidth;
      ctx.drawImage(im, x - bw / 2, y - bh / 2, bw, bh);
      return true;
    };
    const cover = (name: string) => {
      const im = ok(name);
      if (!im) return;
      const k = Math.max(w / im.naturalWidth, h / im.naturalHeight);
      const dw = im.naturalWidth * k;
      const dh = im.naturalHeight * k;
      ctx.drawImage(im, (w - dw) / 2, (h - dh) / 2, dw, dh);
    };
    const digit = (n: number, x: number, y: number, r: number) => {
      ctx.font = `bold ${r * 1.15}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      ctx.lineWidth = r * 0.16;
      ctx.strokeStyle = 'rgba(40,50,90,0.75)';
      ctx.strokeText(String(n), x, y + r * 0.05);
      ctx.fillStyle = '#fff';
      ctx.fillText(String(n), x, y + r * 0.05);
    };
    const orb = (color: BubbleColor, x: number, y: number, r: number) => {
      if (centered(`bubbles-${color}`, x, y, r * 2.1)) return;
      ctx.fillStyle = `${HEX[color]}aa`;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.fill();
    };
    const drawBubble = (b: Bubble) => {
      // Пузырь дрожит, когда его задели; рождается чуть меньше и надувается.
      const shaking = clamp01(1 - (clock - b.wobbleAt) / 450);
      const k = (0.75 + 0.25 * clamp01(b.age * 3)) * (1 + 0.1 * shaking * Math.sin(clock / 30));
      const breath = 1 + 0.025 * Math.sin(b.age * 2.2 + b.phase);
      const r = b.r * k * breath;
      orb(b.color, b.x, b.y, r);
      if (b.digit !== undefined) digit(b.digit, b.x, b.y, r);
    };
    /** Что лопать и сколько осталось — наверху, между кнопками. */
    const drawTop = () => {
      const want = s.R.task !== 'all';
      if (want) {
        const r = 26;
        const y = 46;
        ctx.fillStyle = 'rgba(255,255,255,0.72)';
        ctx.beginPath();
        ctx.arc(w / 2, y, r + 8, 0, TAU);
        ctx.fill();
        orb(s.R.color ?? 'blue', w / 2, y, r);
        if (s.R.digit !== undefined) digit(s.R.digit, w / 2, y, r);
      }
      const n = s.R.goal;
      const size = Math.min(22, (w - 200) / n);
      const y = want ? 96 : 52;
      for (let i = 0; i < n; i++) {
        const x = w / 2 + (i - (n - 1) / 2) * size;
        ctx.fillStyle = i < s.got ? '#ffd23f' : 'rgba(255,255,255,0.6)';
        ctx.strokeStyle = 'rgba(40,50,90,0.35)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(x, y, size * 0.38, 0, TAU);
        ctx.fill();
        ctx.stroke();
      }
    };
    const firstTarget = () => {
      let best: Bubble | undefined;
      for (const b of s.live)
        if (b.target && b.y < h - b.r && b.y > b.r && (!best || b.y > best.y)) best = b;
      return best;
    };
    /** Рука машет прямо над пузырём: «вот так». */
    const drawHand = (b: Bubble) => {
      const size = b.r * 1.5;
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(Math.sin(clock / 130) * 0.45);
      centered('bubbles-hand', 0, 0, size);
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

      if (clock >= s.lookAt) {
        s.lookAt = clock + LOOK_MS;
        look();
      }
      const state = cameraState(s.answer, clock, s.lastLive, s.answeredAt);
      if (state !== s.camera) {
        s.camera = state;
        setCam(state);
      }
      if (s.phase === 'wait') {
        if (state !== 'wait' || clock > WAIT_MS) start(0);
        else if (!s.asked && clock > ASK_AFTER) {
          s.asked = true;
          void say(BUBBLES_ASK);
        }
      }

      if (s.phase === 'play') {
        if (state === 'off' && !s.fingerTold) {
          s.fingerTold = true;
          void say(BUBBLES_FINGER);
        } else if (state === 'on' && !s.waveTold) {
          s.waveTold = true;
          void say(BUBBLES_GO);
        }
        if (clock >= s.spawnAt && s.live.length < MAX_LIVE) {
          s.spawnAt = clock + gapMs(spec.fast);
          const b = spawn(s.R, spec.fast, w, h, s.live, s.nextId++);
          // Самый первый — сразу на экране: ждать пузырь незачем.
          if (!s.live.length) b.y = h * 0.72;
          s.live.push(b);
        }
        const steps = span / 1000;
        for (const b of s.live) drift(b, steps);
        s.live = s.live.filter((b) => !gone(b));
      }

      // ─── Сцена: с камерой поверх живой картинки, без неё — небо ───
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      if (state !== 'on') {
        ctx.fillStyle = '#8fd3f5';
        ctx.fillRect(0, 0, w, h);
        cover(`bubbles-bg-${w > h ? 'l' : 'p'}`);
      }
      for (const b of s.live) drawBubble(b);
      if (s.phase === 'play') drawTop();

      const quiet = clock - s.poppedAt;
      const lead = s.phase === 'play' && state === 'on' ? firstTarget() : undefined;
      if (lead && quiet > (s.pops ? HAND_AFTER : HAND_FIRST)) {
        drawHand(lead);
        if (!s.handTold) {
          s.handTold = true;
          void say(BUBBLES_WAVE);
        }
      }

      // ─── Капли и конфетти ───
      for (const p of s.particles) {
        p.age += dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.rot += dt * 6;
        const fade = Math.min(1, (1 - p.age / p.life) * 1.5);
        ctx.globalAlpha = Math.max(0, fade);
        if (p.kind === 'ring') {
          ctx.strokeStyle = p.color;
          ctx.lineWidth = 5 * (1 - p.age / p.life) + 1;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r * (1 + 0.5 * (p.age / p.life)), 0, TAU);
          ctx.stroke();
        } else if (p.kind === 'confetti') {
          p.vx *= 1 - dt * 1.2;
          p.vy = p.vy * (1 - dt * 1.2) + 420 * dt;
          ctx.fillStyle = p.color;
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.fillRect(-p.r, -p.r * 0.4, p.r * 2, p.r * 0.8);
          ctx.restore();
        } else {
          p.vy += 260 * dt;
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r, 0, TAU);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
      s.particles = s.particles.filter((p) => p.age < p.life);

      // Палец подсказки (IdleHint): на пузырь, который пора лопнуть.
      if (frameNo % 6 === 0 && hint.current) {
        const b = s.phase === 'play' && state !== 'on' ? firstTarget() : undefined;
        hint.current.style.display = b ? 'block' : 'none';
        hint.current.toggleAttribute('data-hint', !!b);
        if (b) {
          hint.current.style.left = `${b.x - b.r}px`;
          hint.current.style.top = `${b.y - b.r}px`;
          hint.current.style.width = `${b.r * 2}px`;
          hint.current.style.height = `${b.r * 2}px`;
        }
      }
      // Для автотестов — каждый кадр.
      if (webdriver) {
        el.dataset.camera = state;
        el.dataset.got = String(s.got);
        el.dataset.pops = String(s.pops);
        el.dataset.goal = String(s.R.goal);
        el.dataset.task = s.R.task;
        el.dataset.want = String(s.R.color ?? s.R.digit ?? '');
        el.dataset.frame = `${fw}x${fh}`;
        el.dataset.bubbles = JSON.stringify(
          s.live.map((b) => ({
            id: b.id,
            x: Math.round(b.x),
            y: Math.round(b.y),
            r: Math.round(b.r),
            target: b.target,
            color: b.color,
            digit: b.digit,
            wobble: clock - b.wobbleAt < 450,
          })),
        );
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      s.stopped = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      camera.stop();
      cur.fill(0);
      prev?.fill(0);
      small.width = 0;
      setKeepAwake(false);
      el.removeEventListener('pointerdown', down);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className="game bubbles"
      data-testid="game-bubbles"
      data-phase={phase}
      data-round={round}
      data-no-idle={phase !== 'play' || cam === 'on' || undefined}
      ref={root}
    >
      <video ref={video} className="bubbles-video" muted playsInline autoPlay />
      <canvas ref={canvas} className="bubbles-canvas" />
      <div ref={hint} className="bubbles-hint" />
    </div>
  );
}
