// Рассылка push-уведомлений родителям (п. 6.2 ТЗ). Отправка — через переданный sender
// (Web Push из @kidsplus/providers), чтобы пакет БД не зависел от внешних сервисов.
import type { PushMessage } from '@kidsplus/shared/push';
import { and, eq, sql } from 'drizzle-orm';
import type { Db } from './index';
import { pushSubscriptions } from './schema';

export interface PushSend {
  send(
    target: { endpoint: string; keys: { p256dh: string; auth: string } },
    payload: object,
  ): Promise<'ok' | 'gone'>;
}

/**
 * Отправить всем подпискам, где включён этот вид (или всем подпискам одного родителя —
 * для проверки). Возвращает, сколько доставлено.
 */
export async function notifyParents(
  db: Db,
  sender: PushSend | null,
  message: PushMessage,
  only?: { parentId: string; respectKinds?: boolean },
): Promise<number> {
  if (!sender) return 0;
  const wanted = sql`${message.kind} = any(${pushSubscriptions.kinds})`;
  const subs = await db
    .select()
    .from(pushSubscriptions)
    .where(
      only
        ? only.respectKinds
          ? and(eq(pushSubscriptions.parentId, only.parentId), wanted)
          : eq(pushSubscriptions.parentId, only.parentId)
        : wanted,
    );
  let sent = 0;
  for (const s of subs) {
    try {
      const r = await sender.send(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        message,
      );
      if (r === 'gone') await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, s.id));
      else sent++;
    } catch {
      // сервис доставки недоступен — уведомление пропадёт, это не критично
    }
  }
  return sent;
}
