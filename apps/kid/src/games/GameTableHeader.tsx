import { say } from './common';
import { Mascot } from './Mascot';
import { Icon } from '../ui/icons';

/** Picture-led instructions and quiet progress, without an extra reward currency. */
export function GameTableHeader({
  title,
  kind,
  hint,
  done,
  total,
}: {
  title: string;
  kind: 'memory' | 'puzzle';
  hint: string;
  done: number;
  total: number;
}) {
  return (
    <header className="game-table-header">
      <div className="game-table-title">
        <img src={`/games/icon-${kind}.webp`} alt="" draggable={false} />
        <h1>{title}</h1>
      </div>
      <div
        className={`game-table-progress${total > 8 ? ' is-dense' : ''}`}
        role="progressbar"
        aria-label="Собрано"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={done}
      >
        {Array.from({ length: total }, (_, i) => (
          <img
            key={i}
            className={i < done ? 'on' : ''}
            src="/games/robot-star.webp"
            alt=""
            draggable={false}
          />
        ))}
      </div>
      <button
        type="button"
        className="game-table-guide"
        aria-label="Повторить задание"
        data-testid="ear"
        onClick={() => void say(hint)}
      >
        <Mascot room />
        <span>
          <Icon name="ear" size={18} />
        </span>
      </button>
    </header>
  );
}
