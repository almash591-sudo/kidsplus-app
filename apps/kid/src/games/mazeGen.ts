// Лабиринт без циклов (каждая клетка достижима ровно одним путём): поиск в глубину со случайным порядком.

export interface Maze {
  n: number;
  /** Стена справа от клетки и снизу от неё; клетка i = y * n + x. */
  right: boolean[];
  down: boolean[];
}

export function makeMaze(n: number, rnd: () => number = Math.random): Maze {
  const right = Array<boolean>(n * n).fill(true);
  const down = Array<boolean>(n * n).fill(true);
  const seen = new Set<number>([0]);
  const stack = [0];
  while (stack.length) {
    const c = stack.at(-1)!;
    const x = c % n;
    const y = Math.floor(c / n);
    const next = [x > 0 && c - 1, x < n - 1 && c + 1, y > 0 && c - n, y < n - 1 && c + n].filter(
      (v): v is number => v !== false && !seen.has(v),
    );
    if (!next.length) {
      stack.pop();
      continue;
    }
    const to = next[Math.floor(rnd() * next.length)]!;
    if (to === c + 1) right[c] = false;
    else if (to === c - 1) right[to] = false;
    else if (to === c + n) down[c] = false;
    else down[to] = false;
    seen.add(to);
    stack.push(to);
  }
  return { n, right, down };
}

/** Можно ли шагнуть из клетки a в соседнюю b (нет стены). */
export function canStep(m: Maze, a: number, b: number): boolean {
  const { n } = m;
  if (b < 0 || b >= n * n) return false;
  if (b === a + 1 && a % n < n - 1) return !m.right[a];
  if (b === a - 1 && a % n > 0) return !m.right[b];
  if (b === a + n) return !m.down[a];
  if (b === a - n) return !m.down[b];
  return false;
}

/** Путь от a до b (по проходам) — для проверки и подсказки. */
export function solve(m: Maze, a: number, b: number): number[] {
  const prev = new Map<number, number>([[a, -1]]);
  const queue = [a];
  while (queue.length) {
    const c = queue.shift()!;
    if (c === b) break;
    for (const d of [c + 1, c - 1, c + m.n, c - m.n])
      if (!prev.has(d) && canStep(m, c, d)) {
        prev.set(d, c);
        queue.push(d);
      }
  }
  if (!prev.has(b)) return [];
  const path = [b];
  while (path[0] !== a) path.unshift(prev.get(path[0]!)!);
  return path;
}
