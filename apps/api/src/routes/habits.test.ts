import type { ChildNow, ActivityEntry } from '@kidsplus/shared/schedule';
import type { Habit, KidHabits, ParentHabits, Reward } from '@kidsplus/shared/habits';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { streakDays } from './habits';
import {
  createChild,
  girl,
  makeApp,
  pairDevice,
  setupParent,
  SETUP_TOKEN,
  type TestApp,
} from '../test/helpers';

let t: TestApp;
let parent: Record<string, string>;
let child: string;
let device: Record<string, string>;

const req = (method: string, url: string, cookies: Record<string, string>, payload?: object) =>
  t.app.inject({ method: method as 'GET', url, cookies, ...(payload ? { payload } : {}) });
const base = () => `/api/parent/children/${child}`;
const addHabit = async (payload: object) => {
  const res = await req('POST', `${base()}/habits`, parent, payload);
  expect(res.statusCode).toBe(201);
  return res.json<Habit>();
};
const addReward = async (payload: object) => {
  const res = await req('POST', `${base()}/rewards`, parent, payload);
  expect(res.statusCode).toBe(201);
  return res.json<Reward>();
};
const kid = async () => (await req('GET', '/api/kid/habits', device)).json<KidHabits>();
const done = (id: string) => req('POST', `/api/kid/habits/${id}/done`, device);
const page = async () => (await req('GET', `${base()}/habits`, parent)).json<ParentHabits>();

beforeEach(async () => {
  t = await makeApp({ setupToken: SETUP_TOKEN, rateLimit: false });
  // Среда, 13:00 по Москве.
  t.clock.now = new Date('2026-10-14T10:00:00Z');
  parent = await setupParent(t);
  child = await createChild(t, parent, girl({ gender: 'f' }));
  device = await pairDevice(t, parent, child);
});
afterEach(() => t.close());

