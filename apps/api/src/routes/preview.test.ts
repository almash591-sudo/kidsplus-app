import { schema } from '@kidsplus/db';
import type { Device, KidPlaylist, PairingCreated } from '@kidsplus/shared/api';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  cookieFrom,
  createChild,
  girl,
  makeApp,
  setupParent,
  SETUP_TOKEN,
  type TestApp,
} from '../test/helpers';

let t: TestApp;
let parent: Record<string, string>;
let child: string;
beforeEach(async () => {
  t = await makeApp({ setupToken: SETUP_TOKEN });
  parent = await setupParent(t);
  child = await createChild(t, parent, girl());
});
afterEach(() => t.close());

const openPreview = async () => {
  const created = await t.app.inject({
    method: 'POST',
    url: `/api/parent/children/${child}/preview`,
    cookies: parent,
  });
  expect(created.statusCode).toBe(201);
  const { code, url } = created.json<PairingCreated>();
  expect(url).toContain('/pair?code=');
  const res = await t.app.inject({ method: 'POST', url: '/api/kid/pair', payload: { code } });
  return { kp_device: cookieFrom(res, 'kp_device') };
};

describe('глазами ребёнка', () => {
  it('ссылка открывает приложение этого ребёнка с пометкой «просмотр»; в «Устройствах» её нет', async () => {
    const view = await openPreview();
    const playlist = await t.app.inject({ url: '/api/kid/playlist', cookies: view });
    expect(playlist.statusCode).toBe(200);
    expect(playlist.json<KidPlaylist>().preview).toBe(true);
    const list = await t.app.inject({ url: '/api/parent/devices', cookies: parent });
    expect(list.json<Device[]>()).toEqual([]);
  });

  it('ничего не записывается: события, время занятий, заряд, снимки', async () => {
    const view = await openPreview();
    const ev = await t.app.inject({
      method: 'POST',
      url: '/api/kid/events',
      cookies: view,
      payload: { type: 'deck_complete', payload: {} },
    });
    expect(ev.statusCode).toBe(204);
    expect(await t.db.select().from(schema.events)).toEqual([]);

    const beat = await t.app.inject({
      method: 'POST',
      url: '/api/kid/heartbeat',
      cookies: view,
      payload: { activity: 'free', active: true, item: null },
    });
    expect(beat.statusCode).toBe(200);
    expect(await t.db.select().from(schema.dayUsage)).toEqual([]);

    const battery = await t.app.inject({
      method: 'POST',
      url: '/api/kid/battery',
      cookies: view,
      payload: { level: 10, charging: false },
    });
    expect(battery.statusCode).toBe(204);

    // Перерыв для глаз (этап 50) у ребёнка не начинается из-за просмотра.
    await t.db.update(schema.children).set({ eyeBreakEvery: 15 });
    const pause = await t.app.inject({
      method: 'POST',
      url: '/api/kid/eye-break',
      cookies: view,
      payload: { action: 'start' },
    });
    expect(pause.statusCode).toBe(200);
    const [row] = await t.db.select().from(schema.children);
    expect(row!.eyeBreakAt).toBeNull();
  });

  it('через 2 часа доступ закрывается сам', async () => {
    const view = await openPreview();
    t.advance(2 * 3600_000 + 1000);
    const res = await t.app.inject({ url: '/api/kid/playlist', cookies: view });
    expect(res.statusCode).toBe(401);
  });

  it('только родитель может открыть просмотр', async () => {
    const res = await t.app.inject({
      method: 'POST',
      url: `/api/parent/children/${child}/preview`,
    });
    expect(res.statusCode).toBe(401);
  });
});
