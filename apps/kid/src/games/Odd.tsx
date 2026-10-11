import { useEffect, useRef, useState } from 'react';
import { ODD_PROMPT } from '../phrases';
import { ask, praise, retry, say, shuffled, type GameProps } from './common';
import { Pic } from './DragItem';
import { burstAt } from './juice';

/** Что лишнее: из 3–4 картинок выбрать ту, что не подходит; потом звучит объяснение. */
export function Odd({ spec, phrases, onFinish }: GameProps<'odd'>) {
  const [round, setRound] = useState(0);
  const r = spec.rounds[round]!;
  const [order, setOrder] = useState(() => shuffled(r.imageIds.map((_, i) => i)));
  const [wrong, setWrong] = useState<number[]>([]);
  const [solved, setSolved] = useState(false);
  const cells = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    void ask(ODD_PROMPT);
  }, [round]);

  const choose = (i: number, slot: number) => {
    if (solved || wrong.includes(i)) return;
    if (i !== r.odd) {
      setWrong([...wrong, i]);
      void retry(phrases);
      return;
    }
    setSolved(true);
    burstAt(cells.current[slot] ?? null, 16);
    void (r.explain ? say(r.explain) : Promise.resolve()).then(() => praise(phrases));
    setTimeout(
      () => {
        if (round + 1 >= spec.rounds.length) return onFinish();
        const next = spec.rounds[round + 1]!;
        setRound(round + 1);
        setOrder(shuffled(next.imageIds.map((_, k) => k)));
        setWrong([]);
        setSolved(false);
      },
      r.explain ? 3800 : 1800,
    );
  };

  return (
    <div className="game odd" data-testid="game-odd" data-odd={r.odd}>
      <div className={`odd-grid n${order.length}`} key={round}>
        {order.map((i, slot) => (
          <button
            key={i}
            type="button"
            ref={(el) => {
              cells.current[slot] = el;
            }}
            className={[
              'odd-cell appear',
              wrong.includes(i) && 'off',
              solved && i === r.odd && 'picked',
              solved && i !== r.odd && 'together',
            ]
              .filter(Boolean)
              .join(' ')}
            data-testid="odd-cell"
            data-index={i}
            data-hint={!solved && i === r.odd ? '' : undefined}
            style={{ '--i': slot } as React.CSSProperties}
            onClick={() => choose(i, slot)}
          >
            <Pic id={r.imageIds[i]!} />
          </button>
        ))}
      </div>
    </div>
  );
}
