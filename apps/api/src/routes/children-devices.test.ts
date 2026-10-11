import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createChild,
  girl,
  KID_APP_URL,
  makeApp,
  pairDevice,
  setupParent,
  type TestApp,
} from '../test/helpers';

let t: TestApp;
let parent: Record<string, string>;
beforeEach(async () => {
  t = await makeApp();
  parent = await setupParent(t);
});
afterEach(() => t.close());

describe('профили детей', () => {
  it('без входа — 401', async () => {
    expect((await t.app.inject({ url: '/api/parent/children' })).statusCode).toBe(401);
  });

  it('создание, изменение, список, удаление', async () => {
    const id = await createChild(t, parent);
    const upd = await t.app.inject({
      method: 'PUT',
      url: `/api/parent/children/${id}`,
      cookies: parent,
      payload: girl({ nickname: 'Зайка', languages: ['ru', 'ru', 'zh'] }),
    });
    expect(upd.json()).toMatchObject({ nickname: 'Зайка', languages: ['ru', 'zh'] });

    const list = await t.app.inject({ url: '/api/parent/children', cookies: parent });
    expect(list.json()).toHaveLength(1);

    const del = await t.app.inject({
      method: 'DELETE',
      url: `/api/parent/children/${id}`,
      cookies: parent,
    });
    expect(del.statusCode).toBe(204);
    expect(
      (await t.app.inject({ url: '/api/parent/children', cookies: parent })).json(),
    ).toHaveLength(0);
  });

  it('дата рождения в будущем отклоняется', async () => {
    const res = await t.app.inject({
      method: 'POST',
      url: '/api/parent/children',
      cookies: parent,
      payload: girl({ birthYear: 2026, birthMonth: 12 }),
    });
    expect(res.statusCode).toBe(400);
  });

  it('некорректный id — 404', async () => {
    const res = await t.app.inject({
      method: 'DELETE',
      url: '/api/parent/children/not-a-uuid',
      cookies: parent,
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('привязка устройства', () => {
  it('ссылка для QR ведёт в детское PWA и содержит код', async () => {
    const childId = await createChild(t, parent);
    const res = await t.app.inject({
      method: 'POST',
      url: '/api/parent/pairings',
      cookies: parent,
      payload: { childId, deviceName: 'Телефон младшего' },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json<{ code: string; url: string }>();
    expect(body.code).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    expect(body.url).toBe(`${KID_APP_URL}/pair?code=${body.code.replace('-', '')}`);
  });

  it('код одноразовый; устройство видно родителю', async () => {
    const childId = await createChild(t, parent);
    const created = await t.app.inject({
      method: 'POST',
      url: '/api/parent/pairings',
      cookies: parent,
      payload: { childId, deviceName: 'S20+' },
    });
    const { code } = created.json<{ code: string }>();

    const first = await t.app.inject({
      method: 'POST',
      url: '/api/kid/pair',
      payload: { code: code.toLowerCase() },
    });
    expect(first.statusCode).toBe(204);
    const c = first.cookies.find((x) => x.name === 'kp_device')!;
    expect(c).toMatchObject({ httpOnly: true, secure: true, sameSite: 'Strict' });

    const second = await t.app.inject({ method: 'POST', url: '/api/kid/pair', payload: { code } });
    expect(second.statusCode).toBe(403);

    const devices = await t.app.inject({ url: '/api/parent/devices', cookies: parent });
    expect(devices.json()).toEqual([
      expect.objectContaining({ childId, name: 'S20+', revokedAt: null }),
    ]);
  });

  it('код истекает через 10 минут', async () => {
    const childId = await createChild(t, parent);
    const { code } = (
      await t.app.inject({
        method: 'POST',
        url: '/api/parent/pairings',
        cookies: parent,
        payload: { childId, deviceName: 'x' },
      })
    ).json<{ code: string }>();
    t.advance(11 * 60 * 1000);
    expect(
      (await t.app.inject({ method: 'POST', url: '/api/kid/pair', payload: { code } })).statusCode,
    ).toBe(403);
  });

  it('отозванное устройство теряет доступ', async () => {
    const childId = await createChild(t, parent);
    const device = await pairDevice(t, parent, childId);
    expect((await t.app.inject({ url: '/api/kid/me', cookies: device })).statusCode).toBe(200);

    const [d] = (await t.app.inject({ url: '/api/parent/devices', cookies: parent })).json<
      { id: string }[]
    >();
    await t.app.inject({ method: 'DELETE', url: `/api/parent/devices/${d!.id}`, cookies: parent });

    const after = await t.app.inject({ url: '/api/kid/me', cookies: device });
    expect(after.statusCode).toBe(401);
    expect(after.json()).toMatchObject({ error: 'not_paired' });
  });

  it('удаление ребёнка удаляет и его устройства', async () => {
    const childId = await createChild(t, parent);
    const device = await pairDevice(t, parent, childId);
    await t.app.inject({
      method: 'DELETE',
      url: `/api/parent/children/${childId}`,
      cookies: parent,
    });
    expect((await t.app.inject({ url: '/api/kid/me', cookies: device })).statusCode).toBe(401);
  });

  it('cookie родителя не даёт доступа к детскому API, и наоборот', async () => {
    const childId = await createChild(t, parent);
    const device = await pairDevice(t, parent, childId);
    expect((await t.app.inject({ url: '/api/kid/playlist', cookies: parent })).statusCode).toBe(
      401,
    );
    expect((await t.app.inject({ url: '/api/parent/children', cookies: device })).statusCode).toBe(
      401,
    );
  });
});

describe('голоса синтеза речи на телефоне', () => {
  it('телефон сообщает языки, родитель видит их у устройства', async () => {
    const childId = await createChild(t, parent);
    const device = await pairDevice(t, parent, childId);
    const before = (await t.app.inject({ url: '/api/parent/devices', cookies: parent })).json<
      { speechLangs: string[] | null }[]
    >();
    expect(before[0]!.speechLangs).toBeNull();

    const res = await t.app.inject({
      method: 'POST',
      url: '/api/kid/voices',
      cookies: device,
      payload: { langs: ['en', 'ko', 'en'] },
    });
    expect(res.statusCode).toBe(204);

    const [d] = (await t.app.inject({ url: '/api/parent/devices', cookies: parent })).json<
      { speechLangs: string[]; speechCheckedAt: string }[]
    >();
    expect(d).toMatchObject({ speechLangs: ['en', 'ko'], speechCheckedAt: expect.any(String) });
  });

  it('только коды языков; без привязки — 401', async () => {
    const childId = await createChild(t, parent);
    const device = await pairDevice(t, parent, childId);
    const bad = await t.app.inject({
      method: 'POST',
      url: '/api/kid/voices',
      cookies: device,
      payload: { langs: ['Samsung русский голос'] },
    });
    expect(bad.statusCode).toBe(400);
    const anon = await t.app.inject({
      method: 'POST',
      url: '/api/kid/voices',
      payload: { langs: ['ru'] },
    });
    expect(anon.statusCode).toBe(401);
  });
});
