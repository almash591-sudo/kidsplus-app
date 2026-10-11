import { schema } from '@kidsplus/db';
import type { ChildItem, Game, KidPlaylist, MediaRef } from '@kidsplus/shared/api';
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

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

let t: TestApp;
let parent: Record<string, string>;
let child: string;
beforeEach(async () => {
  t = await makeApp({ setupToken: SETUP_TOKEN });
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

const addGame = async (title: string, kind: string, params: object) => {
  const [row] = await t.db.insert(schema.interactives).values({ title, kind, params }).returning();
  return row!.id;
};

describe('игры', () => {
  it('родитель видит игры и назначает их; ребёнок получает игру в списке', async () => {
    const device = await pairDevice(t, parent, child);
    const memory = await addGame('Пары', 'memory', { imageIds: [await image(), await image()] });
    const tracing = await addGame('Цифры', 'tracing', { shapes: ['1', '2'] });

    const list = await t.app.inject({ url: '/api/parent/games', cookies: parent });
    expect(
      list
        .json<Game[]>()
        .map((g) => g.title)
        .sort(),
    ).toEqual(['Пары', 'Цифры']);

    const games = list.json<Game[]>();
    for (const id of [memory, tracing]) {
      const g = games.find((x) => x.id === id)!;
      const res = await t.app.inject({
        method: 'PUT',
        url: `/api/parent/games/${id}`,
        cookies: parent,
        // Цифры — в разделе «Математика», остальное — в «Играх» (раздел по умолчанию).
        payload: {
          title: g.title,
          ...(id === tracing ? { category: 'math' } : {}),
          spec: g.spec,
          childIds: [child],
        },
      });
      expect(res.json<Game>()).toMatchObject({
        childIds: [child],
        category: id === tracing ? 'math' : 'games',
      });
    }

    const items = await t.app.inject({
      url: `/api/parent/children/${child}/items`,
      cookies: parent,
    });
    expect(items.json<ChildItem[]>()).toEqual([
      expect.objectContaining({ kind: 'interactive', refId: memory }),
      expect.objectContaining({ kind: 'interactive', refId: tracing }),
    ]);

    const playlist = (
      await t.app.inject({ url: '/api/kid/playlist', cookies: device })
    ).json<KidPlaylist>();
    expect(playlist.items).toEqual([
      {
        kind: 'interactive',
        id: memory,
        category: 'games',
        spec: expect.objectContaining({ kind: 'memory' }),
      },
      {
        kind: 'interactive',
        id: tracing,
        category: 'math',
        spec: { kind: 'tracing', shapes: ['1', '2'] },
      },
    ]);

    // Снять назначение.
    await t.app.inject({
      method: 'PUT',
      url: `/api/parent/games/${tracing}`,
      cookies: parent,
      payload: { title: 'Цифры', spec: { kind: 'tracing', shapes: ['1', '2'] }, childIds: [] },
    });
    const after = (
      await t.app.inject({ url: '/api/kid/playlist', cookies: device })
    ).json<KidPlaylist>();
    expect(after.items.map((i) => i.id)).toEqual([memory]);
  });

  it('игра с неверными параметрами ребёнку не показывается', async () => {
    const device = await pairDevice(t, parent, child);
    const bad = await addGame('Сломанная', 'coloring', { picture: 'dragon' });
    await t.db
      .insert(schema.childItems)
      .values({ childId: child, kind: 'interactive', interactiveId: bad, position: 0 });
    const playlist = (
      await t.app.inject({ url: '/api/kid/playlist', cookies: device })
    ).json<KidPlaylist>();
    expect(playlist.items).toEqual([]);
  });

  it('событие «игра пройдена» сохраняется с id игры', async () => {
    const device = await pairDevice(t, parent, child);
    const id = await addGame('Шарики', 'balloons', { count: 5 });
    const res = await t.app.inject({
      method: 'POST',
      url: '/api/kid/events',
      cookies: device,
      payload: { type: 'interactive_complete', interactiveId: id, payload: { kind: 'balloons' } },
    });
    expect(res.statusCode).toBe(204);
    const [event] = await t.db.select().from(schema.events);
    expect(event).toMatchObject({
      type: 'interactive_complete',
      payload: { kind: 'balloons', interactiveId: id },
    });
  });

  it('назначать игры может только родитель', async () => {
    const id = await addGame('Шарики', 'balloons', { count: 5 });
    const res = await t.app.inject({
      method: 'PUT',
      url: `/api/parent/games/${id}`,
      payload: { title: 'Шарики', spec: { kind: 'balloons', count: 5 }, childIds: [child] },
    });
    expect(res.statusCode).toBe(401);
  });

  it('родитель создаёт, меняет и удаляет игру; параметры проверяются схемой', async () => {
    const cat = await image();
    const created = await t.app.inject({
      method: 'POST',
      url: '/api/parent/games',
      cookies: parent,
      payload: {
        title: 'Покорми котика',
        spec: {
          kind: 'sorting',
          prompt: 'Покорми котика',
          bins: [{ imageId: cat, name: 'котик' }],
          items: [
            { imageId: cat, bin: 0 },
            { imageId: cat, bin: 0 },
          ],
        },
        childIds: [child],
      },
    });
    expect(created.statusCode).toBe(201);
    const game = created.json<Game>();
    expect(game).toMatchObject({ title: 'Покорми котика', childIds: [child] });
    expect(game.spec.kind).toBe('sorting');

    const changed = await t.app.inject({
      method: 'PUT',
      url: `/api/parent/games/${game.id}`,
      cookies: parent,
      payload: { title: 'Шарики', spec: { kind: 'balloons', count: 7 }, childIds: [] },
    });
    expect(changed.json<Game>()).toMatchObject({
      title: 'Шарики',
      spec: { kind: 'balloons', count: 7, target: null },
      childIds: [],
    });

    // Неверные параметры и несуществующая картинка — 400.
    const bad = await t.app.inject({
      method: 'POST',
      url: '/api/parent/games',
      cookies: parent,
      payload: { title: 'x', spec: { kind: 'balloons', count: 100 }, childIds: [] },
    });
    expect(bad.statusCode).toBe(400);
    const noImage = await t.app.inject({
      method: 'POST',
      url: '/api/parent/games',
      cookies: parent,
      payload: {
        title: 'x',
        spec: { kind: 'memory', imageIds: [cat, '00000000-0000-4000-8000-000000000000'] },
        childIds: [],
      },
    });
    expect(noImage.statusCode).toBe(400);

    const del = await t.app.inject({
      method: 'DELETE',
      url: `/api/parent/games/${game.id}`,
      cookies: parent,
    });
    expect(del.statusCode).toBe(204);
    const list = await t.app.inject({ url: '/api/parent/games', cookies: parent });
    expect(list.json<Game[]>()).toEqual([]);
  });
});
