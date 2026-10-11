import { schema } from '@kidsplus/db';
import type { Deck, KidPlaylist, MediaRef, Question } from '@kidsplus/shared/api';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createChild,
  createSegment,
  girl,
  makeApp,
  pairDevice,
  setupParent,
  type TestApp,
} from '../test/helpers';

const { mediaAssets } = schema;

// Минимальные «картинки» с правильными сигнатурами.
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const SVG_AS_IMAGE = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
);

let t: TestApp;
let parent: Record<string, string>;
let child: string;
beforeEach(async () => {
  t = await makeApp();
  parent = await setupParent(t);
  child = await createChild(t, parent, girl({ birthYear: 2024, birthMonth: 3 }));
});
afterEach(() => t.close());

async function upload(body: Buffer = PNG, contentType = 'image/png') {
  return t.app.inject({
    method: 'POST',
    url: '/api/parent/media/images',
    cookies: parent,
    headers: { 'content-type': contentType },
    payload: body,
  });
}

async function image(): Promise<string> {
  return (await upload()).json<MediaRef>().id;
}

/** То, что делает worker: «генерирует» всю ожидающую озвучку. */
async function renderPendingAudio() {
  const pending = await t.db.select().from(mediaAssets).where(eq(mediaAssets.status, 'pending'));
  for (const a of pending) {
    const key = `tts/${a.ttsKey}.mp3`;
    await t.storage.put(key, new Uint8Array([0x49, 0x44, 0x33]), 'audio/mpeg');
    await t.db
      .update(mediaAssets)
      .set({ status: 'ready', storageKey: key, mimeType: 'audio/mpeg' })
      .where(eq(mediaAssets.id, a.id));
  }
  return pending.length;
}

async function addQuestion(segmentId: string, prompt = 'Где кошка?') {
  const [cat, dog] = [await image(), await image()];
  const res = await t.app.inject({
    method: 'POST',
    url: `/api/parent/segments/${segmentId}/questions`,
    cookies: parent,
    payload: {
      prompt,
      lang: 'ru',
      options: [
        { imageId: cat, label: 'кошка', isCorrect: true },
        { imageId: dog, label: 'собака', isCorrect: false },
      ],
    },
  });
  expect(res.statusCode).toBe(201);
  return res.json<Question>();
}

const playlist = async (device: Record<string, string>) =>
  (await t.app.inject({ url: '/api/kid/playlist', cookies: device })).json<KidPlaylist>();

describe('картинки', () => {
  it('принимает PNG и отдаёт его родителю и устройству', async () => {
    const res = await upload();
    expect(res.statusCode).toBe(201);
    const ref = res.json<MediaRef>();
    expect(ref).toMatchObject({ status: 'ready', url: `/api/media/${ref.id}` });

    const asParent = await t.app.inject({ url: ref.url, cookies: parent });
    expect(asParent.statusCode).toBe(200);
    expect(asParent.headers['content-type']).toBe('image/png');
    expect(asParent.headers['x-content-type-options']).toBe('nosniff');
    expect(asParent.headers['content-security-policy']).toContain('sandbox');

    const device = await pairDevice(t, parent, child);
    expect((await t.app.inject({ url: ref.url, cookies: device })).statusCode).toBe(200);
    expect((await t.app.inject({ url: ref.url })).statusCode).toBe(401);
  });

  it('тип определяется по содержимому: SVG под видом PNG отклоняется', async () => {
    const res = await upload(SVG_AS_IMAGE, 'image/png');
    expect(res.statusCode).toBe(415);
  });

  it('SVG как тип не принимается вовсе', async () => {
    expect((await upload(SVG_AS_IMAGE, 'image/svg+xml')).statusCode).toBe(415);
  });
});

