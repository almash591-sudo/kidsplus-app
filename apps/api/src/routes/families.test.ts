import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cookieFrom, makeApp, setupParent, type TestApp } from '../test/helpers';

let t: TestApp;
beforeEach(async () => {
  t = await makeApp();
});
afterEach(() => t.close());

type Cookies = Record<string, string>;
const req = (method: string, url: string, cookies: Cookies, payload?: unknown) =>
  t.app.inject({
    method: method as 'GET',
    url,
    cookies,
    ...(payload !== undefined ? { payload: payload as object } : {}),
  });

const child = { nickname: 'Зайка', birthYear: 2023, birthMonth: 3, gender: 'f', languages: ['ru'] };

/** Администратор приглашает новую семью, сестра регистрируется по ссылке. */
async function twoFamilies() {
  const admin = await setupParent(t);
  const inv = await req('POST', '/api/parent/families/invites', admin, { name: 'Сестра' });
  expect(inv.statusCode).toBe(200);
  const accept = await t.app.inject({
    method: 'POST',
    url: '/api/parent/invites/accept',
    payload: {
      token: inv.json<{ token: string }>().token,
      email: 'sis@example.com',
      password: '0123456789',
    },
  });
  expect(accept.statusCode).toBe(200);
  return { admin, sister: { kp_session: cookieFrom(accept, 'kp_session') } };
}

describe('семьи (этап 23)', () => {
  it('дети, телефоны и снимки другой семьи не видны и недоступны', async () => {
    const { admin, sister } = await twoFamilies();
    const mine = (await req('POST', '/api/parent/children', admin, child)).json<{ id: string }>();
    const theirs = (await req('POST', '/api/parent/children', sister, child)).json<{
      id: string;
    }>();

    const adminKids = (await req('GET', '/api/parent/children', admin)).json<{ id: string }[]>();
    expect(adminKids.map((c) => c.id)).toEqual([mine.id]);
    const sisterKids = (await req('GET', '/api/parent/children', sister)).json<{ id: string }[]>();
    expect(sisterKids.map((c) => c.id)).toEqual([theirs.id]);

    expect((await req('GET', `/api/parent/children/${mine.id}/items`, sister)).statusCode).toBe(
      404,
    );
    expect((await req('DELETE', `/api/parent/children/${mine.id}`, sister)).statusCode).toBe(404);
    expect((await req('GET', `/api/parent/children/${theirs.id}/items`, admin)).statusCode).toBe(
      404,
    );
    const pair = await req('POST', '/api/parent/pairings', sister, {
      childId: mine.id,
      deviceName: 'телефон',
    });
    expect(pair.statusCode).toBe(404);
  });

  it('сестра не модерирует и не меняет библиотеку, но назначает материалы своим детям', async () => {
    const { admin, sister } = await twoFamilies();
    const mine = (await req('POST', '/api/parent/children', admin, child)).json<{ id: string }>();
    const theirs = (await req('POST', '/api/parent/children', sister, child)).json<{
      id: string;
    }>();
    expect((await req('GET', '/api/parent/moderation', sister)).statusCode).toBe(403);
    expect((await req('GET', '/api/parent/families', sister)).statusCode).toBe(403);
    expect((await req('GET', '/api/parent/me', sister)).json()).toMatchObject({ isAdmin: false });

    const deckBody = { title: 'Фрукты', lang: 'ru', category: 'english', childIds: [mine.id] };
    const deck = await req('POST', '/api/parent/decks', admin, deckBody);
    expect(deck.statusCode).toBe(201);
    const id = deck.json<{ id: string }>().id;
    expect((await req('POST', '/api/parent/decks', sister, deckBody)).statusCode).toBe(403);

    // Сестра «переименовывает» и назначает своему ребёнку: название не меняется, назначение — да.
    const put = await req('PUT', `/api/parent/decks/${id}`, sister, {
      ...deckBody,
      title: 'Чужое',
      childIds: [theirs.id],
    });
    expect(put.statusCode).toBe(200);
    expect(put.json()).toMatchObject({ title: 'Фрукты' });
    const items = (await req('GET', `/api/parent/children/${theirs.id}/items`, sister)).json<
      unknown[]
    >();
    expect(items).toHaveLength(1);
    // Назначение ребёнку администратора не пропало.
    const adminItems = (await req('GET', `/api/parent/children/${mine.id}/items`, admin)).json<
      unknown[]
    >();
    expect(adminItems).toHaveLength(1);

    const overview = (await req('GET', '/api/parent/families', admin)).json<{
      families: { name: string; children: number }[];
    }>();
    expect(overview.families.map((f) => [f.name, f.children])).toEqual([
      ['Основная семья', 1],
      ['Сестра', 1],
    ]);
  });
});
