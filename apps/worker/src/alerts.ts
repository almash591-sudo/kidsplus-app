// Предупреждение о расходе токенов модели (п. 6.2 ТЗ): 80 % дневного или общего лимита —
// один раз в сутки.
import { schema, type Db } from '@kidsplus/db';
import { tokenUsage } from '@kidsplus/db/llm-usage';
import { pushMessages, type PushMessage } from '@kidsplus/shared/push';
import { eq, sql } from 'drizzle-orm';

const { appMeta } = schema;
const KEY = 'tokens_alert_day';
export const TOKEN_ALERT_SHARE = 0.8;

export type Notify = (m: PushMessage) => Promise<unknown>;

export async function tokenAlert(
  db: Db,
  limits: { daily: number; total: number },
  notify: Notify | undefined,
  now: Date,
): Promise<boolean> {
  if (!notify) return false;
  const used = await tokenUsage(db, now);
  const share = Math.max(
    limits.daily ? used.today / limits.daily : 0,
    limits.total ? used.total / limits.total : 0,
  );
  if (share < TOKEN_ALERT_SHARE) return false;
  const day = now.toISOString().slice(0, 10);
  const [row] = await db.select().from(appMeta).where(eq(appMeta.key, KEY));
  if (row?.value === day) return false;
  await db
    .insert(appMeta)
    .values({ key: KEY, value: day })
    .onConflictDoUpdate({ target: appMeta.key, set: { value: day, updatedAt: sql`now()` } });
  await notify(pushMessages.tokens(Math.min(100, Math.round(share * 100))));
  return true;
}
