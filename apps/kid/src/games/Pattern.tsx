import type { Pattern as PatternKind } from '@kidsplus/shared/games';
import { useEffect, useRef, useState } from 'react';
import { PATTERN_DONE, PATTERN_PROMPT } from '../phrases';
import { afterSpeech, ask, nice, praise, retry, shuffled, type GameProps } from './common';
import { Pic } from './DragItem';

/**
 * Раунд «Продолжи ряд»: ряд из повторов закономерности (не меньше 6 картинок),
 * последняя — вопрос. Буквы закономерности — разные картинки.
 */
export function patternRound(pattern: PatternKind, imageIds: readonly string[]) {
  const letters = [...new Set(pattern)];
  const pool = shuffled([...new Set(imageIds)]);
  const map = Object.fromEntries(letters.map((l, i) => [l, pool[i]!]));
  const total = Math.max(6, pattern.length * 2 + 1);
  const row = Array.from({ length: total }, (_, i) => map[pattern[i % pattern.length]!]!);
  const answer = row.at(-1)!;
  // Варианты: картинки ряда и одна «чужая», если есть; не больше трёх.
  const used = letters.map((l) => map[l]!);
  const other = pool.slice(letters.length);
  const options = shuffled(
    [...new Set([answer, ...shuffled(used.filter((u) => u !== answer)), ...other])].slice(0, 3),
  );
  return { row: row.slice(0, -1), answer, options };
}

/** Продолжи ряд: 🍎🍌🍎🍌❓ — выбрать, что дальше. */
export function Pattern({ spec, phrases, onFinish }: GameProps<'pattern'>) {
  // Закономерности, для которых хватает разных картинок.
  const unique = new Set(spec.imageIds).size;
  const usable = spec.patterns.filter((p) => new Set(p).size <= unique);
  const patterns = usable.length ? usable : (['AB'] as const);
  const make = () =>
    patternRound(patterns[Math.floor(Math.random() * patterns.length)]!, spec.imageIds);
  const [round, setRound] = useState(0);
  const [r, setR] = useState(make);
  const [wrong, setWrong] = useState<string[]>([]);
  const [solved, setSolved] = useState(false);
  const slot = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void ask(PATTERN_PROMPT);
  }, [round]);

  const choose = (id: string) => {
    if (solved || wrong.includes(id)) return;
    if (id !== r.answer) {
      setWrong([...wrong, id]);
      void retry(phrases);
      return;
    }
    setSolved(true);
    nice(slot.current);
    void afterSpeech(praise(phrases, undefined, [PATTERN_DONE]), 2200).then(() => {
      if (round + 1 >= spec.rounds) return onFinish();
      setRound(round + 1);
      setR(make());
      setWrong([]);
      setSolved(false);
    });
  };

  return (
    <div className="game pattern" data-testid="game-pattern" data-answer={r.answer}>
      <div className={solved ? 'pattern-row solved' : 'pattern-row'} key={round}>
        {r.row.map((id, i) => (
          <div key={i} className="pattern-cell appear" style={{ '--i': i } as React.CSSProperties}>
            <Pic id={id} />
          </div>
        ))}
        <div
          ref={slot}
          className={solved ? 'pattern-cell question filled' : 'pattern-cell question'}
          style={{ '--i': r.row.length } as React.CSSProperties}
        >
          {solved ? <Pic id={r.answer} /> : <span>?</span>}
        </div>
      </div>
      <div className="pattern-options">
        {r.options.map((id) => (
          <button
            key={id}
            type="button"
            className={wrong.includes(id) ? 'pattern-option off' : 'pattern-option'}
            data-testid="pattern-option"
            data-image={id}
            data-hint={!solved && id === r.answer ? '' : undefined}
            onClick={() => choose(id)}
          >
            <Pic id={id} />
          </button>
        ))}
      </div>
    </div>
  );
}
