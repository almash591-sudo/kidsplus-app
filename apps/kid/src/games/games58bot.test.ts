// Этап 58: «Робот и батарейка» — поле и путь, проезд по программе, подсказка, ошибка в программе,
// раунды, коврик с лентой и пультом на экранах, фразы.
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { gameSpec, type GameSpec } from '@kidsplus/shared/games';
import { describe, expect, it } from 'vitest';
import {
  BOT_BUMP,
  BOT_FIX_FIND,
  BOT_FIX_INTRO,
  BOT_GO,
  BOT_RIGHT_ARROW,
  BOT_WIN,
  GAME_INTRO,
  gamePhrases,
} from '../phrases';
import type { SpecOf } from './common';
import {
  botSprites,
  breakProgram,
  distances,
  fixable,
  gridFor,
  isBlock,
  nextHint,
  OWL_RIGHT,
  RIM,
  planField,
  planRounds,
  put,
  run,
  stageFor,
  TOP,
  TOP_BUTTONS,
  turnsOf,
  type Box,
  type BotField,
  type Dir,
} from './botLogic';

const spec = (o: object) => gameSpec.parse({ kind: 'bot', rounds: 4, ...o }) as SpecOf<'bot'>;
/** Простой повторяемый генератор для тестов. */
const seeded = (seed: number) => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
/** S20 стоя и лёжа, iPhone 15 и SE (как в e2e), обычный Android и планшеты. */
const SCREENS = [
  [412, 915],
  [915, 412],
  [393, 659],
  [320, 568],
  [360, 640],
  [640, 360],
  [393, 852],
  [852, 393],
  [768, 1024],
  [1024, 768],
] as const;
const boxIn = (a: Box, b: Box, eps = 1e-6) =>
  a.x >= b.x - eps &&
  a.y >= b.y - eps &&
  a.x + a.w <= b.x + b.w + eps &&
  a.y + a.h <= b.y + b.h + eps;
const boxHit = (a: Box, b: Box) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const manhattan = (f: BotField) =>
  Math.abs(f.start[0] - f.goal[0]) + Math.abs(f.start[1] - f.goal[1]);
const dist = (f: BotField) => distances(f, f.start)[f.goal[1]]![f.goal[0]]!;

describe('робот (этап 58): поле и путь', () => {
  it('без коробок: путь ровно в steps шагов с нужными поворотами, коврик 4 × 4 или 5 × 5', () => {
    for (let steps = 1; steps <= 8; steps++)
      for (let turns = 0; turns <= 3; turns++)
        for (let seed = 1; seed <= 40; seed++) {
          const f = planField(steps, turns, false, seeded(seed * 31 + steps * 7 + turns));
          const n = gridFor(steps);
          expect(f.n).toBe(n);
          expect(f.blocks).toEqual([]);
          expect(f.path).toHaveLength(steps);
          // Напрямую: путь не длиннее, чем от старта до батарейки по клеткам.
          expect(manhattan(f)).toBe(steps);
          const want = Math.max(steps > n - 1 ? 1 : 0, Math.min(turns, steps - 1, 3));
          expect(turnsOf(f.path)).toBe(want);
          const r = run(f, f.path);
          expect(r).toMatchObject({ result: 'goal', at: steps - 1 });
          for (const c of r.cells) expect(c.every((v) => v >= 0 && v < n)).toBe(true);
        }
  });

  it('с коробками: объезд ровно в steps шагов, коробки мешают, путь их не задевает', () => {
    let detours = 0;
    for (let steps = 2; steps <= 8; steps++)
      for (let seed = 1; seed <= 40; seed++) {
        const f = planField(steps, 1, true, seeded(seed * 13 + steps));
        expect(f.blocks.length).toBeGreaterThanOrEqual(2);
        expect(f.blocks.length).toBeLessThanOrEqual(5);
        expect(isBlock(f, f.start) || isBlock(f, f.goal)).toBe(false);
        expect(dist(f)).toBe(steps);
        expect(f.path).toHaveLength(steps);
        expect(run(f, f.path).result).toBe('goal');
        // Коробки правда мешают: без них путь короче или прямых путей больше.
        const free = { ...f, blocks: [] };
        if (manhattan(f) < steps) detours++;
        else expect(f.path).toHaveLength(dist(free));
        if (steps >= 4) expect(manhattan(f)).toBeLessThan(steps);
      }
    expect(detours).toBe(5 * 40);
  });

  it('один шаг с коробками — коробки в стороне от пути', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const f = planField(1, 0, true, seeded(seed));
      expect(f.blocks).toHaveLength(2);
      expect(run(f, f.path)).toMatchObject({ result: 'goal', at: 0 });
    }
  });
});

