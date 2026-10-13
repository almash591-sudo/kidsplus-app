// День ребёнка по расписанию (этап 4): предметы дня, учёт времени, уроки, управление родителем.
// Время считает только сервер — по сигналам телефона (heartbeat) раз в ~15 с.
import type { Db } from './index';
import * as schema from './schema';
import { gameCategory } from '@kidsplus/shared/api';
import type { FillMaterial } from '@kidsplus/shared/plan-fill';
import {
  computeToday,
  dayNumber,
  daySubjects,
  DEFAULT_SCHEDULE,
  LESSONS_PER_DAY,
  localClock,
  planWeek,
  scheduleInput,
  SUBJECTS,
  type Activity,
  type KidToday,
  type LocalClock,
  type Schedule,
  type Subject,
  type TopicItem,
} from '@kidsplus/shared/schedule';
import { and, desc, eq, gt, inArray, sql } from 'drizzle-orm';

/** Ссылка на материал: фрагмент видео, набор карточек или игра. */
export interface ItemRef {
  segmentId: string | null;
  deckId: string | null;
  interactiveId: string | null;
}

const {
  childItems,
  childSchedules,
  curricula,
  curriculumTopics,
  dayControls,
  dayUsage,
  events,
  flashcardDecks,
  interactives,
  videoSegments,
  videoSources,
} = schema;

/** Пауза между сигналами телефона, после которой время не засчитывается (приложение было закрыто). */
const BEAT_GAP_MS = 45_000;
/** Больше этого за один сигнал не засчитываем. */
const BEAT_MAX_S = 30;

export async function loadSchedule(db: Db, childId: string): Promise<Schedule> {
  const [row] = await db.select().from(childSchedules).where(eq(childSchedules.childId, childId));
  if (!row) return DEFAULT_SCHEDULE;
  const parsed = scheduleInput.safeParse(row);
  return parsed.success ? parsed.data : DEFAULT_SCHEDULE;
}

const isSubject = (v: string): v is Subject => (SUBJECTS as readonly string[]).includes(v);

/** План, который идёт сегодня (последний созданный, если их несколько). */
export async function activeCurriculum(db: Db, childId: string, date: string) {
  const rows = await db
    .select()
    .from(curricula)
    .where(eq(curricula.childId, childId))
    .orderBy(desc(curricula.createdAt));
  return rows.find((c) => {
    const w = planWeek(c.startsOn, date);
    return w >= 1 && w <= c.weeks;
  });
}

/** Разделы, в которых у ребёнка есть материалы: наборы карточек, игры, доступные видео. */
async function assignedPresent(db: Db, childId: string): Promise<Set<string | null>> {
  const rows = await db
    .select({
      deck: flashcardDecks.category,
      game: interactives.category,
      segment: videoSegments.subject,
      source: videoSources.status,
    })
    .from(childItems)
    .leftJoin(flashcardDecks, eq(flashcardDecks.id, childItems.deckId))
    .leftJoin(interactives, eq(interactives.id, childItems.interactiveId))
    .leftJoin(videoSegments, eq(videoSegments.id, childItems.segmentId))
    .leftJoin(videoSources, eq(videoSources.id, videoSegments.sourceId))
    .where(eq(childItems.childId, childId));
  return new Set<string | null>(
    rows.flatMap((r) => [
      r.deck,
      r.game ? gameCategory(r.game) : null,
      r.source === 'available' ? r.segment : null,
    ]),
  );
}

/** Без плана: разделы с материалами; «Игры» и «Разное» — только если других разделов нет. */
async function assignedSubjects(db: Db, childId: string): Promise<Subject[]> {
  const present = await assignedPresent(db, childId);
  const all = SUBJECTS.filter((s) => present.has(s));
  const main = all.filter((s) => s !== 'games' && s !== 'other');
  return main.length ? main : all;
}

/**
 * Предметы плана, которые сегодня есть чем открыть: тема этой или прошлой недели с материалами
 * или материалы раздела у ребёнка. Пустой раздел в «Сегодня» ребёнок открыть не может — его не ставим.
 */
