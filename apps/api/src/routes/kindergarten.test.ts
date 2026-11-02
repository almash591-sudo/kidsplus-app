// Этап 56: «Буквы из садика» — отметка в профиле ребёнка ставит блок уроков в «Буквы».
import { schema } from '@kidsplus/db';
import type { Child } from '@kidsplus/shared/api';
import { GARDEN_TITLE, gardenLessons, LETTER_LESSONS } from '@kidsplus/shared/letters-lessons';
import { and, asc, eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createChild,
  girl,
  makeApp,
  setupParent,
  SETUP_TOKEN,
  type TestApp,
} from '../test/helpers';

const { childItems, events, interactives } = schema;

let t: TestApp;
let parent: Record<string, string>;
let kid: string;

beforeEach(async () => {
  t = await makeApp({ setupToken: SETUP_TOKEN, rateLimit: false });
  parent = await setupParent(t);
  kid = await createChild(t, parent, girl({ nickname: 'Зайка' }));
});
afterEach(() => t.close());

const put = (payload: object, childId = kid) =>
  t.app.inject({
    method: 'PUT',
    url: `/api/parent/children/${childId}`,
    cookies: parent,
    payload: { ...girl({ nickname: 'Зайка' }), ...payload },
  });

/** Дорожка ребёнка в разделе: названия по порядку position. */
const track = async (category: string, childId = kid) =>
  (
    await t.db
      .select({ title: interactives.title })
      .from(childItems)
      .innerJoin(interactives, eq(interactives.id, childItems.interactiveId))
      .where(and(eq(childItems.childId, childId), eq(interactives.category, category)))
      .orderBy(asc(childItems.position))
  ).map((r) => r.title);

/** Игра «Букв» уже назначена ребёнку; done — пройдена. */
async function lesson(title: string, done = false) {
  const [game] = await t.db
    .insert(interactives)
    .values({ title, category: 'letters', kind: 'letter', params: LETTER_LESSONS[0]!.spec })
    .returning();
  const all = await t.db
    .select({ p: childItems.position })
    .from(childItems)
    .where(eq(childItems.childId, kid));
  const next = Math.max(-1, ...all.map((r) => r.p)) + 1;
  await t.db
    .insert(childItems)
    .values({ childId: kid, kind: 'interactive', interactiveId: game!.id, position: next });
  if (done)
    await t.db
      .insert(events)
      .values({ childId: kid, type: 'interactive_complete', payload: { interactiveId: game!.id } });
}

const titles = (l: string) => gardenLessons(l).map((x) => x.title);

describe('буквы из садика (этап 56)', () => {
  it('новая буква — блок сразу после пройденного, перед непройденными; профиль её помнит', async () => {
    await lesson('Буквы 01 · пройдено', true);
    await lesson('Буквы 02 · пройдено', true);
    await lesson('Буквы 03 · впереди');
    await lesson('Буквы 04 · впереди');
    const res = await put({ kindergartenLetters: ['М'] });
    expect(res.statusCode).toBe(200);
    expect(res.json<Child>().kindergartenLetters).toEqual(['М']);
    expect(await track('letters')).toEqual([
      'Буквы 01 · пройдено',
      'Буквы 02 · пройдено',
      ...titles('М'),
      'Буквы 03 · впереди',
      'Буквы 04 · впереди',
    ]);
    expect(titles('М')[0]).toBe(`${GARDEN_TITLE} · М: обведи большую букву`);
  });

  it('следующая буква — за прошлым блоком садика; две сразу — по алфавиту; без дублей', async () => {
    await lesson('Буквы 01 · пройдено', true);
    await lesson('Буквы 02 · впереди');
    await put({ kindergartenLetters: ['М'] });
    await put({ kindergartenLetters: ['М', 'Ш', 'Б'] });
    expect(await track('letters')).toEqual([
      'Буквы 01 · пройдено',
      ...titles('М'),
      ...titles('Б'),
      ...titles('Ш'),
      'Буквы 02 · впереди',
    ]);
    // Профиль хранит по алфавиту; повтор той же отметки ничего не добавляет.
    const again = await put({ kindergartenLetters: ['Ш', 'М', 'Б'] });
    expect(again.json<Child>().kindergartenLetters).toEqual(['Б', 'М', 'Ш']);
    expect((await track('letters')).length).toBe(2 + [...'БМШ'].flatMap(titles).length);
    // Игры общие: второму ребёнку — те же, а не копии.
    const other = await createChild(
      t,
      parent,
      girl({ nickname: 'Солнышко', kindergartenLetters: ['М'] }),
    );
    expect(await track('letters', other)).toEqual(titles('М'));
    const games = await t.db
      .select()
      .from(interactives)
      .where(eq(interactives.title, titles('М')[0]!));
    expect(games).toHaveLength(1);
  });

  it('А, О, У — общий блок «Повторяем О, А, У» один раз', async () => {
    await put({ kindergartenLetters: ['А', 'О', 'У'] });
    expect(await track('letters')).toEqual(LETTER_LESSONS.slice(60, 70).map((x) => x.title));
  });

  it('снятая отметка уроки не убирает; старый кабинет без поля отметки не сбрасывает', async () => {
    await put({ kindergartenLetters: ['Ж'] });
    const before = await track('letters');
    const res = await put({ kindergartenLetters: [] });
    expect(res.json<Child>().kindergartenLetters).toEqual([]);
    expect(await track('letters')).toEqual(before);

    await put({ kindergartenLetters: ['Ж', 'Ь'] });
    // girl() — без поля kindergartenLetters, как кабинет до этапа 56.
    const old = await t.app.inject({
      method: 'PUT',
      url: `/api/parent/children/${kid}`,
      cookies: parent,
      payload: girl({ nickname: 'Зайка 2' }),
    });
    expect(old.statusCode).toBe(200);
    expect(old.json<Child>()).toMatchObject({
      nickname: 'Зайка 2',
      kindergartenLetters: ['Ж', 'Ь'],
    });
  });

  it('не буква — 400', async () => {
    expect((await put({ kindergartenLetters: ['Q'] })).statusCode).toBe(400);
    expect((await put({ kindergartenLetters: ['м'] })).statusCode).toBe(400);
  });
});