describe('робот (этап 58): программа', () => {
  const f: BotField = {
    n: 4,
    start: [0, 0],
    goal: [2, 1],
    blocks: [{ c: [1, 0], kind: 'box' }],
    path: ['down', 'right', 'right'],
  };
  it('доехал, упёрся в коробку или в край, не доехал; у батарейки останавливается', () => {
    expect(run(f, ['down', 'right', 'right'])).toMatchObject({ result: 'goal', at: 2 });
    expect(run(f, ['down', 'right', 'right', 'up', 'up'])).toMatchObject({
      result: 'goal',
      at: 2,
    });
    expect(run(f, ['right'])).toMatchObject({ result: 'block', at: 0, cells: [[0, 0]] });
    expect(run(f, ['down', 'left'])).toMatchObject({ result: 'wall', at: 1 });
    expect(run(f, ['down', 'right'])).toMatchObject({
      result: 'short',
      at: 2,
      cells: [
        [0, 0],
        [0, 1],
        [1, 1],
      ],
    });
    expect(run(f, [])).toMatchObject({ result: 'short', at: 0 });
  });

  it('подсказка: следующая стрелка — прямо, если можно; лишняя — убрать; готово — «Пуск»', () => {
    expect(nextHint(f, [], 5)).toEqual({ kind: 'add', dir: 'down' });
    expect(nextHint(f, ['down'], 5)).toEqual({ kind: 'add', dir: 'right' });
    expect(nextHint(f, ['down', 'right'], 5)).toEqual({ kind: 'add', dir: 'right' });
    expect(nextHint(f, ['down', 'right', 'right'], 5)).toEqual({ kind: 'run' });
    expect(nextHint(f, ['right'], 5)).toEqual({ kind: 'remove', index: 0 });
    expect(nextHint(f, ['down', 'down', 'up'], 4)).toEqual({ kind: 'remove', index: 2 });
    // Не туда, но место есть — можно доехать в обход.
    expect(nextHint(f, ['down', 'down'], 5)).toMatchObject({ kind: 'add' });
    expect(nextHint(f, ['down', 'down'], 4)).toEqual({ kind: 'remove', index: 1 });
  });

  it('по подсказкам с пустой ленты робот доезжает кратчайшим путём', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const r = planRounds(spec({ steps: 5, turns: 2, blocks: seed % 2 === 0 }), seeded(seed))[0]!;
      const prog: Dir[] = [];
      for (let h = nextHint(r.field, prog, r.slots); h.kind !== 'run';) {
        expect(h.kind).toBe('add');
        if (h.kind === 'add') prog.push(h.dir);
        h = nextHint(r.field, prog, r.slots);
      }
      expect(prog).toHaveLength(5);
      expect(run(r.field, prog).result).toBe('goal');
    }
  });

  it('«Найди ошибку»: одна стрелка не та — робот не доезжает, её замена всё чинит', () => {
    for (let steps = 1; steps <= 8; steps++)
      for (let seed = 1; seed <= 30; seed++) {
        const rnd = seeded(seed * 17 + steps);
        const f = planField(steps, 1, steps % 2 === 0, rnd);
        const prog = breakProgram(f, rnd);
        expect(prog).toHaveLength(steps);
        expect(prog.filter((d, i) => d !== f.path[i])).toHaveLength(1);
        expect(run(f, prog).result).not.toBe('goal');
        const bad = prog.findIndex((d, i) => d !== f.path[i]);
        const fix = fixable(f, prog);
        expect(fix).toContain(bad);
        expect(run(f, put(prog, bad, f.path[bad]!)).result).toBe('goal');
        // Правильные стрелки не исправить одной заменой — кроме равноценных.
        for (const i of fix) expect(run(f, put(prog, i, prog[i]!)).result).not.toBe('goal');
      }
  });

  it('«Найди ошибку» с коробками: чаще всего неправильная стрелка — одна-единственная', () => {
    let unique = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const rnd = seeded(seed);
      const f = planField(4, 1, true, rnd);
      if (fixable(f, breakProgram(f, rnd)).length === 1) unique++;
    }
    expect(unique).toBeGreaterThan(40);
  });
});