async function curriculumSubjects(
  db: Db,
  childId: string,
  curriculum: NonNullable<Awaited<ReturnType<typeof activeCurriculum>>>,
  date: string,
): Promise<Subject[]> {
  const week = planWeek(curriculum.startsOn, date);
  const topics = await db
    .select({ subject: curriculumTopics.subject, items: curriculumTopics.items })
    .from(curriculumTopics)
    .where(
      and(
        eq(curriculumTopics.curriculumId, curriculum.id),
        inArray(curriculumTopics.week, [week, week - 1]),
      ),
    );
  const present = await assignedPresent(db, childId);
  for (const t of topics) if ((t.items as TopicItem[]).length) present.add(t.subject);
  return curriculum.subjects.filter(isSubject).filter((s) => present.has(s));
}

/** Сколько разных уроков-игр ребёнок прошёл сегодня — по предметам с дневной нормой уроков. */
async function lessonsToday(
  db: Db,
  childId: string,
  clock: { date: string; timezone: string; now: Date },
): Promise<Partial<Record<Subject, number>>> {
  const { date, timezone, now } = clock;
  const subjects = Object.keys(LESSONS_PER_DAY);
  const rows = await db
    .select({
      category: interactives.category,
      n: sql<number>`count(distinct ${interactives.id})::int`,
    })
    .from(events)
    .innerJoin(interactives, sql`${interactives.id}::text = ${events.payload}->>'interactiveId'`)
    .where(
      and(
        eq(events.childId, childId),
        eq(events.type, 'interactive_complete'),
        inArray(interactives.category, subjects),
        // Только за последние сутки (индекс), и из них — сегодняшние по часам ребёнка.
        gt(events.createdAt, new Date(now.getTime() - 30 * 3_600_000)),
        sql`to_char(${events.createdAt} at time zone ${timezone}, 'YYYY-MM-DD') = ${date}`,
      ),
    )
    .groupBy(interactives.category);
  return Object.fromEntries(rows.map((r) => [r.category, r.n]));
}

export interface Day {
  schedule: Schedule;
  clock: LocalClock;
  today: KidToday;
  /** Все предметы плана (из них выбираются предметы дня). */
  pool: Subject[];
  curriculum: Awaited<ReturnType<typeof activeCurriculum>>;
  control: typeof dayControls.$inferSelect | undefined;
  used: Partial<Record<Subject | 'free', number>>;
}

/** Состояние дня ребёнка на момент now. */
export async function loadDay(db: Db, childId: string, now: Date): Promise<Day> {
  const schedule = await loadSchedule(db, childId);
  const clock = localClock(now, schedule.timezone);
  const curriculum = await activeCurriculum(db, childId, clock.date);
  const pool = curriculum
    ? await curriculumSubjects(db, childId, curriculum, clock.date)
    : await assignedSubjects(db, childId);
  const [control] = await db
    .select()
    .from(dayControls)
    .where(and(eq(dayControls.childId, childId), eq(dayControls.date, clock.date)));
  const usage = await db
    .select()
    .from(dayUsage)
    .where(and(eq(dayUsage.childId, childId), eq(dayUsage.date, clock.date)));
  const used = Object.fromEntries(usage.map((u) => [u.activity, u.seconds]));
  const lessons = await lessonsToday(db, childId, {
    date: clock.date,
    timezone: schedule.timezone,
    now,
  });
  const extend = control?.openUntil
    ? Math.max(0, Math.floor((control.openUntil.getTime() - now.getTime()) / 1000))
    : 0;
  const today = computeToday({
    schedule,
    clock,
    subjects: daySubjects(pool, schedule.subjectsPerDay, clock.date),
    used,
    extraSeconds: control?.extraSeconds ?? 0,
    extendSeconds: extend,
    paused: control?.paused ?? false,
    ended: control?.ended ?? false,
    lessons,
  });
  return { schedule, clock, today, pool, curriculum, control, used };
}

