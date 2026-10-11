import { mediaUrl } from '@kidsplus/shared/api';
import { useEffect, useState } from 'react';
import { COUNT_PROMPT } from '../phrases';
import { NUMBERS, praise, retry, say, shuffled, type GameProps } from './common';

/** Варианты ответа: верный и соседние числа, по возрастанию (как на линейке). */
export function countOptions(answer: number, max: number, count = 3): number[] {
  const pool = Array.from({ length: max }, (_, i) => i + 1).filter((n) => n !== answer);
  const near = pool.sort((a, b) => Math.abs(a - answer) - Math.abs(b - answer) || a - b);
  return [answer, ...near.slice(0, count - 1)].sort((a, b) => a - b);
}

/** Новое число для раунда — не такое же, как в прошлом. */
const nextAnswer = (max: number, prev?: number) => {
  const pool = Array.from({ length: max }, (_, i) => i + 1).filter((n) => n !== prev);
  return pool[Math.floor(Math.random() * pool.length)]!;
};

/**
 * Посчитай: на экране несколько предметов, внизу — цифры. Касание предмета считает вслух
 * («один, два…»), касание цифры — ответ.
 */
export function Counting({ spec, phrases, onFinish }: GameProps<'counting'>) {
  const [round, setRound] = useState(0);
  const [answer, setAnswer] = useState(() => nextAnswer(spec.max));
  const [image] = useState(() => shuffled(spec.imageIds));
  const [counted, setCounted] = useState<number[]>([]);
  const [wrong, setWrong] = useState<number[]>([]);
  const [solved, setSolved] = useState(false);
  const options = countOptions(answer, spec.max, Math.min(3, spec.max));
  const imageId = image[round % image.length]!;

  useEffect(() => {
    void say(COUNT_PROMPT);
  }, [round]);

  const tapItem = (i: number) => {
    if (counted.includes(i) || solved) return;
    const next = [...counted, i];
    setCounted(next);
    void say(NUMBERS[next.length]!);
  };

  const choose = (n: number) => {
    if (solved || wrong.includes(n)) return;
    if (n !== answer) {
      setWrong([...wrong, n]);
      void retry(phrases);
      return;
    }
    setSolved(true);
    void say(`${NUMBERS[n]}!`).then(() => praise(phrases));
    setTimeout(() => {
      if (round + 1 >= spec.rounds) return onFinish();
      setRound(round + 1);
      setAnswer(nextAnswer(spec.max, answer));
      setCounted([]);
      setWrong([]);
      setSolved(false);
    }, 2000);
  };

  return (
    <div className="game counting" data-testid="game-counting" data-answer={answer}>
      <div className="count-field">
        {Array.from({ length: answer }, (_, i) => (
          <button
            key={`${round}-${i}`}
            type="button"
            className={counted.includes(i) ? 'count-item counted' : 'count-item'}
            data-testid="count-item"
            style={{ '--i': i } as React.CSSProperties}
            aria-label="Предмет"
            onClick={() => tapItem(i)}
          >
            <img src={mediaUrl(imageId)} alt="" draggable={false} />
            {counted.includes(i) && <span className="count-mark">{counted.indexOf(i) + 1}</span>}
          </button>
        ))}
      </div>
      <div className="count-options">
        {options.map((n) => (
          <button
            key={n}
            type="button"
            className={
              wrong.includes(n)
                ? 'count-option off'
                : solved && n === answer
                  ? 'count-option right'
                  : 'count-option'
            }
            data-testid="count-option"
            data-value={n}
            onClick={() => choose(n)}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}
