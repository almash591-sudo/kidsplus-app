import { useEffect, useRef, useState } from 'react';
import { COMPARE_LESS, COMPARE_MORE, LESS_THAN, MORE_THAN } from '../phrases';
import { ask, NUMBERS, praise, retry, say, shuffled, type GameProps } from './common';
import { Pic } from './DragItem';
import { burstAt } from './juice';

/** Два разных числа от 1 до max. */
export function comparePair(max: number, rnd: () => number = Math.random): [number, number] {
  const a = 1 + Math.floor(rnd() * max);
  let b = 1 + Math.floor(rnd() * (max - 1));
  if (b >= a) b++;
  return [a, b];
}

/** Где больше / меньше: коснуться группы (или числа), где больше или меньше. */
export function Compare({ spec, phrases, onFinish }: GameProps<'compare'>) {
  const make = () => {
    const ask: 'more' | 'less' =
      spec.ask === 'mixed' ? (Math.random() < 0.5 ? 'more' : 'less') : spec.ask;
    return {
      pair: comparePair(spec.max),
      ask,
      image: spec.imageIds.length ? shuffled(spec.imageIds)[0]! : null,
    };
  };
  const [round, setRound] = useState(0);
  const [r, setR] = useState(make);
  const [wrong, setWrong] = useState<number | null>(null);
  const [solved, setSolved] = useState(false);
  const sides = useRef<(HTMLButtonElement | null)[]>([]);
  const [a, b] = r.pair;
  const answer = r.ask === 'more' ? (a > b ? 0 : 1) : a < b ? 0 : 1;
  const prompt = () => ask(r.ask === 'more' ? COMPARE_MORE : COMPARE_LESS);

  useEffect(() => {
    void prompt();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- задание звучит в начале раунда
  }, [round]);

  const choose = (side: number) => {
    if (solved) return;
    if (side !== answer) {
      setWrong(side);
      setTimeout(() => setWrong(null), 500);
      void retry(phrases);
      return;
    }
    setSolved(true);
    burstAt(sides.current[side] ?? null, 16);
    const [big, small] = a > b ? [a, b] : [b, a];
    // «Пять больше, чем три» — понятнее, чем просто «молодец».
    const told =
      r.ask === 'more'
        ? [NUMBERS[big]!, MORE_THAN, NUMBERS[small]!]
        : [NUMBERS[small]!, LESS_THAN, NUMBERS[big]!];
    void say(...told).then(() => praise(phrases));
    setTimeout(() => {
      if (round + 1 >= spec.rounds) return onFinish();
      setRound(round + 1);
      setR(make());
      setSolved(false);
    }, 3200);
  };

  return (
    <div className="game compare" data-testid="game-compare" data-answer={answer}>
      {[a, b].map((n, side) => (
        <button
          key={`${round}-${side}`}
          type="button"
          ref={(el) => {
            sides.current[side] = el;
          }}
          className={[
            'compare-side appear',
            wrong === side && 'off',
            solved && side === answer && 'picked',
          ]
            .filter(Boolean)
            .join(' ')}
          data-testid="compare-side"
          data-hint={!solved && side === answer ? '' : undefined}
          data-value={n}
          style={{ '--i': side } as React.CSSProperties}
          onClick={() => choose(side)}
        >
          {spec.mode === 'numbers' || !r.image ? (
            <span className="compare-number">{n}</span>
          ) : (
            <span className={`compare-group n${n}`}>
              {Array.from({ length: n }, (_, k) => (
                <span key={k} className="compare-thing" style={{ '--k': k } as React.CSSProperties}>
                  <Pic id={r.image!} />
                </span>
              ))}
            </span>
          )}
          {solved && spec.mode === 'objects' && <span className="compare-count">{n}</span>}
        </button>
      ))}
    </div>
  );
}