/** Сигнал телефона: засчитать время с прошлого сигнала и запомнить, что на экране. */
export async function recordBeat(
  db: Db,
  childId: string,
  now: Date,
  beat: { activity: Activity; active: boolean; item: { kind: string; id: string } | null },
): Promise<Day> {
  const day = await loadDay(db, childId, now);
  const { control, clock, today } = day;
  const last = control?.lastBeatAt?.getTime();
  const gap = last ? now.getTime() - last : Infinity;
  const counts =
    beat.active &&
    beat.activity !== null &&
    today.mode === 'plan' &&
    !today.closed &&
    !today.paused &&
    gap <= BEAT_GAP_MS;
  if (counts) {
    const seconds = Math.min(BEAT_MAX_S, Math.round(gap / 1000));
    await db
      .insert(dayUsage)
      .values({ childId, date: clock.date, activity: beat.activity!, seconds })
      .onConflictDoUpdate({
        target: [dayUsage.childId, dayUsage.date, dayUsage.activity],
        set: { seconds: sql`${dayUsage.seconds} + ${seconds}`, updatedAt: now },
      });
  }
  await db
    .insert(dayControls)
    .values({
      childId,
      date: clock.date,
      lastBeatAt: now,
      activity: beat.activity,
      item: beat.item,
    })
    .onConflictDoUpdate({
      target: [dayControls.childId, dayControls.date],
      set: { lastBeatAt: now, activity: beat.activity, item: beat.item },
    });
  return counts ? loadDay(db, childId, now) : day;
}

/** Действие родителя над сегодняшним днём ребёнка. */
export async function applyControl(
  db: Db,
  childId: string,
  now: Date,
  action: { action: 'pause' | 'resume' | 'end' | 'reopen' } | { action: 'add'; minutes: number },
) {
  const day = await loadDay(db, childId, now);
  const key = { childId, date: day.clock.date };
  const set: Partial<typeof dayControls.$inferInsert> = {};
  switch (action.action) {
    case 'pause':
      set.paused = true;
      break;
    case 'resume':
      set.paused = false;
      break;
    case 'end':
      set.ended = true;
      break;
    case 'reopen':
      set.ended = false;
      break;
    case 'add': {
      const add = action.minutes * 60;
      set.extraSeconds = (day.control?.extraSeconds ?? 0) + add;
      set.ended = false;
      // Окно закончится раньше, чем добавленное время, — продлеваем окно.
      const windowLeft = day.today.windowSecondsLeft ?? Infinity;
      if (windowLeft < add) set.openUntil = new Date(now.getTime() + (windowLeft + add) * 1000);
      break;
    }
  }
  await db
    .insert(dayControls)
    .values({ ...key, ...set })
    .onConflictDoUpdate({ target: [dayControls.childId, dayControls.date], set });
}

/** Все материалы ребёнка с названиями и предметами — для раскладки по темам плана. */
export async function childMaterials(db: Db, childId: string): Promise<FillMaterial[]> {
  const rows = await db
    .select({
      segmentId: childItems.segmentId,
      deckId: childItems.deckId,
      interactiveId: childItems.interactiveId,
      deck: flashcardDecks.category,
      deckTitle: flashcardDecks.title,
      game: interactives.category,
      gameTitle: interactives.title,
      segment: videoSegments.subject,
      segmentTitle: videoSegments.title,
      sourceTitle: videoSources.title,
      sourceStatus: videoSources.status,
    })
    .from(childItems)
    .leftJoin(flashcardDecks, eq(flashcardDecks.id, childItems.deckId))
    .leftJoin(interactives, eq(interactives.id, childItems.interactiveId))
    .leftJoin(videoSegments, eq(videoSegments.id, childItems.segmentId))
    .leftJoin(videoSources, eq(videoSources.id, videoSegments.sourceId))
    .where(eq(childItems.childId, childId))
    .orderBy(childItems.position);
  const out: FillMaterial[] = [];
  for (const r of rows) {
    if (r.segmentId) {
      if (r.segment && isSubject(r.segment) && r.sourceStatus === 'available')
        out.push({
          item: { kind: 'segment', refId: r.segmentId },
          title: `${r.segmentTitle} ${r.sourceTitle ?? ''}`,
          subject: r.segment,
        });
    } else if (r.deckId && r.deck && isSubject(r.deck))
      out.push({ item: { kind: 'deck', refId: r.deckId }, title: r.deckTitle!, subject: r.deck });
    else if (r.interactiveId && r.game)
      out.push({
        item: { kind: 'interactive', refId: r.interactiveId },
        title: r.gameTitle!,
        subject: gameCategory(r.game),
      });
  }
  return out;
}

