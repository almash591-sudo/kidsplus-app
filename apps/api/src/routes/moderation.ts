// Очередь модерации (п. 6.1.5 и 7.1 ТЗ). Родитель добавляет ссылку — видео попадает в очередь,
// worker готовит отчёт модели, родитель правит и одобряет. Ребёнку — только одобренное.
import { schema, type Db } from '@kidsplus/db';
import { tokenUsage } from '@kidsplus/db/llm-usage';
import type { YouTubeVideoDetails } from '@kidsplus/providers';
import {
  moderationAddRequest,
  moderationApproveRequest,
  type LlmUsageSummary,
  type ModerationAddResult,
  type ModerationItem,
  type ModerationReport,
  type ModerationStatus,
} from '@kidsplus/shared/moderation';
import { parseYouTubeTarget } from '@kidsplus/shared/youtube';
import { and, desc, eq, inArray } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { requireParent } from '../auth';
import type { Ctx } from '../context';
import { HttpError, idFrom, notFound, parse } from '../lib/http';
import { syncChildItems } from '../services/child-items';
import { fetchYouTubeOEmbed } from '../services/oembed';
import { insertQuestion } from './quiz';

const { appMeta, moderationItems, videoSegments, videoSources } = schema;

/** Видео канала или плейлиста за одно добавление — не больше. */
const MAX_FROM_LIST = 25;
const MODERATION_STATUS_KEY = 'moderation_worker';

/** Метаданные видео в очереди (jsonb). */
interface StoredMetadata {
  title: string;
  description?: string;
  channelTitle: string | null;
  durationSec: number | null;
  madeForKids: boolean | null;
  thumbnailUrl: string | null;
}

type Row = typeof moderationItems.$inferSelect;

function toItem(r: Row): ModerationItem {
  const m = (r.metadata ?? {}) as Partial<StoredMetadata>;
  return {
    id: r.id,
    status: r.status,
    externalId: r.externalId,
    url: r.url,
    title: m.title ?? null,
    channelTitle: m.channelTitle ?? null,
    thumbnailUrl: m.thumbnailUrl ?? null,
    durationSec: m.durationSec ?? null,
    madeForKids: m.madeForKids ?? null,
    topic: r.topic,
    skipReason: r.skipReason,
    error: r.error,
    report: (r.report as unknown as ModerationReport | null) ?? null,
    createdAt: r.createdAt.toISOString(),
  };
}

/** Почему видео не отправляется на анализ (или null — отправляется). */
export function skipReason(d: YouTubeVideoDetails, maxVideoSec: number): string | null {
  if (d.privacyStatus !== 'public') return 'видео не публичное — модель не сможет его посмотреть';
  if (!d.embeddable) return 'владелец запретил встраивание видео';
  if (d.regionBlocked) return 'видео недоступно в вашем регионе';
  if (d.durationSec > 0 && d.durationSec < 60) return 'видео короче минуты';
  if (d.durationSec > maxVideoSec) return `видео длиннее ${Math.round(maxVideoSec / 60)} минут`;
  return null;
}

