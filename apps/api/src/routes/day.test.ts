import { schema } from '@kidsplus/db';
import type { KidItem } from '@kidsplus/shared/api';
import {
  DEFAULT_SCHEDULE,
  type ChildNow,
  type Curriculum,
  type HeartbeatResponse,
  type KidToday,
} from '@kidsplus/shared/schedule';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
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
let position = 0;

/** Игра без картинок (обводка) в разделе category — назначена ребёнку. */
const addGame = async (title: string, category: string) => {
  const [row] = await t.db
    .insert(schema.interactives)
    .values({ title, category, kind: 'tracing', params: { shapes: ['1'] } })
    .returning();
  await t.db
    .insert(schema.childItems)
    .values({ childId: child, kind: 'interactive', interactiveId: row!.id, position: position++ });
  return row!.id;
};

const get = async <T>(url: string, cookies = device) =>
  (await t.app.inject({ url, cookies })).json<T>();
const post = async <T>(url: string, payload: object, cookies = device) => {
  const res = await t.app.inject({ method: 'POST', url, cookies, payload });
  return res.json<T>();
};
const beat = (activity: string | null, active = true) =>
  post<HeartbeatResponse>('/api/kid/heartbeat', { activity, active });
/** Ребёнок занимается minutes минут: сигнал раз в 15 с. */
const study = async (activity: string, minutes: number) => {
  let last: HeartbeatResponse | undefined;
  await beat(activity);
  for (let i = 0; i < minutes * 4; i++) {
    t.advance(15_000);
    last = await beat(activity);
  }
  return last!;
};
const enable = async (o: object = {}) => {
  const res = await t.app.inject({
    method: 'PUT',
    url: `/api/parent/children/${child}/schedule`,
    cookies: parent,
    payload: { ...DEFAULT_SCHEDULE, enabled: true, ...o },
  });
  expect(res.statusCode).toBe(200);
};
const control = (payload: object) =>
  post<ChildNow>(`/api/parent/children/${child}/control`, payload, parent);

beforeEach(async () => {
  // Сигналы телефона идут «каждые 15 с» перемоткой часов — без лимита частоты запросов.
  t = await makeApp({ setupToken: SETUP_TOKEN, rateLimit: false });
  // Среда, 13:00 по Москве.
  t.clock.now = new Date('2026-10-14T10:00:00Z');
  parent = await setupParent(t);
  child = await createChild(t, parent, girl({ gender: 'f' }));
  device = await pairDevice(t, parent, child);
  position = 0;
});
afterEach(() => t.close());