/** Материалы раздела у ребёнка — урок без плана или без темы на эту неделю. */
async function assignedRefs(db: Db, childId: string, subject: Subject): Promise<ItemRef[]> {
  const rows = await db
    .select({
      segmentId: childItems.segmentId,
      deckId: childItems.deckId,
      interactiveId: childItems.interactiveId,
      deck: flashcardDecks.category,
      game: interactives.category,
      segment: videoSegments.subject,
    })
    .from(childItems)
    .leftJoin(flashcardDecks, eq(flashcardDecks.id, childItems.deckId))
    .leftJoin(interactives, eq(interactives.id, childItems.interactiveId))
    .leftJoin(videoSegments, eq(videoSegments.id, childItems.segmentId))
    .where(eq(childItems.childId, childId))
    .orderBy(childItems.position);
  return rows
    .filter(
      (r) =>
        r.deck === subject || (r.game && gameCategory(r.game) === subject) || r.segment === subject,
    )
    .map(({ segmentId, deckId, interactiveId }) => ({ segmentId, deckId, interactiveId }));
}

const toRef = (i: TopicItem): ItemRef => ({
  segmentId: i.kind === 'segment' ? i.refId : null,
  deckId: i.kind === 'deck' ? i.refId : null,
  interactiveId: i.kind === 'interactive' ? i.refId : null,
});
const refKey = (r: ItemRef) => r.segmentId ?? r.deckId ?? r.interactiveId ?? '';

/**
 * Порядок урока: видео чередуется с карточками и играми (видео → квиз → карточки/игра → видео…);
 * каждый день — с другого места, чтобы уроки не повторялись один в один.
 */
export function lessonOrder(refs: readonly ItemRef[], date: string): ItemRef[] {
  const shift = <T>(a: T[]) => {
    if (!a.length) return a;
    const k = dayNumber(date) % a.length;
    return [...a.slice(k), ...a.slice(0, k)];
  };
  const videos = shift(refs.filter((r) => r.segmentId));
  const rest = shift(refs.filter((r) => !r.segmentId));
  const out: ItemRef[] = [];
  while (videos.length || rest.length) {
    if (videos.length) out.push(videos.shift()!);
    if (rest.length) out.push(rest.shift()!);
  }
  return out;
}

/** Урок по предмету на сегодня: тема недели (+ повторение прошлой), иначе материалы раздела. */
export async function lessonRefs(
  db: Db,
  childId: string,
  subject: Subject,
  day: Day,
): Promise<ItemRef[]> {
  if (day.curriculum) {
    const week = planWeek(day.curriculum.startsOn, day.clock.date);
    const topics = await db
      .select()
      .from(curriculumTopics)
      .where(
        and(
          eq(curriculumTopics.curriculumId, day.curriculum.id),
          eq(curriculumTopics.subject, subject),
          inArray(curriculumTopics.week, [week, week - 1]),
        ),
      )
      .orderBy(desc(curriculumTopics.week), curriculumTopics.position);
    const items = (w: number) =>
      topics.filter((t) => t.week === w).flatMap((t) => (t.items as TopicItem[]).map(toRef));
    const current = items(week);
    if (current.length) {
      // Повторение: материалы прошлой недели — после новых.
      const seen = new Set(current.map(refKey));
      return [
        ...lessonOrder(current, day.clock.date),
        ...items(week - 1).filter((r) => !seen.has(refKey(r))),
      ];
    }
  }
  return lessonOrder(await assignedRefs(db, childId, subject), day.clock.date);
}