describe('эмодзи', () => {
  it('ищутся по-русски и сохраняются один раз', async () => {
    const found = await t.app.inject({ url: '/api/parent/emoji?q=кошк', cookies: parent });
    const list = found.json<{ code: string; label: string }[]>();
    expect(list.length).toBeGreaterThan(0);
    const cat = list.find((e) => e.code === '1f431')!;
    expect(cat.label).toMatch(/кошк/);

    const pick = () =>
      t.app.inject({
        method: 'POST',
        url: '/api/parent/media/emoji',
        cookies: parent,
        payload: { code: '1f431' },
      });
    const a = (await pick()).json<MediaRef>();
    const b = (await pick()).json<MediaRef>();
    expect(a.id).toBe(b.id);

    const svg = await t.app.inject({ url: a.url, cookies: parent });
    expect(svg.headers['content-type']).toBe('image/svg+xml');
    const [asset] = await t.db.select().from(mediaAssets).where(eq(mediaAssets.id, a.id));
    expect(asset).toMatchObject({ license: 'CC-BY-4.0', source: 'twemoji' });
  });

  it('неизвестный код — 404', async () => {
    const res = await t.app.inject({
      method: 'POST',
      url: '/api/parent/media/emoji',
      cookies: parent,
      payload: { code: 'fffff' },
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('вопросы и кэш озвучки', () => {
  it('озвучка одинакового вопроса создаётся один раз', async () => {
    const s1 = await createSegment(t, parent, { videoId: 'aaaaaaaaaaa', childIds: [child] });
    const s2 = await createSegment(t, parent, { videoId: 'bbbbbbbbbbb', childIds: [child] });
    const q1 = await addQuestion(s1, 'Где кошка?');
    const q2 = await addQuestion(s2, '  Где   кошка? ');
    expect(q1.audio?.status).toBe('pending');
    expect(q2.audio?.id).toBe(q1.audio?.id);

    const audio = await t.db
      .select()
      .from(mediaAssets)
      .where(eq(mediaAssets.ttsText, 'Где кошка?'));
    expect(audio).toHaveLength(1);
  });

  it('вопрос без верного варианта отклоняется', async () => {
    const s = await createSegment(t, parent, { videoId: 'aaaaaaaaaaa', childIds: [child] });
    const img = await image();
    const res = await t.app.inject({
      method: 'POST',
      url: `/api/parent/segments/${s}/questions`,
      cookies: parent,
      payload: {
        prompt: 'Где кошка?',
        lang: 'ru',
        options: [
          { imageId: img, label: 'a', isCorrect: false },
          { imageId: img, label: 'b', isCorrect: false },
        ],
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it('вариант с чужим id картинки отклоняется', async () => {
    const s = await createSegment(t, parent, { videoId: 'aaaaaaaaaaa', childIds: [child] });
    const res = await t.app.inject({
      method: 'POST',
      url: `/api/parent/segments/${s}/questions`,
      cookies: parent,
      payload: {
        prompt: 'Где кошка?',
        lang: 'ru',
        options: [
          { imageId: '00000000-0000-4000-8000-000000000000', label: 'a', isCorrect: true },
          { imageId: await image(), label: 'b', isCorrect: false },
        ],
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it('изменение и удаление вопроса', async () => {
    const s = await createSegment(t, parent, { videoId: 'aaaaaaaaaaa', childIds: [child] });
    const q = await addQuestion(s);
    const upd = await t.app.inject({
      method: 'PUT',
      url: `/api/parent/questions/${q.id}`,
      cookies: parent,
      payload: {
        prompt: 'Где собака?',
        lang: 'ru',
        options: q.options.map((o) => ({
          imageId: o.image.id,
          label: o.label,
          isCorrect: !o.isCorrect,
        })),
      },
    });
    expect(upd.json<Question>()).toMatchObject({
      prompt: 'Где собака?',
      options: [{ isCorrect: false }, { isCorrect: true }],
    });

    const segs = await t.app.inject({ url: '/api/parent/segments', cookies: parent });
    expect(segs.json<{ questionCount: number }[]>()[0]!.questionCount).toBe(1);

    await t.app.inject({ method: 'DELETE', url: `/api/parent/questions/${q.id}`, cookies: parent });
    const list = await t.app.inject({
      url: `/api/parent/segments/${s}/questions`,
      cookies: parent,
    });
    expect(list.json()).toEqual([]);
  });
});

describe('плейлист ребёнка', () => {
  it('пока озвучка не готова — вопрос звучит голосом телефона, потом — файлом', async () => {
    const device = await pairDevice(t, parent, child);
    const s = await createSegment(t, parent, { videoId: 'aaaaaaaaaaa', childIds: [child] });
    await addQuestion(s);

    const before = await playlist(device);
    expect(before.serverVoice).toBe(true);
    const first = before.items[0]!;
    expect(first.kind === 'segment' && first.questions[0]!.prompt.audioUrl).toBeNull();
    expect(before.phrases.correct[0]!.audioUrl).toBeNull();

    await renderPendingAudio();
    const after = await playlist(device);
    const item = after.items[0]!;
    expect(item.kind === 'segment' && item.questions[0]!.prompt.audioUrl).toMatch(
      /^\/api\/media\//,
    );
    expect(after.phrases.correct.length).toBeGreaterThan(0);
    expect(after.phrases.retry.length).toBeGreaterThan(0);

    const audio = await t.app.inject({ url: after.phrases.correct[0]!.audioUrl!, cookies: device });
    expect(audio.headers['content-type']).toBe('audio/mpeg');
  });

  it('настройки квиза: по возрасту и из профиля', async () => {
    const device = await pairDevice(t, parent, child);
    expect((await playlist(device)).quiz).toEqual({ options: 2, questions: 3 });

    await t.app.inject({
      method: 'PUT',
      url: `/api/parent/children/${child}`,
      cookies: parent,
      payload: girl({ birthYear: 2024, birthMonth: 3, quizOptions: 4, quizQuestions: 2 }),
    });
    expect((await playlist(device)).quiz).toEqual({ options: 4, questions: 2 });
  });

  it('фразы похвалы — в роде ребёнка', async () => {
    await t.app.inject({
      method: 'POST',
      url: '/api/parent/children',
      cookies: parent,
      payload: girl({ nickname: 'Сын', gender: 'm' }),
    });
    const texts = (await t.db.select({ text: mediaAssets.ttsText }).from(mediaAssets)).map(
      (r) => r.text,
    );
    expect(texts).toContain('Ты справилась!');
    expect(texts).toContain('Ты справился!');
  });

  it('набор карточек — пункт списка; озвучка карточек появляется после генерации', async () => {
    const device = await pairDevice(t, parent, child);
    const deck = await t.app.inject({
      method: 'POST',
      url: '/api/parent/decks',
      cookies: parent,
      payload: { title: 'Животные', lang: 'en', childIds: [child] },
    });
    const deckId = deck.json<{ id: string }>().id;
    const card = await t.app.inject({
      method: 'POST',
      url: `/api/parent/decks/${deckId}/cards`,
      cookies: parent,
      payload: { imageId: await image(), text: 'cat', translation: 'кошка' },
    });
    expect(card.statusCode).toBe(201);

    const early = (await playlist(device)).items[0]!;
    expect(early.kind === 'deck' && early.cards[0]!.word.audioUrl).toBeNull();
    await renderPendingAudio();
    const [item] = (await playlist(device)).items;
    expect(item).toMatchObject({ kind: 'deck', id: deckId });
    expect(item!.kind === 'deck' && item!.cards[0]).toMatchObject({
      word: { text: 'cat', lang: 'en', audioUrl: expect.stringMatching(/^\/api\/media\//) },
      translation: {
        text: 'кошка',
        lang: 'ru',
        audioUrl: expect.stringMatching(/^\/api\/media\//),
      },
    });

    const langs = await t.db
      .select({ lang: mediaAssets.ttsLang, text: mediaAssets.ttsText })
      .from(mediaAssets);
    expect(langs).toContainEqual({ lang: 'en', text: 'cat' });
    expect(langs).toContainEqual({ lang: 'ru', text: 'кошка' });
  });

  it('раздел набора и свой вопрос карточки: вопрос озвучивается на сервере', async () => {
    const device = await pairDevice(t, parent, child);
    const deck = await t.app.inject({
      method: 'POST',
      url: '/api/parent/decks',
      cookies: parent,
      payload: { title: 'Сложение', lang: 'ru', category: 'math', childIds: [child] },
    });
    expect(deck.json<Deck>().category).toBe('math');
    const deckId = deck.json<Deck>().id;
    const saved = await t.app.inject({
      method: 'POST',
      url: `/api/parent/decks/${deckId}/cards`,
      cookies: parent,
      payload: {
        imageId: await image(),
        text: 'два плюс один — три',
        question: 'Покажи пример: два плюс один',
      },
    });
    expect(saved.json<Deck>().cards[0]).toMatchObject({
      question: 'Покажи пример: два плюс один',
      questionAudio: expect.objectContaining({ status: 'pending' }),
    });

    const early = (await playlist(device)).items[0]!;
    expect(early.kind === 'deck' && early.cards[0]!.word.audioUrl).toBeNull();
    await renderPendingAudio();
    const [item] = (await playlist(device)).items;
    expect(item).toMatchObject({ kind: 'deck', id: deckId, category: 'math' });
    expect(item!.kind === 'deck' && item!.cards[0]!.question).toEqual({
      text: 'Покажи пример: два плюс один',
      lang: 'ru',
      audioUrl: expect.stringMatching(/^\/api\/media\//),
    });

    // Без раздела — «Разное».
    const other = await t.app.inject({
      method: 'POST',
      url: '/api/parent/decks',
      cookies: parent,
      payload: { title: 'Прочее', lang: 'ru', childIds: [] },
    });
    expect(other.json<Deck>().category).toBe('other');
  });

  it('видео и наборы — в одном списке с общим порядком', async () => {
    const s = await createSegment(t, parent, { videoId: 'aaaaaaaaaaa', childIds: [child] });
    const deck = await t.app.inject({
      method: 'POST',
      url: '/api/parent/decks',
      cookies: parent,
      payload: { title: 'Цвета', lang: 'ru', childIds: [child] },
    });
    const items = await t.app.inject({
      url: `/api/parent/children/${child}/items`,
      cookies: parent,
    });
    expect(items.json()).toEqual([
      expect.objectContaining({ kind: 'segment', refId: s }),
      expect.objectContaining({ kind: 'deck', refId: deck.json<{ id: string }>().id }),
    ]);
  });
});

describe('озвучка фраз приложения', () => {
  it('ставит фразы в очередь, готовые отдаёт ссылкой; повтор не создаёт дублей', async () => {
    const device = await pairDevice(t, parent, child);
    const ask = () =>
      t.app.inject({
        method: 'POST',
        url: '/api/kid/speech',
        cookies: device,
        payload: {
          phrases: [
            { text: 'Раскрась крышу красным.', lang: 'ru' },
            { text: 'Show me', lang: 'en' },
          ],
        },
      });
    const first = await ask();
    expect(first.json()).toEqual([
      { text: 'Раскрась крышу красным.', lang: 'ru', audioUrl: null },
      { text: 'Show me', lang: 'en', audioUrl: null },
    ]);
    await renderPendingAudio();
    const second = (await ask()).json<{ audioUrl: string | null }[]>();
    expect(second.every((p) => p.audioUrl?.startsWith('/api/media/'))).toBe(true);
    const rows = await t.db.select().from(mediaAssets).where(eq(mediaAssets.ttsText, 'Show me'));
    expect(rows).toHaveLength(1);
  });

  it('только для привязанного устройства', async () => {
    const res = await t.app.inject({
      method: 'POST',
      url: '/api/kid/speech',
      payload: { phrases: [{ text: 'x', lang: 'ru' }] },
    });
    expect(res.statusCode).toBe(401);
  });
});
