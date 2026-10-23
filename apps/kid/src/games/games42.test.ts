import {
  COLORING_PICTURES,
  DOT_PICTURES,
  gameSpec,
  TANGRAM_FIGURES,
  type GameSpec,
} from '@kidsplus/shared/games';
import { describe, expect, it } from 'vitest';
import { colorNumberWrong, gamePhrases } from '../phrases';
import { colorNumbers } from './ColorNumbers';
import { PICTURES } from './pictures';
import { DOTS, NUMBER_SPOTS, pieceKind, TANGRAMS } from './shapes42';

const inBoard = (x: number, y: number) => x >= 0 && x <= 100 && y >= 0 && y <= 100;

describe('соедини точки (этап 42)', () => {
  it('у каждой картинки 6–15 точек в поле, соседние точки не слипаются', () => {
    for (const p of DOT_PICTURES) {
      const pts = DOTS[p].points;
      expect(pts.length).toBeGreaterThanOrEqual(6);
      expect(pts.length).toBeLessThanOrEqual(15);
      for (const [x, y] of pts) expect(inBoard(x, y)).toBe(true);
      // Палец попадает в точку с 7 единиц — разные точки дальше 8 друг от друга.
      for (let i = 0; i < pts.length; i++)
        for (let j = i + 1; j < pts.length; j++)
          expect(Math.hypot(pts[i]![0] - pts[j]![0], pts[i]![1] - pts[j]![1])).toBeGreaterThan(8);
    }
  });
});

describe('танграм-малыш (этап 42)', () => {
  it('детали внутри поля; у каждой фигуры 3–6 деталей', () => {
    for (const f of TANGRAM_FIGURES) {
      const pieces = TANGRAMS[f];
      expect(pieces.length).toBeGreaterThanOrEqual(3);
      expect(pieces.length).toBeLessThanOrEqual(6);
      for (const p of pieces) {
        expect(inBoard(p.x, p.y)).toBe(true);
        expect(inBoard(p.x + p.w, p.y + p.h)).toBe(true);
      }
    }
  });
  it('одинаковые детали — одного вида (подходят к любому своему месту)', () => {
    const kinds = TANGRAMS.rocket.map(pieceKind);
    expect(kinds.filter((k) => k === 'tri:16x26')).toHaveLength(2);
  });
});

describe('раскраска по цифрам (этап 42)', () => {
  it('у каждой области есть место для цифры; один цвет — одна цифра', () => {
    for (const p of COLORING_PICTURES) {
      const { colors, of } = colorNumbers(p);
      expect(colors.length).toBeLessThanOrEqual(7);
      for (const r of PICTURES[p].regions) {
        expect(NUMBER_SPOTS[p][r.id]?.length, `${p}.${r.id}`).toBeGreaterThan(0);
        expect(colors[of[r.id]! - 1]).toBe(r.target);
      }
    }
    // Стебель и листики цветка — оба зелёные: одна цифра.
    const flower = colorNumbers('flower');
    expect(flower.of.stem).toBe(flower.of.leaves);
  });
  it('подсказки озвучиваются заранее', () => {
    const spec = gameSpec.parse({ kind: 'colorNumbers', pictures: ['house'] }) as GameSpec;
    expect(gamePhrases(spec)).toContain(colorNumberWrong(7));
    expect(colorNumberWrong(3)).toBe('Здесь цифра три. Возьми краску с цифрой три!');
  });
});
