import type { AppErrorEntry, AppErrorReport } from '@kidsplus/shared/app-errors';
import type { Device } from '@kidsplus/shared/api';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  cookieFrom,
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

beforeEach(async () => {
  t = await makeApp({ setupToken: SETUP_TOKEN, rateLimit: false });
  t.clock.now = new Date('2026-10-28T10:00:00Z');
  parent = await setupParent(t);
  child = await createChild(t, parent, girl({ nickname: 'Зайка' }));
  device = await pairDevice(t, parent, child);
});
afterEach(() => t.close());

const err = (over: Partial<AppErrorReport> = {}): AppErrorReport => ({
  kind: 'error',
  message: "TypeError: Cannot read properties of undefined (reading 'x')",
  stack: 'at Maze (Maze.tsx:10)',
  screen: 'game:maze',
  build: '2026-10-28T09:00',
  count: 1,
  at: '2026-10-28T09:59:00Z',
  ...over,
});
const send = (errors: AppErrorReport[], cookies = device) =>
  t.app.inject({
    method: 'POST',
    url: '/api/kid/errors',
    cookies,
    headers: { 'user-agent': 'Mozilla/5.0 (Linux; Android 13; SM-G986B) Chrome/141' },
    payload: { errors },
  });
const devices = async () =>
  (await t.app.inject({ url: '/api/parent/devices', cookies: parent })).json<Device[]>();
const list = async (id: string, cookies = parent) =>
  t.app.inject({ url: `/api/parent/devices/${id}/errors`, cookies });

describe('сбои детского приложения (этап 51)', () => {
  it('телефон сообщает — родитель видит счётчик у телефона и сам сбой', async () => {
    expect((await devices())[0]).toMatchObject({ errors: 0 });
    expect((await send([err()])).statusCode).toBe(204);
    const [d] = await devices();
    expect(d).toMatchObject({ errors: 1 });
    const res = await list(d!.id);
    expect(res.statusCode).toBe(200);
    expect(res.json<AppErrorEntry[]>()).toEqual([
      {
        id: expect.any(Number),
        kind: 'error',
        message: "TypeError: Cannot read properties of undefined (reading 'x')",
        stack: 'at Maze (Maze.tsx:10)',
        screen: 'game:maze',
        build: '2026-10-28T09:00',
        userAgent: 'Mozilla/5.0 (Linux; Android 13; SM-G986B) Chrome/141',
        count: 1,
        firstAt: '2026-10-28T09:59:00.000Z',
        lastAt: '2026-10-28T10:00:00.000Z',
      },
    ]);
  });

  it('одинаковые за сутки — одна строка со счётчиком; через сутки — новая', async () => {
    await send([err({ count: 3 }), err({ kind: 'rejection', message: 'HTTP 500' })]);
    t.clock.now = new Date('2026-10-28T18:00:00Z');
    await send([err({ count: 2, screen: 'menu' })]);
    const [d] = await devices();
    expect(d!.errors).toBe(6);
    const rows = (await list(d!.id)).json<AppErrorEntry[]>();
    expect(rows.map((r) => [r.kind, r.count, r.screen])).toEqual([
      ['error', 5, 'menu'],
      ['rejection', 1, 'game:maze'],
    ]);

    t.clock.now = new Date('2026-10-29T19:00:00Z');
    await send([err()]);
    expect((await list(d!.id)).json<AppErrorEntry[]>()).toHaveLength(3);
  });

  it('зациклившаяся ошибка: не больше 20 новых строк в час с телефона', async () => {
    for (let i = 0; i < 3; i++)
      await send(Array.from({ length: 10 }, (_, j) => err({ message: `Ошибка ${i * 10 + j}` })));
    const [d] = await devices();
    expect((await list(d!.id)).json<AppErrorEntry[]>()).toHaveLength(20);
    // Через час — снова принимает.
    t.clock.now = new Date('2026-10-28T11:30:00Z');
    await send([err({ message: 'Новая' })]);
    expect((await list(d!.id)).json<AppErrorEntry[]>()).toHaveLength(21);
  });

  it('в счётчике — неделя, в списке — 30 дней; старше 30 дней удаляются', async () => {
    await send([err({ message: 'Старая' })]);
    t.clock.now = new Date('2026-11-06T10:00:00Z');
    await send([err({ message: 'Свежая' })]);
    const [d] = await devices();
    expect(d!.errors).toBe(1);
    expect((await list(d!.id)).json<AppErrorEntry[]>().map((r) => r.message)).toEqual([
      'Свежая',
      'Старая',
    ]);
    t.clock.now = new Date('2026-12-01T10:00:00Z');
    await send([err({ message: 'Ещё одна' })]);
    // Сессия родителя живёт 30 дней — входим заново.
    const login = await t.app.inject({
      method: 'POST',
      url: '/api/parent/login',
      payload: { email: 'mama@example.com', password: 'correct horse battery' },
    });
    parent = { kp_session: cookieFrom(login, 'kp_session') };
    // «Старой» 34 дня — удалена, «Свежей» 25 — ещё видна.
    expect((await list(d!.id)).json<AppErrorEntry[]>().map((r) => r.message)).toEqual([
      'Ещё одна',
      'Свежая',
    ]);
  });

  it('время с телефона не в будущем; слишком длинное и чужое не принимается', async () => {
    await send([err({ at: '2027-01-01T00:00:00Z' })]);
    const [d] = await devices();
    expect((await list(d!.id)).json<AppErrorEntry[]>()[0]!.firstAt).toBe(
      '2026-10-28T10:00:00.000Z',
    );
    expect((await send([err({ message: 'x'.repeat(301) })])).statusCode).toBe(400);
    expect((await send([err({ kind: 'crash' as 'error' })])).statusCode).toBe(400);
    expect((await send([])).statusCode).toBe(400);
    expect((await send([err()], {})).statusCode).toBe(401);
  });

  it('сбои чужого телефона не видны другой семье; просмотр из кабинета не пишет', async () => {
    await send([err()]);
    const [d] = await devices();
    const inv = await t.app.inject({
      method: 'POST',
      url: '/api/parent/families/invites',
      cookies: parent,
      payload: { name: 'Сестра' },
    });
    const accept = await t.app.inject({
      method: 'POST',
      url: '/api/parent/invites/accept',
      payload: {
        token: inv.json<{ token: string }>().token,
        email: 'sis@example.com',
        password: '0123456789',
      },
    });
    const sister = { kp_session: cookieFrom(accept, 'kp_session') };
    expect((await list(d!.id, sister)).statusCode).toBe(404);

    const preview = await t.app.inject({
      method: 'POST',
      url: `/api/parent/children/${child}/preview`,
      cookies: parent,
    });
    expect(preview.statusCode).toBe(201);
    const claim = await t.app.inject({
      method: 'POST',
      url: '/api/kid/pair',
      payload: { code: preview.json<{ code: string }>().code },
    });
    const viewer = { kp_device: cookieFrom(claim, 'kp_device') };
    expect((await send([err({ message: 'Из просмотра' })], viewer)).statusCode).toBe(204);
    expect((await list(d!.id)).json<AppErrorEntry[]>().map((r) => r.message)).not.toContain(
      'Из просмотра',
    );
    expect((await devices()).map((x) => x.errors)).toEqual([1]);
  });
});
