import { describe, expect, it } from 'vitest';
import { builderTower } from './Builder';
import { fishingRound, waterline } from './Fishing';
import { flyStep, nextThing, SKY } from './Flight';
import { LAUNCH, rocketPose, spaceLayout, spaceValues } from './Space';

describe('игры посложнее (этап 36)', () => {
  it('космос: цифры, через одну, с конца, буквы', () => {
    const base = { order: 'numbers', count: 5, step: 1, reverse: false } as const;
    expect(spaceValues(base)).toEqual(['1', '2', '3', '4', '5']);
    expect(spaceValues({ ...base, step: 2 })).toEqual(['2', '4', '6', '8', '10']);
    expect(spaceValues({ ...base, reverse: true })).toEqual(['5', '4', '3', '2', '1']);
    expect(spaceValues({ ...base, order: 'letters', count: 4 })).toEqual(['А', 'Б', 'В', 'Г']);
  });

  it('космос: планеты не на одном месте и не на старте ракеты', () => {
    for (let i = 0; i < 50; i++) {
      const spots = spaceLayout(10, 3, 4);
      expect(spots).toHaveLength(10);
      for (const [a, s] of spots.entries()) {
        expect(Math.hypot(s.x - LAUNCH.x, s.y - LAUNCH.y)).toBeGreaterThan(10);
        for (const t of spots.slice(a + 1))
          expect(Math.hypot(s.x - t.x, s.y - t.y)).toBeGreaterThan(10);
      }
    }
  });

  it('космос: ракета летит носом к цели и не переворачивается', () => {
    expect(rocketPose(100, -100)).toEqual({ angle: 0, left: false });
    expect(rocketPose(-100, -100)).toEqual({ angle: -0, left: true });
    const down = rocketPose(10, 200);
    expect(down.angle).toBeLessThanOrEqual(60);
  });

  it('рыбалка: нужная рыбка есть, остальные другие, задание не повторяется подряд', () => {
    for (let i = 0; i < 100; i++) {
      const r = fishingRound({ mode: 'numbers', max: 5, fish: 4 }, '3');
      expect(r.values).toHaveLength(4);
      expect(new Set(r.values).size).toBe(4);
      expect(r.values).toContain(r.target);
      expect(r.target).not.toBe('3');
      expect(Number(r.target)).toBeLessThanOrEqual(5);
    }
  });

  it('рыбалка: рыбок не больше, чем разных значений; буквы — из первых max', () => {
    const r = fishingRound({ mode: 'letters', max: 3, fish: 6 });
    expect(r.values.sort()).toEqual(['А', 'О', 'У']);
  });

  it('рыбалка: пример даёт ответ на нужной рыбке', () => {
    for (let i = 0; i < 100; i++) {
      const r = fishingRound({ mode: 'sums', max: 6, fish: 4 });
      const [a, b] = r.sum!;
      expect(a).toBeGreaterThanOrEqual(1);
      expect(b).toBeGreaterThanOrEqual(1);
      expect(String(a + b)).toBe(r.target);
    }
  });

  it('рыбалка: линия воды — по фону, прижатому к верху', () => {
    // Телефон вертикально: фон по высоте → 20 % высоты.
    expect(waterline(400, 900)).toBeCloseTo(180);
    // Горизонтально: фон по ширине (900 / 1.777 ≈ 506 > 400) → 25,5 % от 506.
    expect(waterline(900, 400)).toBeCloseTo(0.255 * (900 / (1672 / 941)));
  });

  it('полёт: держишь — вверх, отпустил — вниз, за небо не вылетает', () => {
    let up = { y: 0.5, vy: 0 };
    for (let i = 0; i < 30; i++) up = flyStep(up.y, up.vy, true, 0.016);
    expect(up.y).toBeLessThan(0.5);
    let down = { y: 0.5, vy: 0 };
    for (let i = 0; i < 30; i++) down = flyStep(down.y, down.vy, false, 0.016);
    expect(down.y).toBeGreaterThan(0.5);
    for (let i = 0; i < 500; i++) up = flyStep(up.y, up.vy, true, 0.05);
    expect(up.y).toBe(SKY.top);
    for (let i = 0; i < 500; i++) down = flyStep(down.y, down.vy, false, 0.05);
    expect(down.y).toBe(SKY.bottom);
  });

  it('полёт: тучки не подряд, без тучек — только звёзды, всё в пределах неба', () => {
    let prev: 'star' | 'cloud' | null = null;
    for (let i = 0; i < 300; i++) {
      const t = nextThing({ clouds: 'many', speed: 'slow' }, prev);
      if (prev === 'cloud') expect(t.kind).toBe('star');
      expect(t.y).toBeGreaterThan(SKY.top);
      expect(t.y).toBeLessThan(SKY.bottom);
      prev = t.kind;
      expect(nextThing({ clouds: 'none', speed: 'slow' }, null).kind).toBe('star');
    }
  });

  it('строитель: башня нужной высоты из первых деталей, крыша только наверху, без повторов подряд', () => {
    for (let i = 0; i < 200; i++) {
      const t = builderTower({ height: 5, blocks: 3 });
      expect(t).toHaveLength(5);
      for (const [j, b] of t.entries()) {
        expect(['cube', 'bar', 'roof']).toContain(b);
        if (j < t.length - 1) expect(b).not.toBe('roof');
        if (j > 0) expect(b).not.toBe(t[j - 1]);
      }
    }
  });
});
