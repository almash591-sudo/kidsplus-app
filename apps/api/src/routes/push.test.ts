import { schema } from '@kidsplus/db';
import type { PushMessage } from '@kidsplus/shared/push';
import { DEFAULT_SCHEDULE } from '@kidsplus/shared/schedule';
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
/** Подставной сервис доставки: что и куда «отправлено». */
let sent: { endpoint: string; payload: PushMessage }[];
let gone: Set<string>;

const SUB = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
  keys: { p256dh: 'BPx'.padEnd(80, 'x'), auth: 'auth-secret-16' },
  kinds: ['day_done', 'video'],
};

beforeEach(async () => {
  sent = [];
  gone = new Set();
  t = await makeApp({
    setupToken: SETUP_TOKEN,
    rateLimit: false,
    push: {
      publicKey: 'BPublicKeyForTests000000000000000',
      sender: {
        send: async (target, payload) => {
          if (gone.has(target.endpoint)) return 'gone';
          sent.push({ endpoint: target.endpoint, payload: payload as PushMessage });
          return 'ok';
        },
      },
    },
  });
  t.clock.now = new Date('2026-10-14T10:00:00Z');
  parent = await setupParent(t);
  child = await createChild(t, parent, girl({ gender: 'f', nickname: 'Зайка' }));
});
afterEach(() => t.close());

const subscribe = (body: object = SUB) =>
  t.app.inject({
    method: 'PUT',
    url: '/api/parent/push/subscription',
    cookies: parent,
    payload: body,
  });

/** Дождаться фоновой отправки (уведомления не задерживают ответ ребёнку). */
const flush = () => new Promise((r) => setTimeout(r, 50));

describe('push-уведомления', () => {
  it('подписка: ключ, сохранение, какие виды включены, отписка', async () => {
    const key = await t.app.inject({ url: '/api/parent/push', cookies: parent });
    expect(key.json()).toEqual({ publicKey: 'BPublicKeyForTests000000000000000' });
    expect((await subscribe()).statusCode).toBe(200);
    const status = await t.app.inject({
      method: 'POST',
      url: '/api/parent/push/status',
      cookies: parent,
      payload: { endpoint: SUB.endpoint },
    });
    expect(status.json()).toEqual({ kinds: ['day_done', 'video'] });
    await t.app.inject({
      method: 'POST',
      url: '/api/parent/push/unsubscribe',
      cookies: parent,
      payload: { endpoint: SUB.endpoint },
    });
    expect((await t.db.select().from(schema.pushSubscriptions)).length).toBe(0);
  });

  it('проверочное уведомление; недействительная подписка удаляется', async () => {
    await subscribe();
    const res = await t.app.inject({
      method: 'POST',
      url: '/api/parent/push/test',
      cookies: parent,
    });
    expect(res.json()).toEqual({ sent: 1 });
    gone.add(SUB.endpoint);
    await t.app.inject({ method: 'POST', url: '/api/parent/push/test', cookies: parent });
    expect((await t.db.select().from(schema.pushSubscriptions)).length).toBe(0);
  });

  it('«занятия закончены» — один раз в день, без имени ребёнка в тексте', async () => {
    await subscribe();
    const device = await pairDevice(t, parent, child);
    await t.app.inject({
      method: 'PUT',
      url: `/api/parent/children/${child}/schedule`,
      cookies: parent,
      payload: { ...DEFAULT_SCHEDULE, enabled: true, freeMinutes: 0 },
    });
    // Предметов нет — сразу «на сегодня всё».
    for (let i = 0; i < 3; i++) {
      await t.app.inject({
        method: 'POST',
        url: '/api/kid/heartbeat',
        cookies: device,
        payload: { activity: null, active: true },
      });
      t.advance(15_000);
    }
    await flush();
    const done = sent.filter((s) => s.payload.kind === 'day_done');
    expect(done).toHaveLength(1);
    expect(done[0]!.payload).toMatchObject({ childId: child, url: `/remote?child=${child}` });
    expect(JSON.stringify(done[0]!.payload)).not.toContain('Зайка');
  });

  it('«видео недоступно» — когда у ребёнка видео перестало открываться', async () => {
    await subscribe();
    const device = await pairDevice(t, parent, child);
    const segmentId = await createSegment(t, parent, { videoId: 'abcdefghijk', childIds: [child] });
    for (let i = 0; i < 2; i++)
      await t.app.inject({
        method: 'POST',
        url: '/api/kid/events',
        cookies: device,
        payload: { type: 'segment_error', segmentId, payload: { code: 150 } },
      });
    await flush();
    expect(sent.filter((s) => s.payload.kind === 'video')).toHaveLength(1);
  });

  it('виды, которые родитель выключил, не приходят', async () => {
    await subscribe({ ...SUB, kinds: ['weekly'] });
    const device = await pairDevice(t, parent, child);
    const segmentId = await createSegment(t, parent, { videoId: 'abcdefghijk', childIds: [child] });
    await t.app.inject({
      method: 'POST',
      url: '/api/kid/events',
      cookies: device,
      payload: { type: 'segment_error', segmentId, payload: { code: 150 } },
    });
    await flush();
    expect(sent).toEqual([]);
  });
});
