import { useEffect, useState } from 'react';
import { fx } from '../fx';
import { HOW_MANY, MINUS, PLUS, WILL_BE } from '../phrases';
import { countOptions } from './Counting';
import {
  afterSpeech,
  NUMBERS,
  praise,
  retry,
  say,
  setTask,
  shuffled,
  type GameProps,
} from './common';
import { Pic } from './DragItem';

export interface Sum {
  a: number;
  b: number;
  op: 'plus' | 'minus';
  answer: number;
}

/** Пример в пределах max: сложение — от 1 + 1, вычитание — ответ не меньше 1. */
export function makeSum(op: 'plus' | 'minus', max: number, rnd: () => number = Math.random): Sum {
  const int = (lo: number, hi: number) => lo + Math.floor(rnd() * (hi - lo + 1));
  if (op === 'plus') {
    const a = int(1, max - 1);
    const b = int(1, max - a);
    return { a, b, op, answer: a + b };
  }
  const a = int(2, max);
  const b = int(1, a - 1);
  return { a, b, op, answer: a - b };
}

type Phase = 'show' | 'move' | 'ask' | 'solved';

/** Сложи и вычти: было столько — прилетели (улетели) ещё — сколько стало? */
export function Arithmetic({ spec, phrases, onFinish }: GameProps<'arithmetic'>) {
  const make = () => ({
    sum: makeSum(spec.ops[Math.floor(Math.random() * spec.ops.length)]!, spec.max),
    image: shuffled(spec.imageIds)[0]!,
  });
  const [round, setRound] = useState(0);
  const [{ sum, image }, setR] = useState(make);
  const [phase, setPhase] = useState<Phase>('show');
  const [wrong, setWrong] = useState<number[]>([]);
  const { a, b, op, answer } = sum;
  const sign = op === 'plus' ? PLUS : MINUS;

  // Сначала «было», потом предметы прилетают или улетают, потом вопрос.
  useEffect(() => {
    let alive = true;
    const t: ReturnType<typeof setTimeout>[] = [];
    void say(NUMBERS[a]!).then(() => {
      if (!alive) return;
      setPhase('move');
      fx.fly();
      t.push(
        setTimeout(
          () => {
            if (!alive) return;
            void say(sign, NUMBERS[b]!, HOW_MANY);
            setTask(() => say(NUMBERS[a]!, sign, NUMBERS[b]!, HOW_MANY));
            setPhase('ask');
          },
          900 + b * 120,
        ),
      );
    });
    return () => {
      alive = false;
      t.forEach(clearTimeout);
    };
  }, [round, a, b, sign]);

  const choose = (n: number) => {
    if (phase !== 'ask' || wrong.includes(n)) return;
    if (n !== answer) {
      setWrong([...wrong, n]);
      void retry(phrases);
      return;
    }
    setPhase('solved');
    // «Два плюс три будет пять!» — после похвалы, чтобы закрепить.
    const told = [NUMBERS[a]!, sign, NUMBERS[b]!, WILL_BE, `${NUMBERS[answer]}!`];
    void afterSpeech(praise(phrases, undefined, told), 3000).then(() => {
      if (round + 1 >= spec.rounds) return onFinish();
      setRound(round + 1);
      setR(make());
      setWrong([]);
      setPhase('show');
    });
  };

  const things =
    op === 'plus'
      ? [...Array.from({ length: a }, () => 'stay'), ...Array.from({ length: b }, () => 'arrive')]
      : [
          ...Array.from({ length: a - b }, () => 'stay'),
          ...Array.from({ length: b }, () => 'leave'),
        ];

  return (
    <div
      className="game arithmetic"
      data-testid="game-arithmetic"
      data-answer={answer}
      data-phase={phase}
    >
      <div className="sum-line" aria-hidden="true">
        <span>{a}</span>
        <span className="sum-op">{op === 'plus' ? '+' : '−'}</span>
        <span className={phase === 'show' ? 'sum-hidden' : ''}>{b}</span>
        <span>=</span>
        <span className={phase === 'solved' ? 'sum-answer' : 'sum-q'}>
          {phase === 'solved' ? answer : '?'}
        </span>
      </div>
      <div className={`sum-field ${phase}`} key={round}>
        {things.map((kind, k) => (
          <span
            key={k}
            className={`sum-thing ${kind}`}
            style={
              { '--k': k - (kind === 'stay' ? 0 : things.indexOf(kind)) } as React.CSSProperties
            }
          >
            <Pic id={image} />
          </span>
        ))}
      </div>
      <div className="count-options">
        {countOptions(answer, spec.max, 3).map((n) => (
          <button
            key={n}
            type="button"
            className={
              wrong.includes(n)
                ? 'count-option off'
                : phase === 'solved' && n === answer
                  ? 'count-option right'
                  : 'count-option'
            }
            data-testid="sum-option"
            data-hint={phase === 'ask' && n === answer ? '' : undefined}
            data-value={n}
            disabled={phase === 'show' || phase === 'move'}
            onClick={() => choose(n)}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}
