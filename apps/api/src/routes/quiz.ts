import { schema, type Db } from '@kidsplus/db';
import { questionInput, type Language, type Question } from '@kidsplus/shared/api';
import { asc, eq, inArray, max } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { z } from 'zod';
import { requireParent } from '../auth';
import type { Ctx } from '../context';
import { idFrom, notFound, parse } from '../lib/http';
import { assertImages, ensureTts, loadAssets, toMediaRef } from '../services/media';

const { quizQuestions, quizOptions, videoSegments } = schema;

/** Вопросы с вариантами и состоянием озвучки — в порядке добавления. */
export async function loadQuestions(
  db: Pick<Db, 'select'>,
  where: ReturnType<typeof eq>,
): Promise<Question[]> {
  const questions = await db
    .select()
    .from(quizQuestions)
    .where(where)
    .orderBy(asc(quizQuestions.position));
  if (!questions.length) return [];
  const options = await db
    .select()
    .from(quizOptions)
    .where(
      inArray(
        quizOptions.questionId,
        questions.map((q) => q.id),
      ),
    )
    .orderBy(asc(quizOptions.position));
  const assets = await loadAssets(db, [
    ...questions.map((q) => q.promptAudioId),
    ...options.map((o) => o.imageId),
  ]);
  return questions.map((q) => ({
    id: q.id,
    segmentId: q.segmentId,
    prompt: q.prompt,
    lang: q.lang as Language,
    audio:
      q.promptAudioId && assets.get(q.promptAudioId)
        ? toMediaRef(assets.get(q.promptAudioId)!)
        : null,
    options: options
      .filter((o) => o.questionId === q.id)
      .map((o) => ({
        id: o.id,
        label: o.label,
        isCorrect: o.isCorrect,
        image: toMediaRef(assets.get(o.imageId)!),
      })),
  }));
}

/** Вопрос с вариантами в конец списка фрагмента; озвучка вопроса ставится в очередь. */
export async function insertQuestion(
  tx: Pick<Db, 'select' | 'insert'>,
  tts: Ctx['config']['tts'],
  segmentId: string,
  body: z.output<typeof questionInput>,
): Promise<string> {
  await assertImages(
    tx,
    body.options.map((o) => o.imageId),
  );
  const [last] = await tx
    .select({ pos: max(quizQuestions.position) })
    .from(quizQuestions)
    .where(eq(quizQuestions.segmentId, segmentId));
  const [q] = await tx
    .insert(quizQuestions)
    .values({
      segmentId,
      prompt: body.prompt,
      lang: body.lang,
      promptAudioId: await ensureTts(tx, tts, body.prompt, body.lang),
      position: (last?.pos ?? -1) + 1,
    })
    .returning({ id: quizQuestions.id });
  await tx
    .insert(quizOptions)
    .values(body.options.map((o, position) => ({ ...o, questionId: q!.id, position })));
  return q!.id;
}

export function quizRoutes(app: FastifyInstance, ctx: Ctx) {
  const { db } = ctx;
  const preHandler = requireParent(ctx);

  app.get('/api/parent/segments/:id/questions', { preHandler }, async (request) => {
    const segmentId = idFrom(request.params);
    return loadQuestions(db, eq(quizQuestions.segmentId, segmentId));
  });

  app.post(
    '/api/parent/segments/:id/questions',
    { preHandler },
    async (request, reply): Promise<Question> => {
      const segmentId = idFrom(request.params);
      const body = parse(questionInput, request.body);
      const id = await db.transaction(async (tx) => {
        const [segment] = await tx
          .select({ id: videoSegments.id })
          .from(videoSegments)
          .where(eq(videoSegments.id, segmentId));
        if (!segment) throw notFound('фрагмент не найден');
        return insertQuestion(tx, ctx.config.tts, segmentId, body);
      });
      reply.code(201);
      return (await loadQuestions(db, eq(quizQuestions.id, id)))[0]!;
    },
  );

  app.put('/api/parent/questions/:id', { preHandler }, async (request): Promise<Question> => {
    const id = idFrom(request.params);
    const body = parse(questionInput, request.body);
    await db.transaction(async (tx) => {
      await assertImages(
        tx,
        body.options.map((o) => o.imageId),
      );
      const [q] = await tx
        .update(quizQuestions)
        .set({
          prompt: body.prompt,
          lang: body.lang,
          promptAudioId: await ensureTts(tx, ctx.config.tts, body.prompt, body.lang),
        })
        .where(eq(quizQuestions.id, id))
        .returning({ id: quizQuestions.id });
      if (!q) throw notFound('вопрос не найден');
      await tx.delete(quizOptions).where(eq(quizOptions.questionId, id));
      await tx
        .insert(quizOptions)
        .values(body.options.map((o, position) => ({ ...o, questionId: id, position })));
    });
    return (await loadQuestions(db, eq(quizQuestions.id, id)))[0]!;
  });

  app.delete('/api/parent/questions/:id', { preHandler }, async (request, reply) => {
    const id = idFrom(request.params);
    const [row] = await db
      .delete(quizQuestions)
      .where(eq(quizQuestions.id, id))
      .returning({ id: quizQuestions.id });
    if (!row) throw notFound('вопрос не найден');
    return reply.code(204).send();
  });
}
