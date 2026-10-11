import type { FlashlightScene } from '@kidsplus/shared/games';
import { useEffect, useRef, useState } from 'react';
import { fx } from '../fx';
import { FLASH_PROMPT } from '../phrases';
import { ask, praise, say, shuffled, type GameProps } from './common';
import { Pic } from './DragItem';
import { burst, cheer } from './juice';

/**
 * Места для предметов: сетка 4 × 3 со случайным сдвигом, чтобы не накладывались.
 * Левый верхний угол занят кнопкой «домой» и совёнком — туда не прячем.
 */
export function hidingSpots(count: number, rnd: () => number = Math.random) {
  const cells = shuffled(Array.from({ length: 11 }, (_, i) => i + 1)).slice(0, count);
  return cells.map((c) => ({
    x: ((c % 4) + 0.5 + (rnd() - 0.5) * 0.4) / 4,
    y: (Math.floor(c / 4) + 0.5 + (rnd() - 0.5) * 0.4) / 3,
  }));
}

/** Фонарик: экран тёмный, палец — луч света; кого осветили — тот найден. */
export function Flashlight({ spec, phrases, onFinish }: GameProps<'flashlight'>) {
  const [spots] = useState(() => hidingSpots(spec.items.length));
  const [found, setFound] = useState<Set<number>>(new Set());
  const [touched, setTouched] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const dark = useRef<HTMLDivElement>(null);
  const all = found.size === spec.items.length;

  useEffect(() => {
    void ask(FLASH_PROMPT);
  }, []);

  const shine = (e: React.PointerEvent) => {
    const el = box.current!;
    const r = el.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    dark.current?.style.setProperty('--lx', `${x}px`);
    dark.current?.style.setProperty('--ly', `${y}px`);
    if (!touched) setTouched(true);
    if (all) return;
    const light = Math.min(r.width, r.height) * 0.13;
    const i = spots.findIndex(
      (s, k) => !found.has(k) && Math.hypot(s.x * r.width - x, s.y * r.height - y) <= light,
    );
    if (i < 0) return;
    const s = spots[i]!;
    const next = new Set(found).add(i);
    setFound(next);
    const at = { x: r.left + s.x * r.width, y: r.top + s.y * r.height };
    burst(at, 12);
    const name = spec.items[i]!.name;
    if (next.size === spec.items.length) {
      cheer('wow');
      void (name ? say(name) : Promise.resolve()).then(() => praise(phrases, at));
      setTimeout(onFinish, 2600);
    } else {
      fx.snap();
      cheer('happy');
      if (name) void say(name);
    }
  };

  return (
    <div
      ref={box}
      className={`game flashlight ${spec.scene}`}
      data-testid="game-flashlight"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture?.(e.pointerId);
        shine(e);
      }}
      onPointerMove={(e) => (e.buttons || e.pointerType === 'mouse') && shine(e)}
    >
      <SceneArt scene={spec.scene} />
      {spec.items.map((it, i) => (
        <div
          key={i}
          className={found.has(i) ? 'flash-item found' : 'flash-item'}
          data-testid="flash-item"
          data-found={found.has(i)}
          style={{ left: `${spots[i]!.x * 100}%`, top: `${spots[i]!.y * 100}%` }}
        >
          <Pic id={it.imageId} />
        </div>
      ))}
      <div
        ref={dark}
        className={['flash-dark', touched ? '' : 'idle', all ? 'lights-on' : ''].join(' ')}
      />
      <div className="flash-progress" aria-hidden="true">
        {spec.items.map((_, i) => (
          <span key={i} className={found.has(i) ? 'on' : ''} />
        ))}
      </div>
    </div>
  );
}

/** Фон сцены — нарисован, без картинок с сервера. Поле 400 × 300, растягивается с обрезкой. */
function SceneArt({ scene }: { scene: FlashlightScene }) {
  return (
    <svg
      className="flash-scene"
      viewBox="0 0 400 300"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      {scene === 'room' && (
        <>
          <rect width="400" height="300" fill="#FDE7C2" />
          <rect y="210" width="400" height="90" fill="#C08552" />
          <path d="M0,210 H400" stroke="#8B5A2B" strokeWidth="4" />
          <rect
            x="40"
            y="40"
            width="90"
            height="80"
            rx="6"
            fill="#7DD3FC"
            stroke="#fff"
            strokeWidth="8"
          />
          <path d="M85,40 V120 M40,80 H130" stroke="#fff" strokeWidth="6" />
          <rect x="250" y="120" width="120" height="100" rx="8" fill="#9B5DE5" />
          <rect x="262" y="135" width="96" height="30" rx="4" fill="#B794F4" />
          <rect x="262" y="175" width="96" height="30" rx="4" fill="#B794F4" />
          <circle cx="200" cy="40" r="18" fill="#FACC15" />
          <path d="M200,0 V22" stroke="#555" strokeWidth="3" />
          <ellipse cx="190" cy="255" rx="80" ry="22" fill="#E8453C" opacity="0.7" />
        </>
      )}
      {scene === 'forest' && (
        <>
          <rect width="400" height="300" fill="#BFE3FF" />
          <rect y="220" width="400" height="80" fill="#4ADE80" />
          {[30, 110, 200, 290, 370].map((x, i) => (
            <g key={x}>
              <rect x={x - 8} y="150" width="16" height="80" fill="#92400E" />
              <circle cx={x} cy={130 - (i % 2) * 20} r={50} fill={i % 2 ? '#15803D' : '#22A55B'} />
            </g>
          ))}
          {[60, 160, 250, 340].map((x) => (
            <circle key={x} cx={x} cy="262" r="16" fill="#16A34A" />
          ))}
        </>
      )}
      {scene === 'sea' && (
        <>
          <rect width="400" height="300" fill="#38BDF8" />
          <rect y="0" width="400" height="60" fill="#7DD3FC" />
          <rect y="255" width="400" height="45" fill="#FDE68A" />
          {[40, 120, 300, 360].map((x, i) => (
            <path
              key={x}
              d={`M${x},260 q-15,-40 0,-80 q15,-40 0,-80`}
              stroke={i % 2 ? '#15803D' : '#22A55B'}
              strokeWidth="9"
              fill="none"
              strokeLinecap="round"
            />
          ))}
          {[80, 200, 330].map((x) => (
            <circle key={x} cx={x} cy={70 + (x % 50)} r="7" fill="#E0F2FE" opacity="0.7" />
          ))}
        </>
      )}
      {scene === 'space' && (
        <>
          <rect width="400" height="300" fill="#1E1B4B" />
          {Array.from({ length: 40 }, (_, i) => (
            <circle
              key={i}
              cx={(i * 97) % 400}
              cy={(i * 53) % 300}
              r={(i % 3) + 1}
              fill="#fff"
              opacity={0.5 + (i % 2) * 0.4}
            />
          ))}
          <circle cx="320" cy="70" r="40" fill="#F59E0B" />
          <ellipse cx="320" cy="70" rx="62" ry="12" fill="none" stroke="#FDE68A" strokeWidth="5" />
          <circle cx="70" cy="240" r="28" fill="#60A5FA" />
        </>
      )}
    </svg>
  );
}