export function moderationRoutes(app: FastifyInstance, ctx: Ctx) {
  const { db } = ctx;
  const preHandler = requireParent(ctx);

  /** ID видео по ссылке: видео, плейлист или канал (два последних — только с ключом YouTube). */
  async function resolveIds(url: string): Promise<string[]> {
    const target = parseYouTubeTarget(url);
    if (!target)
      throw new HttpError(400, 'validation', 'это не ссылка на видео, плейлист или канал YouTube');
    if (target.kind === 'video') return [target.id];
    if (!ctx.youtube) {
      throw new HttpError(
        422,
        'youtube_key_required',
        'для плейлистов и каналов нужен ключ YouTube Data API — пока добавляйте видео по одному',
      );
    }
    const playlist =
      target.kind === 'playlist'
        ? target.id
        : await ctx.youtube.channelUploadsPlaylist(
            'handle' in target ? { handle: target.handle } : { id: target.id },
          );
    if (!playlist) throw new HttpError(422, 'channel_not_found', 'канал не найден');
    return ctx.youtube.playlistVideoIds(playlist, MAX_FROM_LIST);
  }

  /** Метаданные: YouTube Data API, без ключа — oEmbed (без длительности и «для детей»). */
  async function metadataFor(
    ids: string[],
  ): Promise<Map<string, { meta: StoredMetadata | null; skip: string | null }>> {
    const out = new Map<string, { meta: StoredMetadata | null; skip: string | null }>();
    if (ctx.youtube) {
      const details = new Map((await ctx.youtube.videos(ids)).map((d) => [d.externalId, d]));
      for (const id of ids) {
        const d = details.get(id);
        out.set(
          id,
          d
            ? {
                meta: {
                  title: d.title,
                  description: d.description.slice(0, 2000),
                  channelTitle: d.channelTitle,
                  durationSec: d.durationSec,
                  madeForKids: d.madeForKids,
                  thumbnailUrl: d.thumbnailUrl,
                },
                skip: skipReason(d, ctx.config.moderation.maxVideoSec),
              }
            : { meta: null, skip: 'видео не найдено, удалено или приватное' },
        );
      }
      return out;
    }
    for (const id of ids) {
      try {
        const info = await fetchYouTubeOEmbed(ctx.fetch, id);
        out.set(id, { meta: { ...info, durationSec: null, madeForKids: null }, skip: null });
      } catch (err) {
        if (err instanceof HttpError && err.statusCode === 422)
          out.set(id, { meta: null, skip: err.message });
        else throw err;
      }
    }
    return out;
  }

  app.post(
    '/api/parent/moderation',
    { preHandler },
    async (request, reply): Promise<ModerationAddResult> => {
      const body = parse(moderationAddRequest, request.body);
      const ids = [...new Set(await resolveIds(body.url))];
      if (!ids.length) return { added: 0, existing: 0 };
      const known = await db
        .select({ externalId: moderationItems.externalId })
        .from(moderationItems)
        .where(
          and(eq(moderationItems.provider, 'youtube'), inArray(moderationItems.externalId, ids)),
        );
      const fresh = ids.filter((id) => !known.some((k) => k.externalId === id));
      const meta = await metadataFor(fresh);
      for (const id of fresh) {
        const m = meta.get(id)!;
        await db
          .insert(moderationItems)
          .values({
            provider: 'youtube',
            externalId: id,
            url: `https://www.youtube.com/watch?v=${id}`,
            topic: body.topic || null,
            status: m.skip ? 'skipped' : 'queued',
            skipReason: m.skip,
            metadata: m.meta as unknown as Record<string, unknown>,
            createdBy: request.parent!.id,
          })
          .onConflictDoNothing();
      }
      reply.code(201);
      return { added: fresh.length, existing: ids.length - fresh.length };
    },
  );

  app.get('/api/parent/moderation', { preHandler }, async (): Promise<ModerationItem[]> => {
    const rows = await db
      .select()
      .from(moderationItems)
      .orderBy(desc(moderationItems.createdAt))
      .limit(300);
    return rows.map(toItem);
  });

  const load = async (id: string) => {
    const [row] = await db.select().from(moderationItems).where(eq(moderationItems.id, id));
    if (!row) throw notFound('видео в очереди не найдено');
    return row;
  };

  app.get('/api/parent/moderation/:id', { preHandler }, async (request): Promise<ModerationItem> =>
    toItem(await load(idFrom(request.params))),
  );

  const setStatus = async (
    id: string,
    from: ModerationStatus[],
    status: ModerationStatus,
    extra: Partial<Row> = {},
  ) => {
    const row = await load(id);
    if (!from.includes(row.status))
      throw new HttpError(409, 'wrong_status', 'действие недоступно для этого видео');
    const [updated] = await db
      .update(moderationItems)
      .set({ status, updatedAt: ctx.now(), ...extra })
      .where(eq(moderationItems.id, id))
      .returning();
    return toItem(updated!);
  };

  // Ещё раз: после ошибки, отсева или отклонения (например, поменяли ключ или лимиты).
  app.post('/api/parent/moderation/:id/retry', { preHandler }, async (request) =>
    setStatus(idFrom(request.params), ['failed', 'skipped', 'rejected', 'ready'], 'queued', {
      attempts: 0,
      error: null,
      skipReason: null,
      decidedAt: null,
    }),
  );

  app.post('/api/parent/moderation/:id/reject', { preHandler }, async (request) =>
    setStatus(idFrom(request.params), ['ready', 'skipped', 'failed', 'queued'], 'rejected', {
      decidedAt: ctx.now(),
    }),
  );

  /**
   * Одобрение: фрагменты и вопросы в том виде, как их поправил родитель, становятся контентом
   * и назначаются выбранным детям. Только здесь видео впервые может дойти до ребёнка.
   */
  app.post(
    '/api/parent/moderation/:id/approve',
    { preHandler },
    async (request): Promise<ModerationItem> => {
      const id = idFrom(request.params);
      const body = parse(moderationApproveRequest, request.body);
      const item = await load(id);
      if (!['ready', 'skipped', 'failed'].includes(item.status)) {
        throw new HttpError(409, 'wrong_status', 'это видео уже решено или ещё анализируется');
      }
      const meta = (item.metadata ?? {}) as Partial<StoredMetadata>;
      if (meta.durationSec && body.segments.some((s) => s.endSec > meta.durationSec!)) {
        throw new HttpError(400, 'validation', 'фрагмент выходит за конец видео');
      }
      await db.transaction(async (tx) => {
        const [source] = await tx
          .insert(videoSources)
          .values({
            provider: 'youtube',
            externalId: item.externalId,
            title: meta.title ?? 'Без названия',
            channelTitle: meta.channelTitle ?? null,
            thumbnailUrl: meta.thumbnailUrl ?? null,
            statusCheckedAt: ctx.now(),
          })
          .onConflictDoUpdate({
            target: [videoSources.provider, videoSources.externalId],
            set: { status: 'available', statusReason: null, statusCheckedAt: ctx.now() },
          })
          .returning({ id: videoSources.id });
        for (const s of body.segments) {
          const [segment] = await tx
            .insert(videoSegments)
            .values({
              sourceId: source!.id,
              title: s.title,
              startSec: s.startSec,
              endSec: s.endSec,
              createdBy: request.parent!.id,
            })
            .returning({ id: videoSegments.id });
          for (const q of s.questions)
            await insertQuestion(tx as Db, ctx.config.tts, segment!.id, q);
          await syncChildItems(tx, 'segment', segment!.id, body.childIds);
        }
        await tx
          .update(moderationItems)
          .set({ status: 'approved', decidedAt: ctx.now(), updatedAt: ctx.now() })
          .where(eq(moderationItems.id, id));
      });
      return toItem(await load(id));
    },
  );

  app.get('/api/parent/llm-usage', { preHandler }, async (): Promise<LlmUsageSummary> => {
    const used = await tokenUsage(db, ctx.now());
    const { dailyTokenLimit, totalTokenLimit } = ctx.config.moderation;
    const [meta] = await db.select().from(appMeta).where(eq(appMeta.key, MODERATION_STATUS_KEY));
    const status = meta ? (JSON.parse(meta.value) as { paused?: LlmUsageSummary['paused'] }) : {};
    return {
      todayTokens: used.today,
      totalTokens: used.total,
      dailyLimit: dailyTokenLimit,
      totalLimit: totalTokenLimit,
      paused: status.paused ?? null,
    };
  });
}
