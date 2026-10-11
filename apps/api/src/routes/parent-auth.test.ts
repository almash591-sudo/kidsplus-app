import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cookieFrom, makeApp, setupParent, SETUP_TOKEN, type TestApp } from '../test/helpers';

let t: TestApp;
beforeEach(async () => {
  t = await makeApp();
});
afterEach(() => t.close());

const post = (url: string, payload: unknown, cookies?: Record<string, string>) =>
  t.app.inject({
    method: 'POST',
    url,
    payload: payload as object,
    ...(cookies ? { cookies } : {}),
  });

describe('первичная настройка', () => {
  it('доступна, пока нет ни одного родителя', async () => {
    expect((await t.app.inject({ url: '/api/parent/setup' })).json()).toEqual({ available: true });
    await setupParent(t);
    expect((await t.app.inject({ url: '/api/parent/setup' })).json()).toEqual({ available: false });
  });

  it('неверный токен — 403', async () => {
    const res = await post('/api/parent/setup', {
      token: 'wrong',
      email: 'a@b.cd',
      password: '0123456789',
    });
    expect(res.statusCode).toBe(403);
  });

  it('второй раз создать аккаунт нельзя', async () => {
    await setupParent(t);
    const res = await post('/api/parent/setup', {
      token: SETUP_TOKEN,
      email: 'x@y.zz',
      password: '0123456789',
    });
    expect(res.statusCode).toBe(409);
  });

  it('без SETUP_TOKEN отключена', async () => {
    const t2 = await makeApp({ setupToken: undefined });
    const res = await t2.app.inject({
      method: 'POST',
      url: '/api/parent/setup',
      payload: { token: 'anything', email: 'a@b.cd', password: '0123456789' },
    });
    expect(res.statusCode).toBe(404);
    await t2.close();
  });

  it('короткий пароль отклоняется', async () => {
    const res = await post('/api/parent/setup', {
      token: SETUP_TOKEN,
      email: 'a@b.cd',
      password: 'short',
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toMatch(/минимум 10/);
  });
});

describe('вход и сессия', () => {
  it('cookie сессии: httpOnly, Secure, SameSite=Strict, только /api', async () => {
    const res = await post('/api/parent/setup', {
      token: SETUP_TOKEN,
      email: 'a@b.cd',
      password: '0123456789',
    });
    const c = res.cookies.find((x) => x.name === 'kp_session')!;
    expect(c).toMatchObject({ httpOnly: true, secure: true, sameSite: 'Strict', path: '/api' });
  });

  it('вход, /me и выход', async () => {
    await setupParent(t, 'Mama@Example.com');
    const login = await post('/api/parent/login', {
      email: 'mama@example.com',
      password: 'correct horse battery',
    });
    expect(login.statusCode).toBe(200);
    const cookies = { kp_session: cookieFrom(login, 'kp_session') };

    const me = await t.app.inject({ url: '/api/parent/me', cookies });
    expect(me.json()).toMatchObject({ email: 'mama@example.com' });

    await post('/api/parent/logout', {}, cookies);
    expect((await t.app.inject({ url: '/api/parent/me', cookies })).statusCode).toBe(401);
  });

  it('неверный пароль и неизвестный email — одинаковый ответ 401', async () => {
    await setupParent(t);
    const wrongPass = await post('/api/parent/login', {
      email: 'mama@example.com',
      password: 'nope',
    });
    const noUser = await post('/api/parent/login', {
      email: 'nobody@example.com',
      password: 'nope',
    });
    expect(wrongPass.statusCode).toBe(401);
    expect(noUser.statusCode).toBe(401);
    expect(wrongPass.json()).toEqual(noUser.json());
  });

  it('сессия истекает через 30 дней', async () => {
    const cookies = await setupParent(t);
    t.advance(31 * 24 * 3600 * 1000);
    expect((await t.app.inject({ url: '/api/parent/me', cookies })).statusCode).toBe(401);
  });

  it('частые попытки входа ограничиваются (429)', async () => {
    let last = 0;
    for (let i = 0; i < 11; i++) {
      last = (await post('/api/parent/login', { email: 'a@b.cd', password: 'x' })).statusCode;
    }
    expect(last).toBe(429);
  });
});

describe('приглашение второго родителя', () => {
  it('одноразовое; третий аккаунт создать нельзя', async () => {
    const cookies = await setupParent(t);
    const invite = await post('/api/parent/invites', {}, cookies);
    expect(invite.statusCode).toBe(200);
    const { token } = invite.json<{ token: string }>();

    const accept = await post('/api/parent/invites/accept', {
      token,
      email: 'papa@example.com',
      password: '0123456789',
    });
    expect(accept.statusCode).toBe(200);
    expect(accept.cookies.some((c) => c.name === 'kp_session')).toBe(true);

    const again = await post('/api/parent/invites/accept', {
      token,
      email: 'x@example.com',
      password: '0123456789',
    });
    expect(again.statusCode).toBe(409); // лимит родителей достигнут раньше проверки токена

    expect((await post('/api/parent/invites', {}, cookies)).statusCode).toBe(409);
  });

  it('истёкшее приглашение не принимается', async () => {
    const cookies = await setupParent(t);
    const { token } = (await post('/api/parent/invites', {}, cookies)).json<{ token: string }>();
    t.advance(25 * 3600 * 1000);
    const res = await post('/api/parent/invites/accept', {
      token,
      email: 'papa@example.com',
      password: '0123456789',
    });
    expect(res.statusCode).toBe(403);
  });

  it('занятый email не «сжигает» приглашение', async () => {
    const cookies = await setupParent(t);
    const { token } = (await post('/api/parent/invites', {}, cookies)).json<{ token: string }>();
    const taken = await post('/api/parent/invites/accept', {
      token,
      email: 'mama@example.com',
      password: '0123456789',
    });
    expect(taken.statusCode).toBe(409);
    const ok = await post('/api/parent/invites/accept', {
      token,
      email: 'papa@example.com',
      password: '0123456789',
    });
    expect(ok.statusCode).toBe(200);
  });

  it('создать приглашение без входа нельзя', async () => {
    expect((await post('/api/parent/invites', {})).statusCode).toBe(401);
  });
});
