// «Совёнок-робот» (этап 34): первые шаги программирования. Ребёнок составляет из стрелок путь
// и нажимает «Поехали» — совёнок идёт по клеткам. Дошёл до звёздочки — ура; нет — назад на старт,
// программу можно поправить. На уровнях выше — больше поле, длиннее путь, камни.
import { useEffect, useRef, useState } from 'react';
import { GAME_INTRO, ROBOT_MISS, ROBOT_ROCK } from '../phrases';
import { Icon } from '../ui/icons';
import { ask, nice, praise, retry, say, type GameProps } from './common';
import { burstAt } from './juice';

export type Dir = 'up' | 'down' | 'left' | 'right';
const MOVE: Record<Dir, [number, number]> = {
  up: [0, -1],
  down: [0, 1],
  left: [-1, 0],
  right: [1, 0],
};
const ARROW: Record<Dir, string> = { up: '↑', down: '↓', left: '←', right: '→' };
type Cell = [number, number];
const key = ([x, y]: Cell) => `${x},${y}`;

/** Поле: старт, цель на расстоянии `steps` шагов (путь без петель), камни не на этом пути. */
export function robotField(
  spec: { size: number; steps: number; rocks: boolean },
  rnd = Math.random,
) {
  const n = spec.size;
  for (;;) {
    const start: Cell = [Math.floor(rnd() * n), Math.floor(rnd() * n)];
    const path: Cell[] = [start];
    const seen = new Set([key(start)]);
    let ok = true;
    for (let i = 0; i < spec.steps; i++) {
      const [x, y] = path.at(-1)!;
      const next = (Object.values(MOVE) as [number, number][])
        .map(([dx, dy]): Cell => [x + dx, y + dy])
        .filter(([a, b]) => a >= 0 && b >= 0 && a < n && b < n && !seen.has(key([a, b])));
      if (!next.length) {
        ok = false;
        break;
      }
      const c = next[Math.floor(rnd() * next.length)]!;
      path.push(c);
      seen.add(key(c));
    }
    if (!ok) continue;
    const goal = path.at(-1)!;
    // Цель не в соседней клетке — иначе путь слишком короткий.
    if (Math.abs(goal[0] - start[0]) + Math.abs(goal[1] - start[1]) < Math.min(2, spec.steps))
      continue;
    const rocks = new Set<string>();
    if (spec.rocks) {
      const free: Cell[] = [];
      for (let x = 0; x < n; x++)
        for (let y = 0; y < n; y++) if (!seen.has(key([x, y]))) free.push([x, y]);
      for (let i = 0; i < Math.min(free.length, n - 1); i++) {
        const c = free.splice(Math.floor(rnd() * free.length), 1)[0]!;
        rocks.add(key(c));
      }
    }
    return { start, goal, rocks };
  }
}

/** Куда придёт совёнок по программе: клетки по шагам и чем закончилось. */
export function runProgram(
  field: { start: Cell; goal: Cell; rocks: Set<string> },
  size: number,
  program: Dir[],
): { cells: Cell[]; result: 'goal' | 'rock' | 'wall' | 'short' } {
  const cells: Cell[] = [];
  let [x, y] = field.start;
  for (const d of program) {
    const [dx, dy] = MOVE[d];
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= size || ny >= size) return { cells, result: 'wall' };
    if (field.rocks.has(key([nx, ny]))) return { cells, result: 'rock' };
    x = nx;
    y = ny;
    cells.push([x, y]);
    if (x === field.goal[0] && y === field.goal[1]) return { cells, result: 'goal' };
  }
  return { cells, result: 'short' };
}

