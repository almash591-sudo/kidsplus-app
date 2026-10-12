import { schema } from '@kidsplus/db';
import { and, eq, gt, isNull, or } from 'drizzle-orm';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { DEVICE_COOKIE_MAX_AGE_S, SESSION_TTL_MS, type Ctx } from './context';
import { randomToken, sha256 } from './lib/crypto';
import { HttpError } from './lib/http';

const { parentSessions, parentUsers, devices } = schema;

export const PARENT_COOKIE = 'kp_session';
export const DEVICE_COOKIE = 'kp_device';

const baseCookie = { path: '/api', httpOnly: true, secure: true, sameSite: 'strict' } as const;

export interface ParentPrincipal {
  id: string;
  email: string;
}
export interface DevicePrincipal {
  id: string;
  childId: string;
  /** Просмотр из кабинета: ничего не записывается (этап 16а). */
  preview: boolean;
}

declare module 'fastify' {
  interface FastifyRequest {
    parent: ParentPrincipal | null;
    device: DevicePrincipal | null;
  }
}

// ─── Родитель ────────────────────────────────────────────────────────────────

export async function startParentSession(ctx: Ctx, reply: FastifyReply, userId: string) {
  const token = randomToken();
  await ctx.db.insert(parentSessions).values({
    tokenHash: sha256(token),
    userId,
    expiresAt: new Date(ctx.now().getTime() + SESSION_TTL_MS),
  });
  reply.setCookie(PARENT_COOKIE, token, { ...baseCookie, maxAge: SESSION_TTL_MS / 1000 });
}

export async function endParentSession(ctx: Ctx, request: FastifyRequest, reply: FastifyReply) {
  const token = request.cookies[PARENT_COOKIE];
  if (token) await ctx.db.delete(parentSessions).where(eq(parentSessions.tokenHash, sha256(token)));
  reply.clearCookie(PARENT_COOKIE, baseCookie);
}

/** preHandler: пускает только с действующей сессией родителя. */
export function requireParent(ctx: Ctx) {
  return async (request: FastifyRequest) => {
    const token = request.cookies[PARENT_COOKIE];
    if (!token) throw new HttpError(401, 'unauthorized', 'нужно войти');
    const [row] = await ctx.db
      .select({ id: parentUsers.id, email: parentUsers.email })
      .from(parentSessions)
      .innerJoin(parentUsers, eq(parentUsers.id, parentSessions.userId))
      .where(
        and(eq(parentSessions.tokenHash, sha256(token)), gt(parentSessions.expiresAt, ctx.now())),
      );
    if (!row) throw new HttpError(401, 'unauthorized', 'сессия истекла, войдите снова');
    request.parent = row;
  };
}

// ─── Устройство ребёнка ──────────────────────────────────────────────────────

export function setDeviceCookie(reply: FastifyReply, token: string) {
  reply.setCookie(DEVICE_COOKIE, token, { ...baseCookie, maxAge: DEVICE_COOKIE_MAX_AGE_S });
}

/** Отметка «был в сети» обновляется не чаще раза в 5 минут. */
const LAST_SEEN_THROTTLE_MS = 5 * 60 * 1000;

/** preHandler: пускает только привязанное и не отозванное устройство. */
export function requireDevice(ctx: Ctx) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const token = request.cookies[DEVICE_COOKIE];
    if (!token) throw new HttpError(401, 'not_paired', 'устройство не привязано');
    const [row] = await ctx.db
      .select({
        id: devices.id,
        childId: devices.childId,
        lastSeenAt: devices.lastSeenAt,
        preview: devices.preview,
      })
      .from(devices)
      // Просмотр из кабинета отзывается заранее (revokedAt — через 2 часа) и до того работает.
      .where(
        and(
          eq(devices.tokenHash, sha256(token)),
          or(isNull(devices.revokedAt), gt(devices.revokedAt, ctx.now())),
        ),
      );
    if (!row) {
      reply.clearCookie(DEVICE_COOKIE, baseCookie);
      throw new HttpError(401, 'not_paired', 'устройство не привязано');
    }
    const now = ctx.now();
    if (!row.lastSeenAt || now.getTime() - row.lastSeenAt.getTime() > LAST_SEEN_THROTTLE_MS) {
      await ctx.db.update(devices).set({ lastSeenAt: now }).where(eq(devices.id, row.id));
      setDeviceCookie(reply, token); // продлеваем срок cookie
    }
    request.device = { id: row.id, childId: row.childId, preview: row.preview };
  };
}

/** preHandler для общих ресурсов (медиа): пускает и родителя, и привязанное устройство. */
export function requireParentOrDevice(ctx: Ctx) {
  const parent = requireParent(ctx);
  const device = requireDevice(ctx);
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (request.cookies[PARENT_COOKIE]) {
      try {
        return await parent(request);
      } catch {
        // сессия родителя истекла — пробуем cookie устройства
      }
    }
    return device(request, reply);
  };
}
