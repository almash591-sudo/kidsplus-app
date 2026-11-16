import { mediaUrl } from '@kidsplus/shared/api';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { fx } from '../fx';
import { cachedObjectUrl } from '../offline';
import { GAME_INTRO } from '../phrases';
import { Icon } from '../ui/icons';
import { cheer, mascotStore } from './juice';
import { paint, say, type GameProps, type PaintId } from './common';
import { Palette } from './Palette';

const BRUSH = { thin: 8, thick: 24 } as const;
const STICKER_SIZE = 110;
type Point = { x: number; y: number };
type Sample = Point & { order: number };
type Stroke = { kind: 'stroke'; color: string; width: number; points: Sample[] };
type Action =
  | Stroke
  | { kind: 'sticker'; id: string; point: Point; size: number; order: number }
  | { kind: 'clear'; order: number };
type StickerState = 'loading' | 'ready' | 'error';

/** Coordinates and brush widths are relative to the square sheet, not device pixels.
 * Replaying commands preserves the whole picture on rotation without bitmap undo copies. */
function segment(el: HTMLCanvasElement, stroke: Stroke, from: Point, to: Point) {
  const ctx = el.getContext('2d')!;
  ctx.strokeStyle = ctx.fillStyle = stroke.color;
  ctx.lineWidth = stroke.width * el.width;
  ctx.lineCap = ctx.lineJoin = 'round';
  ctx.beginPath();
  if (from.x === to.x && from.y === to.y) {
    ctx.arc(to.x * el.width, to.y * el.height, ctx.lineWidth / 2, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.moveTo(from.x * el.width, from.y * el.height);
    ctx.lineTo(to.x * el.width, to.y * el.height);
    ctx.stroke();
  }
}
function replay(el: HTMLCanvasElement, actions: Action[], images: Map<string, HTMLImageElement>) {
  const ctx = el.getContext('2d')!;
  const clear = () => {
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, el.width, el.height);
  };
  clear();
  // Two fingers can alternate segments. Replay in their original paint order too.
  const steps: { action: Action; order: number; index: number }[] = [];
  for (const action of actions) {
    if (action.kind === 'stroke')
      action.points.forEach((point, index) => steps.push({ action, order: point.order, index }));
    else steps.push({ action, order: action.order, index: 0 });
  }
  steps.sort((a, b) => a.order - b.order);
  for (const { action, index } of steps) {
    if (action.kind === 'clear') clear();
    else if (action.kind === 'sticker') {
      const img = images.get(action.id);
      if (!img?.complete || !img.naturalWidth) continue;
      const size = action.size * el.width;
      ctx.drawImage(
        img,
        action.point.x * el.width - size / 2,
        action.point.y * el.height - size / 2,
        size,
        size,
      );
    } else {
      segment(el, action, action.points[Math.max(0, index - 1)]!, action.points[index]!);
    }
  }
}

