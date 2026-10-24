import { schema } from '@kidsplus/db';
import type { ChildUsage } from '@kidsplus/shared/analytics';
import type { ActivityEntry } from '@kidsplus/shared/schedule';
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

let t: TestApp;
let parent: Record<string, string>;
let child: string;
let phone: Record<string, string>;

const DAY = 86_400_000;

beforeEach(async () => {
  t = await makeApp({ setupToken: SETUP_TOKEN });
  t.clock.now = new Date('2026-10-14T10:00:00Z');
  parent = await setupParent(t);
  child = await createChild(t, parent, girl());
  phone = await pairDevice(t, parent, child);
});
afterEach(() => t.close());

const assign = async (kind: 'deck' | 'interactive', refId: string, daysAgo: number) => {
  const res = await t.app.inject({
    method: 'POST',
    url: `/api/parent/children/${child}/items/bulk`,
    cookies: parent,
    payload: { add: [{ kind, refId }] },
  });
  expect(res.statusCode).toBe(200);
  const col = kind === 'deck' ? schema.childItems.deckId : schema.childItems.interactiveId;
  await t.db
    .update(schema.childItems)
    .set({ createdAt: new Date(t.clock.now.getTime() - daysAgo * DAY) })
    .where(eq(col, refId));
};

/** Игра, назначенная ребёнку `daysAgo` дней назад. */
const game = async (title: string, daysAgo = 20, kind = 'race', category = 'games') => {
  const [g] = await t.db
    .insert(schema.interactives)
    .values({ title, kind, category, params: {} })
    .returning();
  await assign('interactive', g!.id, daysAgo);
  return g!.id;
};

const deck = async (title: string, daysAgo = 20) => {
  const [d] = await t.db
    .insert(schema.flashcardDecks)
    .values({ title, category: 'english' })
    .returning();
  await assign('deck', d!.id, daysAgo);
  return d!.id;
};

/** Событие с телефона ребёнка — как его шлёт приложение. */
const send = async (type: string, ref: Record<string, string>, payload: object = {}) => {
  const res = await t.app.inject({
    method: 'POST',
    url: '/api/kid/events',
    cookies: phone,
    payload: { type, ...ref, payload },
  });
  expect(res.statusCode).toBe(204);
};

const usage = async (days = 30) =>
  (
    await t.app.inject({ url: `/api/parent/children/${child}/usage?days=${days}`, cookies: parent })
  ).json<ChildUsage>();

const journal = async () =>
  (await t.app.inject({ url: `/api/parent/children/${child}/activity`, cookies: parent }))
    .json<{ entries: ActivityEntry[] }>()
    .entries.map((e) => e.text);

describe('что нравится (этап 44)', () => {
  it('любимое, бросает, виды игр и «не открывает» — по событиям телефона', async () => {
    const race = await game('Гонки');
    const rocket = await game('Ракета', 20, 'rocket');
    const animals = await deck('Животные');
    await game('Урок музыки 5', 20, 'piano', 'music'); // дорожка: уроки идут по порядку
    await game('Новая игра', 3); // назначена недавно
    for (let i = 0; i < 3; i++) {
      await send('interactive_start', { interactiveId: race }, { kind: 'race', from: 'free' });
      await send('interactive_complete', { interactiveId: race }, { kind: 'race', seconds: 90 });
    }
    for (const seconds of [30, 50, 40]) {
      await send(
        'interactive_start',
        { interactiveId: rocket },
        { kind: 'rocket', from: 'lesson' },
      );
      await send('interactive_exit', { interactiveId: rocket }, { kind: 'rocket', seconds });
    }

    const u = await usage();
    expect(u.favorites).toEqual([
      expect.objectContaining({ title: 'Гонки', opened: 3, completed: 3, chosen: 3 }),
    ]);
    expect(u.dropped).toEqual([
      expect.objectContaining({ title: 'Ракета', opened: 3, left: 3, leftAfterSec: 40 }),
    ]);
    expect(u.kinds.map((k) => [k.kind, k.chosen, k.left])).toEqual([
      ['race', 3, 0],
      ['rocket', 0, 3],
    ]);
    expect(u.unopened).toEqual([{ kind: 'deck', id: animals, title: 'Животные', gameKind: null }]);
    expect(await journal()).toContain('Вышел из игры «Ракета»');
  });

  it('карточки: ушёл на третьей; прошлые прохождения — без события открытия', async () => {
    const animals = await deck('Животные');
    await t.db.insert(schema.events).values(
      [1, 2].map((d) => ({
        childId: child,
        type: 'deck_complete',
        payload: { deckId: animals, cards: 10 },
        createdAt: new Date(t.clock.now.getTime() - d * DAY),
      })),
    );
    await send('deck_start', { deckId: animals }, { cards: 10, from: 'free' });
    await send('deck_exit', { deckId: animals }, { cards: 10, seen: 3, seconds: 25 });
    const u = await usage();
    expect(u.favorites[0]).toMatchObject({ opened: 3, completed: 2, left: 1, chosen: 1 });
    expect(u.unopened).toEqual([]);
    expect(await journal()).toContain('Вышел из карточек «Животные» на 3 из 10');
  });

  it('план текущей и будущих недель — не «не открывает»; не занимался — список пуст', async () => {
    const planned = await game('Лабиринт', 20, 'maze');
    const other = await game('Пазл', 20, 'puzzle');
    expect((await usage()).unopened).toEqual([]); // за 30 дней ничего не открывал

    const played = await game('Шарики', 20, 'balloons');
    await send('interactive_start', { interactiveId: played }, { kind: 'balloons' });
    const [plan] = await t.db
      .insert(schema.curricula)
      .values({
        childId: child,
        title: 'План',
        startsOn: '2026-10-12',
        weeks: 4,
        subjects: ['math'],
      })
      .returning();
    await t.db.insert(schema.curriculumTopics).values({
      curriculumId: plan!.id,
      subject: 'math',
      week: 2,
      title: 'Счёт',
      items: [{ kind: 'interactive', refId: planned }],
    });
    expect((await usage()).unopened.map((i) => i.id)).toEqual([other]);
  });

  it('за 7 дней — только последние события; без входа — 401', async () => {
    const race = await game('Гонки');
    await t.db.insert(schema.events).values(
      [10, 11].map((d) => ({
        childId: child,
        type: 'interactive_complete',
        payload: { interactiveId: race, kind: 'race' },
        createdAt: new Date(t.clock.now.getTime() - d * DAY),
      })),
    );
    expect((await usage(30)).favorites).toHaveLength(1);
    expect((await usage(7)).favorites).toHaveLength(0);
    const res = await t.app.inject({ url: `/api/parent/children/${child}/usage` });
    expect(res.statusCode).toBe(401);
  });
});
