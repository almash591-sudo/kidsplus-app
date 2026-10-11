import { useLayoutEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react';

export interface DragState {
  /** Смещение от точки захвата, px. */
  dx: number;
  dy: number;
}

/**
 * Перетаскивание пальцем: onMove — смещение от точки захвата, onDrop — где палец отпустил.
 * Захват указателя, чтобы перетаскивание не обрывалось, когда палец уходит с элемента.
 */
export function useDrag(handlers: {
  onStart?: () => void;
  onMove: (s: DragState) => void;
  onDrop: (point: { x: number; y: number }, s: DragState) => void;
}) {
  const start = useRef<{ x: number; y: number; id: number } | null>(null);
  const h = useRef(handlers);
  useLayoutEffect(() => {
    h.current = handlers;
  });

  return {
    onPointerDown: (e: ReactPointerEvent<HTMLElement>) => {
      if (start.current) return;
      e.currentTarget.setPointerCapture?.(e.pointerId);
      start.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
      h.current.onStart?.();
    },
    onPointerMove: (e: ReactPointerEvent<HTMLElement>) => {
      const s = start.current;
      if (!s || s.id !== e.pointerId) return;
      h.current.onMove({ dx: e.clientX - s.x, dy: e.clientY - s.y });
    },
    onPointerUp: (e: ReactPointerEvent<HTMLElement>) => {
      const s = start.current;
      if (!s || s.id !== e.pointerId) return;
      start.current = null;
      h.current.onDrop(
        { x: e.clientX, y: e.clientY },
        { dx: e.clientX - s.x, dy: e.clientY - s.y },
      );
    },
    onPointerCancel: (e: ReactPointerEvent<HTMLElement>) => {
      const s = start.current;
      if (!s || s.id !== e.pointerId) return;
      start.current = null;
      h.current.onDrop({ x: Number.NaN, y: Number.NaN }, { dx: 0, dy: 0 });
    },
  };
}

/** Точка внутри прямоугольника элемента. */
export const inside = (el: Element | null, p: { x: number; y: number }) => {
  if (!el) return false;
  const r = el.getBoundingClientRect();
  return p.x >= r.left && p.x <= r.right && p.y >= r.top && p.y <= r.bottom;
};
