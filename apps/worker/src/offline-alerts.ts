// «Телефон не на связи» (этап 15д). Киоск выходит на связь круглосуточно (ожидание звонков —
// раз в ~40 с), поэтому два часа тишины — это выключенный, разряженный телефон или нет интернета.
// Сообщаем один раз и только днём; когда телефон вернулся — «снова на связи».
import { schema, type Db } from '@kidsplus/db';
import { pushMessages, type PushMessage } from '@kidsplus/shared/push';
import { eq, isNull, sql } from 'drizzle-orm';

const { devices, appSettings } = schema;
const KEY = 'offline_alerts';
export const OFFLINE_AFTER_MS = 2 * 3600_000;
/** Днём по Москве — ночью выключенный телефон никого не тревожит. */
const DAY_FROM = 8;
const DAY_TO = 21;

const moscowHour = (d: Date) =>
  Number(
    new Intl.DateTimeFormat('ru-RU', {
      hour: 'numeric',
      hourCycle: 'h23',
      timeZone: 'Europe/Moscow',
    }).format(d),
  );

export async function checkOffline(deps: {
  db: Db;
  notify?: ((m: PushMessage) => Promise<unknown>) | undefined;
  now?: Date;
}): Promise<{ alerted: number; back: number }> {
  const { db, notify } = deps;
  const now = deps.now ?? new Date();
  const [row] = await db.select().from(appSettings).where(eq(appSettings.key, KEY));
  const alerts = { ...((row?.value as Record<string, string> | undefined) ?? {}) };
  const list = await db.select().from(devices).where(isNull(devices.revokedAt));
  const day = moscowHour(now) >= DAY_FROM && moscowHour(now) < DAY_TO;
  let alerted = 0;
  let back = 0;

  for (const d of list) {
    if (!d.lastSeenAt) continue; // ещё ни разу не выходил на связь — не привязан до конца
    const silent = now.getTime() - d.lastSeenAt.getTime();
    const was = alerts[d.id];
    if (was && d.lastSeenAt.getTime() > Date.parse(was)) {
      delete alerts[d.id];
      back++;
      await notify?.(pushMessages.online(d.childId));
    } else if (!was && silent > OFFLINE_AFTER_MS && day) {
      alerts[d.id] = now.toISOString();
      alerted++;
      await notify?.(pushMessages.offline(d.childId, Math.floor(silent / 3600_000)));
    }
  }
  if (alerted || back)
    await db
      .insert(appSettings)
      .values({ key: KEY, value: alerts })
      .onConflictDoUpdate({
        target: appSettings.key,
        set: { value: alerts, updatedAt: sql`now()` },
      });
  return { alerted, back };
}
