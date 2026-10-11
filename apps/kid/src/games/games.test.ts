import { PATTERNS, SORTER_SHAPES, TRACE_SHAPES } from '@kidsplus/shared/games';
import { makeSum } from './Arithmetic';
import { comparePair } from './Compare';
import { hidingSpots } from './Flashlight';
import { canStep, makeMaze, solve } from './mazeGen';
import { nextNote } from './Melody';
import { patternRound } from './Pattern';
import { chunk } from './Shadows';
import { sizeScale } from './Size';
import { fits, SORTER } from './sorterShapes';
import { wordTiles } from './Word';
import { describe, expect, it } from 'vitest';
import { countOptions } from './Counting';
import { gridFor } from './Memory';
import { PICTURES } from './pictures';
import { advance, resample, TRACES } from './traceShapes';

describe('обводка по точкам', () => {
  it('у каждой фигуры и цифры есть штрихи в поле 0..100', () => {
    for (const s of TRACE_SHAPES) {
      const def = TRACES[s];
      expect(def.strokes.length).toBeGreaterThan(0);
      for (const p of def.strokes.flat()) {
        expect(p[0]).toBeGreaterThanOrEqual(0);
        expect(p[0]).toBeLessThanOrEqual(100);
        expect(p[1]).toBeGreaterThanOrEqual(0);
        expect(p[1]).toBeLessThanOrEqual(100);
      }
    }
  });

  it('контрольные точки — через равные промежутки, первая и последняя на месте', () => {
    const pts = resample([
      [0, 0],
      [30, 0],
    ]);
    expect(pts[0]).toEqual([0, 0]);
    expect(pts.at(-1)).toEqual([30, 0]);
    expect(pts).toHaveLength(11);
  });

  it('палец засчитывает только ближайшие точки впереди, без перескоков', () => {
    const pts = resample([
      [0, 0],
      [60, 0],
    ]);
    expect(advance(pts, 0, { x: 1, y: 2 })).toBeGreaterThan(0);
    // Конец линии далеко впереди — не засчитывается.
    expect(advance(pts, 0, { x: 60, y: 0 })).toBe(0);
    // Мимо линии — ничего.
    expect(advance(pts, 3, { x: 9, y: 30 })).toBe(3);
  });

  it('если вести пальцем по линии, фигура обводится целиком', () => {
    for (const s of TRACE_SHAPES) {
      for (const stroke of TRACES[s].strokes) {
        const pts = resample(stroke);
        let done = 0;
        for (const [x, y] of pts) done = advance(pts, done, { x: x + 1, y: y - 1 });
        expect(done, s).toBe(pts.length);
      }
    }
  });
});

describe('посчитай', () => {
  it('варианты: верный и соседние, по возрастанию, без повторов', () => {
    expect(countOptions(1, 3)).toEqual([1, 2, 3]);
    expect(countOptions(5, 10)).toEqual([4, 5, 6]);
    expect(countOptions(10, 10)).toEqual([8, 9, 10]);
    expect(countOptions(2, 2, 2)).toEqual([1, 2]);
  });
});

describe('найди пару', () => {
  it('сетка подбирается под экран: в портрете — выше, в альбоме — шире', () => {
    expect(gridFor(12, 400, 800).cols).toBeLessThan(gridFor(12, 800, 400).cols);
    expect(gridFor(4, 400, 400)).toMatchObject({ cols: 2, rows: 2 });
  });
});

describe('раскраска', () => {
  it('у областей картинок уникальные id и есть названия для заданий', () => {
    for (const [name, p] of Object.entries(PICTURES)) {
      const ids = p.regions.map((r) => r.id);
      expect(new Set(ids).size, name).toBe(ids.length);
      for (const r of p.regions) expect(r.name.length).toBeGreaterThan(0);
    }
  });
});

describe('лабиринт', () => {
  it('из старта можно дойти до каждой клетки, и путь один (нет циклов)', () => {
    for (const n of [3, 5, 9]) {
      for (let k = 0; k < 20; k++) {
        const m = makeMaze(n);
        // Дерево: проходов ровно n² − 1.
        const open =
          m.right.filter((w, c) => !w && c % n < n - 1).length +
          m.down.filter((w, c) => !w && c < n * (n - 1)).length;
        expect(open).toBe(n * n - 1);
        for (let c = 0; c < n * n; c++) expect(solve(m, 0, c).length).toBeGreaterThan(0);
      }
    }
  });

  it('шаг возможен только в соседнюю клетку без стены, в обе стороны одинаково', () => {
    const m = makeMaze(4);
    for (let a = 0; a < 16; a++)
      for (let b = 0; b < 16; b++) expect(canStep(m, a, b)).toBe(canStep(m, b, a));
    // Через край строки не перешагнуть.
    expect(canStep(m, 3, 4)).toBe(false);
    const path = solve(m, 0, 15);
    expect(path[0]).toBe(0);
    expect(path.at(-1)).toBe(15);
    for (let i = 1; i < path.length; i++) expect(canStep(m, path[i - 1]!, path[i]!)).toBe(true);
  });
});

