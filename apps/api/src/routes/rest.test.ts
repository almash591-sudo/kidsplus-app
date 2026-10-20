import type { KidPlaylist } from '@kidsplus/shared/api';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createChild,
  createSegment,
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

const playlist = async () =>
  (await t.app.inject({ url: '/api/kid/playlist', cookies: device })).json<KidPlaylist>();
const event = (type: string, segmentId: string) =>
  t.app.inject({
    method: 'POST',
    url: '/api/kid/events',
    cookies: device,
    payload: { type, segmentId, payload: {} },
  });

beforeEach(async () => {
  t = await makeApp({ setupToken: SETUP_TOKEN, rateLimit: false });
  t.clock.now = new Date(Date.UTC(2026, 9, 20, 9));
  parent = await setupParent(t);
  child = await createChild(t, parent, girl());
  device = await pairDevice(t, parent, child);
});
afterEach(() => t.close());

describe('уровни сложности игр (этап 34)', () => {
  it('две игры без ошибок — уровень выше; много ошибок — ниже', async () => {
    const play = (mistakes: number) =>
      t.app.inject({
        method: 'POST',
        url: '/api/kid/events',
        cookies: device,
        payload: { type: 'interactive_complete', payload: { kind: 'counting', mistakes } },
      });
    const levels = async () => (await playlist()).levels!;
    const { start } = await levels();
    expect((await levels()).byKind.counting).toBeUndefined();
    await play(0);
    await play(0);
    expect((await levels()).byKind.counting).toBe(start + 1);
    await play(6);
    expect((await levels()).byKind.counting).toBe(start);
  });
});

describe('пройденное отдыхает (этап 34)', () => {
  it('досмотрел сегодня — пункт отдыхает до завтра; «без ограничений» — нет', async () => {
    const a = await createSegment(t, parent, { videoId: 'restaaaaaa1', childIds: [child] });
    const b = await createSegment(t, parent, { videoId: 'restaaaaaa2', childIds: [child] });
    await event('segment_complete', a);
    const items = (await playlist()).items;
    expect(items.find((i) => i.id === a)?.rest).toBe('today');
    expect(items.find((i) => i.id === b)?.rest).toBeUndefined();

    // Завтра — снова можно.
    t.clock.now = new Date(Date.UTC(2026, 9, 21, 9));
    expect((await playlist()).items.find((i) => i.id === a)?.rest).toBeUndefined();

    // Ещё два раза — «выучено», неделю отдыхает.
    await event('segment_complete', a);
    t.clock.now = new Date(Date.UTC(2026, 9, 22, 9));
    await event('segment_complete', a);
    t.clock.now = new Date(Date.UTC(2026, 9, 24, 9));
    expect((await playlist()).items.find((i) => i.id === a)?.rest).toBe('learned');

    // Родитель выбрал «без ограничений».
    const put = await t.app.inject({
      method: 'PUT',
      url: `/api/parent/children/${child}`,
      cookies: parent,
      payload: { ...girl(), repeatMode: 'free' },
    });
    expect(put.statusCode).toBe(200);
    expect((await playlist()).items.every((i) => !i.rest)).toBe(true);
  });
});

describe('свободный режим (этап 38)', () => {
  it('у пунктов — сколько раз пройдено; в обычном режиме счёта нет', async () => {
    const a = await createSegment(t, parent, { videoId: 'freeaaaaaa1', childIds: [child] });
    const b = await createSegment(t, parent, { videoId: 'freeaaaaaa2', childIds: [child] });
    await event('segment_complete', a);
    await event('segment_complete', a);
    // Открыл и закрыл — не считается.
    await event('segment_start', b);
    expect((await playlist()).items.every((i) => i.plays === undefined)).toBe(true);

    await t.app.inject({
      method: 'PUT',
      url: `/api/parent/children/${child}`,
      cookies: parent,
      payload: { ...girl(), repeatMode: 'free' },
    });
    const items = (await playlist()).items;
    expect(items.find((i) => i.id === a)?.plays).toBe(2);
    expect(items.find((i) => i.id === b)?.plays).toBe(0);
    expect(items.every((i) => !i.rest)).toBe(true);
  });
});
