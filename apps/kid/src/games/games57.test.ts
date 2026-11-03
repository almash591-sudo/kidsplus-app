// Этап 57: «Смешай краски» — смешение, вердикт после капли, тюбики, задания и фразы.
import {
  gameSpec,
  PAINT_RECIPES,
  PAINT_TARGETS,
  PAINT_TUBES,
  type GameSpec,
  type PaintTarget,
} from '@kidsplus/shared/games';
import { describe, expect, it } from 'vitest';
import {
  gamePhrases,
  paintsGot,
  paintsIs,
  paintsMore,
  paintsNeed,
  paintsOver,
  paintsRecipe,
  paintsTask,
} from '../phrases';
import type { SpecOf } from './common';
import {
  CAPACITY,
  guessChoices,
  hintNow,
  judge,
  mixColor,
  nameOf,
  NO_DROPS,
  PAINT_OBJECTS,
  paintSprites,
  planRounds,
  targetRgb,
  TUBE_RGB,
  tubesFor,
  type Drops,
} from './paintsLogic';

const d = (o: Partial<Drops>): Drops => ({ ...NO_DROPS, ...o });
const spec = (o: object) => gameSpec.parse({ kind: 'paints', rounds: 3, ...o }) as SpecOf<'paints'>;
/** Простой повторяемый генератор для тестов. */
const seeded = (seed: number) => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const hue = ([r, g, b]: readonly number[]) => {
  const max = Math.max(r!, g!, b!);
  const min = Math.min(r!, g!, b!);
  if (max === min) return 0;
  const c = max - min;
  const h = max === r ? (g! - b!) / c : max === g ? (b! - r!) / c + 2 : (r! - g!) / c + 4;
  return (((h * 60) % 360) + 360) % 360;
};

describe('«Смешай краски»: смешение', () => {
  it('пустая баночка — нет цвета; одна краска — её цвет', () => {
    expect(mixColor(NO_DROPS)).toBeNull();
    for (const t of PAINT_TUBES) expect(mixColor(d({ [t]: 2 }))).toEqual(TUBE_RGB[t]);
  });

  it('смеси похожи на настоящие краски', () => {
    expect(hue(targetRgb('orange'))).toBeGreaterThan(20);
    expect(hue(targetRgb('orange'))).toBeLessThan(45);
    expect(hue(targetRgb('green'))).toBeGreaterThan(90);
    expect(hue(targetRgb('green'))).toBeLessThan(150);
    expect(hue(targetRgb('purple'))).toBeGreaterThan(260);
    expect(hue(targetRgb('purple'))).toBeLessThan(300);
    // Розовый и голубой — светлее красного и синего, того же оттенка.
    const light = (c: readonly number[]) => c[0]! + c[1]! + c[2]!;
    expect(light(targetRgb('pink'))).toBeGreaterThan(light(TUBE_RGB.red) + 120);
    expect(light(targetRgb('lightblue'))).toBeGreaterThan(light(TUBE_RGB.blue) + 120);
    expect(targetRgb('lightblue')[2]).toBeGreaterThan(targetRgb('lightblue')[0]);
    // Коричневый — тёмный и тёплый.
    const brown = targetRgb('brown');
    expect(light(brown)).toBeLessThan(330);
    expect(brown[0]).toBeGreaterThan(brown[2]);
  });

  it('больше жёлтой — смесь теплее; цвет меняется плавно', () => {
    const a = mixColor(d({ red: 2, yellow: 1 }))!;
    const b = mixColor(d({ red: 2, yellow: 2 }))!;
    const c = mixColor(d({ red: 1, yellow: 2 }))!;
    expect(hue(a)).toBeLessThan(hue(b));
    expect(hue(b)).toBeLessThan(hue(c));
  });
});

describe('«Смешай краски»: что сказать после капли', () => {
  it('поровну — готово, по одной капле и по две', () => {
    for (const t of PAINT_TARGETS) {
      const one = Object.fromEntries(PAINT_RECIPES[t].map((c) => [c, 1]));
      const two = Object.fromEntries(PAINT_RECIPES[t].map((c) => [c, 2]));
      expect(judge(d(one), t)).toEqual({ kind: 'done' });
      expect(judge(d(two), t)).toEqual({ kind: 'done' });
    }
  });

  it('не хватает — просит ту краску, которой меньше', () => {
    expect(judge(d({ red: 1 }), 'orange')).toEqual({ kind: 'more', tube: 'yellow', missing: true });
    expect(judge(d({ red: 2, yellow: 1 }), 'orange')).toEqual({
      kind: 'more',
      tube: 'yellow',
      missing: false,
    });
    expect(judge(d({ red: 1, yellow: 1 }), 'brown')).toEqual({
      kind: 'more',
      tube: 'blue',
      missing: true,
    });
  });

  it('чужая краска — другой цвет, с именем, если оно есть', () => {
    expect(judge(d({ blue: 1 }), 'orange')).toEqual({ kind: 'wrong', got: 'blue' });
    expect(judge(d({ red: 1, blue: 1 }), 'orange')).toEqual({ kind: 'wrong', got: 'purple' });
    expect(judge(d({ red: 2, blue: 1 }), 'orange')).toEqual({ kind: 'wrong', got: null });
    expect(judge(d({ red: 1, yellow: 1, white: 1 }), 'orange').kind).toBe('wrong');
  });

  it('одной краски столько, что поровну не влезет — выливаем', () => {
    // Два цвета: по 3 капли влезают, 4 — уже нет.
    expect(judge(d({ red: 3 }), 'orange').kind).toBe('more');
    expect(judge(d({ red: 4 }), 'orange')).toEqual({ kind: 'over', tube: 'red' });
    // Три цвета: по 2.
    expect(judge(d({ red: 3 }), 'brown')).toEqual({ kind: 'over', tube: 'red' });
    // В баночку никогда не нужно больше CAPACITY капель.
    for (const t of PAINT_TARGETS)
      expect(
        PAINT_RECIPES[t].length * Math.floor(CAPACITY / PAINT_RECIPES[t].length),
      ).toBeLessThanOrEqual(CAPACITY);
  });

  it('первую каплю только называем, дальше подсказываем, чего мало', () => {
    expect(hintNow(d({ red: 1 }), judge(d({ red: 1 }), 'orange'))).toBe(false);
    expect(hintNow(d({ red: 2 }), judge(d({ red: 2 }), 'orange'))).toBe(true);
    const v = judge(d({ red: 2, yellow: 1 }), 'orange');
    expect(hintNow(d({ red: 2, yellow: 1 }), v)).toBe(true);
  });

  it('имя смеси: одна краска, рецепт поровну, иначе нет', () => {
    expect(nameOf(d({ yellow: 3 }))).toBe('yellow');
    expect(nameOf(d({ yellow: 1, blue: 1 }))).toBe('green');
    expect(nameOf(d({ red: 1, white: 1 }))).toBe('pink');
    expect(nameOf(d({ red: 1, yellow: 1, blue: 1 }))).toBe('brown');
    expect(nameOf(d({ yellow: 2, blue: 1 }))).toBeNull();
    expect(nameOf(d({ yellow: 1, white: 1 }))).toBeNull();
  });
});

