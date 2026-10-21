import { useEffect, useRef, useState } from 'react';
import { riddleAnswer } from '../phrases';
import {
  afterSpeech,
  ask,
  praise,
  repeatCurrentTask,
  retry,
  shuffled,
  type GameProps,
} from './common';
import { Pic } from './DragItem';
import { burstAt } from './juice';

type Riddle = GameProps<'riddle'>['spec']['riddles'][number];

/** Раунды загадок: rounds разных загадок, у каждой — отгадка и choices − 1 чужих отгадок. */
export function riddleRounds(riddles: Riddle[], rounds: number, choices: number) {
  const pick = shuffled;
  return pick(riddles)
    .slice(0, Math.min(rounds, riddles.length))
    .map((r) => {
      const others = [...new Set(riddles.map((x) => x.imageId))].filter((id) => id !== r.imageId);
      return { riddle: r, options: pick([r.imageId, ...pick(others).slice(0, choices - 1)]) };
    });
}

/** Загадки (этап 41): совёнок загадывает — ребёнок выбирает картинку-отгадку. */
export function RiddleGame({ spec, phrases, onFinish }: GameProps<'riddle'>) {
  const [rounds] = useState(() => riddleRounds(spec.riddles, spec.rounds, spec.choices));
  const [round, setRound] = useState(0);
  const { riddle, options } = rounds[round]!;
  const [wrong, setWrong] = useState<string[]>([]);
  const [solved, setSolved] = useState(false);
  const cells = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    void ask(riddle.text);
  }, [riddle.text]);

  const choose = (id: string, slot: number) => {
    if (solved || wrong.includes(id)) return;
    if (id !== riddle.imageId) {
      setWrong([...wrong, id]);
      void retry(phrases);
      return;
    }
    setSolved(true);
    burstAt(cells.current[slot] ?? null, 16);
    void afterSpeech(praise(phrases, undefined, [riddleAnswer(riddle.name)]), 1800).then(() => {
      if (round + 1 >= rounds.length) return onFinish();
      setRound(round + 1);
      setWrong([]);
      setSolved(false);
    });
  };

  return (
    <div className="game riddle" data-testid="game-riddle" data-answer={riddle.imageId}>
      <button
        type="button"
        className="riddle-owl"
        aria-label="Повторить загадку"
        data-testid="riddle-repeat"
        onClick={() => repeatCurrentTask()}
      >
        <img src={solved ? '/owl/happy.webp' : '/owl/talk.webp'} alt="" draggable={false} />
        <span className="riddle-bubble" aria-hidden="true">
          {solved ? '!' : '?'}
        </span>
      </button>
      <div className={`odd-grid riddle-grid n${options.length}`} key={round}>
        {options.map((id, slot) => (
          <button
            key={id}
            type="button"
            ref={(el) => {
              cells.current[slot] = el;
            }}
            className={[
              'odd-cell appear',
              wrong.includes(id) && 'off',
              solved && id === riddle.imageId && 'answer',
            ]
              .filter(Boolean)
              .join(' ')}
            data-testid="riddle-option"
            data-id={id}
            data-hint={!solved && id === riddle.imageId ? '' : undefined}
            style={{ '--i': slot } as React.CSSProperties}
            onClick={() => choose(id, slot)}
          >
            <Pic id={id} />
          </button>
        ))}
      </div>
    </div>
  );
}
