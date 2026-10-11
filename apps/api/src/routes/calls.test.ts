import type { CallInfo, Contact } from '@kidsplus/shared/calls';
import type { ParentMe } from '@kidsplus/shared/api';
import type { PushMessage } from '@kidsplus/shared/push';
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
let mama: Record<string, string>;
let mamaId: string;
let child: string;
let sister: string;
let kid: Record<string, string>;
let sent: { endpoint: string; payload: PushMessage }[];

beforeEach(async () => {
  sent = [];
  t = await makeApp({
    setupToken: SETUP_TOKEN,
    rateLimit: false,
    push: {
      publicKey: 'BPublicKeyForTests000000000000000',
      sender: {
        send: async (target, payload) => {
          sent.push({ endpoint: target.endpoint, payload: payload as PushMessage });
          return 'ok';
        },
      },
    },
  });
  t.clock.now = new Date('2026-10-14T10:00:00Z');
  mama = await setupParent(t);
  mamaId = (await t.app.inject({ url: '/api/parent/me', cookies: mama })).json<ParentMe>().id;
  child = await createChild(t, mama, girl({ nickname: 'Зайка' }));
  sister = await createChild(t, mama, girl({ nickname: 'Солнышко' }));
  kid = await pairDevice(t, mama, child);
  await t.app.inject({
    method: 'PUT',
    url: '/api/parent/push/subscription',
    cookies: mama,
    payload: {
      endpoint: 'https://fcm.googleapis.com/fcm/send/mama',
      keys: { p256dh: 'BPx'.padEnd(80, 'x'), auth: 'auth-secret-16' },
      kinds: ['call'],
    },
  });
});
afterEach(() => t.close());

const post = (url: string, cookies: Record<string, string>, payload: object = {}) =>
  t.app.inject({ method: 'POST', url, cookies, payload });
const current = async (cookies: Record<string, string>) =>
  (await t.app.inject({ url: '/api/calls/current', cookies })).json<{ call: CallInfo | null }>()
    .call;
const flush = () => new Promise((r) => setTimeout(r, 50));
const state = (call: CallInfo, peer: string) => call.members.find((m) => m.id === peer)?.state;

describe('звонки', () => {
  it('контакты — только семья, без себя; имя родителя', async () => {
    await t.app.inject({
      method: 'PUT',
      url: '/api/parent/me/name',
      cookies: mama,
      payload: { displayName: 'Мама' },
    });
    const list = (await t.app.inject({ url: '/api/calls/contacts', cookies: kid })).json<
      Contact[]
    >();
    expect((await t.app.inject({ url: '/api/calls/me', cookies: kid })).json()).toEqual({
      id: `c:${child}`,
    });
    expect(list).toEqual([
      { id: `p:${mamaId}`, name: 'Мама', kind: 'parent' },
      { id: `c:${sister}`, name: 'Солнышко', kind: 'child' },
    ]);
  });

  it('ребёнок звонит маме: push, ответ, сигналы, конец разговора, журнал', async () => {
    const start = await post('/api/calls', kid, { to: [`p:${mamaId}`], video: true });
    expect(start.statusCode).toBe(201);
    const call = start.json<CallInfo>();
    expect(call.status).toBe('ringing');
    await flush();
    expect(sent).toHaveLength(1);
    expect(sent[0]!.payload).toMatchObject({
      kind: 'call',
      childId: child,
      url: `/call/${call.id}`,
    });
    expect(sent[0]!.payload.body).not.toContain('Зайка');

    expect((await current(mama))?.id).toBe(call.id);
    // До ответа сигналы не пересылаются.
    const early = await post(`/api/calls/${call.id}/signal`, kid, {
      to: `p:${mamaId}`,
      type: 'offer',
      data: { sdp: 'x' },
    });
    expect(early.statusCode).toBe(409);

    const answered = (await post(`/api/calls/${call.id}/answer`, mama)).json<CallInfo>();
    expect(answered.status).toBe('active');
    const signal = await post(`/api/calls/${call.id}/signal`, kid, {
      to: `p:${mamaId}`,
      type: 'offer',
      data: { sdp: 'x' },
    });
    expect(signal.statusCode).toBe(204);

    t.advance(65_000);
    const ended = (await post(`/api/calls/${call.id}/hangup`, mama)).json<CallInfo>();
    expect(ended.status).toBe('ended');
    expect(await current(kid)).toBeNull();

    const log = (await t.app.inject({ url: '/api/parent/calls', cookies: mama })).json<
      { seconds: number; from: string }[]
    >();
    expect(log[0]).toMatchObject({ from: 'Зайка', seconds: 65 });
  });

  it('никто не ответил за 45 с — пропущен; отказ — звонок закончен', async () => {
    const call = (
      await post('/api/calls', mama, { to: [`c:${child}`], video: false })
    ).json<CallInfo>();
    // Киоск, ожидающий звонка, получает его сразу.
    const wait = await t.app.inject({ url: '/api/kid/calls/wait', cookies: kid });
    expect(wait.json()).toEqual({ callId: call.id, wake: true });
    t.advance(46_000);
    expect(await current(kid)).toBeNull();

    const again = (
      await post('/api/calls', mama, { to: [`c:${child}`], video: false })
    ).json<CallInfo>();
    const declined = (await post(`/api/calls/${again.id}/decline`, kid)).json<CallInfo>();
    expect(declined.status).toBe('ended');
    expect(state(declined, `c:${child}`)).toBe('declined');
  });

  it('семьёй: звонит всем, разговор идёт, пока остаются двое', async () => {
    const call = (
      await post('/api/calls', kid, { to: [`p:${mamaId}`, `c:${sister}`], video: true })
    ).json<CallInfo>();
    expect(call.members).toHaveLength(3);
    await post(`/api/calls/${call.id}/answer`, mama);
    const left = (await post(`/api/calls/${call.id}/hangup`, kid)).json<CallInfo>();
    // Мама одна, сестра ещё не ответила — звонок звонит дальше.
    expect(left.status).toBe('ringing');
    const end = (await post(`/api/calls/${call.id}/hangup`, mama)).json<CallInfo>();
    expect(end.status).toBe('ended');
    expect(state(end, `c:${sister}`)).toBe('missed');
  });

  it('чужим не позвонить; без входа — 401', async () => {
    const res = await post('/api/calls', kid, {
      to: ['p:00000000-0000-4000-8000-000000000000'],
      video: true,
    });
    expect(res.statusCode).toBe(400);
    expect((await post('/api/calls', kid, { to: [`c:${child}`], video: true })).statusCode).toBe(
      400,
    );
    expect((await post('/api/calls', {}, { to: [`p:${mamaId}`], video: true })).statusCode).toBe(
      401,
    );
  });
});

