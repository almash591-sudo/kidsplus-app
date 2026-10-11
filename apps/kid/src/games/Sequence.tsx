import { useEffect, useRef, useState } from 'react';
import { ask, nice, praise, retry, shuffled, type GameProps } from './common';
import { DragItem, Pic } from './DragItem';
import { inside } from './useDrag';

/**
 * По порядку: карточки разложить по номерам — что сначала, что потом
 * (из семечка — росток — цветок; утро — день — вечер).
 */
export function Sequence({ spec, phrases, onFinish }: GameProps<'sequence'>) {
  const [round, setRound] = useState(0);
  const r = spec.rounds[round]!;
  return (
    <SequenceRound
      key={round}
      prompt={r.prompt}
      ids={r.imageIds}
      onWrong={() => void retry(phrases)}
      onSolved={() => {
        void praise(phrases);
        setTimeout(() => {
          if (round + 1 < spec.rounds.length) setRound(round + 1);
          else onFinish();
        }, 2400);
      }}
    />
  );
}

function SequenceRound(props: {
  prompt: string;
  ids: string[];
  onWrong: () => void;
  onSolved: () => void;
}) {
  const [loose] = useState(() => shuffled(props.ids.map((_, k) => k)));
  /** Заполненные места (номер места) и разложенные карточки (номер карточки). */
  const [placed, setPlaced] = useState<Set<number>>(new Set());
  const [used, setUsed] = useState<Set<number>>(new Set());
  const slots = useRef<(HTMLDivElement | null)[]>([]);
  const solved = placed.size === props.ids.length;

  useEffect(() => {
    void ask(props.prompt);
  }, [props.prompt]);

  const drop = (k: number, p: { x: number; y: number }) => {
    const hit = slots.current.findIndex((el, i) => !placed.has(i) && inside(el, p));
    if (hit < 0) return false;
    // Одинаковые картинки в цепочке взаимозаменяемы.
    if (props.ids[hit] !== props.ids[k]) {
      props.onWrong();
      return false;
    }
    const next = new Set(placed).add(hit);
    nice(slots.current[hit]);
    setPlaced(next);
    setUsed((u) => new Set(u).add(k));
    if (next.size === props.ids.length) props.onSolved();
    return true;
  };

  /** Подсказка: какую картинку взять и куда положить. */
  const hint = loose.find((k) => !used.has(k));
  const hintSlot =
    hint === undefined
      ? -1
      : props.ids.findIndex((id, i) => !placed.has(i) && id === props.ids[hint]);

  return (
    <div className="game sequence" data-testid="game-sequence">
      <div className={solved ? 'seq-slots solved' : 'seq-slots'}>
        {props.ids.map((id, i) => (
          <div key={i} className="seq-step" style={{ '--i': i } as React.CSSProperties}>
            {i > 0 && <span className="seq-arrow">➜</span>}
            <div
              ref={(el) => {
                slots.current[i] = el;
              }}
              className={placed.has(i) ? 'seq-slot filled' : 'seq-slot'}
              data-testid="seq-slot"
              data-image={id}
              data-hint-target={i === hintSlot ? '' : undefined}
            >
              {placed.has(i) ? <Pic id={id} /> : <span className="seq-num">{i + 1}</span>}
            </div>
          </div>
        ))}
      </div>
      <div className="seq-loose">
        {loose
          .filter((k) => !used.has(k))
          .map((k, i) => (
            <DragItem
              key={k}
              className="seq-item appear"
              testId="seq-item"
              data={{ image: props.ids[k]!, ...(k === hint && { hint: '' }) }}
              style={{ '--i': i } as React.CSSProperties}
              onDrop={(p) => drop(k, p)}
            >
              <Pic id={props.ids[k]!} />
            </DragItem>
          ))}
      </div>
    </div>
  );
}
