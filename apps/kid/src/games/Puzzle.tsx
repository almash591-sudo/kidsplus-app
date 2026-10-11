import { mediaUrl } from '@kidsplus/shared/api';
import { useEffect, useRef, useState } from 'react';
import { fx } from '../fx';
import { praise, shuffled, type GameProps } from './common';
import { useDrag, type DragState } from './useDrag';

interface Layout {
  w: number;
  h: number;
  board: { x: number; y: number; s: number };
  tray: { x: number; y: number; w: number; h: number };
}

/** Доска слева (альбом) или сверху (портрет), остальное место — для кусочков. */
function layoutFor(w: number, h: number): Layout {
  const pad = 16;
  if (w > h) {
    const s = Math.min(h - 2 * pad, w * 0.5);
    return {
      w,
      h,
      board: { x: pad + 72, y: (h - s) / 2, s },
      tray: { x: s + 2 * pad + 72, y: pad, w: w - s - 3 * pad - 72, h: h - 2 * pad },
    };
  }
  const s = Math.min(w - 2 * pad, h * 0.5);
  const top = pad + 88;
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
  return (
    <PuzzleRound
      key={round}
      imageId={spec.imageIds[round]!}
      cols={spec.cols}
      rows={spec.rows}
      onSolved={() => {
        void praise(phrases);
        setTimeout(() => {
          if (round + 1 < spec.imageIds.length) setRound(round + 1);
          else onFinish();
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
  const tray = L ? trayGrid(count, L.tray.w, L.tray.h) : { cols: 1, rows: 1, cw: 0, ch: 0 };
  const k = L ? Math.min(1, (Math.min(tray.cw, tray.ch) * 0.9) / Math.max(pw, ph)) : 1;
  const centerOf = (p: (typeof loose)[number]) =>
    p.at
      ? { x: p.at.fx * L!.w, y: p.at.fy * L!.h }
      : {
          x: L!.tray.x + ((p.tray % tray.cols) + 0.5) * tray.cw,
          y: L!.tray.y + (Math.floor(p.tray / tray.cols) + 0.5) * tray.ch,
        };

  const drop = (piece: number, from: { x: number; y: number }, d: DragState) => {
    const at = { x: from.x + d.dx, y: from.y + d.dy };
    const target = slot(piece);
    if (Math.hypot(at.x - target.x, at.y - target.y) < Math.min(pw, ph) * 0.45) {
      const next = new Set(placed).add(piece);
      fx.snap();
      setPlaced(next);
      setLoose((l) => l.filter((p) => p.piece !== piece));
      if (next.size === count) props.onSolved();
      return;
    }
    // Остаётся там, где отпустили (в пределах экрана).
    const nx = Math.min(Math.max(at.x / L!.w, 0.05), 0.95);
    const ny = Math.min(Math.max(at.y / L!.h, 0.05), 0.95);
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
    <div className="game puzzle" ref={box} data-testid="game-puzzle">
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
                <div
                  key={i}
                  className={placed.has(i) ? 'puzzle-slot filled' : 'puzzle-slot'}
                  data-testid="puzzle-slot"
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
          {loose.map((p) => {
            const c = centerOf(p);
            return (
              <Piece
                key={p.piece}
                piece={p.piece}
                style={{
                  left: c.x - (pw * k) / 2,
                  top: c.y - (ph * k) / 2,
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
  );
}

function Piece(props: {
  piece: number;
  style: React.CSSProperties;
  onDrop: (d: DragState) => void;
}) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const handlers = useDrag({
    onStart: () => setDrag({ dx: 0, dy: 0 }),
    onMove: setDrag,
    onDrop: (_p, d) => {
      setDrag(null);
      props.onDrop(d);
    },
  });
  return (
    <div
      className={drag ? 'puzzle-piece dragging' : 'puzzle-piece'}
      data-testid="puzzle-piece"
      data-piece={props.piece}
      style={{
        ...props.style,
        transform: drag ? `translate(${drag.dx}px, ${drag.dy}px)` : undefined,
      }}
      {...handlers}
    />
  );
}

/** Сетка лотка с самыми крупными ячейками для n кусочков. */
function trayGrid(n: number, w: number, h: number) {
  let best = { cols: 1, rows: n, cw: w, ch: h / n };
  for (let c = 1; c <= n; c++) {
    const r = Math.ceil(n / c);
    if (Math.min(w / c, h / r) > Math.min(best.cw, best.ch))
      best = { cols: c, rows: r, cw: w / c, ch: h / r };
  }
  return best;
}
