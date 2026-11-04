// Этап 58: «Одень мишку» — вещи по погоде, раунды, шкаф и мишка на экранах, фразы.
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DRESS_WEATHERS, gameSpec, type GameSpec } from '@kidsplus/shared/games';
import { describe, expect, it } from 'vitest';
import {
  DRESS_DONE,
  DRESS_END,
  DRESS_FITS,
  DRESS_INSTEAD,
  DRESS_MORE,
  dressGood,
  dressOdd,
  dressTask,
  dressWhy,
  gamePhrases,
} from '../phrases';
import type { SpecOf } from './common';
import {
  dressSprites,
  FITS,
  HEADROOM,
  ITEM_AR,
  ITEM_IDS,
  needCount,
  oddRound,
  OUTFITS,
  OWL_RIGHT,
  planDress,
  SHELF_MAX,
  SLOT,
  stageFor,
  TOP_BUTTONS,
  trayFor,
  weatherOrder,
  wornBox,
  WRONG_IN,
  type Box,
} from './dressLogic';

const spec = (o: object) => gameSpec.parse({ kind: 'dress', rounds: 4, ...o }) as SpecOf<'dress'>;
/** Простой повторяемый генератор для тестов. */
const seeded = (seed: number) => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
/** S20 стоя и лёжа, iPhone 15 и SE (как в e2e), обычный Android и планшеты. */
const SCREENS = [
  [412, 915],
  [915, 412],
  [393, 659],
  [320, 568],
  [360, 640],
  [393, 852],
  [852, 393],
  [768, 1024],
  [1024, 768],
] as const;
const inside = (a: Box, b: Box, eps = 1e-6) =>
  a.x >= b.x - eps &&
  a.y >= b.y - eps &&
  a.x + a.w <= b.x + b.w + eps &&
  a.y + a.h <= b.y + b.h + eps;
/** Налезают ли (общая сторона — не в счёт). */
const overlap = (a: Box, b: Box, eps = 1e-6) =>
  a.x < b.x + b.w - eps && b.x < a.x + a.w - eps && a.y < b.y + b.h - eps && b.y < a.y + a.h - eps;

describe('«Одень мишку»: вещи и погода', () => {
  it('в каждую погоду — свой наряд, по вещи на место; лишнее — не из наряда', () => {
    for (const w of DRESS_WEATHERS) {
      const slots = OUTFITS[w].map((id) => SLOT[id]);
      expect(new Set(slots).size, w).toBe(slots.length);
      expect(
        WRONG_IN[w].filter((id) => OUTFITS[w].includes(id)),
        w,
      ).toEqual([]);
      expect(new Set(WRONG_IN[w]).size).toBe(WRONG_IN[w].length);
    }
    // Каждая вещь где-то нужна — картинки не лежат зря.
    const used = new Set(DRESS_WEATHERS.flatMap((w) => OUTFITS[w]));
    expect(ITEM_IDS.filter((id) => !used.has(id))).toEqual([]);
  });

  it('у каждой подходящей вещи есть «почему подходит», у неподходящей — «почему нет»', () => {
    for (const w of DRESS_WEATHERS) {
      for (const id of OUTFITS[w]) expect(dressGood(w, id), `${w}/${id}`).not.toBe('');
      for (const id of WRONG_IN[w]) expect(dressWhy(w, id), `${w}/${id}`).not.toBe('');
    }
    expect(dressWhy('rain', 'sandals')).toBe('В сандаликах ноги промокнут!');
    expect(dressGood('snow', 'mittens')).toBe('Варежки греют лапки!');
  });

  it('у каждой вещи есть пропорции и место на мишке', () => {
    for (const id of ITEM_IDS) {
      expect(ITEM_AR[id], id).toBeGreaterThan(0);
      if (id !== 'umbrella') expect(FITS[id], id).toBeDefined();
    }
  });
});

