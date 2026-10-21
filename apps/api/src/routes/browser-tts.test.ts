import { schema } from '@kidsplus/db';
import type { KidPlaylist, MediaRef, Question } from '@kidsplus/shared/api';
import { eq as eqFn } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { backfillTts } from '../services/tts-backfill';
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

// Режим TTS_PROVIDER=browser: озвучивает телефон, сервер аудио не создаёт.
const BROWSER_TTS = { providerId: 'browser', speed: 0.85, voices: {} };
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

let t: TestApp;
let parent: Record<string, string>;
let child: string;
beforeEach(async () => {
  t = await makeApp({ setupToken: SETUP_TOKEN, tts: BROWSER_TTS });
  parent = await setupParent(t);
  child = await createChild(t, parent, girl({ gender: 'f' }));
});
afterEach(() => t.close());

const image = async () =>
  (
    await t.app.inject({
      method: 'POST',
      url: '/api/parent/media/images',
      cookies: parent,
      headers: { 'content-type': 'image/png' },
      payload: PNG,
    })
  ).json<MediaRef>().id;

describe('озвучка в браузере', () => {
  it('сервер не создаёт аудио; вопрос сразу виден ребёнку с текстом для озвучки', async () => {
    const device = await pairDevice(t, parent, child);
    const s = await createSegment(t, parent, { videoId: 'aaaaaaaaaaa', childIds: [child] });
    const q = await t.app.inject({
      method: 'POST',
      url: `/api/parent/segments/${s}/questions`,
      cookies: parent,
      payload: {
        prompt: 'Где кошка?',
        lang: 'ru',
        options: [
          { imageId: await image(), label: 'кошка', isCorrect: true },
          { imageId: await image(), label: 'собака', isCorrect: false },
        ],
      },
    });
    expect(q.json<Question>().audio).toBeNull();
    expect(await t.db.select().from(schema.mediaAssets).where(eqKind('audio'))).toEqual([]);

    const playlist = (
      await t.app.inject({ url: '/api/kid/playlist', cookies: device })
    ).json<KidPlaylist>();
    const item = playlist.items[0]!;
    expect(item.kind === 'segment' && item.questions[0]!.prompt).toEqual({
      text: 'Где кошка?',
      lang: 'ru',
      audioUrl: null,
    });
    expect(playlist.phrases.correct).toContainEqual({
      text: 'Ты справилась!',
      lang: 'ru',
      audioUrl: null,
    });
    expect(playlist.phrases.retry.length).toBeGreaterThan(0);
    // Этап 39: без пояснения — только «Это <подпись верного>.»
    expect(item.kind === 'segment' && item.questions[0]!.answer).toEqual([
      { text: 'Это кошка.', lang: 'ru', audioUrl: null },
    ]);
  });

  it('пояснение (этап 39): сохраняется, отдаётся родителю и звучит ребёнку после ответа', async () => {
    const device = await pairDevice(t, parent, child);
    const s = await createSegment(t, parent, { videoId: 'aaaaaaaaaaa', childIds: [child] });
    const options = [
      { imageId: await image(), label: 'кошка', isCorrect: true },
      { imageId: await image(), label: 'рыба', isCorrect: false },
    ];
    const created = await t.app.inject({
      method: 'POST',
      url: `/api/parent/segments/${s}/questions`,
      cookies: parent,
      payload: {
        prompt: 'Кто говорит «мяу»?',
        lang: 'ru',
        options,
        explanation: ' Кошка мяукает. ',
      },
    });
    const q = created.json<Question>();
    expect(q.explanation).toBe('Кошка мяукает.');
    let playlist = (
      await t.app.inject({ url: '/api/kid/playlist', cookies: device })
    ).json<KidPlaylist>();
    let item = playlist.items[0]!;
    expect(item.kind === 'segment' && item.questions[0]!.answer).toEqual([
      { text: 'Это кошка.', lang: 'ru', audioUrl: null },
      { text: 'Кошка мяукает.', lang: 'ru', audioUrl: null },
    ]);

    // Пустое пояснение — убрано; английский вопрос — без «Это …» (подпись по-русски).
    const updated = await t.app.inject({
      method: 'PUT',
      url: `/api/parent/questions/${q.id}`,
      cookies: parent,
      payload: { prompt: 'Where is the cat?', lang: 'en', options, explanation: '' },
    });
    expect(updated.json<Question>().explanation).toBeNull();
    playlist = (
      await t.app.inject({ url: '/api/kid/playlist', cookies: device })
    ).json<KidPlaylist>();
    item = playlist.items[0]!;
    expect(item.kind === 'segment' && item.questions[0]!.answer).toEqual([]);
  });

  it('карточки: слово на языке набора, перевод — на русском', async () => {
    const device = await pairDevice(t, parent, child);
    const deck = await t.app.inject({
      method: 'POST',
      url: '/api/parent/decks',
      cookies: parent,
      payload: { title: 'Животные', lang: 'zh', childIds: [child] },
    });
    await t.app.inject({
      method: 'POST',
      url: `/api/parent/decks/${deck.json<{ id: string }>().id}/cards`,
      cookies: parent,
      payload: { imageId: await image(), text: '猫', translation: 'кошка' },
    });
    const playlist = (
      await t.app.inject({ url: '/api/kid/playlist', cookies: device })
    ).json<KidPlaylist>();
    const item = playlist.items[0]!;
    expect(item.kind === 'deck' && item.cards[0]).toMatchObject({
      word: { text: '猫', lang: 'zh', audioUrl: null },
      translation: { text: 'кошка', lang: 'ru', audioUrl: null },
    });
  });
});

