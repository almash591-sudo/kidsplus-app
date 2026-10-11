import type { KioskRelease } from '@kidsplus/shared/kiosk-update';
import { afterEach, describe, expect, it } from 'vitest';
import { makeApp, type TestApp } from '../test/helpers';

const TOKEN = 'p'.repeat(40);
let t: TestApp;
afterEach(() => t.close());

const apk = (size = 1000) => {
  const b = Buffer.alloc(size, 7);
  b.set([0x50, 0x4b, 0x03, 0x04]);
  return b;
};
const publish = (code: number, body = apk(), token = TOKEN) =>
  t.app.inject({
    method: 'POST',
    url: '/api/kiosk/releases',
    headers: {
      authorization: `Bearer ${token}`,
      'x-version-code': String(code),
      'content-type': 'application/vnd.android.package-archive',
    },
    payload: body,
  });

describe('обновление киоска без кабеля', () => {
  it('компьютер публикует APK — телефон видит версию и скачивает тот же файл', async () => {
    t = await makeApp({ kioskPublishToken: TOKEN });
    expect((await t.app.inject({ url: '/api/kiosk/latest' })).json()).toEqual({ release: null });

    const res = await publish(26101215);
    expect(res.statusCode).toBe(201);
    const release = res.json<KioskRelease>();
    expect(release).toMatchObject({ versionCode: 26101215, bytes: 1000 });

    const latest = await t.app.inject({ url: '/api/kiosk/latest' });
    expect(latest.json<{ release: KioskRelease }>().release.sha256).toBe(release.sha256);
    const file = await t.app.inject({ url: release.url });
    expect(file.statusCode).toBe(200);
    expect(file.rawPayload.equals(apk())).toBe(true);
  });

  it('без токена, со старой версией или не APK — отказ', async () => {
    t = await makeApp({ kioskPublishToken: TOKEN });
    expect((await publish(5, apk(), 'x'.repeat(40))).statusCode).toBe(401);
    expect((await publish(5, Buffer.from('not a zip'))).statusCode).toBe(415);
    expect((await publish(10)).statusCode).toBe(201);
    expect((await publish(10)).statusCode).toBe(409);
    expect((await publish(9)).statusCode).toBe(409);
    // Прошлая версия удалена, скачать можно только последнюю.
    expect((await publish(11)).statusCode).toBe(201);
    expect((await t.app.inject({ url: '/api/kiosk/apk/10' })).statusCode).toBe(404);
  });

  it('токен не задан — публикация выключена', async () => {
    t = await makeApp({});
    expect((await publish(1)).statusCode).toBe(401);
  });
});
