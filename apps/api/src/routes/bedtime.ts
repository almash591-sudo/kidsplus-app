// «Пора спать» (этап 31): отбой по расписанию, сказки на ночь (готовые и от модели — только
// одобренные родителем), ночной экран телефона.
import { schema, type Db } from '@kidsplus/db';
import { loadBedtime, loadSchedule } from '@kidsplus/db/day';
import {
  bedtimeAt,
  bedtimeInput,
  storyRequest,
  type KidBedtime,
  type ParentSleep,
  type Story,
  type StoryStatus,
} from '@kidsplus/shared/bedtime';
import { localClock } from '@kidsplus/shared/schedule';
import { LIBRARY_BY_CODE, libraryInfo, STORY_LIBRARY } from '@kidsplus/shared/stories-library';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireDevice, requireParent } from '../auth';
import type { Ctx } from '../context';
import { HttpError, idFrom, notFound, parse } from '../lib/http';
import { toSpeech } from '../services/kid-items';
import { notify } from '../services/live';
import { ensureTts, loadAssets } from '../services/media';

const { audioTracks, bedtimes, children, stories } = schema;

const uuid = z.string().uuid();
const storyParams = z.object({ id: uuid, storyId: uuid });
const libraryParams = z.object({ id: uuid, code: z.string().min(1).max(40) });
const playedBody = z.object({ storyId: uuid });

/** Сказок у ребёнка не больше — список в кабинете остаётся обозримым. */
export const MAX_STORIES = 40;

const toStory = (r: typeof stories.$inferSelect): Story => ({
  id: r.id,
  libraryCode: r.libraryCode,
  theme: r.theme,
  title: r.title,
  paragraphs: r.paragraphs,
  status: r.status as StoryStatus,
  error: r.error,
  createdAt: r.createdAt.toISOString(),
});

/** Озвучка сказки: название и каждый абзац — отдельные фразы (короче запрос, надёжнее кэш). */
async function voiceStory(db: Db, ctx: Ctx, s: { title: string; paragraphs: string[] }) {
  for (const t of [s.title, ...s.paragraphs]) await ensureTts(db, ctx.config.tts, t, 'ru');
}

