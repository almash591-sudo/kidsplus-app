import { schema } from '@kidsplus/db';
import { createTestDb } from '@kidsplus/db/testing';
import type { YouTubeVideoDetails } from '@kidsplus/providers';
import type { PushMessage } from '@kidsplus/shared/push';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { checkAvailability } from './availability';

const RT = (n: number) => String(n).padStart(32, 'a');
let t: Awaited<ReturnType<typeof createTestDb>>;
beforeEach(async () => {
  t = await createTestDb();
});
afterEach(() => t.close());

const add = (provider: string, externalId: string, extra: object = {}) =>
  t.db
    .insert(schema.videoSources)
    .values({ provider, externalId, title: `видео ${externalId.slice(-2)}`, ...extra })
    .returning()
    .then((r) => r[0]!);
const status = async () =>
  Object.fromEntries(
    (await t.db.select().from(schema.videoSources)).map((s) => [
      s.externalId,
      s.status === 'available' ? 'ok' : s.statusReason,
    ]),
  );

/** Ответы RuTube по ID: объект — видео, число — HTTP-статус, 'down' — сеть. */
function ruTube(answers: Record<string, object | number | 'down'>) {
  return (async (url: string | URL) => {
    const id = /\/api\/video\/([0-9a-f]{32})\//.exec(String(url))?.[1] ?? '';
    const a = answers[id] ?? 404;
    if (a === 'down') throw new Error('ECONNRESET');
    if (typeof a === 'number') return new Response('', { status: a });
    return Response.json({ id, title: 'x', ...a });
  }) as typeof fetch;
}

describe('ежедневная проверка видео', () => {
  it('RuTube проверяется и без ключа YouTube; сбой RuTube ничего не меняет', async () => {
    await add('youtube', 'yt000000001');
    await add('rutube', RT(1));
    await add('rutube', RT(2));
    await add('rutube', RT(3));
    await add('rutube', RT(4));
    await add('rutube', RT(5));
    await add('rutube', RT(6), { status: 'unavailable', statusReason: 'not_found' });
    await add('rutube', RT(7), { status: 'unavailable', statusReason: 'player_error_150' });
    const sent: PushMessage[] = [];
    const res = await checkAvailability(
      t.db,
      {
        youtube: null,
        region: 'RU',
        fetch: ruTube({
          [RT(1)]: {},
          [RT(2)]: { pg_rating: { age: 16 } },
          [RT(3)]: { restrictions: { country: { allowed: ['BY'] } } },
          [RT(4)]: 'down',
          [RT(5)]: { is_hidden: true },
          [RT(6)]: {},
          [RT(7)]: {},
        }),
      },
      new Date('2026-11-01T04:00:00Z'),
      async (m) => void sent.push(m),
    );
    expect(await status()).toEqual({
      yt000000001: 'ok', // без ключа YouTube не трогаем
      [RT(1)]: 'ok',
      [RT(2)]: 'not_for_kids',
      [RT(3)]: 'region_blocked',
      [RT(4)]: 'ok', // RuTube не ответил — завтра
      [RT(5)]: 'not_public',
      [RT(6)]: 'ok', // снова есть
      [RT(7)]: 'player_error_150', // ошибку плеера снимает только родитель
    });
    expect(res).toEqual({ checked: 6, unavailable: 3, restored: 1 });
    expect(sent).toHaveLength(3);
  });

  it('YouTube — через Data API, если ключ есть', async () => {
    await add('youtube', 'yt000000001');
    await add('youtube', 'yt000000002');
    const yt = (id: string, extra: Partial<YouTubeVideoDetails> = {}) =>
      ({
        externalId: id,
        privacyStatus: 'public',
        embeddable: true,
        regionBlocked: false,
        ...extra,
      }) as YouTubeVideoDetails;
    const res = await checkAvailability(t.db, {
      youtube: {
        videos: async () => [yt('yt000000001'), yt('yt000000002', { embeddable: false })],
      },
      region: 'RU',
      fetch: ruTube({}),
    });
    expect(await status()).toEqual({ yt000000001: 'ok', yt000000002: 'not_embeddable' });
    expect(res).toEqual({ checked: 2, unavailable: 1, restored: 0 });
  });
});
