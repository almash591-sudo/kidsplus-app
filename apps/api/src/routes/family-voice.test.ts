import type { Deck, KidPlaylist, MediaRef } from '@kidsplus/shared/api';
import type { FamilyPhrase } from '@kidsplus/shared/family-voice';
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

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
/** Начало WebM (EBML) — так пишет Chrome. */
const WEBM = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(400, 1)]);
/** Голос телефона: записи родителя звучат и без нейроголоса. */
const BROWSER_TTS = { providerId: 'browser', speed: 0.85, voices: {} };

let t: TestApp;
let parent: Record<string, string>;
let child: string;
beforeEach(async () => {
  t = await makeApp({ setupToken: SETUP_TOKEN, tts: BROWSER_TTS });
  parent = await setupParent(t);
  child = await createChild(t, parent, girl({ gender: 'f' }));
});
afterEach(() => t.close());

const upload = async (data: Buffer, type = 'audio/webm') =>
  t.app.inject({
    method: 'POST',
    url: '/api/parent/media/audio',
    cookies: parent,
    headers: { 'content-type': type },
    payload: data,
  });

const playlist = async (device: Record<string, string>) =>
  (await t.app.inject({ url: '/api/kid/playlist', cookies: device })).json<KidPlaylist>();

describe('мамин голос', () => {
  it('записанная похвала звучит вместо нейроголоса, остальные фразы — как были', async () => {
    const device = await pairDevice(t, parent, child);
    const audio = (await upload(WEBM)).json<MediaRef>();
    const add = await t.app.inject({
      method: 'POST',
      url: '/api/parent/family-phrases',
      cookies: parent,
      payload: { kind: 'correct', audioId: audio.id, label: 'Умница, моя хорошая!' },
    });
    expect(add.statusCode).toBe(201);
    expect(add.json<FamilyPhrase[]>()).toMatchObject([
      { kind: 'correct', label: 'Умница, моя хорошая!' },
    ]);

    const p = await playlist(device);
    expect(p.phrases.correct).toEqual([
      { text: 'Умница, моя хорошая!', lang: 'ru', audioUrl: `/api/media/${audio.id}` },
    ]);
    expect(p.phrases.retry.length).toBeGreaterThan(0);
    expect(p.phrases.retry[0]!.audioUrl).toBeNull();

    // Устройство может скачать запись.
    const file = await t.app.inject({ url: `/api/media/${audio.id}`, cookies: device });
    expect(file.statusCode).toBe(200);

    const id = add.json<FamilyPhrase[]>()[0]!.id;
    await t.app.inject({
      method: 'DELETE',
      url: `/api/parent/family-phrases/${id}`,
      cookies: parent,
    });
    expect((await playlist(device)).phrases.correct.some((s) => s.text === 'Молодец!')).toBe(true);
  });

  it('слово карточки своим голосом; новое слово — запись сбрасывается', async () => {
    const device = await pairDevice(t, parent, child);
    const image = (
      await t.app.inject({
        method: 'POST',
        url: '/api/parent/media/images',
        cookies: parent,
        headers: { 'content-type': 'image/png' },
        payload: PNG,
      })
    ).json<MediaRef>().id;
    const deck = (
      await t.app.inject({
        method: 'POST',
        url: '/api/parent/decks',
        cookies: parent,
        payload: { title: 'Животные', lang: 'ru', childIds: [child] },
      })
    ).json<Deck>();
    const withCard = (
      await t.app.inject({
        method: 'POST',
        url: `/api/parent/decks/${deck.id}/cards`,
        cookies: parent,
        payload: { imageId: image, text: 'кошка' },
      })
    ).json<Deck>();
    const card = withCard.cards[0]!;
    const audio = (await upload(WEBM)).json<MediaRef>();

    const set = await t.app.inject({
      method: 'PUT',
      url: `/api/parent/cards/${card.id}/voice`,
      cookies: parent,
      payload: { audioId: audio.id },
    });
    expect(set.json<Deck>().cards[0]!.voice?.id).toBe(audio.id);
    const item = (await playlist(device)).items[0]!;
    expect(item.kind === 'deck' && item.cards[0]!.word).toEqual({
      text: 'кошка',
      lang: 'ru',
      audioUrl: `/api/media/${audio.id}`,
    });

    const renamed = await t.app.inject({
      method: 'PUT',
      url: `/api/parent/cards/${card.id}`,
      cookies: parent,
      payload: { imageId: image, text: 'котёнок' },
    });
    expect(renamed.json<Deck>().cards[0]!.voice).toBeNull();
  });

  it('не аудио, пустое или чужая запись — отказ', async () => {
    expect((await upload(PNG, 'audio/webm')).statusCode).toBe(415);
    const image = (
      await t.app.inject({
        method: 'POST',
        url: '/api/parent/media/images',
        cookies: parent,
        headers: { 'content-type': 'image/png' },
        payload: PNG,
      })
    ).json<MediaRef>().id;
    const bad = await t.app.inject({
      method: 'POST',
      url: '/api/parent/family-phrases',
      cookies: parent,
      payload: { kind: 'correct', audioId: image, label: 'x' },
    });
    expect(bad.statusCode).toBe(404);
    expect((await t.app.inject({ url: '/api/parent/family-phrases' })).statusCode).toBe(401);
  });
});
