import type { SorterShape } from '@kidsplus/shared/games';
import { useEffect, useRef, useState } from 'react';
import { fx } from '../fx';
import { SORTER_PROMPT, SORTER_TURN } from '../phrases';
import { nice, praise, retry, say, shuffled, type GameProps } from './common';
import { DragItem } from './DragItem';
import { cheer } from './juice';
import { fits, SORTER } from './sorterShapes';
import { inside } from './useDrag';

const ShapeSvg = ({ shape, className }: { shape: SorterShape; className?: string }) => (
  <svg viewBox="-4 -4 108 108" className={className} aria-hidden="true">
    <path d={SORTER[shape].d} />
  </svg>
);

/** Сортер: перетащить фигуру в её отверстие; rotate — фигуры повёрнуты, касание поворачивает. */
export function Shapes({ spec, phrases, onFinish }: GameProps<'shapes'>) {
  const [holes] = useState(() => shuffled(spec.shapes.map((shape, k) => ({ shape, k }))));
  const [pieces, setPieces] = useState(() =>
    shuffled(
      spec.shapes.map((shape, k) => ({
        shape,
        k,
        rot:
          spec.rotate && SORTER[shape].period > 90 ? 90 * (1 + Math.floor(Math.random() * 3)) : 0,
      })),
    ),
  );
  /** Занятые отверстия (номер отверстия). */
  const [filled, setFilled] = useState<Set<number>>(new Set());
  const slots = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    void say(SORTER_PROMPT);
  }, []);

  const drop = (k: number, p: { x: number; y: number }) => {
    const piece = pieces.find((x) => x.k === k)!;
    const hit = holes.findIndex((h, i) => !filled.has(h.k) && inside(slots.current[i]!, p));
    if (hit < 0) return false;
    const hole = holes[hit]!;
    if (hole.shape !== piece.shape) {
      void retry(phrases);
      return false;
    }
    if (!fits(piece.shape, piece.rot)) {
      fx.soft();
      cheer('oops');
      void say(SORTER_TURN);
      return false;
    }
    const next = new Set(filled).add(hole.k);
    nice(slots.current[hit]);
    void say(SORTER[piece.shape].name);
    setFilled(next);
    setPieces((list) => list.filter((x) => x.k !== k));
    if (next.size === spec.shapes.length) {
      setTimeout(() => void praise(phrases), 600);
      setTimeout(onFinish, 1900);
    }
    return true;
  };

  const turn = (k: number) => {
    if (!spec.rotate) return;
    fx.flip();
    setPieces((list) => list.map((x) => (x.k === k ? { ...x, rot: x.rot + 90 } : x)));
  };

  return (
    <div className="game sorter" data-testid="game-shapes">
      <div className="sorter-board">
        {holes.map((h, i) => (
          <div
            key={h.k}
            ref={(el) => {
              slots.current[i] = el;
            }}
            className={filled.has(h.k) ? 'sorter-hole filled' : 'sorter-hole'}
            data-testid="sorter-hole"
            data-shape={h.shape}
            style={{ '--c': SORTER[h.shape].color } as React.CSSProperties}
          >
            <ShapeSvg shape={h.shape} className="sorter-hole-svg" />
            {filled.has(h.k) && <ShapeSvg shape={h.shape} className="sorter-piece-svg in" />}
          </div>
        ))}
      </div>
      <div className="sorter-loose">
        {pieces.map((p, i) => (
          <DragItem
            key={p.k}
            className="sorter-piece appear"
            testId="sorter-piece"
            data={{ shape: p.shape, rot: p.rot }}
            style={{ '--c': SORTER[p.shape].color, '--i': i } as React.CSSProperties}
            onGrab={() => void say(SORTER[p.shape].name)}
            onTap={spec.rotate ? () => turn(p.k) : undefined}
            onDrop={(pt) => drop(p.k, pt)}
          >
            <span className="sorter-turn" style={{ transform: `rotate(${p.rot}deg)` }}>
              <ShapeSvg shape={p.shape} className="sorter-piece-svg" />
            </span>
            {spec.rotate && SORTER[p.shape].period > 90 && (
              <span className="sorter-turn-hint">↻</span>
            )}
          </DragItem>
        ))}
      </div>
      <button
        type="button"
        className="corner-button ear"
        aria-label="Повторить задание"
        onClick={() => void say(SORTER_PROMPT)}
      >
        👂
      </button>
    </div>
  );
}
