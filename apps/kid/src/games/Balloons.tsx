import type { BalloonColor } from '@kidsplus/shared/games';
import { useEffect, useState } from 'react';
import { fx } from '../fx';
import { balloonLetterPrompt, balloonLetterWrong, balloonsPrompt, balloonsWrong } from '../phrases';
import { ask, bump, NUMBERS, praise, say, type GameProps } from './common';

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
  /** Буква на шарике (этап 56) — как показана: большая или маленькая. */
  letter?: string;
}

const pick = <T,>(list: readonly T[]) => list[Math.floor(Math.random() * list.length)]!;

/**
 * Лопни шарики: шарики плывут вверх, касание лопает; считаем вслух. target — только этот цвет,
 * letters — только шарики с буквой find (этап 56).
 */
export function Balloons({ spec, phrases, onFinish }: GameProps<'balloons'>) {
  const { letters } = spec;
  const make = (): Balloon => {
    const color = spec.target && Math.random() < 0.45 ? spec.target : pick(ALL);
    const upper = letters && (Math.random() < 0.45 ? letters.find : pick(letters.others));
    return {
      id: seq++,
      color,
      ...(upper && { letter: letters.lower && Math.random() < 0.5 ? upper.toLowerCase() : upper }),
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
  const prompt = () =>
    ask(letters ? balloonLetterPrompt(letters.find, letters.lower) : balloonsPrompt(spec.target));

  useEffect(() => {
    void prompt();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- задание звучит один раз при показе
  }, []);

  const replace = (id: number) =>
    setBalloons((list) => list.map((b) => (b.id === id ? make() : b)));

  const pop = (b: Balloon) => {
    if (b.popped || finished) return;
    if (letters && b.letter?.toUpperCase() !== letters.find) {
      bump();
      void say(balloonLetterWrong(b.letter!.toUpperCase(), letters.find));
      return;
    }
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
          data-letter={b.letter}
          aria-label={b.letter ? `Шарик с буквой ${b.letter}` : 'Шарик'}
          style={{ left: `${b.x * 100}%`, animationDuration: `${b.duration}s` }}
          data-silent
          onPointerDown={() => pop(b)}
          onAnimationEnd={(e) => e.animationName === 'float-up' && replace(b.id)}
        >
          <img src={`/games/balloon-${b.color}.webp`} alt="" draggable={false} />
          {b.letter && <span className="balloon-letter">{b.letter}</span>}
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