describe('«Одень мишку»: раунды', () => {
  it('погода по кругу, в перемешку, без одной и той же два раза подряд', () => {
    for (let seed = 1; seed < 40; seed++) {
      const order = weatherOrder(DRESS_WEATHERS, 6, seeded(seed));
      expect(order).toHaveLength(6);
      expect(new Set(order.slice(0, 4)).size).toBe(4);
      for (let i = 1; i < order.length; i++) expect(order[i]).not.toBe(order[i - 1]);
    }
    expect(weatherOrder(['snow'], 3, seeded(1))).toEqual(['snow', 'snow', 'snow']);
  });

  it('«Одень»: нужные вещи по важности; шкаф — нужные и лишние, не больше восьми', () => {
    for (let seed = 1; seed < 30; seed++)
      for (const items of [1, 2, 3, 4])
        for (const r of planDress(spec({ items, rounds: 6 }), seeded(seed))) {
          const k = needCount(r.weather, items);
          expect(r.need).toHaveLength(k);
          expect(r.wear).toEqual([]);
          for (const id of r.need) expect(OUTFITS[r.weather]).toContain(id);
          expect(new Set(r.tray).size).toBe(r.tray.length);
          expect(r.tray.length).toBe(Math.min(SHELF_MAX, k + items));
          for (const id of r.need) expect(r.tray).toContain(id);
          for (const id of r.tray.filter((x) => !r.need.includes(x)))
            expect(WRONG_IN[r.weather]).toContain(id);
        }
    // Одна вещь — самая главная: в дождь зонтик, в снег шапка.
    const first = planDress(spec({ weathers: ['rain', 'snow'], items: 1, rounds: 2 }), seeded(3));
    const main = { rain: 'umbrella', snow: 'hat' } as const;
    for (const r of first) expect(r.need).toEqual([main[r.weather as 'rain' | 'snow']]);
  });

  it('рядом с нужной вещью — неподходящая с того же места (панамка — и шапка)', () => {
    for (let seed = 1; seed < 30; seed++) {
      const tray = trayFor('sun', ['panama'], 1, seeded(seed));
      expect(tray).toHaveLength(2);
      expect(SLOT[tray.find((id) => id !== 'panama')!]).toBe('head');
    }
  });

  it('погода повторяется — «Одень» просит следующие вещи, не те же', () => {
    const rounds = planDress(spec({ weathers: ['snow'], items: 1, rounds: 4 }), seeded(2));
    expect(rounds.map((r) => r.need[0])).toEqual(['hat', 'furcoat', 'mittens', 'valenki']);
    const two = planDress(spec({ weathers: ['rain'], items: 2, rounds: 2 }), seeded(2));
    expect(two.map((r) => r.need)).toEqual([
      ['umbrella', 'boots'],
      ['raincoat', 'umbrella'],
    ]);
  });

  it('«Что не так?»: мишка одет по погоде, одна шапка, одёжка или обувь перепутана', () => {
    for (let seed = 1; seed < 40; seed++)
      for (const w of DRESS_WEATHERS) {
        const r = oddRound(w, seeded(seed));
        const right = r.need[0]!;
        expect(r.need).toHaveLength(1);
        expect(['head', 'body', 'feet']).toContain(SLOT[right]);
        expect(WRONG_IN[w]).toContain(r.wrong);
        expect(SLOT[r.wrong!]).toBe(SLOT[right]);
        expect(r.wear).toHaveLength(OUTFITS[w].length);
        expect(r.wear).toContain(r.wrong);
        expect(r.wear).not.toContain(right);
        expect(r.wear.filter((id) => !OUTFITS[w].includes(id))).toEqual([r.wrong]);
        // В шкафу — нужная, лишняя (её снимут) и, может, ещё одна с того же места.
        expect(r.tray).toContain(right);
        expect(r.tray).toContain(r.wrong);
        expect(r.tray.length).toBeLessThanOrEqual(3);
        for (const id of r.tray) expect(SLOT[id]).toBe(SLOT[right]);
      }
  });

  it('задания по очереди, «Что не так?» в одну погоду не повторяет ту же вещь', () => {
    const rounds = planDress(spec({ tasks: ['dress', 'odd'], rounds: 6 }), seeded(5));
    expect(rounds.map((r) => r.task)).toEqual(['dress', 'odd', 'dress', 'odd', 'dress', 'odd']);
    for (let seed = 1; seed < 30; seed++) {
      const odd = planDress(spec({ weathers: ['wind'], tasks: ['odd'], rounds: 3 }), seeded(seed));
      for (let i = 1; i < odd.length; i++) expect(odd[i]!.need).not.toEqual(odd[i - 1]!.need);
    }
  });
});

