import { schema, type Db } from '@kidsplus/db';
import type { PushKind } from '@kidsplus/shared/push';
import { eq, sql } from 'drizzle-orm';

const { appSettings, pushSubscriptions } = schema;

/**
 * Новый вид уведомлений появляется в уже оформленных подписках один раз — у тех, кто получает
 * похожий (like): например, «телефон не на связи» — тем, кто включил «телефон садится».
 * Дальше родитель сам включает и выключает его в кабинете.
 */
export async function addPushKindOnce(db: Db, kind: PushKind, like: PushKind) {
  const marker = `push_kind_${kind}`;
  const [done] = await db.select().from(appSettings).where(eq(appSettings.key, marker));
  if (done) return 0;
  const res = await db
    .update(pushSubscriptions)
    .set({ kinds: sql`array_append(${pushSubscriptions.kinds}, ${kind})` })
    .where(
      sql`${like} = any(${pushSubscriptions.kinds}) and not (${kind} = any(${pushSubscriptions.kinds}))`,
    )
    .returning({ id: pushSubscriptions.id });
  await db
    .insert(appSettings)
    .values({ key: marker, value: { at: new Date().toISOString() } })
    .onConflictDoNothing();
  return res.length;
}
