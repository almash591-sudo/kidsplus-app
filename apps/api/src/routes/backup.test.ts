import { schema } from '@kidsplus/db';
import { BACKUP_STATUS_KEY, type BackupStatus } from '@kidsplus/shared/backup';
import { afterEach, describe, expect, it } from 'vitest';
import { makeApp, setupParent, SETUP_TOKEN, type TestApp } from '../test/helpers';

let t: TestApp;
afterEach(() => t.close());

describe('резервные копии в кабинете', () => {
  it('без ключей Диска — «не настроено», кнопка недоступна', async () => {
    t = await makeApp({ setupToken: SETUP_TOKEN });
    const parent = await setupParent(t);
    const s = await t.app.inject({ url: '/api/parent/backup', cookies: parent });
    expect(s.json<BackupStatus>()).toMatchObject({ configured: false, last: null });
    const now = await t.app.inject({ method: 'POST', url: '/api/parent/backup', cookies: parent });
    expect(now.statusCode).toBe(409);
  });

  it('настроено: статус от worker’а; «сделать сейчас» ставит запрос', async () => {
    t = await makeApp({ setupToken: SETUP_TOKEN });
    const parent = await setupParent(t);
    const last = { at: '2026-10-12T01:00:00.000Z', name: 'kidsplus-x.dump', bytes: 5 };
    await t.db.insert(schema.appSettings).values({
      key: BACKUP_STATUS_KEY,
      value: { configured: true, last, error: null, requestedAt: null, keep: 14 },
    });
    const res = await t.app.inject({ method: 'POST', url: '/api/parent/backup', cookies: parent });
    expect(res.json<BackupStatus>()).toMatchObject({ configured: true, last });
    expect(res.json<BackupStatus>().requestedAt).not.toBeNull();
    expect((await t.app.inject({ url: '/api/parent/backup' })).statusCode).toBe(401);
  });
});
