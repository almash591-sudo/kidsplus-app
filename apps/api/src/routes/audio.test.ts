import type { AudioTrack, KidAudioTrack } from '@kidsplus/shared/audio';
import { afterEach, describe, expect, it } from 'vitest';
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
afterEach(() => t.close());

/** «MP3»: заголовок ID3 и 1000 байт данных. */
const MP3 = new Uint8Array([0x49, 0x44, 0x33, ...Array.from({ length: 997 }, (_, i) => i % 256)]);

async function start() {
  t = await makeApp({ setupToken: SETUP_TOKEN });
  const parent = await setupParent(t);
  const child = await createChild(t, parent, girl());
  const device = await pairDevice(t, parent, child);
  return { parent, device };
}

const upload = (cookies: Record<string, string>, query: string, payload: Uint8Array = MP3) =>
  t.app.inject({
    method: 'POST',
    url: `/api/parent/audio?${query}`,
    cookies,
    headers: { 'content-type': 'audio/mpeg' },
    payload: Buffer.from(payload),
  });

describe('аудиотека', () => {
  it('родитель загружает и слушает; ребёнку — только отмеченные «детям»', async () => {
    const { parent, device } = await start();
    const song = (await upload(parent, 'title=Колыбельная&forKids=1')).json<AudioTrack>();
    const tale = await upload(parent, 'title=Сказка');
    expect(tale.statusCode).toBe(201);
    expect(song).toMatchObject({ title: 'Колыбельная', forKids: true, bytes: 1000 });
    // Настоящая песня — мегабайты: предел больше, чем у записей «Маминого голоса».
    const big = new Uint8Array(8 * 1024 * 1024);
    big.set([0x49, 0x44, 0x33]);
    expect((await upload(parent, 'title=Большая', big)).statusCode).toBe(201);

    const list = await t.app.inject({ url: '/api/parent/audio', cookies: parent });
    expect(
      list
        .json<AudioTrack[]>()
        .map((a) => a.title)
        .sort(),
    ).toEqual(['Большая', 'Колыбельная', 'Сказка']);
    const kid = (await t.app.inject({ url: '/api/kid/audio', cookies: device })).json<
      KidAudioTrack[]
    >();
    expect(kid.map((a) => a.title)).toEqual(['Колыбельная']);

    const file = await t.app.inject({ url: song.url, cookies: device });
    expect(file.statusCode).toBe(200);
    expect(file.headers['content-type']).toBe('audio/mpeg');
    expect(file.rawPayload.byteLength).toBe(1000);
    // Чужой (не «детям») трек телефону не отдаётся.
    const hidden = tale.json<AudioTrack>();
    expect((await t.app.inject({ url: hidden.url, cookies: device })).statusCode).toBe(404);
    expect((await t.app.inject({ url: hidden.url, cookies: parent })).statusCode).toBe(200);
    expect((await t.app.inject({ url: hidden.url })).statusCode).toBe(401);
  });

  it('перемотка: Range отдаёт кусок 206, за пределами — 416', async () => {
    const { parent } = await start();
    const song = (await upload(parent, 'title=Песня')).json<AudioTrack>();
    const part = await t.app.inject({
      url: song.url,
      cookies: parent,
      headers: { range: 'bytes=100-199' },
    });
    expect(part.statusCode).toBe(206);
    expect(part.headers['content-range']).toBe('bytes 100-199/1000');
    expect([...part.rawPayload]).toEqual([...MP3.slice(100, 200)]);
    const bad = await t.app.inject({
      url: song.url,
      cookies: parent,
      headers: { range: 'bytes=5000-' },
    });
    expect(bad.statusCode).toBe(416);
  });

  it('не аудио — 415; переименовать, отметить «детям», удалить', async () => {
    const { parent, device } = await start();
    expect((await upload(parent, 'title=x', new Uint8Array(100).fill(7))).statusCode).toBe(415);
    const song = (await upload(parent, 'title=Песня')).json<AudioTrack>();
    const patched = await t.app.inject({
      method: 'PATCH',
      url: `/api/parent/audio/${song.id}`,
      cookies: parent,
      payload: { title: 'Песенка', forKids: true },
    });
    expect(patched.json<AudioTrack>()).toMatchObject({ title: 'Песенка', forKids: true });
    const del = await t.app.inject({
      method: 'DELETE',
      url: `/api/parent/audio/${song.id}`,
      cookies: parent,
    });
    expect(del.statusCode).toBe(204);
    expect((await t.app.inject({ url: '/api/kid/audio', cookies: device })).json()).toEqual([]);
    expect((await t.app.inject({ url: song.url, cookies: parent })).statusCode).toBe(404);
  });
});
