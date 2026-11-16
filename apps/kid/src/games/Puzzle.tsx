import { mediaUrl } from '@kidsplus/shared/api';
import { useEffect, useRef, useState } from 'react';
import { fx } from '../fx';
import { praise, shuffled, type GameProps } from './common';
import { useDrag, type DragState } from './useDrag';
import { GameTableHeader } from './GameTableHeader';
import { nice } from './common';

interface Layout {
  w: number;
  h: number;
  board: { x: number; y: number; s: number };
  tray: { x: number; y: number; w: number; h: number };
}

/** Доска слева (альбом) или сверху (портрет), остальное место — для кусочков. */
function layoutFor(w: number, h: number): Layout {
  const pad = 12;
  if (w > h) {
    const s = Math.min(h - 2 * pad, w * 0.54);
    return {
      w,
      h,
      board: { x: pad, y: (h - s) / 2, s },
      tray: { x: s + 2 * pad, y: pad, w: w - s - 3 * pad, h: h - 2 * pad },
    };
  }
  const s = Math.min(w - 2 * pad, h * 0.54);
  const top = pad;
  return {
    w,
    h,
    board: { x: (w - s) / 2, y: top, s },
    tray: { x: pad, y: top + s + pad, w: w - 2 * pad, h: h - top - s - 2 * pad },
  };
}

/** Пазл: картинка режется на части; кусочек, отпущенный рядом со своим местом, встаёт туда. */
export function Puzzle({ spec, phrases, onFinish }: GameProps<'puzzle'>) {
  const [round, setRound] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const solved = useRef(false);
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <PuzzleRound
      key={round}
      imageId={spec.imageIds[round]!}
      cols={spec.cols}
      rows={spec.rows}
      onSolved={() => {
        if (solved.current) return;
        solved.current = true;
        void praise(phrases);
        timer.current = setTimeout(() => {
          if (round + 1 < spec.imageIds.length) {
            solved.current = false;
            setRound(round + 1);
          } else onFinish();
        }, 1300);
      }}
    />
  );
}

