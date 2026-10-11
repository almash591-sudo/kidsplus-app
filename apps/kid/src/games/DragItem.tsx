import { mediaUrl } from '@kidsplus/shared/api';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useDrag, type DragState } from './useDrag';
import { CachedImg } from '../ui/CachedImg';

/** Касание без перетаскивания — палец сдвинулся меньше, чем на столько пикселей. */
const TAP = 10;

/**
 * Предмет, который тащат пальцем: приподнимается и наклоняется, за пальцем — тень.
 * onDrop вернул false — предмет «пружинкой» возвращается на место. onTap — касание без сдвига.
 */
export function DragItem(props: {
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
  testId?: string;
  data?: Record<string, string | number>;
  onDrop: (p: { x: number; y: number }, el: HTMLDivElement) => boolean;
  onTap?: () => void;
  onGrab?: () => void;
}) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const [back, setBack] = useState(false);
  const el = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!back) return;
    const t = setTimeout(() => setBack(false), 450);
    return () => clearTimeout(t);
  }, [back]);
  const handlers = useDrag({
    onStart: () => {
      setDrag({ dx: 0, dy: 0 });
      props.onGrab?.();
    },
    onMove: setDrag,
    onDrop: (p, d) => {
      if (Math.hypot(d.dx, d.dy) < TAP && props.onTap) {
        setDrag(null);
        props.onTap();
        return;
      }
      if (!props.onDrop(p, el.current!)) {
        setDrag(null);
        if (Number.isFinite(p.x)) setBack(true);
      }
    },
  });
  const tilt = drag ? Math.max(-12, Math.min(12, drag.dx / 12)) : 0;
  const dataAttrs = Object.fromEntries(
    Object.entries(props.data ?? {}).map(([k, v]) => [`data-${k}`, String(v)]),
  );
  return (
    <div
      ref={el}
      className={['drag-item', props.className, drag && 'dragging', back && 'bounced-back']
        .filter(Boolean)
        .join(' ')}
      data-testid={props.testId}
      {...dataAttrs}
      style={{
        ...props.style,
        transform: drag
          ? `translate(${drag.dx}px, ${drag.dy}px) scale(1.15) rotate(${tilt}deg) ${props.style?.transform ?? ''}`
          : props.style?.transform,
      }}
      {...handlers}
    >
      {props.children}
    </div>
  );
}

/** Картинка игры. */
export const Pic = ({ id, className }: { id: string; className?: string }) => (
  <CachedImg className={className} src={mediaUrl(id)} alt="" draggable={false} />
);

/** Размер элемента (ResizeObserver). */
export function useSize(ref: React.RefObject<HTMLElement | null>) {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return size;
}