describe('продолжи ряд', () => {
  const ids = ['a', 'b', 'c', 'd'];
  it('ряд повторяет закономерность, ответ — следующая картинка и есть среди вариантов', () => {
    for (const p of PATTERNS) {
      const r = patternRound(p, ids);
      const full = [...r.row, r.answer];
      const letter = new Map<string, string>();
      full.forEach((id, i) => {
        const l = p[i % p.length]!;
        if (!letter.has(l)) letter.set(l, id);
        expect(id, p).toBe(letter.get(l));
      });
      expect(new Set(letter.values()).size).toBe(new Set(p).size);
      expect(r.options).toContain(r.answer);
      expect(new Set(r.options).size).toBe(r.options.length);
      expect(r.row.length).toBeGreaterThanOrEqual(5);
    }
  });
});

describe('счёт', () => {
  it('сложение и вычитание — в пределах max, ответ от 1', () => {
    for (let k = 0; k < 200; k++) {
      for (const max of [2, 5, 10]) {
        const plus = makeSum('plus', max);
        expect(plus.answer).toBe(plus.a + plus.b);
        expect(plus.answer).toBeLessThanOrEqual(max);
        expect(Math.min(plus.a, plus.b)).toBeGreaterThanOrEqual(1);
        const minus = makeSum('minus', max);
        expect(minus.answer).toBe(minus.a - minus.b);
        expect(minus.answer).toBeGreaterThanOrEqual(1);
        expect(minus.a).toBeLessThanOrEqual(max);
      }
    }
  });

  it('где больше: два разных числа от 1 до max', () => {
    for (let k = 0; k < 200; k++) {
      const [a, b] = comparePair(3);
      expect(a).not.toBe(b);
      for (const n of [a, b]) expect(n >= 1 && n <= 3).toBe(true);
    }
  });
});

describe('прочие игры', () => {
  it('раунды «Найди тень»: без раунда из одной картинки', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([
      [1, 2],
      [3, 4, 5],
    ]);
    expect(chunk([1, 2, 3], 3)).toEqual([[1, 2, 3]]);
    expect(chunk([1, 2, 3, 4], 3)).toEqual([[1, 2, 3, 4]]);
  });

  it('«Собери слово»: буквы слова и лишние, которых в слове нет', () => {
    const tiles = wordTiles('КОТ', 'ru', 2);
    expect(tiles).toHaveLength(5);
    expect(tiles.filter((l) => 'КОТ'.includes(l)).sort()).toEqual(['К', 'О', 'Т']);
    expect(wordTiles('MAMA', 'en', 0).sort()).toEqual(['A', 'A', 'M', 'M']);
  });

  it('сортер: фигура пролезает, только если повёрнута как отверстие', () => {
    expect(fits('square', 90)).toBe(true);
    expect(fits('triangle', 90)).toBe(false);
    expect(fits('triangle', 360)).toBe(true);
    expect(fits('rectangle', 180)).toBe(true);
    expect(fits('rectangle', 270)).toBe(false);
    for (const s of SORTER_SHAPES) expect(SORTER[s].name.length).toBeGreaterThan(0);
  });

  it('фонарик: места не повторяются и внутри экрана', () => {
    const spots = hidingSpots(8);
    const cells = new Set(spots.map((s) => `${Math.floor(s.x * 4)},${Math.floor(s.y * 3)}`));
    expect(cells.size).toBe(8);
    expect(cells.has('0,0')).toBe(false);
    for (const s of spots) expect(s.x > 0 && s.x < 1 && s.y > 0 && s.y < 1).toBe(true);
  });

  it('размеры — по возрастанию от 0,4 до 1; мелодия без повтора ноты подряд', () => {
    expect(sizeScale(0, 3)).toBeCloseTo(0.4);
    expect(sizeScale(2, 3)).toBe(1);
    expect(sizeScale(1, 4)).toBeGreaterThan(sizeScale(0, 4));
    for (let k = 0; k < 50; k++) expect(nextNote(3, 1)).not.toBe(1);
  });
});
