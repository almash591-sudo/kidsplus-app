import { schema } from '@kidsplus/db';
import { gameCategory, gameInput, type Game } from '@kidsplus/shared/api';
import { gameImageIds, gameSpec } from '@kidsplus/shared/games';
import { desc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { requireParent } from '../auth';
import type { Ctx } from '../context';
import { idFrom, notFound, parse } from '../lib/http';
import { assignOnly, childIdsByRef, syncChildItems } from '../services/child-items';
import { assertImages } from '../services/media';

const { interactives } = schema;

/**
 * Игры (п. 5.6 ТЗ): родитель создаёт игру из готовых видов, задаёт параметры
 * (проверяются схемой gameSpec) и назначает детям.
 */
export function gamesRoutes(app: FastifyInstance, ctx: Ctx) {
  const { db } = ctx;
  const preHandler = requireParent(ctx);

  const load = async (id?: string): Promise<Game[]> => {
    const rows = await db
      .select()
      .from(interactives)
      .where(id ? eq(interactives.id, id) : undefined)
      .orderBy(desc(interactives.createdAt), interactives.title);
    const childIds = await childIdsByRef(
      db,
      'interactive',
      rows.map((r) => r.id),
    );
    return rows.flatMap((r) => {
      const spec = gameSpec.safeParse({ ...(r.params as object), kind: r.kind });
      return spec.success
        ? [
            {
              id: r.id,
              title: r.title,
              category: gameCategory(r.category),
              spec: spec.data,
              childIds: childIds.get(r.id) ?? [],
            },
          ]
        : [];
    });
  };
  const one = async (id: string) => {
    const [game] = await load(id);
    if (!game) throw notFound('игра не найдена');
    return game;
  };

  app.get('/api/parent/games', { preHandler }, () => load());

  app.post('/api/parent/games', { preHandler }, async (request, reply): Promise<Game> => {
    const body = parse(gameInput, request.body);
    const { kind, ...params } = body.spec;
    const id = await db.transaction(async (tx) => {
      await assertImages(tx, gameImageIds(body.spec));
      const [row] = await tx
        .insert(interactives)
        .values({ title: body.title, category: body.category, kind, params })
        .returning({ id: interactives.id });
      await syncChildItems(tx, 'interactive', row!.id, body.childIds, request.parent!.familyId);
      return row!.id;
    });
    reply.code(201);
    return one(id);
  });

  app.put('/api/parent/games/:id', { preHandler }, async (request): Promise<Game> => {
    const id = idFrom(request.params);
    const body = parse(gameInput, request.body);
    if (!request.parent!.isAdmin) {
      await assignOnly(db, 'interactive', id, body.childIds, request.parent!.familyId);
      return one(id);
    }
    const { kind, ...params } = body.spec;
    await db.transaction(async (tx) => {
      await assertImages(tx, gameImageIds(body.spec));
      const [row] = await tx
        .update(interactives)
        .set({ title: body.title, category: body.category, kind, params })
        .where(eq(interactives.id, id))
        .returning({ id: interactives.id });
      if (!row) throw notFound('игра не найдена');
      await syncChildItems(tx, 'interactive', id, body.childIds, request.parent!.familyId);
    });
    return one(id);
  });

  app.delete('/api/parent/games/:id', { preHandler }, async (request, reply) => {
    const id = idFrom(request.params);
    const [row] = await db
      .delete(interactives)
      .where(eq(interactives.id, id))
      .returning({ id: interactives.id });
    if (!row) throw notFound('игра не найдена');
    return reply.code(204).send();
  });
}
