import type { PushMessage } from '@kidsplus/shared/push';
import type { ChildNow } from '@kidsplus/shared/schedule';
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
let sent: PushMessage[];

beforeEach(async () => {
  sent = [];
  t = await makeApp({
    setupToken: SETUP_TOKEN,
    rateLimit: false,
    push: {
      publicKey: 'BPublicKeyForTests000000000000000',
      sender: {
        send: async (_target, payload) => {
          sent.push(payload as PushMessage);
          return 'ok';
        },
      },
    },
  });
  t.clock.now = new Date('2026-10-14T10:00:00Z');
  parent = await setupParent(t);
  child = await createChild(t, parent, girl({ gender: 'f', nickname: 'Зайка' }));
  device = await pairDevice(t, parent, child);
  await t.app.inject({
    method: 'PUT',
    url: '/api/parent/push/subscription',
    cookies: parent,
    payload: {
      endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
      keys: { p256dh: 'BPx'.padEnd(80, 'x'), auth: 'auth-secret-16' },
      kinds: ['battery'],
    },
  });
});
afterEach(() => t.close());

const report = (level: number, charging = false) =>
  t.app.inject({
    method: 'POST',
    url: '/api/kid/battery',
    cookies: device,
    payload: { level, charging },
  });
const now = async () =>
  (
    await t.app.inject({ url: `/api/parent/children/${child}/now`, cookies: parent })
  ).json<ChildNow>();
const flush = () => new Promise((r) => setTimeout(r, 50));

describe('заряд телефона', () => {
  it('родитель видит последнее показание; без показаний — null', async () => {
    expect((await now()).battery).toBeNull();
    expect((await report(64, true)).statusCode).toBe(204);
    expect((await now()).battery).toEqual({
      level: 64,
      charging: true,
      at: '2026-10-14T10:00:00.000Z',
    });
  });

  it('push на 15 % — один раз за разряд, после зарядки снова', async () => {
    for (const l of [30, 16, 15, 14, 10]) await report(l);
    await flush();
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      kind: 'battery',
      childId: child,
      url: `/routine?child=${child}`,
    });
    expect(sent[0]!.body).toContain('15 %');
    expect(sent[0]!.body).not.toContain('Зайка');

    await report(40, true);
    await report(15);
    await flush();
    expect(sent).toHaveLength(2);
  });

  it('на зарядке при низком заряде push нет; без устройства — 401; неверные данные — 400', async () => {
    await report(5, true);
    await flush();
    expect(sent).toHaveLength(0);
    const anon = await t.app.inject({
      method: 'POST',
      url: '/api/kid/battery',
      payload: { level: 50, charging: false },
    });
    expect(anon.statusCode).toBe(401);
    expect((await report(150)).statusCode).toBe(400);
  });
});
