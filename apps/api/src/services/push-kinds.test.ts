import { schema } from '@kidsplus/db';
import { createTestDb } from '@kidsplus/db/testing';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { addPushKindOnce } from './push-kinds';

let t: Awaited<ReturnType<typeof createTestDb>>;
beforeEach(async () => {
  t = await createTestDb();
});
afterEach(() => t.close());

it('новый вид уведомлений — один раз тем, кто получает похожий', async () => {
  const [p] = await t.db
    .insert(schema.parentUsers)
    .values({ email: 'a@b.cd', passwordHash: 'x' })
    .returning();
  const sub = (endpoint: string, kinds: string[]) => ({
    parentId: p!.id,
    endpoint,
    p256dh: 'k'.repeat(20),
    auth: 'a'.repeat(10),
    kinds,
  });
  await t.db
    .insert(schema.pushSubscriptions)
    .values([sub('https://e/1', ['battery', 'call']), sub('https://e/2', ['call'])]);
  expect(await addPushKindOnce(t.db, 'offline', 'battery')).toBe(1);
  const rows = await t.db.select().from(schema.pushSubscriptions);
  expect(rows.find((r) => r.endpoint === 'https://e/1')!.kinds).toEqual([
    'battery',
    'call',
    'offline',
  ]);
  expect(rows.find((r) => r.endpoint === 'https://e/2')!.kinds).toEqual(['call']);
  // Второй раз — ничего (родитель мог уже выключить).
  expect(await addPushKindOnce(t.db, 'offline', 'battery')).toBe(0);
});
