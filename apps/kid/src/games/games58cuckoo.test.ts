// Этап 58: «Часы с кукушкой» — стрелки и время, какая стрелка в пальце, проверка ответа, раунды
// и режим дня, часы на экранах телефонов, фразы и картинки.
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { gameSpec, type GameSpec } from '@kidsplus/shared/games';
import { describe, expect, it } from 'vitest';
import {
  CUCKOO_BIG_HAND,
  CUCKOO_DAY,
  CUCKOO_GO,
  CUCKOO_NOW_BIG,
  CUCKOO_READ_INTRO,
  cuckooShow,
  GAME_INTRO,
  gamePhrases,
} from '../phrases';
import type { SpecOf } from './common';
import {
  BIG_LEN,
  caseTopAt,
  cuckooSprites,
  DAY,
  grabHand,
  hangMin,
  hourTurn,
  judge,
  minuteTurn,
  NOON,
  numberAt,
  NUM_R,
  obstacles,
  OWL_RIGHT,
  planRounds,
  pointAt,
  sameTime,
  settle,
  SMALL_LEN,
  snapHour,
  snapMinute,
  stageFor,
  turnAt,
  turnDelta,
  type Box,
  type Face,
} from './cuckooLogic';

const spec = (o: object) => gameSpec.parse({ kind: 'cuckoo', rounds: 4, ...o }) as SpecOf<'cuckoo'>;
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
const boxHit = (a: Box, b: Box) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const F: Face = { x: 200, y: 300, r: 100 };

describe('часы (этап 58): стрелки', () => {
  it('повороты стрелок: маленькая к половине — на полпути к следующему числу', () => {
    expect(hourTurn({ h: 3, m: 0 })).toBeCloseTo(0.25);
    expect(hourTurn({ h: 12, m: 0 })).toBe(0);
    expect(hourTurn({ h: 3, m: 30 })).toBeCloseTo(3.5 / 12);
    expect(minuteTurn({ h: 3, m: 30 })).toBe(0.5);
    for (let t = 0; t < 1; t += 0.05) {
      const [x, y] = pointAt(F, t, 0.7);
      expect(turnAt(F, x, y)).toBeCloseTo(t, 6);
    }
    expect(pointAt(F, 0, 1)[1]).toBeCloseTo(200);
    expect(pointAt(F, 0.25, 1)[0]).toBeCloseTo(300);
    expect(turnDelta(0.95, 0.05)).toBeCloseTo(0.1);
    expect(turnDelta(0.05, 0.95)).toBeCloseTo(-0.1);
  });

  it('стрелки ложатся на ровно или половину; маленькая в половину — после своего часа', () => {
    expect(snapMinute(0.2, true)).toBe(0);
    expect(snapMinute(0.3, true)).toBe(30);
    expect(snapMinute(0.74, true)).toBe(30);
    expect(snapMinute(0.8, true)).toBe(0);
    expect(snapMinute(0.5, false)).toBe(0);
    expect(snapHour(0.25, 0)).toBe(3);
    expect(snapHour(0.27, 0)).toBe(3);
    expect(snapHour(0.999, 0)).toBe(12);
    expect(snapHour(0.01, 0)).toBe(12);
    // Половина четвёртого: стрелка между 3 и 4 — и на самой «3».
    expect(snapHour(3.5 / 12, 30)).toBe(3);
    expect(snapHour(3 / 12, 30)).toBe(3);
    expect(snapHour(3.7 / 12, 30)).toBe(3);
    expect(snapHour(4 / 12, 30)).toBe(4);
    expect(snapHour(11.9 / 12, 30)).toBe(12);
  });

  it('большая стрелка тянет маленькую: через «12» — следующий час, назад — прошлый', () => {
    // Как в игре: маленькая сдвигается на 1/12 поворота большой.
    const drag = (t: { h: number; m: 0 | 30 }, to: number) => {
      let small = hourTurn(t);
      let big = minuteTurn(t);
      const steps = 40;
      const total = to - big;
      for (let i = 0; i < steps; i++) {
        const nb = big + total / steps;
        small += turnDelta(big, nb) / 12;
        big = nb;
      }
      return settle(small, big, true);
    };
    expect(drag({ h: 3, m: 0 }, 0.5)).toEqual({ h: 3, m: 30 });
    expect(drag({ h: 3, m: 0 }, 1)).toEqual({ h: 4, m: 0 });
    expect(drag({ h: 3, m: 30 }, 1)).toEqual({ h: 4, m: 0 });
    expect(drag({ h: 3, m: 0 }, -0.5)).toEqual({ h: 2, m: 30 });
    expect(drag({ h: 12, m: 0 }, 1.5)).toEqual({ h: 1, m: 30 });
    expect(drag({ h: 1, m: 0 }, -1)).toEqual({ h: 12, m: 0 });
  });

  it('нажатие на число: по углу, не в середине и не мимо циферблата', () => {
    for (let n = 1; n <= 12; n++) {
      const [x, y] = pointAt(F, n / 12, NUM_R);
      expect(numberAt(F, x, y)).toBe(n);
      // Чуть в сторону и ближе к краю — то же число.
      const [x2, y2] = pointAt(F, n / 12 + 0.03, 1.1);
      expect(numberAt(F, x2, y2)).toBe(n);
    }
    expect(numberAt(F, F.x + 10, F.y)).toBeNull();
    expect(numberAt(F, F.x + 140, F.y)).toBeNull();
  });

  it('какая стрелка в пальце: без половин — маленькая, с половинами — ближайшая', () => {
    const small = hourTurn({ h: 3, m: 0 });
    const big = 0;
    const [bx, by] = pointAt(F, big, BIG_LEN);
    expect(grabHand(F, small, big, bx, by, false)).toBe('small');
    expect(grabHand(F, small, big, bx, by, true)).toBe('big');
    const [sx, sy] = pointAt(F, small, SMALL_LEN);
    expect(grabHand(F, small, big, sx, sy, true)).toBe('small');
    // У самой середины — маленькая.
    expect(grabHand(F, small, big, F.x + 2, F.y - 2, true)).toBe('small');
    // Мимо обеих — ближайшая по углу: у «9» — большая (она на «12»), у «5» — маленькая.
    const [x9, y9] = pointAt(F, 10.5 / 12, 1.2);
    expect(grabHand(F, small, big, x9, y9, true)).toBe('big');
    const [x5, y5] = pointAt(F, 5 / 12, 1.2);
    expect(grabHand(F, small, big, x5, y5, true)).toBe('small');
    // Обе на «12»: у кончика — большая, ближе к середине — маленькая.
    const [tx, ty] = pointAt(F, 0, 0.8);
    expect(grabHand(F, 0, 0, tx, ty, true)).toBe('big');
    const [mx, my] = pointAt(F, 0, 0.3);
    expect(grabHand(F, 0, 0, mx, my, true)).toBe('small');
  });

  it('проверка ответа: что не так и какую стрелку двигать дальше', () => {
    const t = { h: 3, m: 30 } as const;
    expect(judge(t, { h: 3, m: 30 }, 'small')).toBe('win');
    expect(judge(t, { h: 4, m: 30 }, 'small')).toBe('hour');
    expect(judge(t, { h: 3, m: 0 }, 'small')).toBe('needBig');
    expect(judge(t, { h: 3, m: 0 }, 'big')).toBe('minute');
    expect(judge(t, { h: 12, m: 30 }, 'big')).toBe('needSmall');
  });
});

