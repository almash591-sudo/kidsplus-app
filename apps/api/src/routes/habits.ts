// Привычки (этап 30): дела ребёнка, отметки «сделал» (звёздочка в копилку), награды за звёзды.
// Родитель — в кабинете, ребёнок — «Мои дела» на телефоне.
import { schema, type Db } from '@kidsplus/db';
import { applyControl, loadSchedule } from '@kidsplus/db/day';
import {
  customRemind,
  HABIT_PRESETS,
  habitInput,
  habitUpdate,
  rewardInput,
  type Habit,
  type HabitPreset,
  type HabitSlot,
  type KidHabitDone,
  type KidHabits,
  type ParentHabits,
  type Reward,
  type RewardGrant,
} from '@kidsplus/shared/habits';
import { localClock } from '@kidsplus/shared/schedule';
import { and, asc, desc, eq, gte, inArray, isNull, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireDevice, requireParent } from '../auth';
import type { Ctx } from '../context';
import { HttpError, idFrom, notFound, parse } from '../lib/http';
import { toSpeech } from '../services/kid-items';
import { notify } from '../services/live';
import { ensureTts, loadAssets } from '../services/media';

const { habits, habitMarks, rewards, rewardGrants } = schema;

const uuid = z.string().uuid();
const habitParams = z.object({ id: uuid, habitId: uuid });
const rewardParams = z.object({ id: uuid, rewardId: uuid });
const markParams = z.object({
  id: uuid,
  habitId: uuid,
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const isPreset = (v: string | null): v is HabitPreset => Boolean(v && v in HABIT_PRESETS);

const toHabit = (r: typeof habits.$inferSelect): Habit => ({
  id: r.id,
  preset: isPreset(r.preset) ? r.preset : null,
  title: r.title,
  slot: r.slot as HabitSlot,
  remindAt: r.remindAt,
  position: r.position,
});

const toReward = (r: typeof rewards.$inferSelect): Reward => ({
  id: r.id,
  title: r.title,
  price: r.price,
  bonusMinutes: r.bonusMinutes,
});

/** Напоминание дела: у готового — своё («Пора чистить зубки!»), у своего — «Пора! <дело>.» */
const remindText = (h: typeof habits.$inferSelect) =>
  isPreset(h.preset) && h.title === HABIT_PRESETS[h.preset].title
    ? HABIT_PRESETS[h.preset].remind
    : customRemind(h.title);

/** Дата «сегодня» в часовом поясе расписания ребёнка. */
async function childToday(db: Db, childId: string, now: Date) {
  return localClock(now, (await loadSchedule(db, childId)).timezone).date;
}

/** Звёзды в копилке: все отметки минус потраченное на награды. */
export async function starBalance(db: Pick<Db, 'select'>, childId: string) {
  const [earned] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(habitMarks)
    .where(eq(habitMarks.childId, childId));
  const [spent] = await db
    .select({ n: sql<number>`coalesce(sum(${rewardGrants.price}), 0)::int` })
    .from(rewardGrants)
    .where(eq(rewardGrants.childId, childId));
  return (earned?.n ?? 0) - (spent?.n ?? 0);
}

const activeHabits = (db: Db, childId: string) =>
  db
    .select()
    .from(habits)
    .where(and(eq(habits.childId, childId), isNull(habits.archivedAt)))
    .orderBy(asc(habits.position), asc(habits.createdAt));

const activeRewards = (db: Db, childId: string) =>
  db
    .select()
    .from(rewards)
    .where(and(eq(rewards.childId, childId), isNull(rewards.archivedAt)))
    .orderBy(asc(rewards.price), asc(rewards.createdAt));

/** Даты от `days - 1` дней назад до `date` включительно. */
function lastDates(date: string, days: number) {
  const base = Date.parse(`${date}T12:00:00Z`);
  return Array.from({ length: days }, (_, i) =>
    new Date(base - (days - 1 - i) * 86_400_000).toISOString().slice(0, 10),
  );
}

/** Сколько дней подряд сделаны все дела: от сегодня (если всё сделано) или от вчера назад. */
export function streakDays(
  habitIds: readonly string[],
  marks: ReadonlyMap<string, ReadonlySet<string>>,
  dates: readonly string[],
) {
  if (!habitIds.length) return 0;
  const full = (d: string) => habitIds.every((id) => marks.get(id)?.has(d));
  let i = dates.length - 1;
  if (!full(dates[i]!)) i--;
  let n = 0;
  for (; i >= 0 && full(dates[i]!); i--) n++;
  return n;
}

export function habitsRoutes(app: FastifyInstance, ctx: Ctx) {
  const { db } = ctx;
  const parentOnly = requireParent(ctx);
  const deviceOnly = requireDevice(ctx);

  const ownHabit = async (childId: string, habitId: string) => {
    const [row] = await db
      .select()
      .from(habits)
      .where(and(eq(habits.id, habitId), eq(habits.childId, childId), isNull(habits.archivedAt)));
    if (!row) throw notFound('дело не найдено');
    return row;
  };

  // ─── Кабинет ──────────────────────────────────────────────────────────────

  app.get(
    '/api/parent/children/:id/habits',
    { preHandler: parentOnly },
    async (request): Promise<ParentHabits> => {
      const childId = idFrom(request.params);
      const today = await childToday(db, childId, ctx.now());
      // Для серии смотрим 60 дней, на экран — 7.
      const long = lastDates(today, 60);
      const list = await activeHabits(db, childId);
      const rows = list.length
        ? await db
            .select({ habitId: habitMarks.habitId, date: habitMarks.date })
            .from(habitMarks)
            .where(
              and(
                eq(habitMarks.childId, childId),
                gte(habitMarks.date, long[0]!),
                inArray(
                  habitMarks.habitId,
                  list.map((h) => h.id),
                ),
              ),
            )
        : [];
      const byHabit = new Map<string, Set<string>>();
      for (const r of rows) {
        if (!byHabit.has(r.habitId)) byHabit.set(r.habitId, new Set());
        byHabit.get(r.habitId)!.add(r.date);
      }
      const dates = long.slice(-7);
      const marks: Record<string, string[]> = {};
      for (const h of list) marks[h.id] = dates.filter((d) => byHabit.get(h.id)?.has(d));
      const grants = await db
        .select()
        .from(rewardGrants)
        .where(eq(rewardGrants.childId, childId))
        .orderBy(desc(rewardGrants.at))
        .limit(10);
      return {
        today,
        dates,
        habits: list.map(toHabit),
        marks,
        streakDays: streakDays(
          list.map((h) => h.id),
          byHabit,
          long,
        ),
        stars: await starBalance(db, childId),
        rewards: (await activeRewards(db, childId)).map(toReward),
        grants: grants.map((g): RewardGrant => ({
          id: g.id,
          title: g.title,
          price: g.price,
          bonusMinutes: g.bonusMinutes,
          at: g.at.toISOString(),
        })),
      };
    },
  );

  app.post(
    '/api/parent/children/:id/habits',
    { preHandler: parentOnly },
    async (request, reply) => {
      const childId = idFrom(request.params);
      const body = parse(habitInput, request.body);
      const [last] = await db
        .select({ p: sql<number>`coalesce(max(${habits.position}), -1)::int` })
        .from(habits)
        .where(eq(habits.childId, childId));
      const [row] = await db
        .insert(habits)
        .values({ childId, ...body, position: (last?.p ?? -1) + 1 })
        .returning();
      // Озвучка названия и напоминания — заранее, чтобы на телефоне звучал нейроголос.
      await ensureTts(db, ctx.config.tts, row!.title, 'ru');
      await ensureTts(db, ctx.config.tts, remindText(row!), 'ru');
      notify(childId);
      reply.code(201);
      return toHabit(row!);
    },
  );

  app.patch(
    '/api/parent/children/:id/habits/:habitId',
    { preHandler: parentOnly },
    async (request) => {
      const { id: childId, habitId } = parse(habitParams, request.params);
      const body = parse(habitUpdate, request.body);
      await ownHabit(childId, habitId);
      const [row] = await db.update(habits).set(body).where(eq(habits.id, habitId)).returning();
      if (body.title) {
        await ensureTts(db, ctx.config.tts, row!.title, 'ru');
        await ensureTts(db, ctx.config.tts, remindText(row!), 'ru');
      }
      notify(childId);
      return toHabit(row!);
    },
  );

  app.delete(
    '/api/parent/children/:id/habits/:habitId',
    { preHandler: parentOnly },
    async (request, reply) => {
      const { id: childId, habitId } = parse(habitParams, request.params);
      await ownHabit(childId, habitId);
      await db.update(habits).set({ archivedAt: ctx.now() }).where(eq(habits.id, habitId));
      notify(childId);
      reply.code(204);
    },
  );

  /** Снять отметку (ребёнок слукавил) — звёздочка уходит из копилки. */
  app.delete(
    '/api/parent/children/:id/habits/:habitId/marks/:date',
    { preHandler: parentOnly },
    async (request, reply) => {
      const { id: childId, habitId, date } = parse(markParams, request.params);
      await ownHabit(childId, habitId);
      await db
        .delete(habitMarks)
        .where(and(eq(habitMarks.habitId, habitId), eq(habitMarks.date, date)));
      notify(childId);
      reply.code(204);
    },
  );

  /** Отметить за ребёнка (сделал, но забыл нажать). */
  app.put(
    '/api/parent/children/:id/habits/:habitId/marks/:date',
    { preHandler: parentOnly },
    async (request, reply) => {
      const { id: childId, habitId, date } = parse(markParams, request.params);
      await ownHabit(childId, habitId);
      await db
        .insert(habitMarks)
        .values({ habitId, childId, date, at: ctx.now() })
        .onConflictDoNothing();
      notify(childId);
      reply.code(204);
    },
  );

  app.post(
    '/api/parent/children/:id/rewards',
    { preHandler: parentOnly },
    async (request, reply) => {
      const childId = idFrom(request.params);
      const body = parse(rewardInput, request.body);
      const [row] = await db
        .insert(rewards)
        .values({ childId, ...body })
        .returning();
      await ensureTts(db, ctx.config.tts, row!.title, 'ru');
      notify(childId);
      reply.code(201);
      return toReward(row!);
    },
  );

  app.delete(
    '/api/parent/children/:id/rewards/:rewardId',
    { preHandler: parentOnly },
    async (request, reply) => {
      const { id: childId, rewardId } = parse(rewardParams, request.params);
      const [row] = await db
        .update(rewards)
        .set({ archivedAt: ctx.now() })
        .where(and(eq(rewards.id, rewardId), eq(rewards.childId, childId)))
        .returning();
      if (!row) throw notFound('награда не найдена');
      notify(childId);
      reply.code(204);
    },
  );

  /** Выдать награду: звёзды списываются; бонусные минуты — сразу к времени дня. */
  app.post(
    '/api/parent/children/:id/rewards/:rewardId/grant',
    { preHandler: parentOnly },
    async (request): Promise<{ stars: number }> => {
      const { id: childId, rewardId } = parse(rewardParams, request.params);
      const now = ctx.now();
      const stars = await db.transaction(async (tx) => {
        // Две выдачи сразу (два родителя) не уводят копилку в минус: блокируем строку ребёнка.
        await tx
          .select({ id: schema.children.id })
          .from(schema.children)
          .where(eq(schema.children.id, childId))
          .for('update');
        const [reward] = await tx
          .select()
          .from(rewards)
          .where(
            and(eq(rewards.id, rewardId), eq(rewards.childId, childId), isNull(rewards.archivedAt)),
          );
        if (!reward) throw notFound('награда не найдена');
        const have = await starBalance(tx, childId);
        if (have < reward.price)
          throw new HttpError(409, 'not_enough_stars', `в копилке ${have} из ${reward.price}`);
        await tx.insert(rewardGrants).values({
          childId,
          rewardId,
          title: reward.title,
          price: reward.price,
          bonusMinutes: reward.bonusMinutes,
          grantedBy: request.parent!.id,
          at: now,
        });
        return have - reward.price;
      });
      const [reward] = await db.select().from(rewards).where(eq(rewards.id, rewardId));
      if (reward?.bonusMinutes)
        await applyControl(db, childId, now, { action: 'add', minutes: reward.bonusMinutes });
      notify(childId);
      return { stars };
    },
  );

  // ─── Телефон ребёнка ──────────────────────────────────────────────────────

  app.get('/api/kid/habits', { preHandler: deviceOnly }, async (request): Promise<KidHabits> => {
    const childId = request.device!.childId;
    const date = await childToday(db, childId, ctx.now());
    const list = await activeHabits(db, childId);
    const done = new Set(
      (
        await db
          .select({ habitId: habitMarks.habitId })
          .from(habitMarks)
          .where(and(eq(habitMarks.childId, childId), eq(habitMarks.date, date)))
      ).map((r) => r.habitId),
    );
    const stars = await starBalance(db, childId);
    const rewardList = await activeRewards(db, childId);
    const goal = rewardList.find((r) => r.price > stars) ?? rewardList[0] ?? null;
    const [lastGrant] = await db
      .select()
      .from(rewardGrants)
      .where(eq(rewardGrants.childId, childId))
      .orderBy(desc(rewardGrants.at))
      .limit(1);

    // Озвучка: названия, напоминания, цель и награда (уже готовые — со ссылкой на файл).
    const texts = [
      ...list.flatMap((h) => [h.title, remindText(h)]),
      ...(goal ? [goal.title] : []),
      ...(lastGrant ? [lastGrant.title] : []),
    ];
    const ids = new Map<string, string | null>();
    for (const t of texts)
      if (!ids.has(t)) ids.set(t, await ensureTts(db, ctx.config.tts, t, 'ru'));
    const assets = await loadAssets(db, [...ids.values()]);
    const ready = (id: string | null) => Boolean(id && assets.get(id)?.status === 'ready');
    const speech = (t: string) => toSpeech(ctx.config.tts, t, 'ru', ids.get(t) ?? null, ready);

    return {
      date,
      stars,
      habits: list.map((h) => {
        const preset = isPreset(h.preset) ? h.preset : null;
        const p = preset ? (HABIT_PRESETS[preset] as { timerSec?: number }) : null;
        return {
          id: h.id,
          preset,
          slot: h.slot as HabitSlot,
          remindAt: h.remindAt,
          timerSec: p?.timerSec ?? null,
          title: speech(h.title),
          remind: speech(remindText(h)),
          done: done.has(h.id),
        };
      }),
      goal: goal ? { title: speech(goal.title), price: goal.price } : null,
      lastGrant: lastGrant ? { id: lastGrant.id, title: speech(lastGrant.title) } : null,
    };
  });

  app.post(
    '/api/kid/habits/:id/done',
    { preHandler: deviceOnly, config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
    async (request): Promise<KidHabitDone> => {
      const childId = request.device!.childId;
      const habitId = idFrom(request.params);
      await ownHabit(childId, habitId);
      // Просмотр из кабинета — звёзды не начисляются.
      if (!request.device!.preview) {
        const date = await childToday(db, childId, ctx.now());
        await db
          .insert(habitMarks)
          .values({ habitId, childId, date, at: ctx.now() })
          .onConflictDoNothing();
      }
      return { stars: await starBalance(db, childId) };
    },
  );
}
