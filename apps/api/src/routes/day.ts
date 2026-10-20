import { schema } from '@kidsplus/db';
import type { ChildAnalytics, WeeklyReport } from '@kidsplus/shared/analytics';
import type { KidItem, RepeatMode } from '@kidsplus/shared/api';
import { restKey, restMap } from '@kidsplus/db/rest';
import {
  activityQuery,
  controlRequest,
  curriculumDraftRequest,
  curriculumInput,
  heartbeatRequest,
  scheduleInput,
  SUBJECTS,
  activityLeft,
  type ActivityEntry,
  type ChildNow,
  type Curriculum,
  type CurriculumDraft,
  type HeartbeatResponse,
  type KidToday,
  type Schedule,
  type Subject,
  type TopicItem,
} from '@kidsplus/shared/schedule';
import { and, asc, desc, eq, gte, inArray, isNotNull, isNull } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireDevice, requireParent } from '../auth';
import type { Ctx } from '../context';
import { HttpError, idFrom, notFound, parse } from '../lib/http';
import { hashPassword, verifyDummy, verifyPassword } from '../lib/password';
import { childAnalytics, weakRefs, withReview } from '@kidsplus/db/analytics';
import {
  applyControl,
  childMaterials,
  lessonRefs,
  loadDay,
  loadSchedule,
  recordBeat,
} from '@kidsplus/db/day';
import { fillTopics, type CurriculumFillResult } from '@kidsplus/shared/plan-fill';
import { notifyParents } from '@kidsplus/db/notify';
import { pushMessages } from '@kidsplus/shared/push';
import { BATTERY_PUSH_LEVEL, BATTERY_RESET_LEVEL, batteryReport } from '@kidsplus/shared/battery';
import { childActivity } from '../services/activity';
import { buildKidItems } from '../services/kid-items';
import { notify, sse, subscribe } from '../services/live';

const {
  appMeta,
  children,
  childSchedules,
  curricula,
  curriculumDrafts,
  curriculumTopics,
  dayControls,
  devices,
  events,
  flashcardDecks,
  interactives,
  quizQuestions,
  videoSegments,
  weeklyReports,
} = schema;

/** Ключ PIN детского режима в app_meta (хэш argon2). */
const PIN_KEY = 'kid_pin_hash';
/** Считаем телефон «на связи», если сигнал был не позже этого. */
const ONLINE_MS = 45_000;

const subjectParam = z.object({ subject: z.enum(SUBJECTS) });
const analyticsQuery = z.object({ days: z.coerce.number().int().min(1).max(90).default(7) });
const pinRequest = z.object({ pin: z.string().regex(/^\d{4,6}$/, 'PIN — 4–6 цифр') });

