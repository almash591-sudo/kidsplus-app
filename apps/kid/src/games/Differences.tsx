// «Найди отличия» (этап 43). Две живые картинки из глиняных спрайтов — рыбки плавают, деревья
// качаются, звёздочки мерцают, на обеих одинаково. Ребёнок нажимает, где по-другому: колечко
// рисуется сразу на обеих картинках, сыплются искры, совёнок говорит, что нашли («Другой цвет!»).
// Долго не находит — прилетает лупа и показывает это место крупно. Все отличия — картинки
// улетают, прилетают новые; в конце конфетти. Всё — один canvas.
import { useEffect, useRef, useState } from 'react';
import { fx } from '../fx';
import { DIFF_FOUND, DIFF_HINT, DIFF_NEXT, DIFF_PROMPT, DIFF_SAME, diffLeft } from '../phrases';
import { afterSpeech, ask, bump, praise, say, type GameProps } from './common';
import {
  BACKDROP,
  H,
  hitDiff,
  look,
  motion,
  pickDiffs,
  SCENES,
  sceneOrder,
  spot,
  spritesOf,
  W,
  type Diff,
} from './diffLogic';

type Phase = 'enter' | 'play' | 'solved' | 'finish';
const url = (s: string) => `/games/${s}.webp`;
/** Подложка под картинками — в тон картинке. */
const TINT: Record<string, string> = {
  meadow: 'rgba(255,255,255,0.55)',
  forest: 'rgba(255,240,220,0.5)',
  sea: 'rgba(225,245,255,0.45)',
  space: 'rgba(30,20,70,0.45)',
};
const RING = '#22c55e';
const COLORS = ['#ef4444', '#facc15', '#3b82f6', '#22c55e', '#a855f7', '#fb923c'];
/** Через сколько без находки прилетает лупа. */
const HINT_AFTER = 14_000;

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
interface Rect {
  x: number;
  y: number;
  s: number;
}

