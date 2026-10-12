import { mediaUrl } from '@kidsplus/shared/api';
import { useEffect, useRef, useState } from 'react';
import { paint, type GameProps, type PaintId } from './common';
import { Palette } from './Palette';
import { CachedImg } from '../ui/CachedImg';

const BRUSH = { thin: 8, thick: 24 } as const;
const STICKER_SIZE = 110;

/** Рисовалка: рисуем пальцами (можно несколькими сразу), ставим наклейки, стираем всё. */
export function Drawing({ spec, onFinish }: GameProps<'drawing'>) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [color, setColor] = useState<PaintId>('red');
  const [brush, setBrush] = useState<keyof typeof BRUSH>('thick');
  const [sticker, setSticker] = useState<string | null>(null);
  const images = useRef(new Map<string, HTMLImageElement>());
  const last = useRef(new Map<number, { x: number; y: number }>());

  // Наклейки загружаются заранее — ставятся без задержки.
  useEffect(() => {
    for (const id of spec.stickerIds) {
      const img = new Image();
      img.src = mediaUrl(id);
      images.current.set(id, img);
    }
  }, [spec.stickerIds]);

  // Холст в размер экрана с учётом плотности пикселей; при повороте рисунок сохраняется.
  useEffect(() => {
    const el = canvas.current!;
    const fit = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = el.clientWidth * dpr;
      const h = el.clientHeight * dpr;
      if (el.width === Math.round(w) && el.height === Math.round(h)) return;
      const old = document.createElement('canvas');
      old.width = el.width;
      old.height = el.height;
      if (el.width && el.height) old.getContext('2d')?.drawImage(el, 0, 0);
      el.width = Math.round(w);
      el.height = Math.round(h);
      const ctx = el.getContext('2d')!;
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, el.width, el.height);
      if (old.width && old.height) ctx.drawImage(old, 0, 0);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const k = e.currentTarget.width / r.width;
    return { x: (e.clientX - r.left) * k, y: (e.clientY - r.top) * k, k };
  };

  const line = (from: { x: number; y: number }, to: { x: number; y: number }, k: number) => {
    const ctx = canvas.current!.getContext('2d')!;
    ctx.strokeStyle = paint(color).hex;
    ctx.lineWidth = BRUSH[brush] * k;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
  };

  const clear = () => {
    const el = canvas.current!;
    const ctx = el.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, el.width, el.height);
  };

  return (
    <div className="game drawing" data-testid="game-drawing">
      <canvas
        ref={canvas}
        className="drawing-canvas"
        data-testid="canvas"
        onPointerDown={(e) => {
          const p = point(e);
          if (sticker) {
            const img = images.current.get(sticker);
            const s = STICKER_SIZE * p.k;
            if (img?.complete)
              canvas.current!.getContext('2d')!.drawImage(img, p.x - s / 2, p.y - s / 2, s, s);
            return;
          }
          e.currentTarget.setPointerCapture?.(e.pointerId);
          last.current.set(e.pointerId, p);
          line(p, p, p.k); // точка от простого касания
        }}
        onPointerMove={(e) => {
          const prev = last.current.get(e.pointerId);
          if (!prev) return;
          const p = point(e);
          line(prev, p, p.k);
          last.current.set(e.pointerId, p);
        }}
        onPointerUp={(e) => last.current.delete(e.pointerId)}
        onPointerCancel={(e) => last.current.delete(e.pointerId)}
      />
      <div className="drawing-tools">
        <Palette
          value={sticker ? null : color}
          onChange={(c) => {
            setColor(c);
            setSticker(null);
          }}
        />
        <div className="tool-row">
          {(['thin', 'thick'] as const).map((b) => (
            <button
              key={b}
              type="button"
              className={!sticker && brush === b ? 'tool on' : 'tool'}
              aria-label={b === 'thin' ? 'Тонкая кисть' : 'Толстая кисть'}
              onClick={() => {
                setBrush(b);
                setSticker(null);
              }}
            >
              <span className="brush-dot" style={{ width: BRUSH[b], height: BRUSH[b] }} />
            </button>
          ))}
          {spec.stickerIds.map((id) => (
            <button
              key={id}
              type="button"
              className={sticker === id ? 'tool on' : 'tool'}
              aria-label="Наклейка"
              data-testid="sticker"
              onClick={() => setSticker(id)}
            >
              <CachedImg src={mediaUrl(id)} alt="" draggable={false} />
            </button>
          ))}
          <button type="button" className="tool" aria-label="Стереть всё" onClick={clear}>
            🧽
          </button>
          <button
            type="button"
            className="tool done"
            aria-label="Готово"
            data-testid="game-done"
            onClick={onFinish}
          >
            ✔
          </button>
        </div>
      </div>
    </div>
  );
}
