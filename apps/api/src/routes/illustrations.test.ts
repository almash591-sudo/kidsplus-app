import { schema } from '@kidsplus/db';
import type { Child, KidPlaylist, MediaRef } from '@kidsplus/shared/api';
import { mediaUrl } from '@kidsplus/shared/api';
import { eq } from 'drizzle-orm';
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

// Этап 25: авторские картинки вместо эмодзи — только детям, которым их включил родитель.
const BROWSER_TTS = { providerId: 'browser', speed: 0.85, voices: {} };
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

let t: TestApp;
let parent: Record<string, string>;
beforeEach(async () => {
  t = await makeApp({ setupToken: SETUP_TOKEN, tts: BROWSER_TTS });
  parent = await setupParent(t);
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

describe('авторские картинки', () => {
  it('карточка показывает иллюстрацию, только если она включена ребёнку и готова', async () => {
    const plain = await createChild(t, parent, girl({ nickname: 'Зайка' }));
    const fan = await createChild(t, parent, girl({ nickname: 'Мишутка', illustrations: true }));
    const emoji = await image();
    const clay = await image();
    await t.db
      .update(schema.mediaAssets)
      .set({ illustrationId: clay })
      .where(eq(schema.mediaAssets.id, emoji));

    const deck = await t.app.inject({
      method: 'POST',
      url: '/api/parent/decks',
      cookies: parent,
      payload: { title: 'Животные', lang: 'ru', childIds: [plain, fan] },
    });
    await t.app.inject({
      method: 'POST',
      url: `/api/parent/decks/${deck.json<{ id: string }>().id}/cards`,
      cookies: parent,
      payload: { imageId: emoji, text: 'кошка' },
    });

    const cardUrl = async (child: string) => {
      const device = await pairDevice(t, parent, child);
      const pl = (
        await t.app.inject({ url: '/api/kid/playlist', cookies: device })
      ).json<KidPlaylist>();
      const item = pl.items[0]!;
      return item.kind === 'deck' ? item.cards[0]!.imageUrl : null;
    };
    expect(await cardUrl(plain)).toBe(mediaUrl(emoji));
    expect(await cardUrl(fan)).toBe(mediaUrl(clay));

    // Иллюстрация ещё не готова — остаётся эмодзи.
    await t.db
      .update(schema.mediaAssets)
      .set({ status: 'pending' })
      .where(eq(schema.mediaAssets.id, clay));
    expect(await cardUrl(fan)).toBe(mediaUrl(emoji));
  });

  it('в играх картинки тоже подменяются на авторские', async () => {
    const child = await createChild(t, parent, girl({ illustrations: true }));
    const [cat, dog, clay] = [await image(), await image(), await image()];
    await t.db
      .update(schema.mediaAssets)
      .set({ illustrationId: clay })
      .where(eq(schema.mediaAssets.id, cat));
    const [game] = await t.db
      .insert(schema.interactives)
      .values({ title: 'Пары', kind: 'memory', params: { imageIds: [cat, dog] } })
      .returning();
    await t.db
      .insert(schema.childItems)
      .values({ childId: child, kind: 'interactive', interactiveId: game!.id, position: 0 });

    const device = await pairDevice(t, parent, child);
    const pl = (
      await t.app.inject({ url: '/api/kid/playlist', cookies: device })
    ).json<KidPlaylist>();
    const item = pl.items[0]!;
    expect(item.kind === 'interactive' && item.spec).toEqual({
      kind: 'memory',
      imageIds: [clay, dog],
    });
  });

  it('родитель включает и выключает картинки в профиле ребёнка', async () => {
    const id = await createChild(t, parent, girl());
    const res = await t.app.inject({
      method: 'PUT',
      url: `/api/parent/children/${id}`,
      cookies: parent,
      payload: { ...girl(), illustrations: true },
    });
    expect(res.json<Child>().illustrations).toBe(true);
  });
});
