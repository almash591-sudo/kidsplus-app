import { schema } from '@kidsplus/db';
import { and, eq, gt, isNull, or } from 'drizzle-orm';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { DEVICE_COOKIE_MAX_AGE_S, SESSION_TTL_MS, type Ctx } from './context';
import { randomToken, sha256 } from './lib/crypto';
import { HttpError } from './lib/http';

const {
  parentSessions,
  parentUsers,
  devices,
  families,
  children,
  curricula,
  curriculumDrafts,
  kidCaptures,
  familyPhrases,
  audioTracks,
} = schema;

export const PARENT_COOKIE = 'kp_session';
export const DEVICE_COOKIE = 'kp_device';

const baseCookie = { path: '/api', httpOnly: true, secure: true, sameSite: 'strict' } as const;

export interface ParentPrincipal {
  id: string;
  email: string;
  familyId: string;
  /** Семья, которая ведёт общую библиотеку и модерацию (этап 23). */
  isAdmin: boolean;
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
      .select({
        id: parentUsers.id,
        email: parentUsers.email,
        familyId: parentUsers.familyId,
        isAdmin: families.isAdmin,
      })
      .from(parentSessions)
      .innerJoin(parentUsers, eq(parentUsers.id, parentSessions.userId))
      .innerJoin(families, eq(families.id, parentUsers.familyId))
      .where(
        and(eq(parentSessions.tokenHash, sha256(token)), gt(parentSessions.expiresAt, ctx.now())),
      );
    if (!row) throw new HttpError(401, 'unauthorized', 'сессия истекла, войдите снова');
    request.parent = row;
    await checkFamilyAccess(ctx, request, row);
  };
}

// ─── Семьи (этап 23) ─────────────────────────────────────────────────────────

/** Только семья-администратор: модерация, расходы модели, бэкап, семьи, импорт видео. */
const ADMIN_ONLY = /^\/api\/parent\/(moderation|llm-usage|backup|families|videos)(\/|$)/;
/** Что остальные семьи могут менять: своих детей, телефоны, звонки, голос, аудиотеку. Библиотека — только смотреть. */
const FAMILY_WRITABLE =
  /^\/api\/(calls|parent\/(children|curricula|curriculum-drafts|devices|pairings|captures|family-phrases|audio|push|me|invites|logout|media\/audio))(\/|$)/;

/** PUT общего материала: семье без прав администратора применяется только «каким детям показывать». */
const ASSIGN_ONLY = /^\/api\/parent\/(decks|games|segments)\/:id$/;

/** Ресурс по :id → семья, которой он принадлежит. */
const OWNED_BY_ID: Array<[RegExp, (ctx: Ctx, id: string) => Promise<string | undefined>]> = [
  [
    /^\/api\/parent\/children\/:id/,
    async (ctx, id) =>
      (await ctx.db.select({ f: children.familyId }).from(children).where(eq(children.id, id)))[0]
        ?.f,
  ],
  [
    /^\/api\/parent\/curricula\/:id/,
    async (ctx, id) =>
      (
        await ctx.db
          .select({ f: children.familyId })
          .from(curricula)
          .innerJoin(children, eq(children.id, curricula.childId))
          .where(eq(curricula.id, id))
      )[0]?.f,
  ],
  [
    /^\/api\/parent\/curriculum-drafts\/:id/,
    async (ctx, id) =>
      (
        await ctx.db
          .select({ f: children.familyId })
          .from(curriculumDrafts)
          .innerJoin(children, eq(children.id, curriculumDrafts.childId))
          .where(eq(curriculumDrafts.id, id))
      )[0]?.f,
  ],
  [
    /^\/api\/parent\/devices\/:id/,
    async (ctx, id) =>
      (
        await ctx.db
          .select({ f: children.familyId })
          .from(devices)
          .innerJoin(children, eq(children.id, devices.childId))
          .where(eq(devices.id, id))
      )[0]?.f,
  ],
  [
    /^\/api\/parent\/captures\/:id/,
    async (ctx, id) =>
      (
        await ctx.db
          .select({ f: children.familyId })
          .from(kidCaptures)
          .innerJoin(children, eq(children.id, kidCaptures.childId))
          .where(eq(kidCaptures.id, id))
      )[0]?.f,
  ],
  [
    /^\/api\/parent\/family-phrases\/:id/,
    async (ctx, id) =>
      (
        await ctx.db
          .select({ f: familyPhrases.familyId })
          .from(familyPhrases)
          .where(eq(familyPhrases.id, id))
      )[0]?.f,
  ],
  [
    /^\/api\/parent\/audio\/:id/,
    async (ctx, id) =>
      (
        await ctx.db
          .select({ f: audioTracks.familyId })
          .from(audioTracks)
          .where(eq(audioTracks.id, id))
      )[0]?.f,
  ],
];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Ребёнок принадлежит семье? Чужой и несуществующий неотличимы — оба 404. */
export async function childFamily(ctx: Ctx, childId: string) {
  if (!UUID_RE.test(childId)) return undefined;
  const [row] = await ctx.db
    .select({ f: children.familyId })
    .from(children)
    .where(eq(children.id, childId));
  return row?.f;
}

async function checkFamilyAccess(ctx: Ctx, request: FastifyRequest, parent: ParentPrincipal) {
  const url = request.routeOptions.url ?? '';
  if (!parent.isAdmin) {
    const assign = request.method === 'PUT' && ASSIGN_ONLY.test(url);
    if (ADMIN_ONLY.test(url) || (request.method !== 'GET' && !assign && !FAMILY_WRITABLE.test(url)))
      throw new HttpError(403, 'forbidden', 'это может только семья-администратор');
  }
  const id = (request.params as { id?: unknown } | undefined)?.id;
  if (typeof id === 'string' && UUID_RE.test(id)) {
    const owner = OWNED_BY_ID.find(([re]) => re.test(url));
    if (owner && (await owner[1](ctx, id)) !== parent.familyId)
      throw new HttpError(404, 'not_found', 'не найдено');
  }
  // childId в теле или в query (привязка телефона, снимки и т. п.)
  for (const src of [request.body, request.query]) {
    const childId = (src as { childId?: unknown } | undefined)?.childId;
    if (typeof childId === 'string' && (await childFamily(ctx, childId)) !== parent.familyId)
      throw new HttpError(404, 'not_found', 'ребёнок не найден');
  }
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