describe('радионяня', () => {
  const monitor = (body?: object) =>
    body
      ? t.app.inject({
          method: 'PUT',
          url: `/api/parent/children/${child}/monitor`,
          cookies: mama,
          payload: body,
        })
      : t.app.inject({ url: `/api/parent/children/${child}/monitor`, cookies: mama });

  it('включение и чувствительность; телефон видит режим', async () => {
    expect((await monitor()).json()).toMatchObject({
      on: false,
      sensitivity: 'medium',
      listening: null,
    });
    expect((await monitor({ on: true, sensitivity: 'high' })).json()).toMatchObject({
      on: true,
      sensitivity: 'high',
    });
    expect((await t.app.inject({ url: '/api/kid/monitor', cookies: kid })).json()).toEqual({
      on: true,
      sensitivity: 'high',
    });
  });

  it('шум: push родителю, но не чаще раза в 5 минут; выключено — 409', async () => {
    await t.app.inject({
      method: 'PUT',
      url: '/api/parent/push/subscription',
      cookies: mama,
      payload: {
        endpoint: 'https://fcm.googleapis.com/fcm/send/mama',
        keys: { p256dh: 'BPx'.padEnd(80, 'x'), auth: 'auth-secret-16' },
        kinds: ['noise'],
      },
    });
    const noise = () => post('/api/kid/monitor/noise', kid, { db: -20 });
    expect((await noise()).statusCode).toBe(409);
    await monitor({ on: true });
    expect((await noise()).statusCode).toBe(204);
    t.advance(60_000);
    await noise();
    await flush();
    expect(sent.filter((x) => x.payload.kind === 'noise')).toHaveLength(1);
    expect(sent.find((x) => x.payload.kind === 'noise')!.payload).toMatchObject({ childId: child });
    t.advance(5 * 60_000);
    await noise();
    await flush();
    expect(sent.filter((x) => x.payload.kind === 'noise')).toHaveLength(2);
    expect((await monitor()).json().lastNoiseAt).not.toBeNull();
  });

  it('«слушать»: сразу разговор без звонка у ребёнка; выключили — прослушка закончилась', async () => {
    const res = await post(`/api/parent/children/${child}/monitor/listen`, mama);
    expect(res.statusCode).toBe(201);
    const call = res.json<CallInfo>();
    expect(call).toMatchObject({ monitor: true, video: false, status: 'active' });
    expect(state(call, `c:${child}`)).toBe('joined');
    expect((await monitor()).json()).toMatchObject({ on: true, listening: call.id });
    // Ребёнку не звонит: киоск не будят звонком.
    expect((await current(kid))?.monitor).toBe(true);

    await monitor({ on: false });
    expect(await current(mama)).toBeNull();
    expect((await monitor()).json()).toMatchObject({ on: false, listening: null });
  });

  it('включили радионяню — ожидающий киоск будят', async () => {
    const waiting = t.app.inject({ url: '/api/kid/calls/wait', cookies: kid });
    await new Promise((r) => setTimeout(r, 100));
    await monitor({ on: true });
    expect((await waiting).json()).toEqual({ callId: null, wake: true });
  });
});
