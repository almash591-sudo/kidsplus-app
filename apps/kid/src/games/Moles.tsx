import type { MoleSpeed } from '@kidsplus/shared/games';
import { useEffect, useRef, useState } from 'react';
import { fx } from '../fx';
import { MOLES_PROMPT } from '../phrases';
import { ask, NUMBERS, praise, say, type GameProps } from './common';
import { Pic } from './DragItem';
import { burstAt, cheer, floatText } from './juice';

const HOLES = 6;
/** Сколько зверёк сидит наверху, мс. */
const STAY: Record<MoleSpeed, number> = { slow: 2600, normal: 1800, fast: 1200 };

interface Pop {
  hole: number;
  /** Номер картинки. */
  who: number;
  id: number;
  hit: boolean;
  leaving?: boolean;
}

let seq = 0;

/** Поймай зверька: зверьки выглядывают из норок, касание — поймал. target — только этого. */
export function Moles({ spec, phrases, onFinish }: GameProps<'moles'>) {
  const [pops, setPops] = useState<Pop[]>([]);
  const [score, setScore] = useState(0);
  const finished = score >= spec.count;
  const holes = useRef<(HTMLButtonElement | null)[]>([]);
  const prompt = () => ask(spec.prompt ?? MOLES_PROMPT);

  useEffect(() => {
    void prompt();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- задание звучит один раз при показе
  }, []);

  // Зверьки выглядывают по таймеру: не больше двух сразу, в свободных норках.
  useEffect(() => {
    if (finished) return;
    const t = setInterval(() => {
      setPops((list) => {
        if (list.filter((p) => !p.hit && !p.leaving).length >= 2) return list;
        const busy = new Set(list.map((p) => p.hole));
        const free = Array.from({ length: HOLES }, (_, i) => i).filter((h) => !busy.has(h));
        if (!free.length) return list;
        const who =
          spec.target !== null && Math.random() < 0.55
            ? spec.target
            : Math.floor(Math.random() * spec.imageIds.length);
        const pop = {
          hole: free[Math.floor(Math.random() * free.length)]!,
          who,
          id: seq++,
          hit: false,
        };
        // Посидел — прячется, потом норка свободна.
        setTimeout(
          () => setPops((l) => l.map((p) => (p.id === pop.id ? { ...p, leaving: true } : p))),
          STAY[spec.speed],
        );
        setTimeout(() => setPops((l) => l.filter((p) => p.id !== pop.id)), STAY[spec.speed] + 300);
        return [...list, pop];
      });
    }, STAY[spec.speed] * 0.55);
    return () => clearInterval(t);
  }, [finished, spec.speed, spec.target, spec.imageIds.length]);

  const hit = (p: Pop) => {
    if (p.hit || p.leaving || finished) return;
    const el = holes.current[p.hole] ?? null;
    if (spec.target !== null && p.who !== spec.target) {
      fx.soft();
      cheer('oops');
      return;
    }
    fx.boing();
    burstAt(el, 10);
    setPops((l) => l.map((x) => (x.id === p.id ? { ...x, hit: true } : x)));
    setTimeout(() => setPops((l) => l.filter((x) => x.id !== p.id)), 450);
    const n = score + 1;
    setScore(n);
    if (el) {
      const r = el.getBoundingClientRect();
      floatText({ x: r.left + r.width / 2, y: r.top }, String(n));
    }
    if (n >= spec.count) {
      void say(`${NUMBERS[n] ?? n}!`).then(() => praise(phrases));
      setTimeout(onFinish, 2200);
    } else void say(`${NUMBERS[n] ?? n}!`);
  };

  return (
    <div className="game moles" data-testid="game-moles">
      {spec.target !== null && (
        <div className="mole-target" aria-hidden="true">
          <Pic id={spec.imageIds[spec.target]!} />
        </div>
      )}
      <div className="mole-field">
        {Array.from({ length: HOLES }, (_, h) => {
          const p = pops.find((x) => x.hole === h);
          return (
            <button
              key={h}
              type="button"
              ref={(el) => {
                holes.current[h] = el;
              }}
              className="mole-hole"
              data-testid="mole-hole"
              data-silent
              aria-label="Норка"
              onPointerDown={() => p && hit(p)}
            >
              <span className="mole-pit" />
              <span className="mole-window">
                {p && (
                  <span
                    key={p.id}
                    className={p.hit ? 'mole hit' : p.leaving ? 'mole leaving' : 'mole'}
                    data-testid="mole"
                    data-who={p.who}
                  >
                    <Pic id={spec.imageIds[p.who]!} />
                  </span>
                )}
              </span>
              <span className="mole-grass" />
            </button>
          );
        })}
      </div>
      <div className="balloon-score" aria-hidden="true">
        {Array.from({ length: spec.count }, (_, i) => (
          <span key={i} className={i < score ? 'on' : ''} />
        ))}
      </div>
    </div>
  );
}
