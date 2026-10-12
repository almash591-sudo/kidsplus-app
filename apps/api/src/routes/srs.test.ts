import type { Deck, KidPlaylist, MediaRef } from '@kidsplus/shared/api';
import { afterEach, beforeEach, expect, it } from 'vitest';
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
let t: TestApp;
beforeEach(async () => {
  t = await makeApp({
    setupToken: SETUP_TOKEN,
    tts: { providerId: 'browser', speed: 1, voices: {} },
  });
});
afterEach(() => t.close());

it('карточка, которую ребёнок путает, — в начале набора; выученная — в конце', async () => {
  const parent = await setupParent(t);
  const child = await createChild(t, parent, girl());
  const device = await pairDevice(t, parent, child);
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
  const deck = (
    await t.app.inject({
      method: 'POST',
      url: '/api/parent/decks',
      cookies: parent,
      payload: { title: 'Звери', lang: 'ru', childIds: [child] },
    })
  ).json<Deck>();
  let cards: Deck['cards'] = [];
  for (const text of ['кошка', 'собака', 'лиса'])
    cards = (
      await t.app.inject({
        method: 'POST',
        url: `/api/parent/decks/${deck.id}/cards`,
        cookies: parent,
        payload: { imageId: await image(), text },
      })
    ).json<Deck>().cards;
  const id = (text: string) => cards.find((c) => c.text === text)!.id;
  const answer = (text: string, firstTry: boolean) =>
    t.app.inject({
      method: 'POST',
      url: '/api/kid/events',
      cookies: device,
      payload: { type: 'quiz_answer', deckId: deck.id, payload: { cardId: id(text), firstTry } },
    });
  // Кошку знает, лису путает, собаку ещё не спрашивали.
  await answer('кошка', true);
  await answer('лиса', false);

  const playlist = (
    await t.app.inject({ url: '/api/kid/playlist', cookies: device })
  ).json<KidPlaylist>();
  const item = playlist.items[0]!;
  expect(item.kind === 'deck' && item.cards.map((c) => c.word.text)).toEqual([
    'лиса',
    'собака',
    'кошка',
  ]);
});