describe('привычки (этап 30)', () => {
  it('дело отмечается раз в день — одна звёздочка; назавтра снова', async () => {
    const teeth = await addHabit({ preset: 'teeth', title: 'Почистить зубы', slot: 'evening' });
    let list = await kid();
    expect(list.habits).toMatchObject([
      { id: teeth.id, preset: 'teeth', timerSec: 120, done: false, slot: 'evening' },
    ]);
    expect(list.habits[0]!.title.text).toBe('Почистить зубы');
    expect(list.habits[0]!.remind.text).toBe('Пора чистить зубки!');

    expect((await done(teeth.id)).json()).toEqual({ stars: 1 });
    expect((await done(teeth.id)).json()).toEqual({ stars: 1 }); // повторное нажатие
    list = await kid();
    expect(list.habits[0]!.done).toBe(true);
    expect(list.stars).toBe(1);

    t.advance(24 * 3600_000);
    expect((await kid()).habits[0]!.done).toBe(false);
    expect((await done(teeth.id)).json()).toEqual({ stars: 2 });
  });

  it('своё дело — своё напоминание; удалённое пропадает, звёзды остаются', async () => {
    const h = await addHabit({ title: 'Покормить рыбок', slot: 'day', remindAt: '17:30' });
    const [k] = (await kid()).habits;
    expect(k).toMatchObject({ preset: null, remindAt: '17:30', timerSec: null });
    expect(k!.remind.text).toBe('Пора! Покормить рыбок.');
    await done(h.id);
    expect((await req('DELETE', `${base()}/habits/${h.id}`, parent)).statusCode).toBe(204);
    const list = await kid();
    expect(list.habits).toEqual([]);
    expect(list.stars).toBe(1);
    expect((await done(h.id)).statusCode).toBe(404);
  });

  it('проверка полей: время ЧЧ:ММ, название не пустое', async () => {
    for (const payload of [
      { title: 'Дело', slot: 'day', remindAt: '25:00' },
      { title: '  ', slot: 'day' },
      { title: 'Дело', slot: 'night' },
    ])
      expect((await req('POST', `${base()}/habits`, parent, payload)).statusCode).toBe(400);
  });

  it('родитель видит неделю, снимает и ставит отметку; серия дней', async () => {
    const a = await addHabit({ preset: 'wash', title: 'Умыться', slot: 'morning' });
    const b = await addHabit({ preset: 'bed', title: 'Заправить кровать', slot: 'morning' });
    await done(a.id);
    await done(b.id);
    t.advance(24 * 3600_000);
    await done(a.id);
    await done(b.id);
    t.advance(24 * 3600_000);
    await done(a.id); // сегодня пока не всё

    let p = await page();
    expect(p.today).toBe('2026-10-16');
    expect(p.dates).toHaveLength(7);
    expect(p.dates.at(-1)).toBe('2026-10-16');
    expect(p.marks[a.id]).toEqual(['2026-10-14', '2026-10-15', '2026-10-16']);
    expect(p.marks[b.id]).toEqual(['2026-10-14', '2026-10-15']);
    expect(p.streakDays).toBe(2);
    expect(p.stars).toBe(5);

    // Ребёнок слукавил — снять; забыл нажать — поставить.
    expect(
      (await req('DELETE', `${base()}/habits/${a.id}/marks/2026-10-16`, parent)).statusCode,
    ).toBe(204);
    expect((await req('PUT', `${base()}/habits/${b.id}/marks/2026-10-16`, parent)).statusCode).toBe(
      204,
    );
    p = await page();
    expect(p.marks[a.id]).toEqual(['2026-10-14', '2026-10-15']);
    expect(p.marks[b.id]).toEqual(['2026-10-14', '2026-10-15', '2026-10-16']);
    expect(p.stars).toBe(5);
  });

  it('награда: цель копилки, нехватка звёзд — 409, выдача списывает и прибавляет минуты', async () => {
    const h = await addHabit({ preset: 'toys', title: 'Убрать игрушки', slot: 'evening' });
    const park = await addReward({ title: 'Поход в парк', price: 5 });
    const cartoon = await addReward({ title: 'Мультик', price: 2, bonusMinutes: 10 });
    expect((await kid()).goal).toMatchObject({ price: 2, title: { text: 'Мультик' } });

    const grant = (r: Reward) => req('POST', `${base()}/rewards/${r.id}/grant`, parent);
    expect((await grant(cartoon)).statusCode).toBe(409);

    await done(h.id);
    t.advance(24 * 3600_000);
    await done(h.id);
    t.advance(24 * 3600_000);
    await done(h.id);
    // Звёзд 3: «Мультик» уже по карману — цель следующая, «Поход в парк».
    expect((await kid()).goal).toMatchObject({ price: 5 });

    const res = await grant(cartoon);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ stars: 1 });
    const list = await kid();
    expect(list.stars).toBe(1);
    expect(list.lastGrant?.title.text).toBe('Мультик');
    const now = (await req('GET', `${base()}/now`, parent)).json<ChildNow>();
    expect(now.extraMinutes).toBe(10);

    const p = await page();
    expect(p.grants).toMatchObject([{ title: 'Мультик', price: 2, bonusMinutes: 10 }]);
    expect((await grant(park)).statusCode).toBe(409);

    const log = (await req('GET', `${base()}/activity`, parent)).json<{
      entries: ActivityEntry[];
    }>();
    expect(log.entries.map((e) => e.text)).toEqual(
      expect.arrayContaining(['Сделал: убрать игрушки ⭐', 'Награда: Мультик (−2 ⭐)']),
    );
  });

  it('чужое дело не трогается через другого ребёнка', async () => {
    const other = await createChild(t, parent, girl({ nickname: 'Другой' }));
    const h = await addHabit({ title: 'Дело', slot: 'day' });
    const url = `/api/parent/children/${other}/habits/${h.id}`;
    expect((await req('DELETE', url, parent)).statusCode).toBe(404);
    expect((await req('PATCH', url, parent, { title: 'Ещё' })).statusCode).toBe(404);
    const otherDevice = await pairDevice(t, parent, other);
    expect((await req('POST', `/api/kid/habits/${h.id}/done`, otherDevice)).statusCode).toBe(404);
  });
});

describe('серия дней', () => {
  const dates = ['d1', 'd2', 'd3', 'd4'];
  const m = (o: Record<string, string[]>) =>
    new Map(Object.entries(o).map(([k, v]) => [k, new Set(v)]));
  it('считает от сегодня, а если сегодня не всё — от вчера', () => {
    expect(streakDays(['a'], m({ a: ['d2', 'd3', 'd4'] }), dates)).toBe(3);
    expect(streakDays(['a'], m({ a: ['d1', 'd2', 'd3'] }), dates)).toBe(3);
    expect(streakDays(['a', 'b'], m({ a: ['d3', 'd4'], b: ['d4'] }), dates)).toBe(1);
    expect(streakDays([], m({}), dates)).toBe(0);
  });
});
