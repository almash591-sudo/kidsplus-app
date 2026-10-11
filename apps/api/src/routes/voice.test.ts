import { schema } from '@kidsplus/db';
import type { VoiceInfo, VoicePreview } from '@kidsplus/shared/voice';
import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';
import { makeApp, setupParent, SETUP_TOKEN, TEST_TTS, type TestApp } from '../test/helpers';

let t: TestApp;
afterEach(() => t.close());

/** Своя копия настроек: маршрут меняет их на месте. */
const start = async (providerId = TEST_TTS.providerId) => {
  t = await makeApp({ setupToken: SETUP_TOKEN, tts: { providerId, speed: 0.85, voices: {} } });
  return setupParent(t);
};

describe('голос озвучки', () => {
  it('по умолчанию Aoede; выбор сохраняется и сразу действует на новую озвучку', async () => {
    const parent = await start();
    const get = async () =>
      (await t.app.inject({ url: '/api/parent/voice', cookies: parent })).json<VoiceInfo>();
    expect(await get()).toMatchObject({ serverVoice: true, voice: 'Aoede', speed: 0.85 });

    const put = await t.app.inject({
      method: 'PUT',
      url: '/api/parent/voice',
      cookies: parent,
      payload: { voice: 'Kore', speed: 1 },
    });
    expect(put.statusCode).toBe(200);
    expect(await get()).toMatchObject({ voice: 'Kore', speed: 1 });
    const [row] = await t.db
      .select()
      .from(schema.appSettings)
      .where(eq(schema.appSettings.key, 'tts'));
    expect(row!.value).toEqual({ voice: 'Kore', speed: 1 });
  });

  it('прослушивание: фраза ставится в очередь выбранным голосом, текущий не меняется', async () => {
    const parent = await start();
    const res = await t.app.inject({
      method: 'POST',
      url: '/api/parent/voice/preview',
      cookies: parent,
      payload: { voice: 'Leda', speed: 0.95, text: 'Молодец, здор+ово!' },
    });
    const p = res.json<VoicePreview>();
    expect(p).toMatchObject({ status: 'pending', url: null });
    const [asset] = await t.db
      .select()
      .from(schema.mediaAssets)
      .where(eq(schema.mediaAssets.id, p.id));
    expect(asset).toMatchObject({
      ttsVoice: 'ru-RU-Chirp3-HD-Leda',
      ttsSpeed: 0.95,
      ttsText: 'Молодец, здор+ово!',
    });

    await t.db
      .update(schema.mediaAssets)
      .set({ status: 'ready', storageKey: 'x' })
      .where(eq(schema.mediaAssets.id, p.id));
    const again = await t.app.inject({ url: `/api/parent/voice/preview/${p.id}`, cookies: parent });
    expect(again.json<VoicePreview>()).toMatchObject({
      status: 'ready',
      url: `/api/media/${p.id}`,
    });

    const info = await t.app.inject({ url: '/api/parent/voice', cookies: parent });
    expect(info.json<VoiceInfo>().voice).toBe('Aoede');
  });

  it('чужой голос и пустая фраза — 400; без входа — 401', async () => {
    const parent = await start();
    const bad = await t.app.inject({
      method: 'PUT',
      url: '/api/parent/voice',
      cookies: parent,
      payload: { voice: 'Charon', speed: 1 },
    });
    expect(bad.statusCode).toBe(400);
    const empty = await t.app.inject({
      method: 'POST',
      url: '/api/parent/voice/preview',
      cookies: parent,
      payload: { voice: 'Kore', speed: 1, text: '  ' },
    });
    expect(empty.statusCode).toBe(400);
    expect((await t.app.inject({ url: '/api/parent/voice' })).statusCode).toBe(401);
  });

  it('голос телефона (browser): выбора нет', async () => {
    const parent = await start('browser');
    const info = await t.app.inject({ url: '/api/parent/voice', cookies: parent });
    expect(info.json<VoiceInfo>().serverVoice).toBe(false);
    const put = await t.app.inject({
      method: 'PUT',
      url: '/api/parent/voice',
      cookies: parent,
      payload: { voice: 'Kore', speed: 1 },
    });
    expect(put.statusCode).toBe(409);
  });
});