/** Расписание, учебный план, учёт времени, «Управление сейчас», PIN (этап 4 ТЗ). */
export function dayRoutes(app: FastifyInstance, ctx: Ctx) {
  const { db } = ctx;
  const parentOnly = requireParent(ctx);
  const deviceOnly = requireDevice(ctx);

  const ownChild = async (params: unknown) => {
    const id = idFrom(params);
    const [row] = await db.select({ id: children.id }).from(children).where(eq(children.id, id));
    if (!row) throw notFound('ребёнок не найден');
    return id;
  };

  // ─── Телефон ребёнка ──────────────────────────────────────────────────────

  app.get('/api/kid/today', { preHandler: deviceOnly }, async (request): Promise<KidToday> => {
    return (await loadDay(db, request.device!.childId, ctx.now())).today;
  });

  app.post(
    '/api/kid/heartbeat',
    { preHandler: deviceOnly, config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (request): Promise<HeartbeatResponse> => {
      const beat = parse(heartbeatRequest, request.body);
      const childId = request.device!.childId;
      // Просмотр из кабинета: правила дня те же, но время ребёнка не тратится.
      if (request.device!.preview) {
        const view = await loadDay(db, childId, ctx.now());
        return { ...view.today, stop: activityLeft(view.today, beat.activity) <= 0 };
      }
      const day = await recordBeat(db, childId, ctx.now(), beat);
      // Всё на сегодня пройдено — родителю один раз в день.
      if (day.today.closed === 'limit' && !day.control?.doneNotified) {
        const [first] = await db
          .update(dayControls)
          .set({ doneNotified: true })
          .where(
            and(
              eq(dayControls.childId, childId),
              eq(dayControls.date, day.clock.date),
              eq(dayControls.doneNotified, false),
            ),
          )
          .returning({ childId: dayControls.childId });
        if (first) void notifyParents(db, ctx.push?.sender ?? null, pushMessages.dayDone(childId));
      }
      return { ...day.today, stop: activityLeft(day.today, beat.activity) <= 0 };
    },
  );

  /**
   * Заряд телефона (этап 8) — при каждом изменении, независимо от расписания. На 15 % без
   * зарядки — push родителю один раз за разряд; на зарядке или выше 25 % — снова «взведён».
   */
  app.post(
    '/api/kid/battery',
    { preHandler: deviceOnly, config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const b = parse(batteryReport, request.body);
      const { id, childId } = request.device!;
      if (request.device!.preview) return reply.code(204).send();
      const now = ctx.now();
      const reset = b.charging || b.level > BATTERY_RESET_LEVEL;
      await db
        .update(devices)
        .set({
          batteryLevel: b.level,
          batteryCharging: b.charging,
          batteryAt: now,
          ...(reset ? { batteryAlertAt: null } : {}),
        })
        .where(eq(devices.id, id));
      if (!reset && b.level <= BATTERY_PUSH_LEVEL) {
        // Условное обновление: два одновременных показания не пришлют push дважды.
        const [first] = await db
          .update(devices)
          .set({ batteryAlertAt: now })
          .where(and(eq(devices.id, id), isNull(devices.batteryAlertAt)))
          .returning({ id: devices.id });
        if (first)
          void notifyParents(db, ctx.push?.sender ?? null, pushMessages.battery(childId, b.level));
      }
      reply.code(204);
    },
  );

  /** Урок по предмету дня. Предмет, которого сегодня нет, или закрытый день — пустой урок. */
  app.get(
    '/api/kid/lesson/:subject',
    { preHandler: deviceOnly },
    async (request): Promise<{ items: KidItem[] }> => {
      const { subject } = parse(subjectParam, request.params);
      const childId = request.device!.childId;
      const day = await loadDay(db, childId, ctx.now());
      const open =
        day.today.mode === 'off'
          ? day.pool.includes(subject)
          : activityLeft(day.today, subject) > 0;
      if (!open) return { items: [] };
      const refs = withReview(
        await lessonRefs(db, childId, subject, day),
        await weakRefs(db, childId, subject, ctx.now()),
      );
      const built = await buildKidItems(db, ctx.config.tts, refs, { childId, now: ctx.now() });
      // Этап 34: в уроке сначала новое, пройденное сегодня и выученное — после.
      const [child] = await db
        .select({ repeatMode: children.repeatMode })
        .from(children)
        .where(eq(children.id, childId));
      const rest = await restMap(
        db,
        childId,
        ctx.now(),
        day.schedule.timezone,
        (child?.repeatMode ?? 'weekly') as RepeatMode,
      );
      const marked = built.map((it) => {
        const r = rest.get(restKey(it.kind, it.id));
        return r ? { ...it, rest: r } : it;
      });
      return { items: [...marked.filter((i) => !i.rest), ...marked.filter((i) => i.rest)] };
    },
  );

  /** Живой канал: событие «day» — день изменился (пауза, время, завершение). */
  app.get('/api/kid/live', { preHandler: deviceOnly }, (request, reply) => {
    reply.raw.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    });
    reply.raw.write('retry: 5000\n\n');
    const off = subscribe(request.device!.childId, (event) => reply.raw.write(sse(event)));
    // Комментарий раз в 25 с — прокси не рвут «молчащее» соединение.
    const ping = setInterval(() => reply.raw.write(': ping\n\n'), 25_000);
    request.raw.on('close', () => {
      clearInterval(ping);
      off();
    });
    return reply;
  });

  /** Выход из детского режима: проверка PIN родителя. */
  app.post(
    '/api/kid/unlock',
    { preHandler: deviceOnly, config: { rateLimit: { max: 5, timeWindow: '1 minute' } } },
    async (request): Promise<{ ok: boolean }> => {
      const { pin } = parse(pinRequest, request.body);
      const [row] = await db.select().from(appMeta).where(eq(appMeta.key, PIN_KEY));
      if (!row) {
        await verifyDummy(pin);
        return { ok: false };
      }
      return { ok: await verifyPassword(row.value, pin) };
    },
  );

  // ─── Родитель: расписание ─────────────────────────────────────────────────

  app.get('/api/parent/children/:id/schedule', { preHandler: parentOnly }, async (request) =>
    loadSchedule(db, await ownChild(request.params)),
  );

  app.put(
    '/api/parent/children/:id/schedule',
    { preHandler: parentOnly },
    async (request): Promise<Schedule> => {
      const childId = await ownChild(request.params);
      const body = parse(scheduleInput, request.body);
      await db
        .insert(childSchedules)
        .values({ childId, ...body, updatedAt: ctx.now() })
        .onConflictDoUpdate({
          target: childSchedules.childId,
          set: { ...body, updatedAt: ctx.now() },
        });
      notify(childId);
      return loadSchedule(db, childId);
    },
  );

  // ─── Родитель: учебный план ───────────────────────────────────────────────

  const loadCurricula = async (childId: string, id?: string): Promise<Curriculum[]> => {
    const rows = await db
      .select()
      .from(curricula)
      .where(id ? eq(curricula.id, id) : eq(curricula.childId, childId))
      .orderBy(desc(curricula.createdAt));
    const out: Curriculum[] = [];
    for (const c of rows) {
      const topics = await db
        .select()
        .from(curriculumTopics)
        .where(eq(curriculumTopics.curriculumId, c.id))
        .orderBy(asc(curriculumTopics.week), asc(curriculumTopics.position));
      out.push({
        id: c.id,
        childId: c.childId,
        title: c.title,
        startsOn: c.startsOn,
        weeks: c.weeks,
        subjects: c.subjects as Subject[],
        topics: topics.map((t) => ({
          id: t.id,
          subject: t.subject as Subject,
          week: t.week,
          title: t.title,
          items: t.items as TopicItem[],
        })),
      });
    }
    return out;
  };

  const writeTopics = async (
    tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
    curriculumId: string,
    body: z.output<typeof curriculumInput>,
  ) => {
    if (body.topics.some((t) => t.week > body.weeks))
      throw new HttpError(400, 'validation', 'тема за пределами плана');
    if (body.topics.some((t) => !body.subjects.includes(t.subject)))
      throw new HttpError(400, 'validation', 'тема по предмету, которого нет в плане');
    await tx.delete(curriculumTopics).where(eq(curriculumTopics.curriculumId, curriculumId));
    if (body.topics.length)
      await tx
        .insert(curriculumTopics)
        .values(body.topics.map((t, position) => ({ curriculumId, ...t, position })));
  };

  app.get('/api/parent/children/:id/curricula', { preHandler: parentOnly }, async (request) =>
    loadCurricula(await ownChild(request.params)),
  );

  app.post(
    '/api/parent/children/:id/curricula',
    { preHandler: parentOnly },
    async (request, reply): Promise<Curriculum> => {
      const childId = await ownChild(request.params);
      const body = parse(curriculumInput, request.body);
      const id = await db.transaction(async (tx) => {
        const [row] = await tx
          .insert(curricula)
          .values({
            childId,
            title: body.title,
            startsOn: body.startsOn,
            weeks: body.weeks,
            subjects: body.subjects,
          })
          .returning({ id: curricula.id });
        await writeTopics(tx, row!.id, body);
        return row!.id;
      });
      notify(childId);
      reply.code(201);
      return (await loadCurricula(childId, id))[0]!;
    },
  );

  app.put(
    '/api/parent/curricula/:id',
    { preHandler: parentOnly },
    async (request): Promise<Curriculum> => {
      const id = idFrom(request.params);
      const body = parse(curriculumInput, request.body);
      const childId = await db.transaction(async (tx) => {
        const [row] = await tx
          .update(curricula)
          .set({
            title: body.title,
            startsOn: body.startsOn,
            weeks: body.weeks,
            subjects: body.subjects,
          })
          .where(eq(curricula.id, id))
          .returning({ childId: curricula.childId });
        if (!row) throw notFound('план не найден');
        await writeTopics(tx, id, body);
        return row.childId;
      });
      notify(childId);
      return (await loadCurricula(childId, id))[0]!;
    },
  );

  app.delete('/api/parent/curricula/:id', { preHandler: parentOnly }, async (request, reply) => {
    const id = idFrom(request.params);
    const [row] = await db
      .delete(curricula)
      .where(eq(curricula.id, id))
      .returning({ childId: curricula.childId });
    if (!row) throw notFound('план не найден');
    notify(row.childId);
    return reply.code(204).send();
  });

  /**
   * «Заполнить материалами»: раскладывает видео, карточки и игры ребёнка по пустым темам плана.
   * Ничего не сохраняет — родитель видит результат в редакторе и сохраняет сам.
   */
  app.post(
    '/api/parent/children/:id/curriculum-fill',
    { preHandler: parentOnly },
    async (request): Promise<CurriculumFillResult> => {
      const childId = await ownChild(request.params);
      const body = parse(curriculumInput, request.body);
      return fillTopics(body, await childMaterials(db, childId));
    },
  );

  // ─── Родитель: черновик плана от языковой модели ──────────────────────────

  const toDraft = (r: typeof curriculumDrafts.$inferSelect): CurriculumDraft => ({
    id: r.id,
    status: r.status as CurriculumDraft['status'],
    topics: (r.result as { topics?: CurriculumDraft['topics'] } | null)?.topics ?? [],
    error: r.status === 'failed' ? r.error : null,
  });

  /** В очередь worker'у: в модель уйдут только возраст (полных лет), предметы и число недель. */
  app.post(
    '/api/parent/children/:id/curriculum-drafts',
    { preHandler: parentOnly, config: { rateLimit: { max: 10, timeWindow: '1 hour' } } },
    async (request, reply): Promise<CurriculumDraft> => {
      const childId = await ownChild(request.params);
      const body = parse(curriculumDraftRequest, request.body);
      const [c] = await db
        .select({ y: children.birthYear, m: children.birthMonth })
        .from(children)
        .where(eq(children.id, childId));
      const now = ctx.now();
      const months = (now.getFullYear() - c!.y) * 12 + (now.getMonth() + 1 - c!.m);
      const [row] = await db
        .insert(curriculumDrafts)
        .values({
          childId,
          request: { ageYears: Math.max(1, Math.floor(months / 12)), ...body },
        })
        .returning();
      reply.code(201);
      return toDraft(row!);
    },
  );

  app.get(
    '/api/parent/curriculum-drafts/:id',
    { preHandler: parentOnly },
    async (request): Promise<CurriculumDraft> => {
      const id = idFrom(request.params);
      const [row] = await db.select().from(curriculumDrafts).where(eq(curriculumDrafts.id, id));
      if (!row) throw notFound('черновик не найден');
      return toDraft(row);
    },
  );

  // ─── Родитель: управление сейчас ──────────────────────────────────────────

  /** Название того, что сейчас на экране у ребёнка. */
  const itemTitle = async (item: { kind: string; id: string }): Promise<string | null> => {
    const pick = async (q: Promise<{ title: string }[]>) => (await q)[0]?.title ?? null;
    switch (item.kind) {
      case 'segment':
        return pick(
          db
            .select({ title: videoSegments.title })
            .from(videoSegments)
            .where(eq(videoSegments.id, item.id)),
        );
      case 'deck':
        return pick(
          db
            .select({ title: flashcardDecks.title })
            .from(flashcardDecks)
            .where(eq(flashcardDecks.id, item.id)),
        );
      case 'interactive':
        return pick(
          db
            .select({ title: interactives.title })
            .from(interactives)
            .where(eq(interactives.id, item.id)),
        );
      case 'quiz':
        return pick(
          db
            .select({ title: quizQuestions.prompt })
            .from(quizQuestions)
            .where(eq(quizQuestions.id, item.id)),
        );
      default:
        return null;
    }
  };

  /** Последнее показание заряда среди телефонов ребёнка. */
  const childBattery = async (childId: string): Promise<ChildNow['battery']> => {
    const [d] = await db
      .select({
        level: devices.batteryLevel,
        charging: devices.batteryCharging,
        at: devices.batteryAt,
      })
      .from(devices)
      .where(
        and(eq(devices.childId, childId), isNull(devices.revokedAt), isNotNull(devices.batteryAt)),
      )
      .orderBy(desc(devices.batteryAt))
      .limit(1);
    if (!d || d.level === null || !d.at) return null;
    return { level: d.level, charging: Boolean(d.charging), at: d.at.toISOString() };
  };

  const childNow = async (childId: string): Promise<ChildNow> => {
    const now = ctx.now();
    const day = await loadDay(db, childId, now);
    const c = day.control;
    const online = Boolean(c?.lastBeatAt && now.getTime() - c.lastBeatAt.getTime() <= ONLINE_MS);
    const raw = (c?.item ?? null) as { kind: string; id: string } | null;
    return {
      ...day.today,
      online,
      activity: online ? ((c?.activity ?? null) as ChildNow['activity']) : null,
      item: online && raw ? { ...raw, title: await itemTitle(raw) } : null,
      lastSeenAt: c?.lastBeatAt?.toISOString() ?? null,
      usedSeconds: Object.values(day.used).reduce((a, b) => a + (b ?? 0), 0),
      extraMinutes: Math.round((c?.extraSeconds ?? 0) / 60),
      battery: await childBattery(childId),
      videosDown: await videosDown(childId, now),
    };
  };

  /**
   * Телефон ребёнка за полчаса не открыл 3+ разных видео и с тех пор ни одного не досмотрел
   * (этап 34): скорее всего, нет связи с YouTube — подсказка родителю на «Главной».
   */
  const videosDown = async (childId: string, now: Date) => {
    const since = new Date(now.getTime() - 30 * 60_000);
    const rows = await db
      .select({ type: events.type, segmentId: events.segmentId, at: events.createdAt })
      .from(events)
      .where(
        and(
          eq(events.childId, childId),
          inArray(events.type, ['segment_error', 'segment_complete']),
          gte(events.createdAt, since),
        ),
      )
      .orderBy(desc(events.createdAt));
    const lastOk = rows.findIndex((r) => r.type === 'segment_complete');
    const errors = (lastOk === -1 ? rows : rows.slice(0, lastOk)).filter(
      (r) => r.type === 'segment_error',
    );
    return new Set(errors.map((r) => r.segmentId)).size >= 3;
  };

  app.get('/api/parent/children/:id/now', { preHandler: parentOnly }, async (request) =>
    childNow(await ownChild(request.params)),
  );

  app.post(
    '/api/parent/children/:id/control',
    { preHandler: parentOnly },
    async (request): Promise<ChildNow> => {
      const childId = await ownChild(request.params);
      await applyControl(db, childId, ctx.now(), parse(controlRequest, request.body));
      notify(childId);
      return childNow(childId);
    },
  );

  /** Журнал действий ребёнка за день (этап 29). */
  app.get(
    '/api/parent/children/:id/activity',
    { preHandler: parentOnly },
    async (request): Promise<{ date: string; entries: ActivityEntry[] }> => {
      const childId = await ownChild(request.params);
      const { date } = parse(activityQuery, request.query);
      return childActivity(db, childId, ctx.now(), date);
    },
  );

  // ─── Родитель: аналитика ──────────────────────────────────────────────────

  app.get(
    '/api/parent/children/:id/analytics',
    { preHandler: parentOnly },
    async (request): Promise<ChildAnalytics> => {
      const childId = await ownChild(request.params);
      const { days } = parse(analyticsQuery, request.query);
      return childAnalytics(db, childId, ctx.now(), days);
    },
  );

  /** Недельные отчёты (последние 12 недель). */
  app.get(
    '/api/parent/children/:id/reports',
    { preHandler: parentOnly },
    async (request): Promise<WeeklyReport[]> => {
      const childId = await ownChild(request.params);
      const rows = await db
        .select()
        .from(weeklyReports)
        .where(eq(weeklyReports.childId, childId))
        .orderBy(desc(weeklyReports.weekStart))
        .limit(12);
      return rows.map((r) => ({
        id: r.id,
        childId: r.childId,
        weekStart: r.weekStart,
        createdAt: r.createdAt.toISOString(),
        stats: r.stats as ChildAnalytics,
        rules: r.rules as string[],
        advice: r.advice as WeeklyReport['advice'],
      }));
    },
  );

  // ─── Родитель: PIN детского режима ────────────────────────────────────────

  app.get('/api/parent/settings/pin', { preHandler: parentOnly }, async () => {
    const [row] = await db
      .select({ key: appMeta.key })
      .from(appMeta)
      .where(eq(appMeta.key, PIN_KEY));
    return { pinSet: Boolean(row) };
  });

  app.put('/api/parent/settings/pin', { preHandler: parentOnly }, async (request) => {
    const { pin } = parse(pinRequest, request.body);
    const value = await hashPassword(pin);
    await db
      .insert(appMeta)
      .values({ key: PIN_KEY, value, updatedAt: ctx.now() })
      .onConflictDoUpdate({ target: appMeta.key, set: { value, updatedAt: ctx.now() } });
    return { pinSet: true };
  });
}
