// Визуальный отклик игр: искры там, где палец, светящийся след пальца, настроение маскота.
// Частицы рисуются в отдельном слое поверх экрана (Web Animations API) — React их не перерисовывает.

const STAR =
  'polygon(50% 0, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)';
const SPARK_COLORS = ['#FACC15', '#F59E0B', '#F472B6', '#7DD3FC', '#22A55B', '#9B5DE5'];

const reduced = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

let layer: HTMLDivElement | null = null;
function fxLayer(): HTMLDivElement | null {
  if (typeof document === 'undefined') return null;
  if (!layer || !layer.isConnected) {
    layer = document.createElement('div');
    layer.className = 'fx-layer';
    layer.setAttribute('aria-hidden', 'true');
    document.body.appendChild(layer);
  }
  return layer;
}

/** Где палец касался последний раз — туда летят искры похвалы. */
let last: { x: number; y: number } | null = null;
if (typeof document !== 'undefined') {
  const remember = (e: PointerEvent) => {
    last = { x: e.clientX, y: e.clientY };
  };
  document.addEventListener('pointerdown', remember, { capture: true, passive: true });
  document.addEventListener('pointerup', remember, { capture: true, passive: true });
}

function particle(x: number, y: number, size: number, style: Partial<CSSStyleDeclaration>) {
  const root = fxLayer();
  if (!root) return null;
  const el = document.createElement('span');
  el.className = 'fx-particle';
  Object.assign(el.style, {
    left: `${x - size / 2}px`,
    top: `${y - size / 2}px`,
    width: `${size}px`,
    height: `${size}px`,
    ...style,
  });
  root.appendChild(el);
  return el;
}

const animate = (el: HTMLElement | null, frames: Keyframe[], o: KeyframeAnimationOptions) => {
  if (!el) return;
  if (typeof el.animate !== 'function') return el.remove();
  el.animate(frames, { fill: 'forwards', ...o }).onfinish = () => el.remove();
};

/** Искры-звёздочки разлетаются из точки (по умолчанию — где было последнее касание). */
export function burst(at?: { x: number; y: number }, count = 14) {
  if (reduced()) return;
  const p = at ?? last ?? { x: innerWidth / 2, y: innerHeight / 2 };
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + Math.random() * 0.5;
    const r = 50 + Math.random() * 70;
    const size = 12 + Math.random() * 14;
    const el = particle(p.x, p.y, size, {
      background: SPARK_COLORS[i % SPARK_COLORS.length]!,
      clipPath: STAR,
    });
    animate(
      el,
      [
        { transform: 'translate(0, 0) scale(0.2) rotate(0deg)', opacity: 1 },
        {
          transform: `translate(${Math.cos(a) * r}px, ${Math.sin(a) * r}px) scale(1) rotate(${
            180 + Math.random() * 180
          }deg)`,
          opacity: 1,
          offset: 0.6,
        },
        {
          transform: `translate(${Math.cos(a) * r * 1.2}px, ${Math.sin(a) * r * 1.2 + 40}px) scale(0.4) rotate(360deg)`,
          opacity: 0,
        },
      ],
      { duration: 750 + Math.random() * 250, easing: 'cubic-bezier(0.2, 0.8, 0.3, 1)' },
    );
  }
  ring(p);
}

/** Расходящееся кольцо — «попал!». */
export function ring(p: { x: number; y: number }, color = '#FACC15') {
  if (reduced()) return;
  const el = particle(p.x, p.y, 40, { border: `5px solid ${color}`, borderRadius: '50%' });
  animate(
    el,
    [
      { transform: 'scale(0.3)', opacity: 0.9 },
      { transform: 'scale(3)', opacity: 0 },
    ],
    { duration: 500, easing: 'ease-out' },
  );
}

/** Брызги краски там, где палец: кольцо и капли цвета краски. */
export function splash(color: string) {
  if (reduced() || !last) return;
  const p = last;
  ring(p, color);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const r = 30 + Math.random() * 30;
    const el = particle(p.x, p.y, 10 + Math.random() * 8, {
      background: color,
      borderRadius: '50%',
    });
    animate(
      el,
      [
        { transform: 'translate(0, 0) scale(1)', opacity: 1 },
        {
          transform: `translate(${Math.cos(a) * r}px, ${Math.sin(a) * r}px) scale(0.3)`,
          opacity: 0,
        },
      ],
      { duration: 500, easing: 'ease-out' },
    );
  }
}

/** Искры из центра элемента. */
export function burstAt(el: Element | null, count?: number) {
  if (!el) return burst(undefined, count);
  const r = el.getBoundingClientRect();
  burst({ x: r.left + r.width / 2, y: r.top + r.height / 2 }, count);
}

/** Всплывающая надпись («+1», «3»). */
export function floatText(p: { x: number; y: number }, text: string, color = '#1d4ed8') {
  if (reduced()) return;
  const el = particle(p.x, p.y, 60, { color, fontSize: '44px', fontWeight: '900' });
  if (!el) return;
  el.textContent = text;
  el.classList.add('fx-text');
  animate(
    el,
    [
      { transform: 'translateY(0) scale(0.5)', opacity: 0 },
      { transform: 'translateY(-30px) scale(1.2)', opacity: 1, offset: 0.3 },
      { transform: 'translateY(-90px) scale(1)', opacity: 0 },
    ],
    { duration: 900, easing: 'ease-out' },
  );
}

/** Светящийся след пальца (вызывается на каждое движение; частоту ограничивает сам). */
let lastTrail = 0;
export function trail(x: number, y: number) {
  const now = performance.now();
  if (now - lastTrail < 35 || reduced()) return;
  lastTrail = now;
  const el = particle(x, y, 22, {
    background: 'radial-gradient(circle, #fff 0, #fde68a 35%, rgb(250 204 21 / 0) 70%)',
    borderRadius: '50%',
  });
  animate(
    el,
    [
      { transform: 'scale(1)', opacity: 0.9 },
      { transform: 'scale(0.2)', opacity: 0 },
    ],
    { duration: 550, easing: 'ease-out' },
  );
}

// ─── Маскот ──────────────────────────────────────────────────────────────────

export type Mood = 'idle' | 'happy' | 'oops' | 'wow';
type MascotState = { mood: Mood; seq: number };
let mascot: MascotState = { mood: 'idle', seq: 0 };
const listeners = new Set<() => void>();
let calm: ReturnType<typeof setTimeout> | undefined;

export const mascotStore = {
  get: () => mascot,
  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};

/** Маскот реагирует; через пару секунд снова спокоен. */
export function cheer(mood: Exclude<Mood, 'idle'>) {
  mascot = { mood, seq: mascot.seq + 1 };
  listeners.forEach((l) => l());
  clearTimeout(calm);
  calm = setTimeout(
    () => {
      mascot = { mood: 'idle', seq: mascot.seq + 1 };
      listeners.forEach((l) => l());
    },
    mood === 'wow' ? 3000 : 1600,
  );
}
