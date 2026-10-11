import { useEffect, useRef, useState } from 'react';
import { SHADOWS_PROMPT } from '../phrases';
import { nice, praise, retry, say, shuffled, type GameProps } from './common';
import { DragItem, Pic } from './DragItem';
import { inside } from './useDrag';

/** Разбить список на раунды по size штук; последний короткий раунд сливается с предыдущим. */
export function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  if (out.length > 1 && out.at(-1)!.length < 2) out.at(-2)!.push(...out.pop()!);
  return out;
}

/** Найди тень: перетащить картинку на её силуэт. */
export function Shadows({ spec, phrases, onFinish }: GameProps<'shadows'>) {
  const [rounds] = useState(() => chunk(shuffled(spec.imageIds), spec.perRound));
  const [round, setRound] = useState(0);
  useEffect(() => {
    void say(SHADOWS_PROMPT);
  }, []);
  return (
    <ShadowRound
      key={round}
      ids={rounds[round]!}
      onWrong={() => void retry(phrases)}
      onSolved={() => {
        void praise(phrases);
        setTimeout(() => {
          if (round + 1 < rounds.length) setRound(round + 1);
          else onFinish();
        }, 1400);
      }}
    />
  );
}

function ShadowRound(props: { ids: string[]; onWrong: () => void; onSolved: () => void }) {
  // Одинаковые картинки в раунде различаем по номеру.
  const [targets] = useState(() => shuffled(props.ids.map((id, k) => ({ id, k }))));
  const [loose] = useState(() => shuffled(props.ids.map((id, k) => ({ id, k }))));
  /** Закрытые тени (номер тени) и уже положенные картинки (номер картинки). */
  const [placed, setPlaced] = useState<Set<number>>(new Set());
  const [used, setUsed] = useState<Set<number>>(new Set());
  const slots = useRef<(HTMLDivElement | null)[]>([]);

  const drop = (k: number, p: { x: number; y: number }) => {
    const hit = targets.findIndex((t, i) => !placed.has(t.k) && inside(slots.current[i]!, p));
    if (hit < 0) return false;
    const t = targets[hit]!;
    // Одинаковая картинка подходит к любой своей тени.
    if (t.id !== props.ids[k]) {
      props.onWrong();
      return false;
    }
    const next = new Set(placed).add(t.k);
    nice(slots.current[hit]);
    setPlaced(next);
    setUsed(new Set(used).add(k));
    if (next.size === props.ids.length) props.onSolved();
    return true;
  };

  return (
    <div className="game shadows" data-testid="game-shadows">
      <div className="shadow-row">
        {targets.map((t, i) => (
          <div
            key={t.k}
            ref={(el) => {
              slots.current[i] = el;
            }}
            className={placed.has(t.k) ? 'shadow-slot filled' : 'shadow-slot'}
            data-testid="shadow-slot"
            data-image={t.id}
            style={{ '--i': i } as React.CSSProperties}
          >
            <Pic id={t.id} className="shadow-img" />
          </div>
        ))}
      </div>
      <div className="shadow-loose">
        {loose
          .filter((it) => !used.has(it.k))
          .map((it, i) => (
            <DragItem
              key={it.k}
              className="shadow-item appear"
              testId="shadow-item"
              data={{ image: it.id }}
              style={{ '--i': i } as React.CSSProperties}
              onDrop={(p) => drop(it.k, p)}
            >
              <Pic id={it.id} />
            </DragItem>
          ))}
      </div>
    </div>
  );
}
