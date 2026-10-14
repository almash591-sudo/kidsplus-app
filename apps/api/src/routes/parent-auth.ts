import { schema, type Db } from '@kidsplus/db';
import {
  familyInviteRequest,
  inviteAcceptRequest,
  type FamiliesOverview,
  loginRequest,
  setupRequest,
  type InviteCreated,
  type ParentMe,
} from '@kidsplus/shared/api';
import { and, asc, count, eq, gt, isNull } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { endParentSession, requireParent, startParentSession } from '../auth';
import { FAMILY_INVITE_TTL_MS, INVITE_TTL_MS, MAX_PARENTS, type Ctx } from '../context';
import { randomToken, safeEqual, sha256 } from '../lib/crypto';
import { HttpError, parse } from '../lib/http';
import { hashPassword, verifyDummy, verifyPassword } from '../lib/password';

const { parentUsers, parentInvites, families, children } = schema;

/** Не больше 10 попыток в минуту с одного IP. */
const strictLimit = { rateLimit: { max: 10, timeWindow: '1 minute' } };

export function parentAuthRoutes(app: FastifyInstance, ctx: Ctx) {
  const { db } = ctx;
  const auth = requireParent(ctx);

  const parentCount = async () => (await db.select({ n: count() }).from(parentUsers))[0]?.n ?? 0;
  const familyParents = async (familyId: string) =>
    (await db.select({ n: count() }).from(parentUsers).where(eq(parentUsers.familyId, familyId)))[0]
      ?.n ?? 0;

  async function createParent(
    exec: Pick<Db, 'select' | 'insert'>,
    email: string,
    passwordHash: string,
    familyId?: string,
  ) {
    const existing = await exec
      .select({ id: parentUsers.id })
      .from(parentUsers)
      .where(eq(parentUsers.email, email));
    if (existing.length) throw new HttpError(409, 'email_taken', 'этот email уже зарегистрирован');
    const [user] = await exec
      .insert(parentUsers)
      .values({ email, passwordHash, ...(familyId ? { familyId } : {}) })
      .returning({ id: parentUsers.id, email: parentUsers.email });
    return user!;
  }

  // Доступна ли первичная настройка (для страницы /setup).
  app.get('/api/parent/setup', async () => ({
    available: Boolean(ctx.config.setupToken) && (await parentCount()) === 0,
  }));

  app.post(
    '/api/parent/setup',
    { config: strictLimit },
    async (request, reply): Promise<ParentMe> => {
      const body = parse(setupRequest, request.body);
      const expected = ctx.config.setupToken;
      if (!expected) throw new HttpError(404, 'not_found', 'первичная настройка отключена');
      if (!safeEqual(body.token, expected))
        throw new HttpError(403, 'invalid_token', 'неверная ссылка настройки');
      if ((await parentCount()) > 0)
        throw new HttpError(409, 'already_setup', 'аккаунт уже создан, войдите');
      const user = await createParent(db, body.email, await hashPassword(body.password));
      await startParentSession(ctx, reply, user.id);
      return user;
    },
  );

  app.post(
    '/api/parent/login',
    { config: strictLimit },
    async (request, reply): Promise<ParentMe> => {
      const body = parse(loginRequest, request.body);
      const [user] = await db.select().from(parentUsers).where(eq(parentUsers.email, body.email));
      const ok = user
        ? await verifyPassword(user.passwordHash, body.password)
        : await verifyDummy(body.password);
      if (!user || !ok)
        throw new HttpError(401, 'invalid_credentials', 'неверный email или пароль');
      await startParentSession(ctx, reply, user.id);
      return { id: user.id, email: user.email };
    },
  );

  app.post('/api/parent/logout', async (request, reply) => {
    await endParentSession(ctx, request, reply);
    return reply.code(204).send();
  });

  app.get('/api/parent/me', { preHandler: auth }, async (request): Promise<ParentMe> => {
    const [u] = await db
      .select({ displayName: parentUsers.displayName })
      .from(parentUsers)
      .where(eq(parentUsers.id, request.parent!.id));
    const { id, email, isAdmin } = request.parent!;
    return { id, email, isAdmin, displayName: u?.displayName ?? null };
  });

  // Приглашение второго родителя: одноразовая ссылка на 24 часа.
  app.post('/api/parent/invites', { preHandler: auth }, async (request): Promise<InviteCreated> => {
    const [fp] = await db
      .select({ n: count() })
      .from(parentUsers)
      .where(eq(parentUsers.familyId, request.parent!.familyId));
    if ((fp?.n ?? 0) >= MAX_PARENTS) {
      throw new HttpError(
        409,
        'parents_limit',
        `можно создать не больше ${MAX_PARENTS} родительских аккаунтов`,
      );
    }
    const token = randomToken();
    const expiresAt = new Date(ctx.now().getTime() + INVITE_TTL_MS);
    await db
      .insert(parentInvites)
      .values({ tokenHash: sha256(token), createdBy: request.parent!.id, expiresAt });
    return { token, expiresAt: expiresAt.toISOString() };
  });

  app.post(
    '/api/parent/invites/accept',
    { config: strictLimit },
    async (request, reply): Promise<ParentMe> => {
      const body = parse(inviteAcceptRequest, request.body);
      // Лимит родителей в семье проверяется до приглашения: так ошибка понятнее.
      const [pending] = await db
        .select({ newFamily: parentInvites.newFamily, familyId: parentUsers.familyId })
        .from(parentInvites)
        .innerJoin(parentUsers, eq(parentUsers.id, parentInvites.createdBy))
        .where(eq(parentInvites.tokenHash, sha256(body.token)));
      if (pending && !pending.newFamily && (await familyParents(pending.familyId)) >= MAX_PARENTS)
        throw new HttpError(
          409,
          'parents_limit',
          `в семье может быть не больше ${MAX_PARENTS} родительских аккаунтов`,
        );
      const passwordHash = await hashPassword(body.password);
      // В одной транзакции: приглашение помечается использованным, только если аккаунт создан.
      const user = await db.transaction(async (tx) => {
        const [invite] = await tx
          .update(parentInvites)
          .set({ usedAt: ctx.now() })
          .where(
            and(
              eq(parentInvites.tokenHash, sha256(body.token)),
              isNull(parentInvites.usedAt),
              gt(parentInvites.expiresAt, ctx.now()),
            ),
          )
          .returning({
            newFamily: parentInvites.newFamily,
            familyName: parentInvites.familyName,
            createdBy: parentInvites.createdBy,
          });
        if (!invite)
          throw new HttpError(403, 'invalid_token', 'приглашение недействительно или истекло');
        let familyId: string;
        if (invite.newFamily) {
          const [fam] = await tx
            .insert(families)
            .values({ name: invite.familyName ?? 'Семья' })
            .returning({ id: families.id });
          familyId = fam!.id;
        } else {
          const [inviter] = await tx
            .select({ familyId: parentUsers.familyId })
            .from(parentUsers)
            .where(eq(parentUsers.id, invite.createdBy));
          if (!inviter) throw new HttpError(403, 'invalid_token', 'приглашение недействительно');
          familyId = inviter.familyId;
          const [n] = await tx
            .select({ n: count() })
            .from(parentUsers)
            .where(eq(parentUsers.familyId, familyId));
          if ((n?.n ?? 0) >= MAX_PARENTS)
            throw new HttpError(
              409,
              'parents_limit',
              `в семье может быть не больше ${MAX_PARENTS} родительских аккаунтов`,
            );
        }
        return createParent(tx, body.email, passwordHash, familyId);
      });
      await startParentSession(ctx, reply, user.id);
      return user;
    },
  );

  // ─── Семьи (этап 23): только семья-администратор (проверка — в requireParent) ───

  app.get('/api/parent/families', { preHandler: auth }, async (): Promise<FamiliesOverview> => {
    const rows = await db.select().from(families).orderBy(asc(families.createdAt));
    const parents = await db
      .select({ f: parentUsers.familyId, n: count() })
      .from(parentUsers)
      .groupBy(parentUsers.familyId);
    const kids = await db
      .select({ f: children.familyId, n: count() })
      .from(children)
      .groupBy(children.familyId);
    const pending = await db
      .select()
      .from(parentInvites)
      .where(
        and(
          eq(parentInvites.newFamily, true),
          isNull(parentInvites.usedAt),
          gt(parentInvites.expiresAt, ctx.now()),
        ),
      )
      .orderBy(asc(parentInvites.createdAt));
    return {
      families: rows.map((f) => ({
        id: f.id,
        name: f.name,
        isAdmin: f.isAdmin,
        parents: parents.find((p) => p.f === f.id)?.n ?? 0,
        children: kids.find((k) => k.f === f.id)?.n ?? 0,
        createdAt: f.createdAt.toISOString(),
      })),
      pending: pending.map((i) => ({
        name: i.familyName ?? 'Семья',
        createdAt: i.createdAt.toISOString(),
        expiresAt: i.expiresAt.toISOString(),
      })),
    };
  });

  // Приглашение новой семьи: одноразовая ссылка на 14 дней, по ней создаётся отдельный кабинет.
  app.post(
    '/api/parent/families/invites',
    { preHandler: auth },
    async (request): Promise<InviteCreated> => {
      const body = parse(familyInviteRequest, request.body);
      const token = randomToken();
      const expiresAt = new Date(ctx.now().getTime() + FAMILY_INVITE_TTL_MS);
      await db.insert(parentInvites).values({
        tokenHash: sha256(token),
        createdBy: request.parent!.id,
        expiresAt,
        newFamily: true,
        familyName: body.name,
      });
      return { token, expiresAt: expiresAt.toISOString() };
    },
  );
}
