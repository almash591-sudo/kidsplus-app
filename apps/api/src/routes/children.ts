import { schema } from '@kidsplus/db';
import { childInput, type Child } from '@kidsplus/shared/api';
import { asc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { requireParent } from '../auth';
import type { Ctx } from '../context';
import { HttpError, idFrom, notFound, parse } from '../lib/http';
import { kidPhrases } from './kid';

const { children } = schema;

export const toChild = (c: typeof children.$inferSelect): Child => ({
  id: c.id,
  nickname: c.nickname,
  birthYear: c.birthYear,
  birthMonth: c.birthMonth,
  gender: c.gender,
  languages: c.languages as Child['languages'],
  quizOptions: c.quizOptions,
  quizQuestions: c.quizQuestions,
  foreignImmersion: c.foreignImmersion,
  illustrations: c.illustrations,
  createdAt: c.createdAt.toISOString(),
});

export function childrenRoutes(app: FastifyInstance, ctx: Ctx) {
  const { db } = ctx;
  const preHandler = requireParent(ctx);

  function parseChild(body: unknown) {
    const input = parse(childInput, body);
    const now = ctx.now();
    const future =
      input.birthYear > now.getFullYear() ||
      (input.birthYear === now.getFullYear() && input.birthMonth > now.getMonth() + 1);
    if (future) throw new HttpError(400, 'validation', 'дата рождения в будущем');
    return { ...input, languages: [...new Set(input.languages)] };
  }

  app.get('/api/parent/children', { preHandler }, async (request): Promise<Child[]> => {
    const rows = await db
      .select()
      .from(children)
      .where(eq(children.familyId, request.parent!.familyId))
      .orderBy(asc(children.createdAt));
    return rows.map(toChild);
  });

  app.post('/api/parent/children', { preHandler }, async (request, reply): Promise<Child> => {
    const [row] = await db
      .insert(children)
      .values({ ...parseChild(request.body), familyId: request.parent!.familyId })
      .returning();
    // Озвучка похвалы для рода ребёнка ставится в очередь заранее.
    await kidPhrases(db, ctx.config.tts, row!.gender);
    reply.code(201);
    return toChild(row!);
  });

  app.put('/api/parent/children/:id', { preHandler }, async (request): Promise<Child> => {
    const id = idFrom(request.params);
    const [row] = await db
      .update(children)
      .set(parseChild(request.body))
      .where(eq(children.id, id))
      .returning();
    if (!row) throw notFound('ребёнок не найден');
    await kidPhrases(db, ctx.config.tts, row.gender);
    return toChild(row);
  });

  // Удаление каскадом убирает устройства, списки фрагментов и события ребёнка.
  app.delete('/api/parent/children/:id', { preHandler }, async (request, reply) => {
    const id = idFrom(request.params);
    const [row] = await db
      .delete(children)
      .where(eq(children.id, id))
      .returning({ id: children.id });
    if (!row) throw notFound('ребёнок не найден');
    return reply.code(204).send();
  });
}
