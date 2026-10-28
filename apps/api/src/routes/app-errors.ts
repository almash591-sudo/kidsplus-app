import { schema } from '@kidsplus/db';
import { appErrorBatch, type AppErrorEntry, type AppErrorKind } from '@kidsplus/shared/app-errors';
import { and, count, desc, eq, gte, lt } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { requireDevice, requireParent } from '../auth';
import type { Ctx } from '../context';
import { idFrom, parse } from '../lib/http';

const { deviceErrors } = schema;

const DAY_MS = 24 * 3600_000;
/** Одинаковая ошибка за сутки — одна строка со счётчиком. */
const SAME_ERROR_MS = DAY_MS;
/** Сбои хранятся столько дней. */
const KEEP_DAYS = 30;
/** Новых строк с одного телефона в час — не больше: зациклившаяся ошибка не забьёт базу. */
const NEW_PER_HOUR = 20;
/** В кабинете — последние столько. */
const LIST_LIMIT = 50;
/** Старые сбои чистятся не чаще раза в час. */
const PRUNE_EVERY_MS = 3600_000;

export function appErrorsRoutes(app: FastifyInstance, ctx: Ctx) {
  const { db } = ctx;
  let prunedAt = 0;

  /**
   * Сбои детского приложения (этап 51): ошибка в коде, отказ промиса, упавший экран, неоткрытый
   * звук. Одинаковые за сутки складываются; с одного телефона — не больше 20 новых в час.
   */
  app.post(
    '/api/kid/errors',
    {
      preHandler: requireDevice(ctx),
      config: { rateLimit: { max: 60, timeWindow: '1 hour' } },
    },
    async (request, reply) => {
      const { errors } = parse(appErrorBatch, request.body);
      const { id: deviceId, preview } = request.device!;
      // Просмотр из кабинета в «Устройствах» не виден — и сбои его там не нужны.
      if (preview) return reply.code(204).send();
      const now = ctx.now();
      const userAgent = request.headers['user-agent']?.slice(0, 200) ?? null;

      if (now.getTime() - prunedAt > PRUNE_EVERY_MS) {
        prunedAt = now.getTime();
        await db
          .delete(deviceErrors)
          .where(lt(deviceErrors.lastAt, new Date(now.getTime() - KEEP_DAYS * DAY_MS)));
      }

      for (const e of errors) {
        // Время с телефона — когда случилось, но не в будущем и не старше недели.
        const at = new Date(
          Math.min(now.getTime(), Math.max(Date.parse(e.at), now.getTime() - 7 * DAY_MS)),
        );
        const [same] = await db
          .select({ id: deviceErrors.id, count: deviceErrors.count })
          .from(deviceErrors)
          .where(
            and(
              eq(deviceErrors.deviceId, deviceId),
              eq(deviceErrors.kind, e.kind),
              eq(deviceErrors.message, e.message),
              gte(deviceErrors.lastAt, new Date(now.getTime() - SAME_ERROR_MS)),
            ),
          )
          .orderBy(desc(deviceErrors.lastAt))
          .limit(1);
        if (same) {
          await db
            .update(deviceErrors)
            .set({
              count: same.count + e.count,
              lastAt: now,
              screen: e.screen,
              build: e.build,
              stack: e.stack ?? undefined,
              userAgent,
            })
            .where(eq(deviceErrors.id, same.id));
          continue;
        }
        const [recent] = await db
          .select({ n: count() })
          .from(deviceErrors)
          .where(
            and(
              eq(deviceErrors.deviceId, deviceId),
              gte(deviceErrors.firstAt, new Date(now.getTime() - 3600_000)),
            ),
          );
        if ((recent?.n ?? 0) >= NEW_PER_HOUR) continue;
        await db.insert(deviceErrors).values({
          deviceId,
          kind: e.kind,
          message: e.message,
          stack: e.stack,
          screen: e.screen,
          build: e.build,
          userAgent,
          count: e.count,
          firstAt: at,
          lastAt: now,
        });
      }
      return reply.code(204).send();
    },
  );

  /** Последние сбои телефона — в «Устройствах». Чужой телефон — 404 (проверка семьи в auth). */
  app.get(
    '/api/parent/devices/:id/errors',
    { preHandler: requireParent(ctx) },
    async (request): Promise<AppErrorEntry[]> => {
      const id = idFrom(request.params);
      const rows = await db
        .select()
        .from(deviceErrors)
        .where(
          and(
            eq(deviceErrors.deviceId, id),
            gte(deviceErrors.lastAt, new Date(ctx.now().getTime() - KEEP_DAYS * DAY_MS)),
          ),
        )
        .orderBy(desc(deviceErrors.lastAt))
        .limit(LIST_LIMIT);
      return rows.map((r) => ({
        id: r.id,
        kind: r.kind as AppErrorKind,
        message: r.message,
        stack: r.stack,
        screen: r.screen,
        build: r.build,
        userAgent: r.userAgent,
        count: r.count,
        firstAt: r.firstAt.toISOString(),
        lastAt: r.lastAt.toISOString(),
      }));
    },
  );
}