/** A quiet drawing workshop: fingers, two brushes, assigned stickers, reversible clearing. */
export function Drawing({ spec, onFinish }: GameProps<'drawing'>) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [color, setColor] = useState<PaintId>('red');
  const [brush, setBrush] = useState<keyof typeof BRUSH>('thick');
  const [sticker, setSticker] = useState<string | null>(null);
  const [stickerStates, setStickerStates] = useState<Record<string, StickerState>>({});
  const [stickerSources, setStickerSources] = useState<Record<string, string>>({});
  const [historySize, setHistorySize] = useState(0);
  const [hasArt, setHasArt] = useState(false);
  const [cursor, setCursor] = useState<Point>({ x: 0.5, y: 0.5 });
  const actions = useRef<Action[]>([]);
  const sequence = useRef(0);
  const pointers = useRef(new Map<number, Stroke>());
  const images = useRef(new Map<string, HTMLImageElement>());
  const blobUrls = useRef(new Set<string>());
  const generation = useRef({ active: false });
  const finished = useRef(false);
  const { mood } = useSyncExternalStore(mascotStore.subscribe, mascotStore.get);
  const happy = mood === 'happy' || mood === 'wow';

  const loadSticker = async (id: string, currentGeneration = generation.current) => {
    const cached = await cachedObjectUrl(mediaUrl(id));
    if (!currentGeneration.active) {
      if (cached) URL.revokeObjectURL(cached);
      return;
    }
    if (cached) blobUrls.current.add(cached);
    const img = new Image();
    images.current.set(id, img);
    img.onload = () => {
      if (!currentGeneration.active || images.current.get(id) !== img) return;
      setStickerSources((sources) => ({ ...sources, [id]: img.src }));
      setStickerStates((states) => ({ ...states, [id]: 'ready' }));
    };
    img.onerror = () => {
      if (!currentGeneration.active || images.current.get(id) !== img) return;
      setStickerStates((states) => ({ ...states, [id]: 'error' }));
    };
    img.src = cached ?? mediaUrl(id);
  };
  useEffect(() => {
    const current = { active: true };
    generation.current = current;
    for (const id of spec.stickerIds) void loadSticker(id, current);
    const loadedImages = images.current;
    const urls = blobUrls.current;
    return () => {
      current.active = false;
      loadedImages.forEach((img) => {
        img.onload = img.onerror = null;
      });
      loadedImages.clear();
      urls.forEach((url) => URL.revokeObjectURL(url));
      urls.clear();
    };
  }, [spec.stickerIds]);

  useEffect(() => {
    const el = canvas.current!;
    const fit = () => {
      const size = Math.max(1, Math.round(el.clientWidth * (window.devicePixelRatio || 1)));
      if (el.width === size && el.height === size) return;
      pointers.current.clear();
      el.width = el.height = size;
      replay(el, actions.current, images.current);
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const syncHistory = () => {
    setHistorySize(actions.current.length);
    setHasArt(Boolean(actions.current.length && actions.current.at(-1)?.kind !== 'clear'));
  };
  const point = (event: React.PointerEvent<HTMLCanvasElement>): Point => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)),
    };
  };
  const start = (at: Point): Stroke | null => {
    if (finished.current) return null;
    const el = canvas.current!;
    if (sticker) {
      const img = images.current.get(sticker);
      if (!img?.complete || !img.naturalWidth) return null;
      const size = STICKER_SIZE / el.clientWidth;
      actions.current.push({
        kind: 'sticker',
        id: sticker,
        point: at,
        size,
        order: sequence.current++,
      });
      const pixels = size * el.width;
      el.getContext('2d')!.drawImage(
        img,
        at.x * el.width - pixels / 2,
        at.y * el.height - pixels / 2,
        pixels,
        pixels,
      );
      syncHistory();
      fx.drop();
      cheer('happy');
      return null;
    }
    const stroke: Stroke = {
      kind: 'stroke',
      color: paint(color).hex,
      width: BRUSH[brush] / el.clientWidth,
      points: [{ ...at, order: sequence.current++ }],
    };
    actions.current.push(stroke);
    segment(el, stroke, at, at);
    syncHistory();
    return stroke;
  };
  const stop = (id: number) => {
    if (pointers.current.delete(id)) cheer('happy');
  };
  const undo = () => {
    if (!actions.current.length) return;
    pointers.current.clear();
    actions.current.pop();
    replay(canvas.current!, actions.current, images.current);
    syncHistory();
    fx.soft();
  };
  const clear = () => {
    if (!hasArt) return;
    pointers.current.clear();
    actions.current.push({ kind: 'clear', order: sequence.current++ });
    replay(canvas.current!, actions.current, images.current);
    syncHistory();
    fx.soft();
  };

  return (
    <div className="game drawing fairy-drawing" data-testid="game-drawing">
      <header className="drawing-heading">
        <img src="/games/icon-drawing.webp" alt="" draggable={false} />
        <h1>Рисовалка</h1>
      </header>
      <button
        type="button"
        className={`drawing-guide${happy ? ' is-happy' : ''}`}
        data-testid="ear"
        aria-label="Совёнок: как рисовать"
        onClick={() => {
          fx.soft();
          void say(GAME_INTRO.drawing);
        }}
      >
        <span className="drawing-owl" aria-hidden="true">
          <img src={`/playroom/${happy ? 'owl-wave' : 'owl'}.webp`} alt="" draggable={false} />
          <img
            className="drawing-owl-blink"
            src="/playroom/owl-blink.webp"
            alt=""
            draggable={false}
          />
        </span>
        <span className="drawing-guide-content">
          <span className="drawing-prompt">{sticker ? 'Поставь наклейку' : 'Рисуй пальчиком'}</span>
          <span className="drawing-guide-caption">
            {!hasArt && historySize
              ? 'Отмена вернёт рисунок'
              : sticker
                ? 'Коснись листа'
                : 'Выбери цвет и кисточку'}
          </span>
        </span>
        <Icon name="ear" size={25} />
      </button>
      <div className="drawing-board">
        <div className="drawing-paper">
          <div className="drawing-surface">
            <canvas
              ref={canvas}
              className="drawing-canvas"
              data-testid="canvas"
              tabIndex={0}
              aria-label="Лист для рисования. Стрелки двигают кисточку, пробел ставит точку, Shift и стрелки рисуют."
              onPointerDown={(event) => {
                if (event.button !== 0) return;
                event.currentTarget.focus({ preventScroll: true });
                const stroke = start(point(event));
                if (stroke) {
                  event.currentTarget.setPointerCapture(event.pointerId);
                  pointers.current.set(event.pointerId, stroke);
                }
              }}
              onPointerMove={(event) => {
                const stroke = pointers.current.get(event.pointerId);
                if (!stroke) return;
                const at = point(event);
                segment(event.currentTarget, stroke, stroke.points.at(-1)!, at);
                stroke.points.push({ ...at, order: sequence.current++ });
              }}
              onPointerUp={(event) => stop(event.pointerId)}
              onPointerCancel={(event) => stop(event.pointerId)}
              onLostPointerCapture={(event) => stop(event.pointerId)}
              onKeyDown={(event) => {
                if (event.key === ' ' || event.key === 'Enter') {
                  event.preventDefault();
                  start(cursor);
                  cheer('happy');
                  return;
                }
                const directions: Record<string, Point> = {
                  ArrowLeft: { x: -0.04, y: 0 },
                  ArrowRight: { x: 0.04, y: 0 },
                  ArrowUp: { x: 0, y: -0.04 },
                  ArrowDown: { x: 0, y: 0.04 },
                };
                const direction = directions[event.key];
                if (!direction) return;
                event.preventDefault();
                const next = {
                  x: Math.max(0, Math.min(1, cursor.x + direction.x)),
                  y: Math.max(0, Math.min(1, cursor.y + direction.y)),
                };
                if (event.shiftKey && !sticker) {
                  const stroke = start(cursor);
                  if (stroke) {
                    segment(event.currentTarget, stroke, cursor, next);
                    stroke.points.push({ ...next, order: sequence.current++ });
                  }
                }
                setCursor(next);
              }}
            />
            <span
              className="drawing-keyboard-cursor"
              aria-hidden="true"
              style={{
                left: `${cursor.x * 100}%`,
                top: `${cursor.y * 100}%`,
                borderColor: paint(color).hex,
              }}
            />
          </div>
        </div>
      </div>
      <div className="drawing-tools">
        <Palette
          marked
          value={sticker ? null : color}
          onChange={(next) => {
            setColor(next);
            setSticker(null);
          }}
        />
        <div className="drawing-brushes">
          {(['thin', 'thick'] as const).map((size) => (
            <button
              key={size}
              type="button"
              className={`drawing-tool${!sticker && brush === size ? ' on' : ''}`}
              aria-label={size === 'thin' ? 'Тонкая кисть' : 'Толстая кисть'}
              aria-pressed={!sticker && brush === size}
              onClick={() => {
                setBrush(size);
                setSticker(null);
                fx.soft();
              }}
            >
              <span
                className="brush-dot"
                style={{ width: BRUSH[size], height: BRUSH[size], background: paint(color).hex }}
              />
            </button>
          ))}
          {spec.stickerIds.length ? (
            <div className="drawing-stickers" role="group" aria-label="Наклейки для рисунка">
              {spec.stickerIds.map((id, i) => (
                <button
                  key={id}
                  type="button"
                  className={`drawing-tool${sticker === id ? ' on' : ''}`}
                  data-testid="sticker"
                  aria-label={
                    stickerStates[id] === 'error'
                      ? `Загрузить наклейку ${i + 1} ещё раз`
                      : `Наклейка ${i + 1}`
                  }
                  aria-pressed={sticker === id}
                  disabled={!stickerStates[id] || stickerStates[id] === 'loading'}
                  onClick={() => {
                    if (stickerStates[id] === 'error') {
                      setStickerStates((states) => ({ ...states, [id]: 'loading' }));
                      void loadSticker(id);
                      return;
                    }
                    setSticker(id);
                    fx.soft();
                  }}
                >
                  {stickerStates[id] === 'ready' ? (
                    <img src={stickerSources[id]} alt="" draggable={false} />
                  ) : stickerStates[id] === 'error' ? (
                    <Icon name="retry" size={25} />
                  ) : (
                    <img src="/playroom/basket.webp" alt="" draggable={false} />
                  )}
                </button>
              ))}
            </div>
          ) : (
            <span className="drawing-brush-caption">
              <img src="/games/paints-brush.webp" alt="" />
              {paint(color).name}
            </span>
          )}
        </div>
        <div className="drawing-actions">
          <button
            type="button"
            className="drawing-tool drawing-undo"
            aria-label="Отменить последнее действие"
            disabled={!historySize}
            onClick={undo}
          >
            <Icon name="retry" size={25} />
          </button>
          <button
            type="button"
            className="drawing-tool drawing-clear"
            aria-label="Стереть всё"
            disabled={!hasArt}
            onClick={clear}
          >
            <Icon name="close" size={23} />
            <span>Стереть</span>
          </button>
          <button
            type="button"
            className="drawing-tool drawing-done"
            aria-label="Готово"
            data-testid="game-done"
            onClick={() => {
              if (finished.current) return;
              finished.current = true;
              pointers.current.clear();
              onFinish();
            }}
          >
            <Icon name="check" size={25} />
            <span>Готово</span>
          </button>
        </div>
      </div>
    </div>
  );
}
