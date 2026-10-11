import { mediaUrl } from '@kidsplus/shared/api';
import { useEffect, useMemo, useRef, useState } from 'react';
import { fx } from '../fx';
import { MAZE_PROMPT } from '../phrases';
import { praise, say, svgPoint, type GameProps } from './common';
import { burst, trail } from './juice';
import { canStep, makeMaze } from './mazeGen';

const CELL = 10;

/** Лабиринт: ведём героя пальцем по проходам к цели; каждый раунд — новый лабиринт. */
export function Maze({ spec, phrases, onFinish }: GameProps<'maze'>) {
  const [round, setRound] = useState(0);
  useEffect(() => {
    void say(MAZE_PROMPT);
  }, []);
  return (
    <MazeRound
      key={round}
      n={spec.size}
      heroId={spec.heroId}
      goalId={spec.goalId}
      onSolved={(at) => {
        void praise(phrases, at);
        setTimeout(() => {
          if (round + 1 < spec.rounds) setRound(round + 1);
          else onFinish();
        }, 1500);
      }}
    />
  );
}

function MazeRound(props: {
  n: number;
  heroId: string;
  goalId: string;
  onSolved: (at: { x: number; y: number }) => void;
}) {
  const { n } = props;
  const maze = useMemo(() => makeMaze(n), [n]);
  const goal = n * n - 1;
  const [path, setPath] = useState<number[]>([0]);
  const [done, setDone] = useState(false);
  const svg = useRef<SVGSVGElement>(null);
  const bumped = useRef(0);
  const hero = path.at(-1)!;
  const center = (c: number) => ({
    x: (c % n) * CELL + CELL / 2,
    y: Math.floor(c / n) * CELL + CELL / 2,
  });

  // Стены — один путь: внешняя рамка и внутренние стенки.
  const walls = useMemo(() => {
    const d: string[] = [`M0,0 H${n * CELL} V${n * CELL} H0 Z`];
    for (let c = 0; c < n * n; c++) {
      const x = (c % n) * CELL;
      const y = Math.floor(c / n) * CELL;
      if (c % n < n - 1 && maze.right[c]) d.push(`M${x + CELL},${y} V${y + CELL}`);
      if (c < n * (n - 1) && maze.down[c]) d.push(`M${x},${y + CELL} H${x + CELL}`);
    }
    return d.join(' ');
  }, [maze, n]);

  const move = (e: React.PointerEvent<SVGSVGElement>) => {
    trail(e.clientX, e.clientY);
    if (done) return;
    const p = svgPoint(svg.current!, e);
    const cx = Math.floor(p.x / CELL);
    const cy = Math.floor(p.y / CELL);
    if (cx < 0 || cy < 0 || cx >= n || cy >= n) return;
    const cell = cy * n + cx;
    if (cell === hero) return;
    // Назад по своему следу.
    if (cell === path.at(-2)) {
      setPath(path.slice(0, -1));
      return;
    }
    const adjacent = [hero + 1, hero - 1, hero + n, hero - n].includes(cell);
    if (!adjacent) return;
    if (!canStep(maze, hero, cell)) {
      if (e.timeStamp - bumped.current > 500) {
        bumped.current = e.timeStamp;
        fx.thud();
      }
      return;
    }
    fx.step();
    const next = path.includes(cell) ? path.slice(0, path.indexOf(cell) + 1) : [...path, cell];
    setPath(next);
    if (cell === goal) {
      setDone(true);
      props.onSolved({ x: e.clientX, y: e.clientY });
      burst({ x: e.clientX, y: e.clientY }, 20);
    }
  };

  const h = center(hero);
  const g = center(goal);
  const size = n * CELL;
  return (
    <div
      className="game maze"
      data-testid="game-maze"
      data-n={n}
      // Стены — для e2e-теста (проходит лабиринт по решению).
      data-right={maze.right.map(Number).join('')}
      data-down={maze.down.map(Number).join('')}
    >
      <svg
        ref={svg}
        className={done ? 'maze-svg done' : 'maze-svg'}
        viewBox={`-2 -2 ${size + 4} ${size + 4}`}
        data-testid="maze"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture?.(e.pointerId);
          move(e);
        }}
        onPointerMove={(e) => e.buttons && move(e)}
      >
        <rect x="0" y="0" width={size} height={size} rx="2" className="maze-floor" />
        <polyline
          className="maze-trail"
          points={path.map((c) => `${center(c).x},${center(c).y}`).join(' ')}
        />
        <path d={walls} className="maze-walls" />
        <g className="maze-goal" style={{ transform: `translate(${g.x}px, ${g.y}px)` }}>
          <circle r={CELL * 0.45} className="maze-goal-glow" />
          <image href={mediaUrl(props.goalId)} x={-4} y={-4} width={8} height={8} />
        </g>
        <g className="maze-hero" style={{ transform: `translate(${h.x}px, ${h.y}px)` }}>
          <g className="maze-hero-bob" key={hero}>
            <image href={mediaUrl(props.heroId)} x={-4.2} y={-4.2} width={8.4} height={8.4} />
          </g>
        </g>
      </svg>
      <button
        type="button"
        className="corner-button ear"
        aria-label="Повторить задание"
        onClick={() => void say(MAZE_PROMPT)}
      >
        👂
      </button>
    </div>
  );
}
