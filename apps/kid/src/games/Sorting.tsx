import { mediaUrl } from '@kidsplus/shared/api';
import { useEffect, useRef, useState } from 'react';
import { nice, praise, retry, say, shuffled, type GameProps } from './common';
import { DragItem, Pic } from './DragItem';
import { inside } from './useDrag';

/** Разложи по местам: перетащить каждый предмет в свою корзину. Не туда — предмет вернётся. */
export function Sorting({ spec, phrases, onFinish }: GameProps<'sorting'>) {
  // Порядок предметов перемешивается один раз.
  const [items] = useState(() => shuffled(spec.items.map((it, i) => ({ ...it, key: i }))));
  const [placed, setPlaced] = useState<Record<number, number>>({});
  const bins = useRef<(HTMLDivElement | null)[]>([]);
  /** Корзина, куда только что положили, — подпрыгивает (n — чтобы анимация повторялась). */
  const [got, setGot] = useState<{ bin: number; n: number } | null>(null);
  const left = items.filter((i) => placed[i.key] === undefined);

  useEffect(() => {
    void say(spec.prompt);
  }, [spec.prompt]);

  const drop = (key: number, bin: number, p: { x: number; y: number }) => {
    const hit = bins.current.findIndex((el) => inside(el, p));
    if (hit < 0) return false;
    if (hit !== bin) {
      void retry(phrases);
      return false;
    }
    const next = { ...placed, [key]: bin };
    nice(bins.current[hit]);
    setGot({ bin, n: (got?.n ?? 0) + 1 });
    setPlaced(next);
    if (Object.keys(next).length === items.length) {
      void praise(phrases);
      setTimeout(onFinish, 1200);
    } else if (Object.keys(next).length % 2 === 0) void praise(phrases);
    return true;
  };

  return (
    <div className="game sorting" data-testid="game-sorting">
      <div className="bins">
        {spec.bins.map((b, i) => (
          <div
            key={got?.bin === i ? `${i}-${got.n}` : i}
            ref={(el) => {
              bins.current[i] = el;
            }}
            className={got?.bin === i ? 'bin got' : 'bin'}
            data-testid="bin"
            onClick={() => void say(b.name)}
          >
            <img className="bin-icon" src={mediaUrl(b.imageId)} alt="" draggable={false} />
            <div className="bin-content">
              {items
                .filter((it) => placed[it.key] === i)
                .map((it) => (
                  <img key={it.key} src={mediaUrl(it.imageId)} alt="" draggable={false} />
                ))}
            </div>
          </div>
        ))}
      </div>
      <div className="loose">
        {left.map((it, i) => (
          <DragItem
            key={it.key}
            className="item"
            testId="item"
            style={{ '--i': i } as React.CSSProperties}
            onDrop={(p) => drop(it.key, it.bin, p)}
          >
            <Pic id={it.imageId} />
          </DragItem>
        ))}
      </div>
      <button
        type="button"
        className="corner-button ear"
        aria-label="Повторить задание"
        onClick={() => void say(spec.prompt)}
      >
        👂
      </button>
    </div>
  );
}