export function Robot({ spec, phrases, onFinish }: GameProps<'robot'>) {
  const n = spec.size;
  const [round, setRound] = useState(0);
  const [field, setField] = useState(() => robotField(spec));
  const [program, setProgram] = useState<Dir[]>([]);
  const [owl, setOwl] = useState<Cell>(field.start);
  const [running, setRunning] = useState(false);
  const goalEl = useRef<HTMLDivElement>(null);
  const maxProgram = spec.steps + 4;

  useEffect(() => {
    // Задание — в начале каждого раунда.
    void ask(GAME_INTRO.robot);
  }, [round]);

  const add = (d: Dir, el: Element) => {
    if (running || program.length >= maxProgram) return;
    nice(el);
    setProgram([...program, d]);
  };

  const go = () => {
    if (running || !program.length) return;
    setRunning(true);
    const { cells, result } = runProgram(field, n, program);
    cells.forEach((c, i) => setTimeout(() => setOwl(c), 450 * (i + 1)));
    setTimeout(
      () => {
        if (result === 'goal') {
          burstAt(goalEl.current, 24);
          void praise(phrases);
          setTimeout(() => {
            if (round + 1 >= spec.rounds) return onFinish();
            const next = robotField(spec);
            setRound(round + 1);
            setField(next);
            setOwl(next.start);
            setProgram([]);
            setRunning(false);
          }, 2200);
          return;
        }
        void retry(phrases).then(() => say(result === 'rock' ? ROBOT_ROCK : ROBOT_MISS));
        setTimeout(() => {
          setOwl(field.start);
          setRunning(false);
        }, 1400);
      },
      450 * (cells.length + 1),
    );
  };

  const cell = (x: number, y: number) => {
    const k = key([x, y]);
    if (owl[0] === x && owl[1] === y)
      return <img src="/owl/master.webp" alt="" draggable={false} className="robot-owl" />;
    if (field.goal[0] === x && field.goal[1] === y)
      return (
        <span className="robot-star">
          <Icon name="star" size={40} fill />
        </span>
      );
    // Камень рисуем сами: эмодзи камня есть не на всех телефонах.
    if (field.rocks.has(k)) return <span className="robot-rock" aria-label="камень" />;
    return null;
  };

  return (
    <div
      className="game robot"
      data-testid="game-robot"
      data-size={n}
      data-start={key(field.start)}
      data-goal={key(field.goal)}
      data-rocks={[...field.rocks].join(';')}
    >
      <div
        className="robot-grid"
        style={
          {
            gridTemplateColumns: `repeat(${n}, 1fr)`,
            gridTemplateRows: `repeat(${n}, 1fr)`,
          } as React.CSSProperties
        }
      >
        {Array.from({ length: n * n }, (_, i) => {
          const x = i % n;
          const y = Math.floor(i / n);
          const isGoal = field.goal[0] === x && field.goal[1] === y;
          return (
            <div
              key={i}
              className="robot-cell"
              ref={isGoal ? goalEl : undefined}
              data-testid={isGoal ? 'robot-goal' : undefined}
            >
              {cell(x, y)}
            </div>
          );
        })}
      </div>
      <div className="robot-program" data-testid="robot-program">
        {program.map((d, i) => (
          <span key={i} className="robot-step">
            {ARROW[d]}
          </span>
        ))}
      </div>
      <div className="robot-controls">
        {(Object.keys(ARROW) as Dir[]).map((d) => (
          <button
            key={d}
            type="button"
            className="robot-arrow"
            data-testid={`robot-${d}`}
            disabled={running}
            onClick={(e) => add(d, e.currentTarget)}
            aria-label={d}
          >
            {ARROW[d]}
          </button>
        ))}
        <button
          type="button"
          className="robot-arrow erase"
          disabled={running || !program.length}
          onClick={() => setProgram(program.slice(0, -1))}
          aria-label="Стереть"
          data-testid="robot-erase"
        >
          <Icon name="back" size={28} stroke={2.6} />
        </button>
        <button
          type="button"
          className="robot-go"
          disabled={running || !program.length}
          onClick={go}
          data-testid="robot-go"
        >
          Поехали
        </button>
      </div>
    </div>
  );
}
