import { schema } from '@kidsplus/db';
import {
  gameCategory,
  childItemsOrderRequest,
  segmentCreateRequest,
  segmentUpdateRequest,
  type ChildItem,
  type Segment,
  type VideoLookup,
} from '@kidsplus/shared/api';
import { parseYouTubeId, parseYouTubeStart } from '@kidsplus/shared/youtube';
import { and, asc, count, desc, eq, inArray } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireParent } from '../auth';
import type { Ctx } from '../context';
import { HttpError, idFrom, notFound, parse } from '../lib/http';
import { childIdsByRef, syncChildItems } from '../services/child-items';
import { fetchYouTubeOEmbed } from '../services/oembed';

const { childItems, quizQuestions, videoSegments, videoSources } = schema;

function youtubeIdOrThrow(url: string): string {
  const id = parseYouTubeId(url);
  if (!id) throw new HttpError(400, 'validation', 'это не ссылка на видео YouTube');
  return id;
}

export function videosRoutes(app: FastifyInstance, ctx: Ctx) {
  const { db } = ctx;
  const parentOnly = requireParent(ctx);

  async function loadSegments(where?: ReturnType<typeof eq>): Promise<Segment[]> {
    const rows = await db
      .select({ segment: videoSegments, source: videoSources })
      .from(videoSegments)
      .innerJoin(videoSources, eq(videoSources.id, videoSegments.sourceId))
      .where(where)
      .orderBy(desc(videoSegments.createdAt));
    if (!rows.length) return [];
    const ids = rows.map((r) => r.segment.id);
    const childIds = await childIdsByRef(db, 'segment', ids);
    const questionCounts = await db
      .select({ segmentId: quizQuestions.segmentId, n: count() })
      .from(quizQuestions)
      .where(inArray(quizQuestions.segmentId, ids))
      .groupBy(quizQuestions.segmentId);
    return rows.map(({ segment: s, source: v }) => ({
      id: s.id,
      title: s.title,
      startSec: s.startSec,
      endSec: s.endSec,
      createdAt: s.createdAt.toISOString(),
      source: {
        provider: 'youtube',
        externalId: v.externalId,
        title: v.title,
        channelTitle: v.channelTitle,
        thumbnailUrl: v.thumbnailUrl,
        status: v.status,
        statusReason: v.statusReason,
      },
      childIds: childIds.get(s.id) ?? [],
      questionCount: questionCounts.find((q) => q.segmentId === s.id)?.n ?? 0,
      subject: s.subject ? gameCategory(s.subject) : null,
    }));
  }

  // Метаданные по ссылке — для формы добавления.
  app.get(
    '/api/parent/videos/lookup',
    { preHandler: parentOnly },
    async (request): Promise<VideoLookup> => {
      const { url } = parse(z.object({ url: z.string().min(1).max(500) }), request.query);
      const externalId = youtubeIdOrThrow(url);
      const info = await fetchYouTubeOEmbed(ctx.fetch, externalId);
      return {
        provider: 'youtube',
        externalId,
        ...info,
        suggestedStartSec: parseYouTubeStart(url),
      };
    },
  );

  app.get('/api/parent/segments', { preHandler: parentOnly }, () => loadSegments());

  app.post(
    '/api/parent/segments',
    { preHandler: parentOnly },
    async (request, reply): Promise<Segment> => {
      const body = parse(segmentCreateRequest, request.body);
      const externalId = youtubeIdOrThrow(body.url);
      // Проверяем встраивание и обновляем метаданные при каждом добавлении.
      const info = await fetchYouTubeOEmbed(ctx.fetch, externalId);

      const id = await db.transaction(async (tx) => {
        const [source] = await tx
          .insert(videoSources)
          .values({ provider: 'youtube', externalId, ...info, statusCheckedAt: ctx.now() })
          .onConflictDoUpdate({
            target: [videoSources.provider, videoSources.externalId],
            set: { ...info, status: 'available', statusReason: null, statusCheckedAt: ctx.now() },
          })
          .returning({ id: videoSources.id });
        const [segment] = await tx
          .insert(videoSegments)
          .values({
            sourceId: source!.id,
            title: body.title,
            startSec: body.startSec,
            endSec: body.endSec,
            subject: body.subject,
            createdBy: request.parent!.id,
          })
          .returning({ id: videoSegments.id });
        await syncChildItems(tx, 'segment', segment!.id, body.childIds);
        return segment!.id;
      });

      reply.code(201);
      return (await loadSegments(eq(videoSegments.id, id)))[0]!;
    },
  );

  app.put(
    '/api/parent/segments/:id',
    { preHandler: parentOnly },
    async (request): Promise<Segment> => {
      const id = idFrom(request.params);
      const body = parse(segmentUpdateRequest, request.body);
      await db.transaction(async (tx) => {
        const [row] = await tx
          .update(videoSegments)
          .set({
            title: body.title,
            startSec: body.startSec,
            endSec: body.endSec,
            subject: body.subject,
          })
          .where(eq(videoSegments.id, id))
          .returning({ id: videoSegments.id });
        if (!row) throw notFound('фрагмент не найден');
        await syncChildItems(tx, 'segment', id, body.childIds);
      });
      return (await loadSegments(eq(videoSegments.id, id)))[0]!;
    },
  );

  app.delete('/api/parent/segments/:id', { preHandler: parentOnly }, async (request, reply) => {
    const id = idFrom(request.params);
    const [row] = await db
      .delete(videoSegments)
      .where(eq(videoSegments.id, id))
      .returning({ id: videoSegments.id });
    if (!row) throw notFound('фрагмент не найден');
    return reply.code(204).send();
  });

  // Список ребёнка (видео, наборы карточек и игры) в порядке показа.
  app.get(
    '/api/parent/children/:id/items',
    { preHandler: parentOnly },
    async (request): Promise<ChildItem[]> => {
      const childId = idFrom(request.params);
      const rows = await db
        .select()
        .from(childItems)
        .where(eq(childItems.childId, childId))
        .orderBy(asc(childItems.position));
      return rows.map((r) => ({
        id: r.id,
        kind: r.kind,
        refId: (r.segmentId ?? r.deckId ?? r.interactiveId)!,
      }));
    },
  );

  // Новый порядок: должен содержать ровно те же пункты, что уже есть в списке.
  app.put('/api/parent/children/:id/items', { preHandler: parentOnly }, async (request, reply) => {
    const childId = idFrom(request.params);
    const { itemIds } = parse(childItemsOrderRequest, request.body);
    await db.transaction(async (tx) => {
      const current = await tx
        .select({ id: childItems.id })
        .from(childItems)
        .where(eq(childItems.childId, childId));
      const have = new Set(current.map((c) => c.id));
      const same =
        itemIds.length === have.size &&
        new Set(itemIds).size === have.size &&
        itemIds.every((s) => have.has(s));
      if (!same) throw new HttpError(400, 'validation', 'список не совпадает с текущим');
      for (const [position, id] of itemIds.entries()) {
        await tx
          .update(childItems)
          .set({ position })
          .where(and(eq(childItems.childId, childId), eq(childItems.id, id)));
      }
    });
    return reply.code(204).send();
  });

  // Повторная проверка видео, помеченного недоступным (после ошибки плеера у ребёнка).
  app.post(
    '/api/parent/segments/:id/recheck',
    { preHandler: parentOnly },
    async (request): Promise<Segment> => {
      const id = idFrom(request.params);
      const [row] = await db
        .select({ sourceId: videoSources.id, externalId: videoSources.externalId })
        .from(videoSegments)
        .innerJoin(videoSources, eq(videoSources.id, videoSegments.sourceId))
        .where(eq(videoSegments.id, id));
      if (!row) throw notFound('фрагмент не найден');
      const info = await fetchYouTubeOEmbed(ctx.fetch, row.externalId).catch((err: unknown) => {
        if (err instanceof HttpError && err.statusCode === 422) return null;
        throw err;
      });
      await db
        .update(videoSources)
        .set(
          info
            ? { ...info, status: 'available', statusReason: null, statusCheckedAt: ctx.now() }
            : {
                status: 'unavailable',
                statusReason: 'oembed_unavailable',
                statusCheckedAt: ctx.now(),
              },
        )
        .where(eq(videoSources.id, row.sourceId));
      return (await loadSegments(eq(videoSegments.id, id)))[0]!;
    },
  );
}