function PuzzleRound(props: { imageId: string; cols: number; rows: number; onSolved: () => void }) {
  const { cols, rows } = props;
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const count = cols * rows;
  /**
   * Свободные кусочки: место в сетке лотка (tray) или центр, куда ребёнок его положил
   * (доли размера экрана).
   */
  const [loose, setLoose] = useState<
    { piece: number; tray: number; at?: { fx: number; fy: number } }[]
  >(() =>
    shuffled(Array.from({ length: count }, (_, i) => i)).map((piece, tray) => ({ piece, tray })),
  );
  const [placed, setPlaced] = useState<Set<number>>(new Set());
  const placedRef = useRef(new Set<number>());
  const [selected, setSelected] = useState<number | null>(null);

  useEffect(() => {
    const el = box.current!;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const L = size && layoutFor(size.w, size.h);
  const pw = L ? L.board.s / cols : 0;
  const ph = L ? L.board.s / rows : 0;
  /** Центр места кусочка на доске. */
  const slot = (piece: number) => ({
    x: L!.board.x + ((piece % cols) + 0.5) * pw,
    y: L!.board.y + (Math.floor(piece / cols) + 0.5) * ph,
  });
  // Лоток — сетка без наложений; кусочки в нём уменьшены, если не помещаются.
  const tray = L
    ? trayGrid(Math.min(count, 6), L.tray.w, L.tray.h, pw, ph)
    : { cols: 1, rows: 1, cw: 0, ch: 0, scale: 1 };
  const k = tray.scale;
  // Узкая полоска картинки сохраняет пропорции, но нажимается как кнопка не меньше 48 px.
  const hitWidth = Math.max(48, pw * k);
  const hitHeight = Math.max(48, ph * k);
  const keepInside = (at: { x: number; y: number }) => ({
    x: Math.min(Math.max(at.x, hitWidth / 2 + 4), L!.w - hitWidth / 2 - 4),
    y: Math.min(Math.max(at.y, hitHeight / 2 + 4), L!.h - hitHeight / 2 - 4),
  });
  const centerOf = (p: (typeof loose)[number]) =>
    p.at
      ? keepInside({ x: p.at.fx * L!.w, y: p.at.fy * L!.h })
      : {
          x: L!.tray.x + ((p.tray % tray.cols) + 0.5) * tray.cw,
          y: L!.tray.y + (Math.floor(p.tray / tray.cols) + 0.5) * tray.ch,
        };

  const place = (piece: number) => {
    if (placedRef.current.has(piece)) return;
    const next = new Set(placedRef.current).add(piece);
    placedRef.current = next;
    fx.snap();
    setPlaced(next);
    setSelected(null);
    setLoose((list) => {
      const freeSlot = list.find((item) => item.piece === piece)?.tray;
      const rest = list.filter((item) => item.piece !== piece);
      const refill = rest.find((item) => item.tray >= 6);
      return freeSlot !== undefined && refill
        ? rest.map((item) => (item === refill ? { ...item, tray: freeSlot } : item))
        : rest;
    });
    if (next.size === count) props.onSolved();
  };
  const drop = (piece: number, from: { x: number; y: number }, d: DragState) => {
    const at = { x: from.x + d.dx, y: from.y + d.dy };
    const target = slot(piece);
    if (Math.hypot(at.x - target.x, at.y - target.y) < Math.min(pw, ph) * 0.45) {
      place(piece);
      return;
    }
    // Весь кусочек остаётся в рабочей области, в том числе после поворота экрана.
    const safe = keepInside(at);
    const nx = safe.x / L!.w;
    const ny = safe.y / L!.h;
    setLoose((l) => l.map((p) => (p.piece === piece ? { ...p, at: { fx: nx, fy: ny } } : p)));
  };

  const url = mediaUrl(props.imageId);
  const bg = (piece: number) => ({
    backgroundImage: `url(${url})`,
    backgroundSize: `${cols * 100}% ${rows * 100}%`,
    backgroundPosition: `${cols > 1 ? ((piece % cols) / (cols - 1)) * 100 : 0}% ${
      rows > 1 ? (Math.floor(piece / cols) / (rows - 1)) * 100 : 0
    }%`,
  });

  return (
    <div className="fairy-table-game" data-testid="game-puzzle">
      <GameTableHeader
        kind="puzzle"
        title="Собери картинку"
        hint="Перетащи кусочек на его место. Или нажми на кусочек, а потом на его место на картинке."
        done={placed.size}
        total={count}
      />
      <div className="game-table-field puzzle" ref={box}>
        {L && (
          <>
            <div
              className="puzzle-board"
              style={{ left: L.board.x, top: L.board.y, width: L.board.s, height: L.board.s }}
            >
              <img className="puzzle-ghost" src={url} alt="" draggable={false} />
              {Array.from({ length: count }, (_, i) => {
                const s = slot(i);
                return (
                  <button
                    key={i}
                    type="button"
                    className={placed.has(i) ? 'puzzle-slot filled' : 'puzzle-slot'}
                    data-testid="puzzle-slot"
                    aria-label={`Место ${i + 1}${placed.has(i) ? ': собрано' : ''}`}
                    aria-disabled={placed.has(i)}
                    data-hint-target={selected === i ? '' : undefined}
                    onClick={(event) => {
                      if (selected === null || placedRef.current.has(i)) return;
                      if (selected === i) place(i);
                      else {
                        fx.soft();
                        nice(event.currentTarget);
                      }
                    }}
                    style={{
                      left: s.x - pw / 2 - L.board.x,
                      top: s.y - ph / 2 - L.board.y,
                      width: pw,
                      height: ph,
                      ...(placed.has(i) ? bg(i) : {}),
                    }}
                  />
                );
              })}
            </div>
            {loose
              .filter((p) => p.tray < 6)
              .map((p) => {
                const c = centerOf(p);
                return (
                  <Piece
                    key={p.piece}
                    piece={p.piece}
                    selected={selected === p.piece}
                    onChoose={() => {
                      fx.soft();
                      setSelected(p.piece);
                    }}
                    style={{
                      left: c.x - hitWidth / 2,
                      top: c.y - hitHeight / 2,
                      width: hitWidth,
                      height: hitHeight,
                    }}
                    picture={{
                      width: pw * k,
                      height: ph * k,
                      ...bg(p.piece),
                    }}
                    onDrop={(d) => drop(p.piece, c, d)}
                  />
                );
              })}
          </>
        )}
      </div>
    </div>
  );
}

function Piece(props: {
  piece: number;
  style: React.CSSProperties;
  picture: React.CSSProperties;
  selected: boolean;
  onChoose: () => void;
  onDrop: (d: DragState) => void;
}) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const suppressClick = useRef(false);
  const handlers = useDrag({
    onStart: () => {
      suppressClick.current = false;
      setDrag({ dx: 0, dy: 0 });
    },
    onMove: setDrag,
    onDrop: (point, d) => {
      setDrag(null);
      suppressClick.current = !Number.isFinite(point.x) || Math.hypot(d.dx, d.dy) >= 10;
      if (suppressClick.current && Number.isFinite(point.x)) props.onDrop(d);
    },
  });
  return (
    <button
      type="button"
      className={`puzzle-piece${drag ? ' dragging' : ''}${props.selected ? ' selected' : ''}`}
      aria-label={`Кусочек ${props.piece + 1}`}
      aria-pressed={props.selected}
      data-testid="puzzle-piece"
      data-piece={props.piece}
      style={{
        ...props.style,
        transform: drag ? `translate(${drag.dx}px, ${drag.dy}px)` : undefined,
      }}
      {...handlers}
      onPointerDown={(event) => {
        if (event.button === 0) handlers.onPointerDown(event);
      }}
      onClick={(event) => {
        if (event.detail === 0 || !suppressClick.current) props.onChoose();
        suppressClick.current = false;
      }}
    >
      <span className="puzzle-piece-picture" style={props.picture} aria-hidden="true" />
    </button>
  );
}

/** Сетка учитывает пропорции частей и оставляет место для крупных зон нажатия. */
function trayGrid(n: number, w: number, h: number, pw: number, ph: number) {
  let best = { cols: 1, rows: n, cw: w, ch: h / n, scale: 0, fits: false };
  for (let c = 1; c <= n; c++) {
    const r = Math.ceil(n / c);
    const cw = w / c;
    const ch = h / r;
    const fits = cw >= 56 && ch >= 56;
    const scale = Math.min(1, (cw * 0.9) / pw, (ch * 0.9) / ph);
    if ((fits && !best.fits) || (fits === best.fits && scale > best.scale))
      best = { cols: c, rows: r, cw, ch, scale, fits };
  }
  return best;
}
