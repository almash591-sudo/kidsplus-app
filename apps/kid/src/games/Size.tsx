import { useEffect, useRef, useState } from 'react';
import { SIZE_PROMPT } from '../phrases';
import { nice, praise, retry, say, shuffled, type GameProps } from './common';
import { DragItem, Pic } from './DragItem';
import { inside } from './useDrag';

/** Масштаб k-го размера из count: от 0,4 до 1. */
export const sizeScale = (k: number, count: number) => 0.4 + (0.6 * k) / (count - 1);

/** По размеру: одна картинка в нескольких размерах — поставить от маленького к большому. */
export function Size({ spec, phrases, onFinish }: GameProps<'size'>) {
  const [round, setRound] = useState(0);
  useEffect(() => {
    void say(SIZE_PROMPT);
  }, []);
  return (
    <SizeRound
      key={round}
      imageId={spec.imageIds[round]!}
      count={spec.count}
      onWrong={() => void retry(phrases)}
      onSolved={() => {
        void praise(phrases);
        setTimeout(() => {
          if (round + 1 < spec.imageIds.length) setRound(round + 1);
          else onFinish();
        }, 1600);
      }}
    />
  );
}

function SizeRound(props: {
  imageId: string;
  count: number;
  onWrong: () => void;
  onSolved: () => void;
}) {
  const { count } = props;
  const [loose] = useState(() => shuffled(Array.from({ length: count }, (_, k) => k)));
  const [placed, setPlaced] = useState<Set<number>>(new Set());
  const slots = useRef<(HTMLDivElement | null)[]>([]);

  const drop = (k: number, p: { x: number; y: number }) => {
    const hit = slots.current.findIndex((el, i) => !placed.has(i) && inside(el, p));
    if (hit < 0) return false;
    if (hit !== k) {
      props.onWrong();
      return false;
    }
    const next = new Set(placed).add(k);
    nice(slots.current[hit]);
    setPlaced(next);
    if (next.size === count) props.onSolved();
    return true;
  };

  const box = (k: number) => ({ '--s': sizeScale(k, count), '--i': k }) as React.CSSProperties;

  return (
    <div className="game size" data-testid="game-size">
      <div className="size-loose">
        {loose
          .filter((k) => !placed.has(k))
          .map((k) => (
            <DragItem
              key={k}
              className="size-item appear"
              testId="size-item"
              data={{ size: k }}
              style={box(k)}
              onDrop={(p) => drop(k, p)}
            >
              <Pic id={props.imageId} />
            </DragItem>
          ))}
      </div>
      <div className={placed.size === count ? 'size-steps solved' : 'size-steps'}>
        {Array.from({ length: count }, (_, k) => (
          <div
            key={k}
            ref={(el) => {
              slots.current[k] = el;
            }}
            className={placed.has(k) ? 'size-slot filled' : 'size-slot'}
            data-testid="size-slot"
            style={box(k)}
          >
            <Pic id={props.imageId} className={placed.has(k) ? 'size-in' : 'size-ghost'} />
          </div>
        ))}
      </div>
    </div>
  );
}
