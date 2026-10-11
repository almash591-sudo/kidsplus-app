import { schema } from '@kidsplus/db';
import { notifyParents } from '@kidsplus/db/notify';
import { pushSubscription, type PushKind } from '@kidsplus/shared/push';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireParent } from '../auth';
import type { Ctx } from '../context';
import { HttpError, parse } from '../lib/http';

const { pushSubscriptions } = schema;

const endpointRequest = z.object({ endpoint: z.url().max(1000) });

/** Подписка родителя на push-уведомления (п. 6.2 ТЗ). */
export function pushRoutes(app: FastifyInstance, ctx: Ctx) {
  const { db } = ctx;
  const preHandler = requireParent(ctx);

  /** Открытый ключ VAPID для подписки в браузере; null — уведомления на сервере не настроены. */
  app.get('/api/parent/push', { preHandler }, async () => ({
    publicKey: ctx.push?.publicKey ?? null,
  }));

  /** Подписка этого браузера: какие уведомления включены (null — не подписан). */
  app.post('/api/parent/push/status', { preHandler }, async (request) => {
    const { endpoint } = parse(endpointRequest, request.body);
    const [row] = await db
      .select({ kinds: pushSubscriptions.kinds })
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.endpoint, endpoint));
    return { kinds: (row?.kinds as PushKind[] | undefined) ?? null };
  });

  app.put('/api/parent/push/subscription', { preHandler }, async (request) => {
    const body = parse(pushSubscription, request.body);
    const values = {
      parentId: request.parent!.id,
      endpoint: body.endpoint,
      p256dh: body.keys.p256dh,
      auth: body.keys.auth,
      kinds: body.kinds,
    };
    await db
      .insert(pushSubscriptions)
      .values(values)
      .onConflictDoUpdate({ target: pushSubscriptions.endpoint, set: values });
    return { kinds: body.kinds };
  });

  app.post('/api/parent/push/unsubscribe', { preHandler }, async (request, reply) => {
    const { endpoint } = parse(endpointRequest, request.body);
    await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint));
    return reply.code(204).send();
  });

  /** Проверочное уведомление — всем подпискам родителя. */
  app.post(
    '/api/parent/push/test',
    { preHandler, config: { rateLimit: { max: 5, timeWindow: '1 minute' } } },
    async (request) => {
      if (!ctx.push) throw new HttpError(409, 'push_off', 'уведомления на сервере не настроены');
      const sent = await notifyParents(
        db,
        ctx.push.sender,
        { kind: 'moderation', title: 'KidsPlus', body: 'Уведомления работают.', url: '/account' },
        { parentId: request.parent!.id },
      );
      return { sent };
    },
  );
}
