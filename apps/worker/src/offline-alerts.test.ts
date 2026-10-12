import { schema } from '@kidsplus/db';
import { createTestDb } from '@kidsplus/db/testing';
import type { PushMessage } from '@kidsplus/shared/push';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { checkOffline } from './offline-alerts';

let t: Awaited<ReturnType<typeof createTestDb>>;
let device: string;
let child: string;
beforeEach(async () => {
  t = await createTestDb();
  const [c] = await t.db
    .insert(schema.children)
    .values({ nickname: 'Зайка', birthYear: 2024, birthMonth: 1, gender: 'f' })
    .returning();
  child = c!.id;
  const [d] = await t.db
    .insert(schema.devices)
    .values({ childId: child, name: 'Телефон', tokenHash: 'h' })
    .returning();
  device = d!.id;
});
afterEach(() => t.close());

const seen = (at: string) =>
  t.db
    .update(schema.devices)
    .set({ lastSeenAt: new Date(at) })
    .where(eq(schema.devices.id, device));

describe('телефон не на связи', () => {
  it('днём через 2 часа тишины — одно уведомление; вернулся — «снова на связи»', async () => {
    const sent: PushMessage[] = [];
    const notify = async (m: PushMessage) => void sent.push(m);
    await seen('2026-10-12T07:00:00Z'); // 10:00 МСК
    // 1 час 50 минут — ещё рано.
    await checkOffline({ db: t.db, notify, now: new Date('2026-10-12T08:50:00Z') });
    expect(sent).toHaveLength(0);
    await checkOffline({ db: t.db, notify, now: new Date('2026-10-12T09:10:00Z') });
    expect(sent).toMatchObject([{ kind: 'offline', title: 'Телефон не на связи', childId: child }]);
    expect(sent[0]!.body).toContain('2 ч');
    expect(sent[0]!.body).not.toContain('Зайка'); // имени нет — только {child}
    // Повторно не тревожим.
    await checkOffline({ db: t.db, notify, now: new Date('2026-10-12T10:10:00Z') });
    expect(sent).toHaveLength(1);
    await seen('2026-10-12T10:20:00Z');
    await checkOffline({ db: t.db, notify, now: new Date('2026-10-12T10:30:00Z') });
    expect(sent[1]).toMatchObject({ kind: 'offline', title: 'Телефон снова на связи' });
  });

  it('ночью не тревожит; утром, если всё ещё нет связи, — сообщает', async () => {
    const sent: PushMessage[] = [];
    const notify = async (m: PushMessage) => void sent.push(m);
    await seen('2026-10-11T17:00:00Z'); // 20:00 МСК
    await checkOffline({ db: t.db, notify, now: new Date('2026-10-11T22:00:00Z') }); // 01:00 МСК
    expect(sent).toHaveLength(0);
    await checkOffline({ db: t.db, notify, now: new Date('2026-10-12T05:10:00Z') }); // 08:10 МСК
    expect(sent).toHaveLength(1);
  });

  it('отвязанный и ни разу не выходивший на связь телефон — не в счёт', async () => {
    const sent: PushMessage[] = [];
    const notify = async (m: PushMessage) => void sent.push(m);
    await checkOffline({ db: t.db, notify, now: new Date('2026-10-12T09:00:00Z') });
    await seen('2026-10-12T01:00:00Z');
    await t.db
      .update(schema.devices)
      .set({ revokedAt: new Date('2026-10-12T02:00:00Z') })
      .where(eq(schema.devices.id, device));
    await checkOffline({ db: t.db, notify, now: new Date('2026-10-12T09:00:00Z') });
    expect(sent).toHaveLength(0);
  });
});
