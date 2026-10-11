import { gte, sql, sum } from 'drizzle-orm';
import type { Db } from './index';
import { llmUsage } from './schema';

/** Расход токенов модели: с начала суток (UTC) и всего — для лимитов п. 7.4 ТЗ. */
export async function tokenUsage(db: Pick<Db, 'select'>, now: Date) {
  const total = sql<string>`coalesce(${sum(llmUsage.inputTokens)}, 0) + coalesce(${sum(llmUsage.outputTokens)}, 0)`;
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const [all] = await db.select({ n: total }).from(llmUsage);
  const [today] = await db
    .select({ n: total })
    .from(llmUsage)
    .where(gte(llmUsage.createdAt, dayStart));
  return { today: Number(today?.n ?? 0), total: Number(all?.n ?? 0) };
}
