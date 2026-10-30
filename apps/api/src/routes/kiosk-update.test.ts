import type { KioskRelease, KioskSetupInfo } from '@kidsplus/shared/kiosk-update';
import { afterEach, describe, expect, it } from 'vitest';
import { KID_APP_URL, makeApp, SETUP_TOKEN, setupParent, type TestApp } from '../test/helpers';

const TOKEN = 'p'.repeat(40);
let t: TestApp;
afterEach(() => t.close());

const apk = (size = 1000) => {
  const b = Buffer.alloc(size, 7);
  b.set([0x50, 0x4b, 0x03, 0x04]);
  return b;
};
const publish = (code: number, body = apk(), token = TOKEN, extra: Record<string, string> = {}) =>
  t.app.inject({
    method: 'POST',
    url: '/api/kiosk/releases',
    headers: {
      authorization: `Bearer ${token}`,
      'x-version-code': String(code),
      'content-type': 'application/vnd.android.package-archive',
      ...extra,
    },
    payload: body,
  });
const CHECKSUM = 'Ab0_-'.repeat(8) + 'xyz';
const MIRROR = 'https://github.com/demo/kidsplus-app/releases/download/kiosk-12/kidsplus-kiosk.apk';

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

  it('QR-код настройки (этап 53): отпечаток подписи, копия на GitHub, постоянный адрес', async () => {
    t = await makeApp({ setupToken: SETUP_TOKEN, kioskPublishToken: TOKEN });
    const cookies = await setupParent(t);
    const setup = async () =>
      (await t.app.inject({ url: '/api/parent/kiosk/setup', cookies })).json<KioskSetupInfo>();
    expect((await t.app.inject({ url: '/api/parent/kiosk/setup' })).statusCode).toBe(401);
    expect((await t.app.inject({ url: '/api/kiosk/apk/latest' })).statusCode).toBe(404);

    // Версия без отпечатка подписи — Android её по QR-коду не поставит.
    expect((await publish(10)).statusCode).toBe(201);
    expect(await setup()).toEqual({ release: null });

    const bad = (h: Record<string, string>) => publish(11, apk(), TOKEN, h);
    expect((await bad({ 'x-signature-checksum': 'deadbeef' })).statusCode).toBe(400);
    expect((await bad({ 'x-mirror-url': 'https://evil.test/kiosk.apk' })).statusCode).toBe(400);

    expect((await publish(11, apk(), TOKEN, { 'x-signature-checksum': CHECKSUM })).statusCode).toBe(
      201,
    );
    expect((await setup()).release).toEqual({
      versionCode: 11,
      bytes: 1000,
      apkUrl: `${KID_APP_URL}/api/kiosk/apk/latest`,
      signatureChecksum: CHECKSUM,
      mirrored: false,
    });
    const file = await t.app.inject({ url: '/api/kiosk/apk/latest' });
    expect(file.statusCode).toBe(200);
    expect(file.headers['cache-control']).toBe('no-cache');
    expect(file.rawPayload.equals(apk())).toBe(true);

    // Копия на GitHub открывается в России без VPN — её и ставим в QR-код.
    expect((await publish(12, apk(), TOKEN, { 'x-mirror-url': MIRROR })).statusCode).toBe(201);
    expect((await setup()).release).toMatchObject({
      versionCode: 12,
      apkUrl: MIRROR,
      signatureChecksum: CHECKSUM,
      mirrored: true,
    });
    // Следующая версия без копии: прошлая копия и отпечаток остаются.
    expect((await publish(13)).statusCode).toBe(201);
    expect((await setup()).release).toMatchObject({ versionCode: 13, apkUrl: MIRROR });
  });

  it('токен не задан — публикация выключена', async () => {
    t = await makeApp({});
    expect((await publish(1)).statusCode).toBe(401);
  });
});