function eqKind(kind: 'audio' | 'image') {
  return eqFn(schema.mediaAssets.kind, kind);
}

describe('погружение (иностранные карточки без перевода)', () => {
  it('по умолчанию выключено; включается в профиле; плейлист отдаёт английскую похвалу', async () => {
    const device = await pairDevice(t, parent, child);
    let pl = (
      await t.app.inject({ url: '/api/kid/playlist', cookies: device })
    ).json<KidPlaylist>();
    expect(pl.immersion).toBe(false);
    expect(pl.phrasesEn.correct).toContainEqual({ text: 'Great job!', lang: 'en', audioUrl: null });

    const upd = await t.app.inject({
      method: 'PUT',
      url: `/api/parent/children/${child}`,
      cookies: parent,
      payload: girl({ gender: 'f', foreignImmersion: true }),
    });
    expect(upd.json()).toMatchObject({ foreignImmersion: true });
    pl = (await t.app.inject({ url: '/api/kid/playlist', cookies: device })).json<KidPlaylist>();
    expect(pl.immersion).toBe(true);
  });
});

describe('переход на серверную озвучку', () => {
  it('озвучка старых карточек и вопросов ставится в очередь один раз', async () => {
    const deck = await t.app.inject({
      method: 'POST',
      url: '/api/parent/decks',
      cookies: parent,
      payload: { title: 'Животные', lang: 'zh', childIds: [] },
    });
    await t.app.inject({
      method: 'POST',
      url: `/api/parent/decks/${deck.json<{ id: string }>().id}/cards`,
      cookies: parent,
      payload: { imageId: await image(), text: '猫', translation: 'кошка', question: '猫在哪里？' },
    });
    const [before] = await t.db.select().from(schema.flashcards);
    expect(before!.audioId).toBeNull();

    const google = { providerId: 'google', speed: 0.85, voices: { zh: 'cmn-CN-Chirp3-HD-Aoede' } };
    expect(await backfillTts(t.db, google)).toBe(1);
    const [after] = await t.db.select().from(schema.flashcards);
    expect(after!.audioId && after!.translationAudioId && after!.questionAudioId).toBeTruthy();
    const pending = await t.db.select().from(schema.mediaAssets).where(eqKind('audio'));
    expect(pending.map((a) => [a.ttsText, a.ttsLang, a.ttsVoice]).sort()).toEqual(
      [
        ['кошка', 'ru', null],
        ['猫', 'zh', 'cmn-CN-Chirp3-HD-Aoede'],
        ['猫在哪里？', 'zh', 'cmn-CN-Chirp3-HD-Aoede'],
      ].sort(),
    );
    // Повторный запуск ничего не меняет.
    expect(await backfillTts(t.db, google)).toBe(0);
    expect(await backfillTts(t.db, BROWSER_TTS)).toBe(0);
  });
});
