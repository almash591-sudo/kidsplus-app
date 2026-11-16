import { mediaUrl } from '@kidsplus/shared/api';
import { useEffect, useRef, useState } from 'react';
import { fx } from '../fx';
import { praise, shuffled, type GameProps } from './common';
import { CachedImg } from '../ui/CachedImg';
import { GameTableHeader } from './GameTableHeader';

/** Найди пару: открываем по две карточки; совпали — остаются открытыми. */
export function Memory({ spec, phrases, onFinish }: GameProps<'memory'>) {
  const [cards] = useState(() =>
    shuffled(
      spec.imageIds.flatMap((id, pair) => [0, 1].map((k) => ({ key: pair * 2 + k, id, pair }))),
    ),
  );
  const [open, setOpen] = useState<number[]>([]);
  const [found, setFound] = useState<Set<number>>(new Set());
  const busy = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const field = useRef<HTMLDivElement>(null);
  const [area, setArea] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const element = field.current!;
    const observer = new ResizeObserver(() =>
      setArea({ w: element.clientWidth, h: element.clientHeight }),
    );
    observer.observe(element);
    return () => {
      observer.disconnect();
      clearTimeout(timer.current);
    };
  }, []);
  const { cols, rows, size } = gridFor(cards.length, area.w - 16, area.h - 20);

  const flip = (i: number) => {
    if (busy.current || open.includes(i) || found.has(cards[i]!.pair)) return;
    const next = [...open, i];
    fx.flip();
    setOpen(next);
    if (next.length < 2) return;
    const [a, b] = next.map((k) => cards[k]!);
    busy.current = true;
    if (a!.pair === b!.pair) {
      const all = new Set(found).add(a!.pair);
      setFound(all);
      setOpen([]);
      busy.current = all.size === spec.imageIds.length;
      void praise(phrases);
      if (all.size === spec.imageIds.length) timer.current = setTimeout(onFinish, 1200);
    } else {
      timer.current = setTimeout(() => {
        setOpen([]);
        busy.current = false;
      }, 1000);
    }
  };

  return (
    <div className="fairy-table-game" data-testid="game-memory">
      <GameTableHeader
        kind="memory"
        title="Найди пару"
        hint="Открой две карточки. Найди одинаковые картинки."
        done={found.size}
        total={spec.imageIds.length}
      />
      <div className="game-table-field" ref={field}>
        <div
          className="memory-grid fairy-memory-grid"
          style={
            {
              gridTemplateColumns: `repeat(${cols}, auto)`,
              '--card-w': `${Math.min(190, size)}px`,
              '--card-h': `${Math.min(190, size)}px`,
            } as React.CSSProperties
          }
          data-cols={cols}
          data-rows={rows}
        >
          {cards.map((c, i) => {
            const shown = open.includes(i) || found.has(c.pair);
            return (
              <button
                key={c.key}
                type="button"
                className={
                  found.has(c.pair)
                    ? 'memory-card open found'
                    : shown
                      ? 'memory-card open'
                      : 'memory-card'
                }
                data-testid="memory-card"
                data-pair={c.pair}
                style={{ '--i': i } as React.CSSProperties}
                aria-label={`Карточка ${i + 1}${found.has(c.pair) ? ': пара найдена' : shown ? ': открыта' : ''}`}
                aria-pressed={shown}
                aria-disabled={found.has(c.pair)}
                onClick={() => flip(i)}
              >
                {shown ? <CachedImg src={mediaUrl(c.id)} alt="" draggable={false} /> : null}
                {found.has(c.pair) && (
                  <span className="memory-found-mark" aria-hidden="true">
                    ✓
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** Сетка с самыми крупными карточками для области w × h. */
export function gridFor(n: number, w: number, h: number, gap = 12) {
  let best = { cols: 1, rows: n, size: 0 };
  for (let cols = 1; cols <= n; cols++) {
    const rows = Math.ceil(n / cols);
    const size = Math.min((w - gap * (cols - 1)) / cols, (h - gap * (rows - 1)) / rows);
    if (size > best.size) best = { cols, rows, size: Math.floor(size) };
  }
  return best;
}
