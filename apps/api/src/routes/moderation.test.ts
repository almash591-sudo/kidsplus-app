import { schema } from '@kidsplus/db';
import type { YouTubeVideoDetails } from '@kidsplus/providers';
import type { KidPlaylist, MediaRef } from '@kidsplus/shared/api';
import type {
  LlmUsageSummary,
  ModerationApproveRequest,
  ModerationItem,
  ModerationReport,
} from '@kidsplus/shared/moderation';
import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { YouTubeClient } from '../context';
import {
  BLOCKED_ID,
  createChild,
  girl,
  makeApp,
  pairDevice,
  setupParent,
  SETUP_TOKEN,
  type TestApp,
} from '../test/helpers';

const { appMeta, llmUsage, moderationItems, quizQuestions, videoSegments } = schema;
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

let t: TestApp;
afterEach(() => t.close());

async function start(youtube: YouTubeClient | null = null) {
  t = await makeApp({ setupToken: SETUP_TOKEN, youtube });
  const parent = await setupParent(t);
  const child = await createChild(t, parent, girl());
  return { parent, child };
}

const add = (parent: Record<string, string>, url: string, topic?: string) =>
  t.app.inject({
    method: 'POST',
    url: '/api/parent/moderation',
    cookies: parent,
    payload: { url, topic },
  });
const list = async (parent: Record<string, string>) =>
  (await t.app.inject({ url: '/api/parent/moderation', cookies: parent })).json<ModerationItem[]>();

const video = (id: string, over: Partial<YouTubeVideoDetails> = {}): YouTubeVideoDetails => ({
  externalId: id,
  title: `Видео ${id}`,
  description: 'описание',
  channelTitle: 'Канал',
  durationSec: 600,
  embeddable: true,
  privacyStatus: 'public',
  madeForKids: true,
  regionBlocked: false,
  thumbnailUrl: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
  publishedAt: null,
  ...over,
});

describe('добавление в очередь', () => {
  it('без ключа YouTube — видео по одному через oEmbed; повтор не дублирует', async () => {
    const { parent } = await start();
    const r = await add(parent, 'https://youtu.be/aaaaaaaaaaa', 'цвета');
    expect(r.statusCode).toBe(201);
    expect(r.json()).toEqual({ added: 1, existing: 0 });
    const [item] = await list(parent);
    expect(item).toMatchObject({
      status: 'queued',
      externalId: 'aaaaaaaaaaa',
      title: 'Видео aaaaaaaaaaa',
      topic: 'цвета',
      durationSec: null,
      report: null,
    });
    expect((await add(parent, 'https://www.youtube.com/watch?v=aaaaaaaaaaa')).json()).toEqual({
      added: 0,
      existing: 1,
    });

    // Встраивание запрещено — сразу отсеяно.
    await add(parent, `https://youtu.be/${BLOCKED_ID}`);
    const blocked = (await list(parent)).find((i) => i.externalId === BLOCKED_ID)!;
    expect(blocked).toMatchObject({
      status: 'skipped',
      skipReason: expect.stringMatching(/встраивание/),
    });

    // Плейлист без ключа — понятная ошибка.
    const pl = await add(parent, 'https://www.youtube.com/playlist?list=PL1234567890ab');
    expect(pl.statusCode).toBe(422);
    expect(pl.json().message).toMatch(/ключ YouTube Data API/);
  });

  it('с ключом YouTube — канал целиком; отсев на входе', async () => {
    const youtube: YouTubeClient = {
      channelUploadsPlaylist: vi.fn(async () => 'UUuploads'),
      playlistVideoIds: vi.fn(async () => [
        'aaaaaaaaaaa',
        'bbbbbbbbbbb',
        'ccccccccccc',
        'ddddddddddd',
        'eeeeeeeeeee',
      ]),
      videos: vi.fn(async () => [
        video('aaaaaaaaaaa'),
        video('bbbbbbbbbbb', { privacyStatus: 'unlisted' }),
        video('ccccccccccc', { durationSec: 3 * 3600 }),
        video('ddddddddddd', { regionBlocked: true }),
      ]),
    };
    const { parent } = await start(youtube);
    expect((await add(parent, 'https://www.youtube.com/@kids')).json()).toEqual({
      added: 5,
      existing: 0,
    });
    expect(youtube.channelUploadsPlaylist).toHaveBeenCalledWith({ handle: '@kids' });
    const items = new Map((await list(parent)).map((i) => [i.externalId, i]));
    expect(items.get('aaaaaaaaaaa')).toMatchObject({
      status: 'queued',
      durationSec: 600,
      madeForKids: true,
    });
    expect(items.get('bbbbbbbbbbb')!.skipReason).toMatch(/не публичное/);
    expect(items.get('ccccccccccc')!.skipReason).toMatch(/длиннее 30 минут/);
    expect(items.get('ddddddddddd')!.skipReason).toMatch(/регионе/);
    expect(items.get('eeeeeeeeeee')!.skipReason).toMatch(/не найдено/);
  });

  it('только для родителя', async () => {
    await start();
    expect(
      (await t.app.inject({ method: 'POST', url: '/api/parent/moderation', payload: { url: 'x' } }))
        .statusCode,
    ).toBe(401);
  });
});

