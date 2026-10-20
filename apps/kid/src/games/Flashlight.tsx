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

/** Фон сцены (этап 35) — глиняная картинка своего формата для вертикального и горизонтального
 * экрана: вписывается с обрезкой краёв, без растяжения. */
function SceneArt({ scene }: { scene: FlashlightScene }) {
  return (
    <picture className="flash-scene" aria-hidden="true">
      <source media="(orientation: landscape)" srcSet={`/games/scene-${scene}-l.webp`} />
      <img src={`/games/scene-${scene}-p.webp`} alt="" draggable={false} />
    </picture>
  );
}