describe('расписание дня', () => {
  it('без расписания — как раньше: без лимитов', async () => {
    await addGame('Счёт', 'math');
    const today = await get<KidToday>('/api/kid/today');
    expect(today).toMatchObject({ mode: 'off', closed: null });
    const lesson = await get<{ items: KidItem[] }>('/api/kid/lesson/math');
    expect(lesson.items).toHaveLength(1);
  });

  it('ровно 3 предмета по 20 минут; время считает сервер; потом свободное время', async () => {
    for (const [title, c] of [
      ['Счёт', 'math'],
      ['Флаги', 'geography'],
      ['Звери', 'nature'],
      ['Лабиринт', 'games'],
    ] as const)
      await addGame(title, c);
    await enable();

    const today = await get<KidToday>('/api/kid/today');
    expect(today.mode).toBe('plan');
    expect(today.subjects.map((s) => s.subject)).toEqual(['math', 'geography', 'nature']);
    expect(today.subjects.every((s) => s.secondsLeft === 1200)).toBe(true);
    expect(today.free.open).toBe(false);

    // Урок по предмету — материалы этого раздела.
    const lesson = await get<{ items: KidItem[] }>('/api/kid/lesson/math');
    expect(lesson.items.map((i) => i.kind)).toEqual(['interactive']);

    const after = await study('math', 20);
    expect(after.stop).toBe(true);
    expect(after.subjects.find((s) => s.subject === 'math')).toMatchObject({
      done: true,
      secondsLeft: 0,
    });
    // Время предмета вышло — новый урок не начинается.
    expect((await get<{ items: KidItem[] }>('/api/kid/lesson/math')).items).toEqual([]);

    await study('geography', 20);
    const last = await study('nature', 20);
    expect(last.free).toEqual({ open: true, secondsLeft: 1200 });
    const free = await study('free', 20);
    expect(free.closed).toBe('limit');
  });

  it('без сигналов и на паузе время не идёт', async () => {
    await addGame('Счёт', 'math');
    await enable();
    await beat('math');
    t.advance(10 * 60_000); // телефон был выключен
    let r = await beat('math');
    expect(r.subjects[0]!.secondsLeft).toBe(1200);
    t.advance(15_000);
    r = await beat('math', false); // приложение свёрнуто
    expect(r.subjects[0]!.secondsLeft).toBe(1200);
    t.advance(15_000);
    r = await beat('math');
    expect(r.subjects[0]!.secondsLeft).toBe(1185);
    await control({ action: 'pause' });
    t.advance(15_000);
    r = await beat('math');
    expect(r).toMatchObject({ paused: true });
    expect(r.subjects[0]!.secondsLeft).toBe(1185);
  });

  it('вне окна — «на сегодня всё»; родитель добавил время — можно ещё', async () => {
    await addGame('Счёт', 'math');
    await enable();
    t.clock.now = new Date('2026-10-14T18:30:00Z'); // 21:30 по Москве
    expect((await get<KidToday>('/api/kid/today')).closed).toBe('window');
    const now = await control({ action: 'add', minutes: 10 });
    expect(now.closed).toBeNull();
    expect(now.windowSecondsLeft).toBe(600);
    expect(now.extraMinutes).toBe(10);
    t.advance(11 * 60_000);
    expect((await get<KidToday>('/api/kid/today')).closed).toBe('window');
  });

  it('родитель завершает день и видит, что ребёнок делает сейчас', async () => {
    const game = await addGame('Счёт', 'math');
    await enable();
    await post('/api/kid/heartbeat', {
      activity: 'math',
      active: true,
      item: { kind: 'interactive', id: game },
    });
    const now = await get<ChildNow>(`/api/parent/children/${child}/now`, parent);
    expect(now).toMatchObject({ online: true, activity: 'math', item: { title: 'Счёт' } });
    expect((await control({ action: 'end' })).closed).toBe('ended');
    expect((await get<KidToday>('/api/kid/today')).closed).toBe('ended');
    expect((await control({ action: 'reopen' })).closed).toBeNull();
    t.advance(60_000);
    expect((await get<ChildNow>(`/api/parent/children/${child}/now`, parent)).online).toBe(false);
  });

  it('расписание меняет только родитель; неверные окна не принимаются', async () => {
    const bad = await t.app.inject({
      method: 'PUT',
      url: `/api/parent/children/${child}/schedule`,
      cookies: parent,
      payload: {
        ...DEFAULT_SCHEDULE,
        windows: { ...DEFAULT_SCHEDULE.windows, mon: { from: '22:00', to: '09:00' } },
      },
    });
    expect(bad.statusCode).toBe(400);
    const kid = await t.app.inject({
      method: 'PUT',
      url: `/api/parent/children/${child}/schedule`,
      cookies: device,
      payload: DEFAULT_SCHEDULE,
    });
    expect(kid.statusCode).toBe(401);
  });
});