describe('«Смешай краски»: стол и задания', () => {
  it('тюбики всегда в одном порядке; белый — только если нужен или «все»', () => {
    expect(tubesFor('needed', 'green')).toEqual(['yellow', 'blue']);
    expect(tubesFor('needed', 'brown')).toEqual(['red', 'yellow', 'blue']);
    expect(tubesFor('primary', 'orange')).toEqual(['red', 'yellow', 'blue']);
    expect(tubesFor('primary', 'pink')).toEqual(['red', 'yellow', 'blue', 'white']);
    expect(tubesFor('all', 'orange')).toEqual(['red', 'yellow', 'blue', 'white']);
    for (const t of PAINT_TARGETS)
      for (const m of ['needed', 'primary', 'all'] as const)
        for (const c of PAINT_RECIPES[t]) expect(tubesFor(m, t)).toContain(c);
  });

  it('задания: без одного цвета подряд, два предмета цвета по очереди', () => {
    for (let seed = 1; seed < 30; seed++) {
      const rounds = planRounds(
        spec({ colors: ['orange', 'green', 'purple'], rounds: 8 }),
        seeded(seed),
      );
      expect(rounds).toHaveLength(8);
      for (let i = 1; i < rounds.length; i++)
        expect(rounds[i]!.target).not.toBe(rounds[i - 1]!.target);
      for (const t of ['orange', 'green', 'purple'] as const) {
        const objs = rounds.filter((r) => r.target === t).map((r) => r.object.id);
        for (let i = 1; i < objs.length; i++) expect(objs[i]).not.toBe(objs[i - 1]);
        for (const id of objs) expect(PAINT_OBJECTS[t].map((o) => o.id)).toContain(id);
      }
    }
    const one = planRounds(spec({ colors: ['brown'], rounds: 3 }), seeded(3));
    expect(one.map((r) => r.target)).toEqual(['brown', 'brown', 'brown']);
  });

  it('«что получится?» — верный и ещё два разных цвета', () => {
    for (let seed = 1; seed < 20; seed++) {
      const c = guessChoices('green', ['orange', 'green'], seeded(seed));
      expect(c).toHaveLength(3);
      expect(new Set(c).size).toBe(3);
      expect(c).toContain('green');
      expect(c).toContain('orange');
    }
  });

  it('все спрайты — у каждого предмета своя картинка', () => {
    const s = paintSprites();
    expect(s).toContain('paints-bg');
    expect(s).toContain('paints-tube');
    expect(new Set(s).size).toBe(s.length);
    expect(s).toHaveLength(4 - 1 + 12);
  });
});

describe('«Смешай краски»: фразы', () => {
  it('задание и рецепт по-русски, с родом предмета', () => {
    expect(paintsTask(PAINT_OBJECTS.orange[0], 'orange')).toBe(
      'Тыква оранжевая. Сделай оранжевую краску!',
    );
    expect(paintsTask(PAINT_OBJECTS.green[1], 'green')).toBe(
      'Огурец зелёный. Сделай зелёную краску!',
    );
    expect(paintsRecipe('orange')).toBe('Смешай красную и жёлтую!');
    expect(paintsRecipe('brown')).toBe('Смешай красную, жёлтую и синюю!');
    expect(paintsMore('yellow')).toBe('Добавь жёлтой!');
    expect(paintsIs('blue')).toBe('Синяя!');
  });

  it('все фразы игры — в списке озвучки', () => {
    const all: PaintTarget[] = [...PAINT_TARGETS];
    const phrases = gamePhrases(
      gameSpec.parse({
        kind: 'paints',
        colors: all,
        tubes: 'all',
        guess: true,
        rounds: 8,
      }) as GameSpec,
    );
    for (const t of all) {
      for (const o of PAINT_OBJECTS[t]) expect(phrases).toContain(paintsTask(o, t));
      expect(phrases).toContain(paintsRecipe(t));
      expect(phrases).toContain(paintsNeed(t));
      expect(phrases).toContain(paintsGot(t));
    }
    for (const c of PAINT_TUBES) {
      expect(phrases).toContain(paintsIs(c));
      expect(phrases).toContain(paintsMore(c));
      expect(phrases).toContain(paintsOver(c));
    }
  });
});
