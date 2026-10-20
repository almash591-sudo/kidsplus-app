import { schema } from '@kidsplus/db';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  BLOCKED_ID,
  createChild,
  createSegment,
  girl,
  makeApp,
  MISSING_ID,
  pairDevice,
  setupParent,
  videoUrl,
  type TestApp,
} from '../test/helpers';

let t: TestApp;
let parent: Record<string, string>;
let younger: string;
let older: string;
beforeEach(async () => {
  t = await makeApp();
  parent = await setupParent(t);
  younger = await createChild(t, parent, girl({ nickname: 'Малышка', birthYear: 2024 }));
  older = await createChild(t, parent, girl({ nickname: 'Старшая', birthYear: 2021 }));
});
afterEach(() => t.close());

/** Видео из плейлиста устройства. */
const kidSegments = async (device: Record<string, string>) =>
  (await t.app.inject({ url: '/api/kid/playlist', cookies: device }))
    .json<{ items: { kind: string; id: string; externalId: string }[] }>()
    .items.filter((i) => i.kind === 'segment');

const childItemIds = async (childId: string) =>
  (await t.app.inject({ url: `/api/parent/children/${childId}/items`, cookies: parent })).json<
    { id: string; refId: string }[]
  >();

describe('поиск видео по ссылке (oEmbed)', () => {
  it('возвращает название, канал и превью с i.ytimg.com', async () => {
    const res = await t.app.inject({
      url: `/api/parent/videos/lookup?url=${encodeURIComponent('https://youtu.be/abcdefghijk?t=1m5s')}`,
      cookies: parent,
    });
    expect(res.json()).toEqual({
      provider: 'youtube',
      externalId: 'abcdefghijk',
      title: 'Видео abcdefghijk',
      channelTitle: 'Канал',
      thumbnailUrl: 'https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg',
      suggestedStartSec: 65,
    });
  });

  it('встраивание запрещено — 422 с понятным сообщением', async () => {
    const res = await t.app.inject({
      url: `/api/parent/videos/lookup?url=${videoUrl(BLOCKED_ID)}`,
      cookies: parent,
    });
    expect(res.statusCode).toBe(422);
    expect(res.json()).toMatchObject({ error: 'embedding_disabled' });
  });

  it('видео не найдено — 422', async () => {
    const res = await t.app.inject({
      url: `/api/parent/videos/lookup?url=${videoUrl(MISSING_ID)}`,
      cookies: parent,
    });
    expect(res.json()).toMatchObject({ error: 'video_not_found' });
  });

  it('не YouTube — 400', async () => {
    const res = await t.app.inject({
      url: '/api/parent/videos/lookup?url=https://vimeo.com/1',
      cookies: parent,
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('фрагменты', () => {
  it('нельзя добавить видео с запрещённым встраиванием', async () => {
    const res = await t.app.inject({
      method: 'POST',
      url: '/api/parent/segments',
      cookies: parent,
      payload: {
        url: videoUrl(BLOCKED_ID),
        title: 'x',
        startSec: 0,
        endSec: 120,
        childIds: [younger],
      },
    });
    expect(res.statusCode).toBe(422);
    expect((await t.app.inject({ url: '/api/parent/segments', cookies: parent })).json()).toEqual(
      [],
    );
  });

  it('длительность вне 1–5 минут — 400', async () => {
    const res = await t.app.inject({
      method: 'POST',
      url: '/api/parent/segments',
      cookies: parent,
      payload: { url: videoUrl('abcdefghijk'), title: 'x', startSec: 0, endSec: 400, childIds: [] },
    });
    expect(res.statusCode).toBe(400);
  });

  it('несколько фрагментов одного видео используют один источник', async () => {
    await createSegment(t, parent, {
      videoId: 'samevideo01',
      childIds: [younger],
      startSec: 0,
      endSec: 90,
    });
    await createSegment(t, parent, {
      videoId: 'samevideo01',
      childIds: [younger],
      startSec: 100,
      endSec: 200,
    });
    const sources = await t.db.select().from(schema.videoSources);
    expect(sources).toHaveLength(1);
  });

  it('изменение назначения и таймкодов', async () => {
    const id = await createSegment(t, parent, { videoId: 'abcdefghijk', childIds: [younger] });
    const res = await t.app.inject({
      method: 'PUT',
      url: `/api/parent/segments/${id}`,
      cookies: parent,
      payload: { title: 'Новое', startSec: 10, endSec: 100, childIds: [older] },
    });
    expect(res.json()).toMatchObject({
      title: 'Новое',
      startSec: 10,
      endSec: 100,
      childIds: [older],
    });
  });

  it('неизвестный ребёнок в назначении — 400', async () => {
    const res = await t.app.inject({
      method: 'POST',
      url: '/api/parent/segments',
      cookies: parent,
      payload: {
        url: videoUrl('abcdefghijk'),
        title: 'x',
        startSec: 0,
        endSec: 120,
        childIds: ['00000000-0000-4000-8000-000000000000'],
      },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('детское устройство видит только фрагменты своего ребёнка', () => {
  it('у каждого ребёнка свой список', async () => {
    const youngDevice = await pairDevice(t, parent, younger);
    const oldDevice = await pairDevice(t, parent, older);

    await createSegment(t, parent, { videoId: 'forYounger1', childIds: [younger] });
    await createSegment(t, parent, { videoId: 'forOlder001', childIds: [older] });
    await createSegment(t, parent, { videoId: 'forBoth0001', childIds: [younger, older] });
    await createSegment(t, parent, { videoId: 'unassigned1', childIds: [] });

    expect((await kidSegments(youngDevice)).map((s) => s.externalId)).toEqual([
      'forYounger1',
      'forBoth0001',
    ]);
    expect((await kidSegments(oldDevice)).map((s) => s.externalId)).toEqual([
      'forOlder001',
      'forBoth0001',
    ]);
  });

  it('без привязки — 401', async () => {
    expect((await t.app.inject({ url: '/api/kid/playlist' })).statusCode).toBe(401);
  });

  it('снятие назначения сразу убирает фрагмент с устройства', async () => {
    const device = await pairDevice(t, parent, younger);
    const id = await createSegment(t, parent, { videoId: 'abcdefghijk', childIds: [younger] });
    await t.app.inject({
      method: 'PUT',
      url: `/api/parent/segments/${id}`,
      cookies: parent,
      payload: { title: 'x', startSec: 0, endSec: 120, childIds: [] },
    });
    expect(await kidSegments(device)).toEqual([]);
  });

  it('порядок задаёт родитель', async () => {
    const device = await pairDevice(t, parent, younger);
    const a = await createSegment(t, parent, { videoId: 'aaaaaaaaaaa', childIds: [younger] });
    const b = await createSegment(t, parent, { videoId: 'bbbbbbbbbbb', childIds: [younger] });
    const items = await childItemIds(younger);
    expect(items.map((i) => i.refId)).toEqual([a, b]);
    const res = await t.app.inject({
      method: 'PUT',
      url: `/api/parent/children/${younger}/items`,
      cookies: parent,
      payload: { itemIds: [items[1]!.id, items[0]!.id] },
    });
    expect(res.statusCode).toBe(204);
    expect((await kidSegments(device)).map((s) => s.id)).toEqual([b, a]);

    const partial = await t.app.inject({
      method: 'PUT',
      url: `/api/parent/children/${younger}/items`,
      cookies: parent,
      payload: { itemIds: [items[0]!.id] },
    });
    expect(partial.statusCode).toBe(400);
  });
});

describe('события детского приложения', () => {
  it('записываются только по своим фрагментам', async () => {
    const device = await pairDevice(t, parent, younger);
    const own = await createSegment(t, parent, { videoId: 'ownvideo001', childIds: [younger] });
    const foreign = await createSegment(t, parent, { videoId: 'foreign0001', childIds: [older] });

    const ok = await t.app.inject({
      method: 'POST',
      url: '/api/kid/events',
      cookies: device,
      payload: { type: 'segment_complete', segmentId: own, payload: { watchedSec: 120 } },
    });
    expect(ok.statusCode).toBe(204);

    const denied = await t.app.inject({
      method: 'POST',
      url: '/api/kid/events',
      cookies: device,
      payload: { type: 'segment_start', segmentId: foreign },
    });
    expect(denied.statusCode).toBe(404);

    const rows = await t.db.select().from(schema.events);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ childId: younger, type: 'segment_complete', segmentId: own });
  });

  it('ошибка плеера 150 помечает видео недоступным и скрывает его', async () => {
    const device = await pairDevice(t, parent, younger);
    const id = await createSegment(t, parent, { videoId: 'willvanish1', childIds: [younger] });
    await t.app.inject({
      method: 'POST',
      url: '/api/kid/events',
      cookies: device,
      payload: { type: 'segment_error', segmentId: id, payload: { code: 150 } },
    });
    expect(await kidSegments(device)).toEqual([]);

    const [source] = await t.db
      .select()
      .from(schema.videoSources)
      .where(eq(schema.videoSources.externalId, 'willvanish1'));
    expect(source).toMatchObject({ status: 'unavailable', statusReason: 'player_error_150' });

    // Родитель перепроверяет: oEmbed отвечает — видео снова доступно.
    const recheck = await t.app.inject({
      method: 'POST',
      url: `/api/parent/segments/${id}/recheck`,
      cookies: parent,
    });
    expect(recheck.json()).toMatchObject({ source: { status: 'available' } });
    expect(await kidSegments(device)).toHaveLength(1);
  });

  it('телефон подряд не открывает разные видео — сбой у телефона, видео остаются доступными', async () => {
    const device = await pairDevice(t, parent, younger);
    const ids = ['cascade0001', 'cascade0002', 'cascade0003', 'cascade0004'];
    for (const videoId of ids) {
      const id = await createSegment(t, parent, { videoId, childIds: [younger] });
      await t.app.inject({
        method: 'POST',
        url: '/api/kid/events',
        cookies: device,
        payload: { type: 'segment_error', segmentId: id, payload: { code: 150 } },
      });
    }
    const status = async (externalId: string) =>
      (
        await t.db
          .select({ status: schema.videoSources.status })
          .from(schema.videoSources)
          .where(eq(schema.videoSources.externalId, externalId))
      )[0]!.status;
    expect(await Promise.all(ids.map(status))).toEqual([
      'unavailable',
      'unavailable',
      'available',
      'available',
    ]);

    // Этап 34: родителю — «видео не открываются» один раз; на «Главной» — отметка до досмотра.
    const downs = async () =>
      (await t.db.select().from(schema.events)).filter((e) => e.type === 'videos_down').length;
    expect(await downs()).toBe(1);
    const now = async () =>
      (await t.app.inject({ url: `/api/parent/children/${younger}/now`, cookies: parent })).json<{
        videosDown: boolean;
      }>().videosDown;
    expect(await now()).toBe(true);
    const more = await createSegment(t, parent, { videoId: 'cascade0005', childIds: [younger] });
    await t.app.inject({
      method: 'POST',
      url: '/api/kid/events',
      cookies: device,
      payload: { type: 'segment_error', segmentId: more, payload: { code: 150 } },
    });
    expect(await downs()).toBe(1);
    await t.app.inject({
      method: 'POST',
      url: '/api/kid/events',
      cookies: device,
      payload: { type: 'segment_complete', segmentId: more, payload: { watchedSec: 60 } },
    });
    expect(await now()).toBe(false);
  });

  it('неизвестный тип события — 400', async () => {
    const device = await pairDevice(t, parent, younger);
    const res = await t.app.inject({
      method: 'POST',
      url: '/api/kid/events',
      cookies: device,
      payload: { type: 'hack' },
    });
    expect(res.statusCode).toBe(400);
  });
});