describe('учебный план', () => {
  it('урок — тема недели; на второй неделе — новая тема и повторение прошлой', async () => {
    const counting = await addGame('Счёт до 5', 'math');
    const shapes = await addGame('Фигуры', 'math');
    const other = await addGame('Ещё математика', 'math');
    await enable();
    const res = await t.app.inject({
      method: 'POST',
      url: `/api/parent/children/${child}/curricula`,
      cookies: parent,
      payload: {
        title: 'Осень',
        startsOn: '2026-10-12',
        weeks: 12,
        subjects: ['math'],
        topics: [
          {
            subject: 'math',
            week: 1,
            title: 'Счёт до 5',
            items: [{ kind: 'interactive', refId: counting }],
          },
          {
            subject: 'math',
            week: 2,
            title: 'Фигуры',
            items: [{ kind: 'interactive', refId: shapes }],
          },
        ],
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json<Curriculum>().topics).toHaveLength(2);

    const ids = async () =>
      (await get<{ items: KidItem[] }>('/api/kid/lesson/math')).items.map((i) => i.id);
    expect(await ids()).toEqual([counting]);
    expect((await get<KidToday>('/api/kid/today')).subjects.map((s) => s.subject)).toEqual([
      'math',
    ]);
    t.advance(7 * 86_400_000);
    expect(await ids()).toEqual([shapes, counting]);
    // Недели без темы — материалы раздела.
    t.advance(7 * 86_400_000);
    expect((await ids()).sort()).toEqual([counting, shapes, other].sort());
  });

  it('предмет плана без материалов в «Сегодня» не попадает — пустой раздел не открыть', async () => {
    await addGame('Счёт', 'math');
    const tune = await addGame('Песенка', 'music');
    await enable();
    const res = await t.app.inject({
      method: 'POST',
      url: `/api/parent/children/${child}/curricula`,
      cookies: parent,
      payload: {
        title: 'Осень',
        startsOn: '2026-10-12',
        weeks: 4,
        subjects: ['music', 'other', 'math', 'games'],
        topics: [
          {
            subject: 'music',
            week: 1,
            title: 'Песенки',
            items: [{ kind: 'interactive', refId: tune }],
          },
          // Тема без материалов и раздел без материалов у ребёнка.
          { subject: 'other', week: 1, title: 'Разное', items: [] },
        ],
      },
    });
    expect(res.statusCode).toBe(201);
    expect((await get<KidToday>('/api/kid/today')).subjects.map((s) => s.subject)).toEqual([
      'music',
      'math',
    ]);
  });

  it('тема вне плана или по чужому предмету — ошибка', async () => {
    const payload = { title: 'План', startsOn: '2026-10-12', weeks: 4, subjects: ['math'] };
    for (const topic of [
      { subject: 'math', week: 5, title: 'После конца' },
      { subject: 'english', week: 1, title: 'Не тот предмет' },
    ]) {
      const res = await t.app.inject({
        method: 'POST',
        url: `/api/parent/children/${child}/curricula`,
        cookies: parent,
        payload: { ...payload, topics: [topic] },
      });
      expect(res.statusCode).toBe(400);
    }
  });
});

describe('черновик плана', () => {
  it('в очередь уходят только возраст, предметы и недели; родитель видит статус', async () => {
    const res = await t.app.inject({
      method: 'POST',
      url: `/api/parent/children/${child}/curriculum-drafts`,
      cookies: parent,
      payload: { subjects: ['math', 'nature'], weeks: 4 },
    });
    expect(res.statusCode).toBe(201);
    const draft = res.json<{ id: string; status: string }>();
    expect(draft.status).toBe('queued');
    const [row] = await t.db.select().from(schema.curriculumDrafts);
    const request = row!.request as Record<string, unknown>;
    expect(Object.keys(request).sort()).toEqual(['ageYears', 'subjects', 'weeks']);
    expect(typeof request.ageYears).toBe('number');
    const got = await get<{ status: string; topics: unknown[] }>(
      `/api/parent/curriculum-drafts/${draft.id}`,
      parent,
    );
    expect(got).toMatchObject({ status: 'queued', topics: [] });
  });
});

describe('PIN детского режима', () => {
  it('выход только по PIN родителя', async () => {
    expect((await post<{ ok: boolean }>('/api/kid/unlock', { pin: '1234' })).ok).toBe(false);
    const set = await t.app.inject({
      method: 'PUT',
      url: '/api/parent/settings/pin',
      cookies: parent,
      payload: { pin: '2580' },
    });
    expect(set.json()).toEqual({ pinSet: true });
    expect((await post<{ ok: boolean }>('/api/kid/unlock', { pin: '1234' })).ok).toBe(false);
    expect((await post<{ ok: boolean }>('/api/kid/unlock', { pin: '2580' })).ok).toBe(true);
    const bad = await t.app.inject({
      method: 'PUT',
      url: '/api/parent/settings/pin',
      cookies: parent,
      payload: { pin: '12' },
    });
    expect(bad.statusCode).toBe(400);
  });
});
