import type { BalloonColor } from '@kidsplus/shared/games';
import { useEffect, useState } from 'react';
import { fx } from '../fx';
import { balloonsPrompt, balloonsWrong } from '../phrases';
import { ask, NUMBERS, praise, say, type GameProps } from './common';

/** Цвета шариков — у каждого своя глиняная картинка /games/balloon-<цвет>.webp. */
const ALL: BalloonColor[] = ['red', 'yellow', 'blue', 'green'];
/** Шариков на экране одновременно. */
const ON_SCREEN = 5;
/** Счётчик id шариков (общий — id нужны только для ключей React). */
let seq = 0;

interface Balloon {
  id: number;
  color: BalloonColor;
  /** Положение по горизонтали, доли ширины. */
  x: number;
  /** Время подъёма, с. */
  duration: number;
  popped: boolean;
}

/** Лопни шарики: шарики плывут вверх, касание лопает; считаем вслух. target — только этот цвет. */
export function Balloons({ spec, phrases, onFinish }: GameProps<'balloons'>) {
  const make = (): Balloon => {
    const color =
      spec.target && Math.random() < 0.45
        ? spec.target
        : ALL[Math.floor(Math.random() * ALL.length)]!;
    return {
      id: seq++,
      color,
      x: 0.08 + Math.random() * 0.74,
      duration: 6 + Math.random() * 4,
      popped: false,
    };
  };
  const [balloons, setBalloons] = useState<Balloon[]>(() =>
    Array.from({ length: ON_SCREEN }, make),
  );
  const [score, setScore] = useState(0);
  const finished = score >= spec.count;
  const prompt = () => ask(balloonsPrompt(spec.target));

  useEffect(() => {
    void prompt();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- задание звучит один раз при показе
  }, []);

  const replace = (id: number) =>
    setBalloons((list) => list.map((b) => (b.id === id ? make() : b)));

  const pop = (b: Balloon) => {
    if (b.popped || finished) return;
    if (spec.target && b.color !== spec.target) {
      fx.soft();
      void say(balloonsWrong(b.color, spec.target));
      return;
    }
    fx.pop();
    setBalloons((list) => list.map((x) => (x.id === b.id ? { ...x, popped: true } : x)));
    setTimeout(() => replace(b.id), 350);
    const n = score + 1;
    setScore(n);
    if (n >= spec.count) {
      void say(`${NUMBERS[n] ?? n}!`).then(() => praise(phrases));
      setTimeout(onFinish, 2200);
    } else void say(`${NUMBERS[n] ?? n}!`);
  };

  return (
    <div className="game balloons" data-testid="game-balloons">
      {balloons.map((b) => (
        <button
          key={b.id}
          type="button"
          className={b.popped ? 'balloon popped' : 'balloon'}
          data-testid="balloon"
          data-color={b.color}
          aria-label="Шарик"
          style={{ left: `${b.x * 100}%`, animationDuration: `${b.duration}s` }}
          data-silent
          onPointerDown={() => pop(b)}
          onAnimationEnd={(e) => e.animationName === 'float-up' && replace(b.id)}
        >
          <img src={`/games/balloon-${b.color}.webp`} alt="" draggable={false} />
        </button>
      ))}
      <div className="balloon-score" aria-hidden="true">
        {Array.from({ length: spec.count }, (_, i) => (
          <span key={i} className={i < score ? 'on' : ''} />
        ))}
      </div>
    </div>
  );
}
