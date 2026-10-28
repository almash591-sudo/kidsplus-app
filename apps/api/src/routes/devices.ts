import { schema } from '@kidsplus/db';
import {
  pairClaimRequest,
  pairingCreateRequest,
  kidVoicesRequest,
  type Device,
  type PairingCreated,
} from '@kidsplus/shared/api';
import { APP_ERROR_RECENT_DAYS } from '@kidsplus/shared/app-errors';
import { and, desc, eq, gt, gte, inArray, isNull, sum } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { requireDevice, requireParent, setDeviceCookie } from '../auth';
import { PAIRING_TTL_MS, type Ctx } from '../context';

/** Просмотр из кабинета длится 2 часа. */
const PREVIEW_TTL_MS = 2 * 3600_000;
import { formatPairingCode, pairingCode, randomToken, sha256 } from '../lib/crypto';
import { HttpError, idFrom, notFound, parse } from '../lib/http';

const { children, deviceErrors, devices, devicePairings } = schema;

const toDevice = (d: typeof devices.$inferSelect, errors = 0): Device => ({
  id: d.id,
  childId: d.childId,
  name: d.name,
  createdAt: d.createdAt.toISOString(),
  lastSeenAt: d.lastSeenAt?.toISOString() ?? null,
  revokedAt: d.revokedAt?.toISOString() ?? null,
  speechLangs: d.speechLangs ?? null,
  speechCheckedAt: d.speechCheckedAt?.toISOString() ?? null,
  errors,
});

export function devicesRoutes(app: FastifyInstance, ctx: Ctx) {
  const { db } = ctx;
  const parentOnly = requireParent(ctx);

  app.get('/api/parent/devices', { preHandler: parentOnly }, async (request): Promise<Device[]> => {
    const rows = await db
      .select({ d: devices })
      .from(devices)
      .innerJoin(children, eq(children.id, devices.childId))
      .where(and(eq(devices.preview, false), eq(children.familyId, request.parent!.familyId)))
      .orderBy(desc(devices.createdAt));
    // Этап 51: сколько раз за неделю на телефоне что-то сломалось.
    const since = new Date(ctx.now().getTime() - APP_ERROR_RECENT_DAYS * 24 * 3600_000);
    const ids = rows.map((r) => r.d.id);
    const counts = ids.length
      ? await db
          .select({ deviceId: deviceErrors.deviceId, n: sum(deviceErrors.count).mapWith(Number) })
          .from(deviceErrors)
          .where(and(inArray(deviceErrors.deviceId, ids), gte(deviceErrors.lastAt, since)))
          .groupBy(deviceErrors.deviceId)
      : [];
    const errors = new Map(counts.map((c) => [c.deviceId, c.n]));
    return rows.map((r) => toDevice(r.d, errors.get(r.d.id) ?? 0));
  });

  // Родитель создаёт одноразовый код привязки для конкретного ребёнка.
  app.post(
    '/api/parent/pairings',
    { preHandler: parentOnly },
    async (request, reply): Promise<PairingCreated> => {
      const body = parse(pairingCreateRequest, request.body);
      const [child] = await db
        .select({ id: children.id })
        .from(children)
        .where(eq(children.id, body.childId));
      if (!child) throw notFound('ребёнок не найден');

      const code = pairingCode();
      const expiresAt = new Date(ctx.now().getTime() + PAIRING_TTL_MS);
      await db.insert(devicePairings).values({
        codeHash: sha256(code),
        childId: child.id,
        deviceName: body.deviceName,
        createdBy: request.parent!.id,
        expiresAt,
      });
      const url = new URL('/pair', ctx.config.kidAppUrl);
      url.searchParams.set('code', code);
      reply.code(201);
      return {
        code: formatPairingCode(code),
        url: url.toString(),
        expiresAt: expiresAt.toISOString(),
      };
    },
  );

  /**
   * Просмотр глазами ребёнка (этап 16а): одноразовая ссылка на детское приложение под этим
   * ребёнком. Устройство-просмотр не пишет прогресс и не тратит время, не видно в «Устройствах»
   * и само отзывается через 2 часа.
   */
  app.post(
    '/api/parent/children/:id/preview',
    { preHandler: parentOnly },
    async (request, reply): Promise<PairingCreated> => {
      const [child] = await db
        .select({ id: children.id })
        .from(children)
        .where(eq(children.id, idFrom(request.params)));
      if (!child) throw notFound('ребёнок не найден');
      const code = pairingCode();
      const expiresAt = new Date(ctx.now().getTime() + PAIRING_TTL_MS);
      await db.insert(devicePairings).values({
        codeHash: sha256(code),
        childId: child.id,
        deviceName: 'Просмотр из кабинета',
        createdBy: request.parent!.id,
        expiresAt,
        preview: true,
      });
      const url = new URL('/pair', ctx.config.kidAppUrl);
      url.searchParams.set('code', code);
      reply.code(201);
      return {
        code: formatPairingCode(code),
        url: url.toString(),
        expiresAt: expiresAt.toISOString(),
      };
    },
  );

  // Отзыв доступа: устройство сразу перестаёт получать контент.
  app.delete('/api/parent/devices/:id', { preHandler: parentOnly }, async (request, reply) => {
    const id = idFrom(request.params);
    const [row] = await db
      .update(devices)
      .set({ revokedAt: ctx.now() })
      .where(and(eq(devices.id, id), isNull(devices.revokedAt)))
      .returning({ id: devices.id });
    if (!row) throw notFound('устройство не найдено');
    return reply.code(204).send();
  });

  // ─── Детское приложение ────────────────────────────────────────────────────

  app.post(
    '/api/kid/pair',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const { code } = parse(pairClaimRequest, request.body);
      const token = randomToken();
      await db.transaction(async (tx) => {
        // Код помечается использованным атомарно — второй раз им не воспользоваться.
        const [pairing] = await tx
          .update(devicePairings)
          .set({ usedAt: ctx.now() })
          .where(
            and(
              eq(devicePairings.codeHash, sha256(code)),
              isNull(devicePairings.usedAt),
              gt(devicePairings.expiresAt, ctx.now()),
            ),
          )
          .returning();
        if (!pairing) throw new HttpError(403, 'invalid_code', 'код недействителен или истёк');
        const [device] = await tx
          .insert(devices)
          .values({
            childId: pairing.childId,
            name: pairing.deviceName,
            tokenHash: sha256(token),
            lastSeenAt: ctx.now(),
            preview: pairing.preview,
            ...(pairing.preview
              ? { revokedAt: new Date(ctx.now().getTime() + PREVIEW_TTL_MS) }
              : {}),
          })
          .returning({ id: devices.id });
        await tx
          .update(devicePairings)
          .set({ deviceId: device!.id })
          .where(eq(devicePairings.codeHash, pairing.codeHash));
      });
      setDeviceCookie(reply, token);
      return reply.code(204).send();
    },
  );

  app.get('/api/kid/me', { preHandler: requireDevice(ctx) }, async () => ({ paired: true }));

  // Телефон сообщает, на каких языках у него есть голоса синтеза речи (для предупреждения родителю).
  app.post(
    '/api/kid/voices',
    { preHandler: requireDevice(ctx), config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const { langs } = parse(kidVoicesRequest, request.body);
      await db
        .update(devices)
        .set({ speechLangs: [...new Set(langs)].sort(), speechCheckedAt: ctx.now() })
        .where(eq(devices.id, request.device!.id));
      return reply.code(204).send();
    },
  );
}