describe('решение родителя', () => {
  async function readyItem(parent: Record<string, string>) {
    await add(parent, 'https://youtu.be/aaaaaaaaaaa');
    const [item] = await list(parent);
    const report: ModerationReport = {
      model: 'gemini-3.8-flash',
      summary: 'Песенка про цвета',
      language: 'ru',
      ages: [{ age: '2-3', fit: 'good', note: '' }],
      educationalValue: { score: 4, note: '' },
      redFlags: [],
      recommendation: 'approve',
      segments: [],
    };
    await t.db
      .update(moderationItems)
      .set({ status: 'ready', report: report as unknown as Record<string, unknown> })
      .where(eq(moderationItems.id, item!.id));
    return item!.id;
  }

  const image = async (parent: Record<string, string>) =>
    (
      await t.app.inject({
        method: 'POST',
        url: '/api/parent/media/images',
        cookies: parent,
        headers: { 'content-type': 'image/png' },
        payload: PNG,
      })
    ).json<MediaRef>().id;

  it('одобрение создаёт фрагменты и вопросы и назначает детям; до этого ребёнок ничего не видит', async () => {
    const { parent, child } = await start();
    const device = await pairDevice(t, parent, child);
    const id = await readyItem(parent);
    const playlist = async () =>
      (await t.app.inject({ url: '/api/kid/playlist', cookies: device })).json<KidPlaylist>();
    expect((await playlist()).items).toEqual([]);

    const [a, b] = [await image(parent), await image(parent)];
    const body: ModerationApproveRequest = {
      childIds: [child],
      segments: [
        {
          title: 'Красный',
          startSec: 30,
          endSec: 150,
          questions: [
            {
              prompt: 'Где красный шарик?',
              lang: 'ru',
              options: [
                { imageId: a, label: 'красный', isCorrect: true },
                { imageId: b, label: 'синий', isCorrect: false },
              ],
            },
          ],
        },
        { title: 'Синий', startSec: 200, endSec: 320, questions: [] },
      ],
    };
    const res = await t.app.inject({
      method: 'POST',
      url: `/api/parent/moderation/${id}/approve`,
      cookies: parent,
      payload: body,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json<ModerationItem>().status).toBe('approved');

    const segments = await t.db.select().from(videoSegments);
    expect(segments.map((s) => [s.title, s.startSec, s.endSec]).sort()).toEqual([
      ['Красный', 30, 150],
      ['Синий', 200, 320],
    ]);
    expect(await t.db.select().from(quizQuestions)).toHaveLength(1);
    expect((await playlist()).items.map((i) => i.kind)).toEqual(['segment', 'segment']);

    // Повторно одобрить нельзя.
    const again = await t.app.inject({
      method: 'POST',
      url: `/api/parent/moderation/${id}/approve`,
      cookies: parent,
      payload: body,
    });
    expect(again.statusCode).toBe(409);
  });

  it('фрагмент вне 1–5 минут — ошибка проверки', async () => {
    const { parent } = await start();
    const id = await readyItem(parent);
    const res = await t.app.inject({
      method: 'POST',
      url: `/api/parent/moderation/${id}/approve`,
      cookies: parent,
      payload: { childIds: [], segments: [{ title: 'x', startSec: 0, endSec: 20, questions: [] }] },
    });
    expect(res.statusCode).toBe(400);
  });

  it('отклонить и вернуть в очередь', async () => {
    const { parent } = await start();
    const id = await readyItem(parent);
    const rej = await t.app.inject({
      method: 'POST',
      url: `/api/parent/moderation/${id}/reject`,
      cookies: parent,
    });
    expect(rej.json<ModerationItem>().status).toBe('rejected');
    const retry = await t.app.inject({
      method: 'POST',
      url: `/api/parent/moderation/${id}/retry`,
      cookies: parent,
    });
    expect(retry.json<ModerationItem>()).toMatchObject({ status: 'queued', error: null });
  });
});

describe('расход токенов', () => {
  it('сутки, всего, лимиты и состояние worker’а', async () => {
    const { parent } = await start();
    await t.db.insert(llmUsage).values([
      {
        task: 'moderate',
        model: 'm',
        inputTokens: 1000,
        outputTokens: 200,
        createdAt: t.clock.now,
      },
      {
        task: 'moderate',
        model: 'm',
        inputTokens: 500,
        outputTokens: 0,
        createdAt: new Date('2026-10-01T00:00:00Z'),
      },
    ]);
    await t.db
      .insert(appMeta)
      .values({ key: 'moderation_worker', value: JSON.stringify({ paused: 'no_key' }) });
    const r = await t.app.inject({ url: '/api/parent/llm-usage', cookies: parent });
    expect(r.json<LlmUsageSummary>()).toEqual({
      todayTokens: 1200,
      totalTokens: 1700,
      dailyLimit: 1_000_000,
      totalLimit: 10_000_000,
      paused: 'no_key',
    });
  });
});
