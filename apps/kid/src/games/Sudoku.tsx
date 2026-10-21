import { useEffect, useRef, useState } from 'react';
import { SUDOKU_COL, SUDOKU_DONE, SUDOKU_PROMPT, SUDOKU_ROW } from '../phrases';
import { afterSpeech, ask, bump, nice, praise, retry, say, type GameProps } from './common';
import { Pic } from './DragItem';
import { cheer } from './juice';
import { makeSudoku } from './sudokuGen';

/**
 * Судоку-малыш (этап 41): нажать пустую клетку (или сразу картинку — встанет в первую пустую) и
 * выбрать картинку внизу. Не подходит — совёнок говорит, где такая уже есть.
 */
export function Sudoku({ spec, phrases, onFinish }: GameProps<'sudoku'>) {
  const [round, setRound] = useState(0);
  return (
    <SudokuRound
      key={round}
      imageIds={[...new Set(spec.imageIds)].slice(0, spec.size)}
      size={spec.size}
      blanks={spec.blanks}
      onSolved={() => {
        void afterSpeech(praise(phrases, undefined, [SUDOKU_DONE]), 1800).then(() => {
          if (round + 1 < spec.rounds) setRound(round + 1);
          else onFinish();
        });
      }}
      onWrong={() => void retry(phrases)}
    />
  );
}

function SudokuRound(props: {
  imageIds: string[];
  size: number;
  blanks: number;
  onSolved: () => void;
  onWrong: () => void;
}) {
  const { size, imageIds } = props;
  const [puzzle] = useState(() => makeSudoku(size, props.blanks));
  const [filled, setFilled] = useState<Set<number>>(new Set());
  const [picked, setPicked] = useState<number | null>(null);
  const cells = useRef<(HTMLButtonElement | null)[]>([]);
  const value = (i: number) => puzzle.solution[Math.floor(i / size)]![i % size]!;
  const shown = (i: number) => !puzzle.holes.has(i) || filled.has(i);
  const empty = [...puzzle.holes].filter((i) => !filled.has(i)).sort((a, b) => a - b);
  const target = picked !== null && !filled.has(picked) ? picked : (empty[0] ?? null);

  useEffect(() => {
    void ask(SUDOKU_PROMPT);
  }, []);

  /** Такая картинка уже видна в строке (row) или столбце (col) клетки? */
  const conflict = (i: number, v: number) => {
    const r = Math.floor(i / size);
    const c = i % size;
    for (let k = 0; k < size; k++) {
      const inRow = r * size + k;
      if (inRow !== i && shown(inRow) && value(inRow) === v) return 'row';
    }
    for (let k = 0; k < size; k++) {
      const inCol = k * size + c;
      if (inCol !== i && shown(inCol) && value(inCol) === v) return 'col';
    }
    return null;
  };

  const place = (v: number) => {
    if (target === null) return;
    if (value(target) !== v) {
      const why = conflict(target, v);
      if (why) {
        // Объяснение вместо «попробуй ещё»: где такая картинка уже есть.
        bump();
        cheer('oops');
        cells.current[target]?.animate?.(
          [{ transform: 'scale(1)' }, { transform: 'scale(1.08)' }, { transform: 'scale(1)' }],
          { duration: 300 },
        );
        void say(why === 'row' ? SUDOKU_ROW : SUDOKU_COL);
      } else props.onWrong();
      return;
    }
    const next = new Set(filled).add(target);
    nice(cells.current[target]);
    setFilled(next);
    setPicked(null);
    if (next.size === puzzle.holes.size) props.onSolved();
  };

  const solved = empty.length === 0;
  return (
    <div className="game sudoku" data-testid="game-sudoku" data-size={size}>
      <div className="sudoku-grid" style={{ '--n': size } as React.CSSProperties}>
        {Array.from({ length: size * size }, (_, i) => (
          <button
            key={i}
            type="button"
            ref={(el) => {
              cells.current[i] = el;
            }}
            className={[
              'sudoku-cell',
              puzzle.holes.has(i) ? 'hole' : 'given',
              filled.has(i) && 'filled',
              !solved && i === target && 'target',
            ]
              .filter(Boolean)
              .join(' ')}
            data-testid="sudoku-cell"
            data-value={value(i)}
            data-empty={shown(i) ? undefined : ''}
            data-hint-target={!solved && i === target ? '' : undefined}
            onClick={() => !shown(i) && setPicked(i)}
          >
            {shown(i) && <Pic id={imageIds[value(i)]!} />}
          </button>
        ))}
      </div>
      <div className="sudoku-palette">
        {imageIds.map((id, v) => (
          <button
            key={id}
            type="button"
            className="sudoku-pick appear"
            data-testid="sudoku-pick"
            data-value={v}
            data-hint={!solved && target !== null && value(target) === v ? '' : undefined}
            style={{ '--i': v } as React.CSSProperties}
            onClick={() => place(v)}
          >
            <Pic id={id} />
          </button>
        ))}
      </div>
    </div>
  );
}