describe('часы (этап 58): раунды', () => {
  it('задания по очереди; час всегда новый; начинаем с того, что показывают часы', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const rs = planRounds(spec({ tasks: ['read', 'set'], rounds: 8 }), seeded(seed));
      expect(rs.map((r) => r.task)).toEqual([
        'read',
        'set',
        'read',
        'set',
        'read',
        'set',
        'read',
        'set',
      ]);
      expect(sameTime(rs[0]!.start, NOON)).toBe(true);
      rs.forEach((r, i) => {
        expect(r.target.m).toBe(0);
        expect(r.target.h).toBeGreaterThanOrEqual(1);
        expect(r.target.h).toBeLessThanOrEqual(r.task === 'read' ? 11 : 12);
        expect(r.target.h).not.toBe(r.start.h);
        if (i > 0) expect(r.start).toEqual(rs[i - 1]!.target);
      });
    }
  });

  it('с половинами «Покажи» — две из трёх в половину; «Который час?» — всегда ровно', () => {
    const rs = planRounds(spec({ tasks: ['read', 'set'], half: true, rounds: 8 }), seeded(3));
    expect(rs.filter((r) => r.task === 'set').map((r) => r.target.m)).toEqual([30, 0, 30, 30]);
    expect(rs.filter((r) => r.task === 'read').every((r) => r.target.m === 0)).toBe(true);
  });

  it('режим дня: по порядку дня — утро, день, вечер; половины — только с половинами', () => {
    for (let seed = 1; seed <= 30; seed++)
      for (const half of [false, true]) {
        const rs = planRounds(spec({ tasks: ['day'], half, rounds: 3 }), seeded(seed));
        expect(rs.map((r) => r.day!.part)).toEqual(['morning', 'day', 'evening']);
        if (!half) expect(rs.every((r) => r.target.m === 0)).toBe(true);
        for (const r of rs) {
          expect(r.target).toEqual(r.day!.t);
          expect(sameTime(r.start, r.target)).toBe(false);
        }
      }
    // Больше раундов, чем событий, — день идёт по кругу, подряд не повторяется.
    const many = planRounds(spec({ tasks: ['day'], rounds: 8 }), seeded(1));
    expect(many.map((r) => r.day!.id)).toEqual([
      'wake',
      'breakfast',
      'walk',
      'lunch',
      'bath',
      'sleep',
      'wake',
      'breakfast',
    ]);
    const mixed = planRounds(
      spec({ tasks: ['read', 'set', 'day'], half: true, rounds: 8 }),
      seeded(2),
    );
    const days = mixed.filter((r) => r.task === 'day');
    expect(days).toHaveLength(2);
    expect(DAY.indexOf(days[0]!.day!)).toBeLessThan(DAY.indexOf(days[1]!.day!));
  });
});