describe('робот (этап 58): раунды', () => {
  it('задания по очереди; у «ошибки» лента по программе, у «составь» — на две стрелки больше', () => {
    const rs = planRounds(spec({ tasks: ['go', 'fix'], steps: 3, rounds: 4 }), seeded(5));
    expect(rs.map((r) => r.task)).toEqual(['go', 'fix', 'go', 'fix']);
    expect(rs[0]).toMatchObject({ program: [], slots: 5 });
    expect(rs[1]!.program).toHaveLength(3);
    expect(rs[1]!.slots).toBe(3);
    const big = planRounds(spec({ steps: 8, turns: 3, rounds: 3 }), seeded(2));
    expect(big.every((r) => r.slots === 10)).toBe(true);
    // Подряд — не то же поле.
    for (let seed = 1; seed <= 30; seed++) {
      const r = planRounds(spec({ steps: 1, rounds: 6 }), seeded(seed));
      r.slice(1).forEach((x, i) => {
        const p = r[i]!.field;
        expect(
          x.field.start.join() === p.start.join() && x.field.goal.join() === p.goal.join(),
        ).toBe(false);
      });
    }
  });
});

describe('робот (этап 58): на экране', () => {
  it('коврик, лента и пульт помещаются, не налезают друг на друга и на кнопки', () => {
    for (const [w, h] of SCREENS)
      for (const slots of [1, 3, 4, 6, 7, 10])
        for (const n of [4, 5]) {
          const st = stageFor(w, h, n, slots);
          const screen = { x: 0, y: 0, w, h };
          const half = st.socket / 2;
          const sockets = st.sockets.map((s) => ({
            x: s.x - half,
            y: s.y - half,
            w: st.socket,
            h: st.socket,
          }));
          // Коврик вместе с войлочным краем.
          const r = st.cell * RIM;
          const mat = {
            x: st.board.x - r,
            y: st.board.y - r,
            w: st.board.w + 2 * r,
            h: st.board.h + 2 * r,
          };
          const parts = [mat, ...sockets, ...st.keys, st.go];
          for (const p of parts) expect(boxIn(p, screen), `${w}x${h} ${slots}`).toBe(true);
          for (const p of [...sockets, ...st.keys, st.go]) {
            expect(boxHit(p, mat), `${w}x${h} ${slots}`).toBe(false);
            if (st.land) {
              expect(p.y).toBeGreaterThanOrEqual(TOP_BUTTONS - 1e-6);
            }
          }
          for (const k of [...st.keys, st.go])
            for (const s of sockets) expect(boxHit(k, s), `${w}x${h} ${slots}`).toBe(false);
          if (st.land) expect(st.board.x).toBeGreaterThanOrEqual(OWL_RIGHT);
          else expect(st.board.y).toBeGreaterThanOrEqual(TOP);
          // Пальцем попасть: стрелка пульта — не меньше 44 px, гнездо — 40; клетки не нажимают,
          // но робот на ней должен быть хорошо виден — не меньше 44.
          expect(st.keys[0]!.w, `${w}x${h}`).toBeGreaterThanOrEqual(44);
          expect(st.socket, `${w}x${h} ${slots}`).toBeGreaterThanOrEqual(40);
          expect(st.cell, `${w}x${h} ${n}`).toBeGreaterThanOrEqual(44);
          expect(st.board.w).toBeCloseTo(st.cell * n);
        }
  });
});

describe('робот (этап 58): фразы и картинки', () => {
  it('фразы по заданиям, вступление', () => {
    const go = gamePhrases(spec({ tasks: ['go'] }) as GameSpec);
    expect(go).toContain(BOT_GO);
    expect(go).toContain(BOT_BUMP);
    expect(go).toContain(BOT_WIN);
    expect(go).not.toContain(BOT_FIX_INTRO);
    const fix = gamePhrases(spec({ tasks: ['fix'] }) as GameSpec);
    expect(fix).toEqual(expect.arrayContaining([BOT_FIX_INTRO, BOT_FIX_FIND, BOT_RIGHT_ARROW]));
    expect(fix).not.toContain(BOT_GO);
    expect(GAME_INTRO.bot).toBe(BOT_GO);
  });

  it('картинки игры и значок на месте', () => {
    for (const n of [...botSprites(), 'icon-bot'])
      expect(
        existsSync(fileURLToPath(new URL(`../../public/games/${n}.webp`, import.meta.url))),
        n,
      ).toBe(true);
  });
});