describe('«Одень мишку»: комната на экране', () => {
  /** Сколько клеток бывает в шкафу: «Что не так?» — до трёх, «Одень» — до восьми. */
  const SIZES = [1, 2, 3, 4, 5, 6, 7, 8];

  it('на всех экранах всё внутри: окно, мишка с шапкой, шкаф; клетки не налезают', () => {
    for (const [w, h] of SCREENS)
      for (const n of SIZES) {
        const st = stageFor(w, h, n);
        const screen = { x: 0, y: 0, w, h };
        const at = `${w}×${h}, ${n}`;
        expect(inside(st.win, screen), at).toBe(true);
        expect(inside(st.bear, screen), at).toBe(true);
        expect(inside(st.shelf, screen), at).toBe(true);
        expect(st.cells, at).toHaveLength(n);
        for (const c of st.cells) expect(inside(c, st.shelf), at).toBe(true);
        for (let i = 0; i < n; i++)
          for (let j = i + 1; j < n; j++)
            expect(overlap(st.cells[i]!, st.cells[j]!), at).toBe(false);
        expect(overlap(st.bear, st.shelf), at).toBe(false);
        // Над головой — место под шапку и зонтик.
        const head = { ...st.bear, y: st.bear.y - HEADROOM * st.bear.h, h: st.bear.h * HEADROOM };
        expect(head.y, at).toBeGreaterThanOrEqual(0);
        if (!st.land) expect(head.y, at).toBeGreaterThanOrEqual(st.win.y + st.win.h - 1e-6);
        // Вещи на мишке — на экране.
        for (const id of ITEM_IDS)
          expect(inside(wornBox(id, st.bear), screen, 1), `${at} ${id}`).toBe(true);
      }
  });

  it('стоя: окно сверху, мишка над шкафом (не стоит на нём); лёжа: окно, мишка, шкаф', () => {
    for (const [w, h] of SCREENS)
      for (const n of SIZES) {
        const st = stageFor(w, h, n);
        const at = `${w}×${h}, ${n}`;
        if (!st.land) {
          expect(st.win.y + st.win.h, at).toBeLessThanOrEqual(st.bear.y);
          expect(st.shelf.y - (st.bear.y + st.bear.h), at).toBeGreaterThanOrEqual(15);
        } else {
          expect(st.win.x + st.win.w, at).toBeLessThan(st.bear.x);
          expect(st.bear.x + st.bear.w, at).toBeLessThan(st.shelf.x);
          // Не под совой и не под кнопкой «послушать».
          expect(st.win.x, at).toBeGreaterThanOrEqual(OWL_RIGHT);
          expect(st.shelf.y, at).toBeGreaterThanOrEqual(TOP_BUTTONS);
        }
      }
  });

  it('клетки шкафа — по пальцу, мишка на телефонах крупный', () => {
    for (const [w, h] of SCREENS.filter(([w, h]) => Math.min(w, h) < 600))
      for (const n of SIZES) {
        const st = stageFor(w, h, n);
        const at = `${w}×${h}, ${n}`;
        expect(st.cells[0]!.w, at).toBeGreaterThanOrEqual(56);
        expect(st.bear.h, at).toBeGreaterThanOrEqual(Math.min(w, h) * 0.5);
      }
  });

  it('вещи на мишке: пара — обе вместе, зонтик нажимается по куполу над головой', () => {
    const bear = { x: 100, y: 200, w: 300, h: 300 / (567 / 900) };
    for (const id of ITEM_IDS) {
      expect(overlap(wornBox(id, bear), bear), id).toBe(true);
      // Шапка с помпоном и зонтик не выше места над головой.
      expect(wornBox(id, bear).y, id).toBeGreaterThanOrEqual(bear.y - HEADROOM * bear.h);
    }
    const boots = wornBox('boots', bear);
    expect(boots.x + boots.w / 2).toBeCloseTo(bear.x + bear.w / 2);
    expect(boots.w).toBeGreaterThan(bear.w * 0.7);
    const umb = wornBox('umbrella', bear);
    expect(umb.y).toBeLessThan(bear.y);
    expect(umb.y + umb.h).toBeLessThan(bear.y + bear.h * 0.25);
    const head = wornBox('hat', bear);
    const feet = wornBox('sandals', bear);
    expect(head.y + head.h).toBeLessThan(feet.y);
  });

  it('все картинки — свои и лежат в public/games', () => {
    const s = dressSprites();
    expect(new Set(s).size).toBe(s.length);
    for (const name of s) {
      expect(name.startsWith('dress-')).toBe(true);
      const file = fileURLToPath(new URL(`../../public/games/${name}.webp`, import.meta.url));
      expect(existsSync(file), name).toBe(true);
    }
  });
});

describe('«Одень мишку»: фразы', () => {
  it('все фразы игры — в списке озвучки, лишних нет', () => {
    const all = gamePhrases(
      gameSpec.parse({ kind: 'dress', items: 4, tasks: ['dress', 'odd'], rounds: 4 }) as GameSpec,
    );
    for (const w of DRESS_WEATHERS) {
      for (const p of [dressTask(w, needCount(w, 4)), dressOdd(w), DRESS_DONE[w]])
        expect(all).toContain(p);
      for (const id of OUTFITS[w]) expect(all).toContain(dressGood(w, id));
      for (const id of WRONG_IN[w]) expect(all).toContain(dressWhy(w, id));
    }
    for (const p of [DRESS_MORE, DRESS_INSTEAD, DRESS_FITS, DRESS_END]) expect(all).toContain(p);
    expect(new Set(all).size).toBe(all.length);
    expect(all).not.toContain('');
    expect(dressTask('rain', 3)).toBe('На улице дождик! Одень мишку на прогулку! Нужны три вещи.');
    // Одна вещь в дождь: ни «Что ещё?», ни «Что не так?», ни снега.
    const small = gamePhrases(
      gameSpec.parse({ kind: 'dress', weathers: ['rain'], rounds: 2 }) as GameSpec,
    );
    expect(small).toContain('На улице дождик! Что нужно мишке на прогулку?');
    expect(small).not.toContain(DRESS_MORE);
    expect(small).not.toContain(DRESS_INSTEAD);
    expect(small).not.toContain(dressOdd('rain'));
    expect(small).not.toContain(DRESS_DONE.snow);
  });
});