export function bedtimeRoutes(app: FastifyInstance, ctx: Ctx) {
  const { db } = ctx;
  const parentOnly = requireParent(ctx);
  const deviceOnly = requireDevice(ctx);

  const childAge = async (childId: string) => {
    const [c] = await db
      .select({ y: children.birthYear, m: children.birthMonth, family: children.familyId })
      .from(children)
      .where(eq(children.id, childId));
    if (!c) throw notFound('ребёнок не найден');
    const now = ctx.now();
    const months = (now.getFullYear() - c.y) * 12 + (now.getMonth() + 1 - c.m);
    return { ageYears: Math.max(1, Math.floor(months / 12)), familyId: c.family };
  };

  const storyCount = async (childId: string) =>
    (
      await db
        .select({ n: sql<number>`count(*)::int` })
        .from(stories)
        .where(eq(stories.childId, childId))
    )[0]?.n ?? 0;

  const ownStory = async (childId: string, storyId: string) => {
    const [row] = await db
      .select()
      .from(stories)
      .where(and(eq(stories.id, storyId), eq(stories.childId, childId)));
    if (!row) throw notFound('сказка не найдена');
    return row;
  };

  // ─── Кабинет ──────────────────────────────────────────────────────────────

  app.get(
    '/api/parent/children/:id/sleep',
    { preHandler: parentOnly },
    async (request): Promise<ParentSleep> => {
      const childId = idFrom(request.params);
      const { familyId } = await childAge(childId);
      const sleep = await loadBedtime(db, childId);
      const clock = localClock(ctx.now(), (await loadSchedule(db, childId)).timezone);
      const list = await db
        .select()
        .from(stories)
        .where(eq(stories.childId, childId))
        .orderBy(desc(stories.createdAt));
      const have = new Set(list.map((s) => s.libraryCode).filter(Boolean));
      const tracks = await db
        .select({ id: audioTracks.id, title: audioTracks.title })
        .from(audioTracks)
        .where(and(eq(audioTracks.familyId, familyId), eq(audioTracks.forKids, true)))
        .orderBy(desc(audioTracks.createdAt));
      return {
        settings: sleep.settings,
        now: bedtimeAt(clock, sleep.settings, sleep.skipNight),
        stories: list.map(toStory),
        library: STORY_LIBRARY.filter((s) => !have.has(s.code)).map(libraryInfo),
        tracks,
      };
    },
  );

  app.put('/api/parent/children/:id/sleep', { preHandler: parentOnly }, async (request) => {
    const childId = idFrom(request.params);
    const body = parse(bedtimeInput, request.body);
    const { familyId } = await childAge(childId);
    // Запись — только из аудиотеки своей семьи и «для детей» (иначе телефон её не получит).
    if (body.trackId) {
      const [t] = await db
        .select({ id: audioTracks.id })
        .from(audioTracks)
        .where(
          and(
            eq(audioTracks.id, body.trackId),
            eq(audioTracks.familyId, familyId),
            eq(audioTracks.forKids, true),
          ),
        );
      if (!t) throw new HttpError(400, 'validation', 'запись не найдена в аудиотеке детей');
    }
    const values = { ...body, updatedAt: ctx.now() };
    await db
      .insert(bedtimes)
      .values({ childId, ...values })
      .onConflictDoUpdate({ target: bedtimes.childId, set: values });
    notify(childId);
    return body;
  });

  /** Придумать сказку: заявка в очередь worker'а (тема и возраст, без имени). */
  app.post(
    '/api/parent/children/:id/stories',
    { preHandler: parentOnly, config: { rateLimit: { max: 10, timeWindow: '1 hour' } } },
    async (request, reply): Promise<Story> => {
      const childId = idFrom(request.params);
      const { theme } = parse(storyRequest, request.body);
      const { ageYears } = await childAge(childId);
      if ((await storyCount(childId)) >= MAX_STORIES)
        throw new HttpError(409, 'too_many', `сказок уже ${MAX_STORIES} — удалите старые`);
      const [row] = await db
        .insert(stories)
        .values({ childId, theme, status: 'queued', ageYears })
        .returning();
      reply.code(201);
      return toStory(row!);
    },
  );

  /** Добавить готовую сказку: родитель прочитал её в кабинете — сразу одобрена. */
  app.post(
    '/api/parent/children/:id/stories/library/:code',
    { preHandler: parentOnly },
    async (request, reply): Promise<Story> => {
      const { id: childId, code } = parse(libraryParams, request.params);
      const lib = LIBRARY_BY_CODE.get(code);
      if (!lib) throw notFound('нет такой сказки');
      const { ageYears } = await childAge(childId);
      const [row] = await db
        .insert(stories)
        .values({
          childId,
          libraryCode: code,
          theme: lib.theme,
          title: lib.title,
          paragraphs: lib.paragraphs,
          status: 'approved',
          ageYears,
        })
        .onConflictDoNothing()
        .returning();
      if (!row) throw new HttpError(409, 'exists', 'эта сказка уже добавлена');
      await voiceStory(db, ctx, lib);
      notify(childId);
      reply.code(201);
      return toStory(row);
    },
  );

  app.post(
    '/api/parent/children/:id/stories/:storyId/approve',
    { preHandler: parentOnly },
    async (request): Promise<Story> => {
      const { id: childId, storyId } = parse(storyParams, request.params);
      const s = await ownStory(childId, storyId);
      if (s.status !== 'draft' && s.status !== 'approved')
        throw new HttpError(409, 'not_ready', 'сказка ещё не готова');
      const [row] = await db
        .update(stories)
        .set({ status: 'approved', updatedAt: ctx.now() })
        .where(eq(stories.id, storyId))
        .returning();
      await voiceStory(db, ctx, row!);
      notify(childId);
      return toStory(row!);
    },
  );

  /** Не получилось у модели — ещё раз. */
  app.post(
    '/api/parent/children/:id/stories/:storyId/retry',
    { preHandler: parentOnly },
    async (request): Promise<Story> => {
      const { id: childId, storyId } = parse(storyParams, request.params);
      const s = await ownStory(childId, storyId);
      if (s.status !== 'failed' && s.status !== 'draft')
        throw new HttpError(409, 'not_failed', 'сказку нельзя переписать сейчас');
      const [row] = await db
        .update(stories)
        .set({ status: 'queued', attempts: 0, error: null, updatedAt: ctx.now() })
        .where(eq(stories.id, storyId))
        .returning();
      return toStory(row!);
    },
  );

  app.delete(
    '/api/parent/children/:id/stories/:storyId',
    { preHandler: parentOnly },
    async (request, reply) => {
      const { id: childId, storyId } = parse(storyParams, request.params);
      await ownStory(childId, storyId);
      await db.delete(stories).where(eq(stories.id, storyId));
      notify(childId);
      reply.code(204);
    },
  );

  // ─── Телефон ребёнка ──────────────────────────────────────────────────────

  app.get('/api/kid/bedtime', { preHandler: deviceOnly }, async (request): Promise<KidBedtime> => {
    const childId = request.device!.childId;
    const sleep = await loadBedtime(db, childId);
    const clock = localClock(ctx.now(), (await loadSchedule(db, childId)).timezone);
    const { companion, trackId, wakeAt } = sleep.settings;

    // Сказки по очереди: та, что звучала давнее всех (новая — первой).
    const [story] =
      companion === 'story'
        ? await db
            .select()
            .from(stories)
            .where(and(eq(stories.childId, childId), eq(stories.status, 'approved')))
            .orderBy(sql`${stories.playedAt} asc nulls first`, asc(stories.createdAt))
            .limit(1)
        : [];
    let speeches: KidBedtime['story'] = null;
    if (story) {
      const texts = [story.title, ...story.paragraphs];
      const ids = new Map<string, string | null>();
      for (const t of texts)
        if (!ids.has(t)) ids.set(t, await ensureTts(db, ctx.config.tts, t, 'ru'));
      const assets = await loadAssets(db, [...ids.values()]);
      const ready = (id: string | null) => Boolean(id && assets.get(id)?.status === 'ready');
      const speech = (t: string) => toSpeech(ctx.config.tts, t, 'ru', ids.get(t) ?? null, ready);
      speeches = { id: story.id, title: speech(story.title), parts: story.paragraphs.map(speech) };
    }

    const [track] =
      companion === 'track' && trackId
        ? await db
            .select({ id: audioTracks.id, title: audioTracks.title })
            .from(audioTracks)
            .where(and(eq(audioTracks.id, trackId), eq(audioTracks.forKids, true)))
        : [];

    return {
      now: bedtimeAt(clock, sleep.settings, sleep.skipNight),
      wakeAt,
      companion,
      story: speeches,
      track: track ? { ...track, url: `/api/audio/${track.id}/file` } : null,
    };
  });

  /** Сказка дослушана — следующей ночью будет другая. Просмотр из кабинета очередь не двигает. */
  app.post(
    '/api/kid/bedtime/played',
    { preHandler: deviceOnly, config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const { storyId } = parse(playedBody, request.body);
      if (!request.device!.preview)
        await db
          .update(stories)
          .set({ playedAt: ctx.now() })
          .where(and(eq(stories.id, storyId), eq(stories.childId, request.device!.childId)));
      reply.code(204);
    },
  );
}
