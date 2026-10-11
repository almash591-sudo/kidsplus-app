import { schema, type Db } from '@kidsplus/db';
import {
  inviteAcceptRequest,
  loginRequest,
  setupRequest,
  type InviteCreated,
  type ParentMe,
} from '@kidsplus/shared/api';
import { and, count, eq, gt, isNull } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { endParentSession, requireParent, startParentSession } from '../auth';
import { INVITE_TTL_MS, MAX_PARENTS, type Ctx } from '../context';
import { randomToken, safeEqual, sha256 } from '../lib/crypto';
import { HttpError, parse } from '../lib/http';
import { hashPassword, verifyDummy, verifyPassword } from '../lib/password';

const { parentUsers, parentInvites } = schema;

/** Не больше 10 попыток в минуту с одного IP. */
const strictLimit = { rateLimit: { max: 10, timeWindow: '1 minute' } };

export function parentAuthRoutes(app: FastifyInstance, ctx: Ctx) {
  const { db } = ctx;
  const auth = requireParent(ctx);

  const parentCount = async () => (await db.select({ n: count() }).from(parentUsers))[0]?.n ?? 0;

  async function createParent(
    exec: Pick<Db, 'select' | 'insert'>,
    email: string,
    passwordHash: string,
  ) {
    const existing = await exec
      .select({ id: parentUsers.id })
      .from(parentUsers)
      .where(eq(parentUsers.email, email));
    if (existing.length) throw new HttpError(409, 'email_taken', 'этот email уже зарегистрирован');
    const [user] = await exec
      .insert(parentUsers)
      .values({ email, passwordHash })
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
    return { ...request.parent!, displayName: u?.displayName ?? null };
  });

  // Приглашение второго родителя: одноразовая ссылка на 24 часа.
  app.post('/api/parent/invites', { preHandler: auth }, async (request): Promise<InviteCreated> => {
    if ((await parentCount()) >= MAX_PARENTS) {
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
      if ((await parentCount()) >= MAX_PARENTS) {
        throw new HttpError(
          409,
          'parents_limit',
          `можно создать не больше ${MAX_PARENTS} родительских аккаунтов`,
        );
      }
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
          .returning({ tokenHash: parentInvites.tokenHash });
        if (!invite)
          throw new HttpError(403, 'invalid_token', 'приглашение недействительно или истекло');
        return createParent(tx, body.email, passwordHash);
      });
      await startParentSession(ctx, reply, user.id);
      return user;
    },
  );
}
