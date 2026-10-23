import type { TangramFigure } from '@kidsplus/shared/games';
import { useEffect, useRef, useState } from 'react';
import { itIs, TANGRAM_NAMES, TANGRAM_PROMPT } from '../phrases';
import { afterSpeech, ask, nice, praise, retry, shuffled, type GameProps } from './common';
import { DragItem, useSize } from './DragItem';
import { inside } from './useDrag';
import { piecePath, pieceKind, TANGRAMS, type Piece } from './shapes42';

/**
 * Танграм-малыш (этап 42): серый силуэт фигуры и детали под ним — перетащить каждую на её
 * место. Одинаковые детали подходят к любому своему месту; не та деталь — «попробуй ещё».
 */
export function Tangram({ spec, phrases, onFinish }: GameProps<'tangram'>) {
  const [round, setRound] = useState(0);
  useEffect(() => {
    void ask(TANGRAM_PROMPT);
  }, []);
  const figure = spec.figures[round]!;
  return (
    <TangramRound
      key={round}
      figure={figure}
      outline={spec.outline}
      onWrong={() => void retry(phrases)}
      onSolved={() => {
        void afterSpeech(praise(phrases, undefined, [itIs(TANGRAM_NAMES[figure])]), 1800).then(
          () => {
            if (round + 1 < spec.figures.length) setRound(round + 1);
            else onFinish();
          },
        );
      }}
    />
  );
}

/** Детали в лотке чуть мельче, чем в силуэте: на коротком экране всё помещается. */
const TRAY = 0.75;

/** Деталь отдельно — в своём размере, начало координат в её углу. */
const PieceSvg = ({ piece, scale }: { piece: Piece; scale: number }) => (
  <svg
    width={(piece.w + 2) * scale}
    height={(piece.h + 2) * scale}
    viewBox={`${piece.x - 1} ${piece.y - 1} ${piece.w + 2} ${piece.h + 2}`}
    style={{ overflow: 'visible' }}
  >
    <path d={piecePath(piece)} fill={piece.color} stroke="#333" strokeWidth={1.2} />
  </svg>
);

function TangramRound(props: {
  figure: TangramFigure;
  outline: boolean;
  onWrong: () => void;
  onSolved: () => void;
}) {
  const pieces = TANGRAMS[props.figure];
  const [loose] = useState(() => shuffled(pieces.map((_, i) => i)));
  /** Место (номер детали в фигуре) → какая деталь легла. */
  const [placed, setPlaced] = useState<Set<number>>(new Set());
  const [used, setUsed] = useState<Set<number>>(new Set());
  const board = useRef<HTMLDivElement>(null);
  const slots = useRef<(SVGPathElement | null)[]>([]);
  const size = useSize(board);
  // Поле — 104 единицы (с полями под обводку).
  const scale = size ? size.w / 104 : 0;

  const drop = (k: number, p: { x: number; y: number }) => {
    const kind = pieceKind(pieces[k]!);
    const free = pieces
      .map((s, i) => ({ s, i }))
      .filter(({ i }) => !placed.has(i) && inside(slots.current[i]!, p));
    const hit = free.find(({ s }) => pieceKind(s) === kind);
    if (!hit) {
      if (free.length) props.onWrong();
      return false;
    }
    const next = new Set(placed).add(hit.i);
    nice(slots.current[hit.i]);
    setPlaced(next);
    setUsed(new Set(used).add(k));
    if (next.size === pieces.length) props.onSolved();
    return true;
  };

  return (
    <div className="game tangram" data-testid="game-tangram">
      <div ref={board} className="tangram-board">
        <svg viewBox="-2 -2 104 104" className="tangram-svg">
          {pieces.map((s, i) => (
            <path
              key={i}
              ref={(el) => {
                slots.current[i] = el;
              }}
              d={piecePath(s)}
              className={placed.has(i) ? 'slot filled' : 'slot'}
              data-testid="tangram-slot"
              data-kind={pieceKind(s)}
              fill={placed.has(i) ? s.color : '#c9ced6'}
              stroke={placed.has(i) ? '#333' : props.outline ? '#fff' : 'none'}
              strokeWidth={1.2}
              strokeDasharray={placed.has(i) ? undefined : '3 2'}
            />
          ))}
        </svg>
      </div>
      <div className="tangram-tray">
        {scale > 0 &&
          loose
            .filter((k) => !used.has(k))
            .map((k, i) => (
              <DragItem
                key={k}
                className="tangram-piece appear"
                testId="tangram-piece"
                data={{ kind: pieceKind(pieces[k]!) }}
                style={{ '--i': i } as React.CSSProperties}
                onDrop={(p) => drop(k, p)}
              >
                <PieceSvg piece={pieces[k]!} scale={scale * TRAY} />
              </DragItem>
            ))}
      </div>
    </div>
  );
}