export function Differences({ spec, phrases, onFinish }: GameProps<'differences'>) {
  const [order] = useState(() => sceneOrder(spec.scenes, spec.rounds));
  const [round, setRound] = useState(0);
  const [found, setFound] = useState(0);
  const [first] = useState(() => pickDiffs(SCENES[order[0]!], spec.count));
  const [total, setTotal] = useState(first.length);
  const [phase, setPhase] = useState<Phase>('enter');
  const root = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const el = root.current!;
    const cv = canvas.current!;
    const ctx = cv.getContext('2d')!;
    const img = new Map<string, HTMLImageElement>();
    const load = (s: string) => {
      if (img.has(s)) return;
      const i = new Image();
      i.src = url(s);
      img.set(s, i);
    };
    // Сначала первая картинка, потом остальные.
    order.forEach((sc) => spritesOf(sc).forEach(load));
    const ok = (s: string) => {
      const i = img.get(s);
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

    const s = {
      round: 0,
      phase: 'enter' as Phase,
      phaseAt: performance.now(),
      diffs: first,
      found: new Map<number, number>(),
      lastFind: performance.now(),
      hint: -1,
      hintAt: 0,
      lastMiss: 0,
      missSaid: false,
      particles: [] as Particle[],
    };
    const scene = () => order[s.round]!;
    const things = () => SCENES[scene()];
    const go = (p: Phase) => {
      s.phase = p;
      s.phaseAt = performance.now();
      setPhase(p);
    };
    void ask(DIFF_PROMPT);

    /** Где картинки на экране: сверху и снизу (телефон стоя) или рядом (лёжа). */
    const layout = (): [Rect, Rect] => {
      const pad = 12;
      const gap = 14;
      const top = 78;
      const bottom = 40;
      if (w > h) {
        const sc = Math.min((w - 2 * pad - gap) / 2 / W, (h - top - bottom) / H);
        const pw = W * sc;
        const x0 = (w - 2 * pw - gap) / 2;
        const y = top + (h - top - bottom - H * sc) / 2;
        return [
          { x: x0, y, s: sc },
          { x: x0 + pw + gap, y, s: sc },
        ];
      }
      const sc = Math.min((w - 2 * pad) / W, (h - top - bottom - gap) / 2 / H);
      const ph = H * sc;
      const x = (w - W * sc) / 2;
      const y0 = top + (h - top - bottom - 2 * ph - gap) / 2;
      return [
        { x, y: y0, s: sc },
        { x, y: y0 + ph + gap, s: sc },
      ];
    };
    /** Прилёт и улёт картинок: смещение по экрану. */
    const slide = (side: 0 | 1, now: number) => {
      const t = (now - s.phaseAt) / 1000;
      const dir = side ? 1 : -1;
      if (s.phase === 'enter') {
        const k = Math.min(1, t / 0.75);
        const e = 1 - (1 - k) ** 3;
        return { dx: dir * (1 - e) * w * 1.1, rot: dir * (1 - e) * 0.25 };
      }
      if (s.phase === 'solved' && t > 1.8) {
        const k = Math.min(1, (t - 1.8) / 0.55);
        return { dx: -dir * k * k * w * 1.1, rot: -dir * k * k * 0.25 };
      }
      return { dx: 0, rot: 0 };
    };

    const cover = (im: HTMLImageElement, cw: number, ch: number) => {
      const k = Math.max(cw / im.naturalWidth, ch / im.naturalHeight);
      const dw = im.naturalWidth * k;
      const dh = im.naturalHeight * k;
      ctx.drawImage(im, (cw - dw) / 2, (ch - dh) / 2, dw, dh);
    };
    /** Картинка side в её координатах (0..W, 0..H): фон и предметы от дальних к ближним. */
    const drawPicture = (side: 0 | 1, t: number) => {
      const bg = ok(BACKDROP[scene()]);
      if (bg) cover(bg, W, H);
      else {
        ctx.fillStyle = '#9fd3f0';
        ctx.fillRect(0, 0, W, H);
      }
      const list = things();
      const idx = list.map((_, i) => i).sort((a, b) => list[a]!.y - list[b]!.y);
      for (const i of idx) {
        const th = list[i]!;
        const l = look(th, i, s.diffs, side);
        if (!l) continue;
        const im = ok(l.s);
        if (!im) continue;
        const m = motion(th.anim, t, i);
        const dw = l.w * m.k;
        const dh = (dw * im.naturalHeight) / im.naturalWidth;
        // Покачивание — от основания, вращение и мерцание — от середины.
        const center = th.anim === 'spin' || th.anim === 'pulse' || th.anim === 'swim';
        ctx.save();
        ctx.translate(th.x + m.dx, th.y + m.dy - (center ? dh / 2 : 0));
        ctx.rotate(m.rot);
        if (l.mirror) ctx.scale(-1, 1);
        ctx.drawImage(im, -dw / 2, center ? -dh / 2 : -dh, dw, dh);
        ctx.restore();
      }
    };
    /** Колечко находки: дорисовывается за 0,45 с, потом чуть дышит. */
    const drawRing = (d: Diff, at: number, now: number) => {
      const p = spot(things()[d.thing]!, d);
      const t = (now - at) / 1000;
      const k = Math.min(1, t / 0.45);
      const r = p.r * (0.92 + 0.05 * Math.sin(now / 260));
      ctx.lineCap = 'round';
      ctx.lineWidth = 22;
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, -Math.PI / 2, -Math.PI / 2 + k * Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = 12;
      ctx.strokeStyle = RING;
      ctx.stroke();
    };
    const toScreen = (rc: Rect, x: number, y: number) => ({
      x: rc.x + x * rc.s,
      y: rc.y + y * rc.s,
    });
    const burst = (x: number, y: number, n: number) => {
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
          color: i % 3 ? '#ffe14d' : '#fff',
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
    /** Лупа: стекло с увеличенным кусочком картинки, ручка, блик. */
    const drawLens = (rc: Rect, side: 0 | 1, d: Diff, now: number, t: number) => {
      const p = spot(things()[d.thing]!, d);
      const fly = Math.min(1, (now - s.hintAt) / 900);
      const e = 1 - (1 - fly) ** 3;
      const target = toScreen(rc, p.x, p.y);
      const wob = Math.sin(now / 300) * 6 * e;
      const cx = w * 0.5 + (target.x - w * 0.5) * e + wob;
      const cy = h + 80 + (target.y - h - 80) * e + Math.cos(now / 360) * 4 * e;
      const R = Math.max(46, p.r * rc.s * 1.05);
      // Ручка.
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(0.75);
      ctx.fillStyle = '#8a4b22';
      ctx.beginPath();
      ctx.roundRect(-R * 0.16, R * 0.95, R * 0.32, R * 1.1, R * 0.14);
      ctx.fill();
      ctx.fillStyle = '#c0c6d0';
      ctx.fillRect(-R * 0.2, R * 0.86, R * 0.4, R * 0.2);
      ctx.restore();
      // Увеличенная картинка внутри стекла.
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.clip();
      const zoom = 1.6;
      const px = (cx - rc.x) / rc.s;
      const py = (cy - rc.y) / rc.s;
      ctx.translate(cx, cy);
      ctx.scale(rc.s * zoom, rc.s * zoom);
      ctx.translate(-px, -py);
      drawPicture(side, t);
      ctx.restore();
      // Блик и оправа.
      const g = ctx.createRadialGradient(cx - R * 0.4, cy - R * 0.45, R * 0.05, cx, cy, R);
      g.addColorStop(0, 'rgba(255,255,255,0.55)');
      g.addColorStop(0.35, 'rgba(255,255,255,0.08)');
      g.addColorStop(1, 'rgba(160,210,255,0.18)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = Math.max(6, R * 0.14);
      ctx.strokeStyle = '#f59e0b';
      ctx.stroke();
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.beginPath();
      ctx.arc(cx, cy, R - ctx.lineWidth * 2, Math.PI * 1.1, Math.PI * 1.45);
      ctx.stroke();
    };

    const frame = (now: number) => {
      const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
      last = now;
      frameNo++;
      const t = now / 1000;
      const since = (now - s.phaseAt) / 1000;

      // ─── Фазы ───
      if (s.phase === 'enter' && since > 0.8) go('play');
      else if (s.phase === 'solved' && since > 2.4) {
        if (s.round + 1 < order.length) {
          s.round++;
          s.diffs = pickDiffs(things(), spec.count);
          s.found = new Map();
          s.hint = -1;
          s.lastFind = now;
          setRound(s.round);
          setFound(0);
          setTotal(s.diffs.length);
          go('enter');
        } else {
          go('finish');
          confetti();
          fx.snap();
          void afterSpeech(praise(phrases), 2400).then(() => onFinish());
        }
      }
      if (
        spec.hint &&
        s.phase === 'play' &&
        s.hint < 0 &&
        now - s.lastFind > HINT_AFTER &&
        now - s.lastMiss > 1500
      ) {
        const left = s.diffs.map((_, k) => k).filter((k) => !s.found.has(k));
        s.hint = left[Math.floor(Math.random() * left.length)] ?? -1;
        s.hintAt = now;
        if (s.hint >= 0) void say(DIFF_HINT);
      }

      // ─── Экран ───
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const bg = ok(BACKDROP[scene()]);
      if (bg) {
        ctx.save();
        cover(bg, w, h);
        ctx.restore();
      } else {
        ctx.fillStyle = '#bfe6ff';
        ctx.fillRect(0, 0, w, h);
      }
      ctx.fillStyle = TINT[scene()]!;
      ctx.fillRect(0, 0, w, h);

      const rects = layout();
      if (s.phase !== 'finish') {
        rects.forEach((rc, side) => {
          const sl = slide(side as 0 | 1, now);
          const pw = W * rc.s;
          const ph = H * rc.s;
          ctx.save();
          ctx.translate(rc.x + pw / 2 + sl.dx, rc.y + ph / 2);
          ctx.rotate(sl.rot);
          ctx.translate(-pw / 2, -ph / 2);
          // Рамка-фотография с тенью.
          ctx.shadowColor = 'rgba(20,30,60,0.35)';
          ctx.shadowBlur = 18;
          ctx.shadowOffsetY = 6;
          ctx.fillStyle = '#fff';
          ctx.beginPath();
          ctx.roundRect(-6, -6, pw + 12, ph + 12, 18);
          ctx.fill();
          ctx.shadowColor = 'transparent';
          ctx.beginPath();
          ctx.roundRect(0, 0, pw, ph, 13);
          ctx.clip();
          ctx.scale(rc.s, rc.s);
          drawPicture(side as 0 | 1, t);
          for (const [k, at] of s.found) drawRing(s.diffs[k]!, at, now);
          if (s.phase === 'solved') {
            // Все колечки вспыхивают.
            const flash = Math.max(0, 1 - since / 0.9);
            ctx.fillStyle = `rgba(255,255,255,${0.45 * flash})`;
            ctx.fillRect(0, 0, W, H);
          }
          ctx.restore();
        });
        if (s.hint >= 0 && s.phase === 'play') {
          const d = s.diffs[s.hint]!;
          drawLens(rects[d.side]!, d.side, d, now, t);
        }
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

      if (webdriver && frameNo % 5 === 0) {
        const rc = rects[0];
        const left = s.diffs.flatMap((d, k) => {
          if (s.found.has(k)) return [];
          const p = spot(things()[d.thing]!, d);
          const at = toScreen(rc, p.x, p.y);
          return [{ x: Math.round(at.x), y: Math.round(at.y), kind: d.kind }];
        });
        el.dataset.diffs = JSON.stringify(left);
        // Место без отличий — для проверки промаха.
        let same = { x: 0, y: 0 };
        let best = -1;
        for (let gx = 80; gx < W; gx += 60) {
          for (let gy = 80; gy < H; gy += 60) {
            const dist = Math.min(
              ...s.diffs.map((d) => {
                const p = spot(things()[d.thing]!, d);
                return Math.hypot(gx - p.x, gy - p.y) - p.r;
              }),
            );
            if (dist > best) {
              best = dist;
              same = toScreen(rc, gx, gy);
            }
          }
        }
        el.dataset.same = JSON.stringify({ x: Math.round(same.x), y: Math.round(same.y) });
        el.dataset.hint = String(s.hint);
      }
      raf = requestAnimationFrame(frame);
    };

    // ─── Касания ───
    const down = (e: PointerEvent) => {
      if ((e.target as Element).closest('.corner-button')) return;
      if (s.phase !== 'play') return;
      const box = el.getBoundingClientRect();
      const sx = e.clientX - box.left;
      const sy = e.clientY - box.top;
      const rects = layout();
      const side = rects.findIndex(
        (rc) => sx >= rc.x && sx <= rc.x + W * rc.s && sy >= rc.y && sy <= rc.y + H * rc.s,
      );
      if (side < 0) return;
      const rc = rects[side]!;
      const x = (sx - rc.x) / rc.s;
      const y = (sy - rc.y) / rc.s;
      const now = performance.now();
      const k = hitDiff(things(), s.diffs, new Set(s.found.keys()), x, y);
      if (k < 0) {
        // Промах: тряска не нужна, просто «пуф» и мягкий звук; частые касания подряд не считаем.
        if (now - s.lastMiss < 700) return;
        s.lastMiss = now;
        bump();
        if (!s.missSaid) void say(DIFF_SAME);
        s.missSaid = true;
        return;
      }
      s.found.set(k, now);
      s.lastFind = now;
      if (s.hint === k) s.hint = -1;
      const d = s.diffs[k]!;
      const p = spot(things()[d.thing]!, d);
      fx.snap();
      for (const r of rects) {
        const at = toScreen(r, p.x, p.y);
        burst(at.x, at.y, 18);
      }
      const left = s.diffs.length - s.found.size;
      setFound(s.found.size);
      if (left > 0) void say(DIFF_FOUND[d.kind], diffLeft(left));
      else {
        go('solved');
        s.hint = -1;
        void say(DIFF_FOUND[d.kind], ...(s.round + 1 < order.length ? [DIFF_NEXT] : []));
      }
    };
    el.addEventListener('pointerdown', down);

    let raf = 0;
    let last = performance.now();
    let frameNo = 0;
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      el.removeEventListener('pointerdown', down);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className="game differences"
      data-testid="game-differences"
      data-phase={phase}
      data-round={round}
      data-found={found}
      ref={root}
    >
      <canvas ref={canvas} className="diff-canvas" />
      <div className="diff-marks" aria-hidden>
        {Array.from({ length: total }, (_, i) => (
          <span key={i} className={i < found ? 'diff-mark on' : 'diff-mark'} />
        ))}
      </div>
    </div>
  );
}
