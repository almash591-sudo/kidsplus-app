import type { ChildItem, ChildItemsBulkResult } from '@kidsplus/shared/api';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createChild,
  createSegment,
  girl,
  makeApp,
  setupParent,
  SETUP_TOKEN,
  type TestApp,
} from '../test/helpers';

let t: TestApp;
let parent: Record<string, string>;
let older: string;
let younger: string;

const items = async (childId: string) =>
  (await t.app.inject({ url: `/api/parent/children/${childId}/items`, cookies: parent })).json<
    ChildItem[]
  >();
const bulk = (childId: string, payload: object) =>
  t.app.inject({
    method: 'POST',
    url: `/api/parent/children/${childId}/items/bulk`,
    cookies: parent,
    payload,
  });

beforeEach(async () => {
  t = await makeApp({ setupToken: SETUP_TOKEN, rateLimit: false });
  parent = await setupParent(t);
  older = await createChild(t, parent, girl({ nickname: 'Старшая' }));
  younger = await createChild(t, parent, girl({ nickname: 'Младшая' }));
});
afterEach(() => t.close());

describe('массовое назначение (этап 33)', () => {
  it('добавляет много сразу — в конец, по порядку, без повторов; убирает выбранные', async () => {
    const own = await createSegment(t, parent, { videoId: 'aaaaaaaaaa1', childIds: [older] });
    const a = await createSegment(t, parent, { videoId: 'aaaaaaaaaa2', childIds: [younger] });
    const b = await createSegment(t, parent, { videoId: 'aaaaaaaaaa3', childIds: [younger] });
    const c = await createSegment(t, parent, { videoId: 'aaaaaaaaaa4', childIds: [] });

    const res = await bulk(older, {
      add: [
        { kind: 'segment', refId: b },
        { kind: 'segment', refId: a },
        { kind: 'segment', refId: own }, // уже есть
        { kind: 'segment', refId: b }, // повтор
        { kind: 'segment', refId: '00000000-0000-4000-8000-0000000000ff' }, // нет такого
      ],
    });
    expect(res.statusCode).toBe(200);
    expect(res.json<ChildItemsBulkResult>()).toEqual({ added: 2, removed: 0 });
    expect((await items(older)).map((i) => i.refId)).toEqual([own, b, a]);

    const res2 = await bulk(older, {
      add: [{ kind: 'segment', refId: c }],
      remove: [
        { kind: 'segment', refId: own },
        { kind: 'segment', refId: a },
      ],
    });
    expect(res2.json<ChildItemsBulkResult>()).toEqual({ added: 1, removed: 2 });
    expect((await items(older)).map((i) => i.refId)).toEqual([b, c]);
    // У младшей ничего не изменилось.
    expect((await items(younger)).map((i) => i.refId)).toEqual([a, b]);
  });

  it('чужой или несуществующий ребёнок — 404; неверное тело — 400', async () => {
    const res = await bulk('00000000-0000-4000-8000-0000000000aa', { add: [] });
    expect(res.statusCode).toBe(404);
    expect((await bulk(older, { add: [{ kind: 'video', refId: 'x' }] })).statusCode).toBe(400);
  });
});