describe('часы (этап 58): на экране', () => {
  it('часы целиком на экране, крыша не налезает на сову и кнопки, карточка — отдельно', () => {
    for (const [w, h] of SCREENS)
      for (const card of [false, true]) {
        const st = stageFor(w, h, card);
        const at = `${w}x${h}${card ? ' карточка' : ''}`;
        const c = st.case;
        expect(c.x, at).toBeGreaterThanOrEqual(0);
        expect(c.x + c.w, at).toBeLessThanOrEqual(w);
        expect(c.y, at).toBeGreaterThanOrEqual(0);
        expect(c.y + c.h + st.hang, at).toBeLessThanOrEqual(h);
        expect(st.hang, at).toBeGreaterThanOrEqual(c.h * hangMin(st.land) - 1e-6);
        for (const o of obstacles(w, h))
          for (let x = o.x - 4; x <= o.x + o.w + 4; x += 2)
            expect(caseTopAt(st, x), `${at} ${o.x},${o.y} x=${x}`).toBeGreaterThanOrEqual(
              o.y + o.h,
            );
        if (st.land) {
          expect(c.x, at).toBeGreaterThanOrEqual(OWL_RIGHT);
          expect(c.x + c.w, at).toBeLessThanOrEqual(w - OWL_RIGHT);
        }
        if (card) {
          const k = st.card!;
          expect(k.x >= 0 && k.y >= 0 && k.x + k.w <= w && k.y + k.h <= h, at).toBe(true);
          expect(boxHit(k, c), at).toBe(false);
          for (const o of obstacles(w, h)) expect(boxHit(k, o), at).toBe(false);
          expect(k.w, at).toBeGreaterThanOrEqual(112);
        } else expect(st.card).toBeNull();
        // Циферблат крупный: числа далеко друг от друга, чтобы попасть пальцем (лёжа на маленьком
        // экране — чуть мельче).
        const small = Math.min(w, h) < 390;
        expect(st.face.r, at).toBeGreaterThanOrEqual(st.land ? (small ? 54 : 64) : 70);
        // Дверца над циферблатом, внутри корпуса.
        expect(st.door.y + st.door.h, at).toBeLessThan(st.face.y - st.face.r);
      }
  });

  it('стоя на телефонах циферблат почти во всю ширину', () => {
    for (const [w, h] of [
      [412, 915],
      [393, 659],
      [320, 568],
    ] as const) {
      const st = stageFor(w, h, false);
      expect(st.case.w, `${w}x${h}`).toBeGreaterThanOrEqual(w - 20);
    }
  });
});

describe('часы (этап 58): фразы и картинки', () => {
  it('фразы по заданиям и половинам, вступление', () => {
    const read = gamePhrases(spec({ tasks: ['read'] }) as GameSpec);
    expect(read).toEqual(expect.arrayContaining([CUCKOO_GO, CUCKOO_READ_INTRO, CUCKOO_BIG_HAND]));
    expect(read).not.toContain(cuckooShow({ h: 3, m: 0 }));
    const set = gamePhrases(spec({ tasks: ['set'], half: true }) as GameSpec);
    expect(set).toEqual(
      expect.arrayContaining([
        cuckooShow({ h: 3, m: 0 }),
        cuckooShow({ h: 3, m: 30 }),
        CUCKOO_NOW_BIG,
        'Сейчас половина четвёртого.',
      ]),
    );
    expect(cuckooShow({ h: 3, m: 30 })).toBe('Покажи половину четвёртого!');
    expect(cuckooShow({ h: 1, m: 0 })).toBe('Покажи час!');
    expect(cuckooShow({ h: 12, m: 30 })).toBe('Покажи половину первого!');
    const day = gamePhrases(spec({ tasks: ['day'] }) as GameSpec);
    expect(day).toEqual(expect.arrayContaining([...CUCKOO_DAY.wake, ...CUCKOO_DAY.sleep]));
    expect(day).not.toContain(CUCKOO_DAY.teeth[0]);
    expect(GAME_INTRO.cuckoo).toBe(CUCKOO_GO);
  });

  it('картинки игры и значок на месте', () => {
    for (const n of [...cuckooSprites(), 'icon-cuckoo'])
      expect(
        existsSync(fileURLToPath(new URL(`../../public/games/${n}.webp`, import.meta.url))),
        n,
      ).toBe(true);
  });
});
