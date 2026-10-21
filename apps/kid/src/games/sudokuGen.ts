// «Судоку-малыш» (этап 41): поле size × size, в каждой строке и столбце каждая картинка по разу
// (латинский квадрат, без квадратиков-блоков — малышам так понятнее). Пустые клетки выбираются
// так, чтобы решение было одно: ребёнок всегда может догадаться, что куда.

export interface Sudoku {
  size: number;
  /** solution[r][c] — номер картинки. */
  solution: number[][];
  /** Пустые клетки: индекс r * size + c. */
  holes: Set<number>;
}

const shuffle = <T>(a: T[], rnd: () => number) => {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
};
const range = (n: number) => Array.from({ length: n }, (_, i) => i);

/** Случайный латинский квадрат: сдвиги строк, потом перестановки строк, столбцов и картинок. */
export function latinSquare(size: number, rnd = Math.random): number[][] {
  const rows = shuffle(range(size), rnd);
  const cols = shuffle(range(size), rnd);
  const pics = shuffle(range(size), rnd);
  return rows.map((r) => cols.map((c) => pics[(r + c) % size]!));
}

/** Сколько решений у поля (-1 — пусто), но не больше limit. */
export function countSolutions(grid: number[][], limit = 2): number {
  const size = grid.length;
  const cell = grid.flat().indexOf(-1);
  if (cell < 0) return 1;
  const r = Math.floor(cell / size);
  const c = cell % size;
  let n = 0;
  for (let v = 0; v < size && n < limit; v++) {
    if (grid[r]!.includes(v) || grid.some((row) => row[c] === v)) continue;
    grid[r]![c] = v;
    n += countSolutions(grid, limit - n);
    grid[r]![c] = -1;
  }
  return n;
}

/** Самое большое число пустых клеток для поля. */
export const maxBlanks = (size: number) => (size === 4 ? 12 : 6);

/** Поле с blanks пустыми клетками (меньше — если иначе решение не одно). */
export function makeSudoku(size: number, blanks: number, rnd = Math.random): Sudoku {
  const solution = latinSquare(size, rnd);
  const want = Math.min(blanks, maxBlanks(size));
  const grid = solution.map((row) => [...row]);
  const holes = new Set<number>();
  for (const i of shuffle(range(size * size), rnd)) {
    if (holes.size >= want) break;
    const r = Math.floor(i / size);
    const c = i % size;
    grid[r]![c] = -1;
    if (countSolutions(grid) === 1) holes.add(i);
    else grid[r]![c] = solution[r]![c]!;
  }
  return { size, solution, holes };
}
