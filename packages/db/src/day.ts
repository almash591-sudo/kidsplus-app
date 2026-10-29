// День ребёнка по расписанию (этап 4): предметы дня, учёт времени, уроки, управление родителем.
// Время считает только сервер — по сигналам телефона (heartbeat) раз в ~15 с.
import type { Db } from './index';
import * as schema from './schema';
import { gameCategory } from '@kidsplus/shared/api';
import { bedtimeAt, DEFAULT_BEDTIME, type BedtimeSettings } from '@kidsplus/shared/bedtime';
import { BOOK_CODES } from '@kidsplus/shared/books';
import { stems, type FillMaterial } from '@kidsplus/shared/plan-fill';
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
  type ControlRequest,
  type EyeBreak,
  type EyeBreakAsk,
  type KidToday,
  type LocalClock,
  type Schedule,
  type Subject,
  type TopicItem,
} from '@kidsplus/shared/schedule';
import { and, desc, eq, gt, inArray, isNull, sql } from 'drizzle-orm';

/** Ссылка на материал: фрагмент видео, набор карточек или игра. */
export interface ItemRef {
  segmentId: string | null;
  deckId: string | null;
  interactiveId: string | null;
}

const {
  children,
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

/** Расписание сна ребёнка (этап 31); нет записи — выключено. */
export async function loadBedtime(
  db: Db,
  childId: string,
): Promise<{
  settings: BedtimeSettings;
  skipNight: string | null;
  book: { chapter: number; night: string | null };
}> {
  const [row] = await db.select().from(schema.bedtimes).where(eq(schema.bedtimes.childId, childId));
  if (!row)
    return { settings: DEFAULT_BEDTIME, skipNight: null, book: { chapter: 0, night: null } };
  // Книжку убрали из библиотеки — как будто не выбрана.
  const bookCode = BOOK_CODES.find((c) => c === row.bookCode) ?? null;
  return {
    settings: {
      enabled: row.enabled,
      at: row.at,
      wakeAt: row.wakeAt,
      days: row.days as BedtimeSettings['days'],
      warnMinutes: row.warnMinutes,
      companion: row.companion as BedtimeSettings['companion'],
      trackId: row.trackId,
      bookCode,
    },
    skipNight: row.skipNight,
    book: { chapter: row.bookChapter, night: row.bookNight },
  };
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
  const [child] = await db
    .select({
      volume: children.volume,
      rest: children.rest,
      eyeBreakEvery: children.eyeBreakEvery,
      eyeBreakRest: children.eyeBreakRest,
      eyeBreakAt: children.eyeBreakAt,
      eyeBreakUntil: children.eyeBreakUntil,
      eyeBreakAsk: children.eyeBreakAsk,
    })
    .from(children)
    .where(eq(children.id, childId));
  const rest = (child?.rest ?? null) as KidToday['rest'];
  const sleep = await loadBedtime(db, childId);
  const bedtime = bedtimeAt(clock, sleep.settings, sleep.skipNight);
  const night = bedtime?.phase === 'night';
  const today: KidToday = {
    ...computeToday({
      schedule,
      clock,
      subjects: daySubjects(pool, schedule.subjectsPerDay, clock.date),
      used,
      extraSeconds: control?.extraSeconds ?? 0,
      extendSeconds: extend,
      // «Экран выключен с поводом» и ночь — время занятий стоит, как на паузе.
      paused: (control?.paused ?? false) || rest !== null || night,
      ended: control?.ended ?? false,
      lessons,
    }),
    rest,
    // «Позвать» живёт 3 минуты: позже телефон, включившись, уже не зовёт.
    calledAt:
      control?.calledAt && now.getTime() - control.calledAt.getTime() < 3 * 60_000
        ? control.calledAt.toISOString()
        : null,
    volume: child?.volume ?? null,
    bedtime,
    eyeBreak: child ? eyeBreakNow(child, now) : null,
  };
  return { schedule, clock, today, pool, curriculum, control, used };
}

/** Перерыв для глаз (этап 50) на момент now: настройки ребёнка и текущий перерыв. */
export function eyeBreakNow(
  c: {
    eyeBreakEvery: number | null;
    eyeBreakRest: number;
    eyeBreakAt: Date | null;
    eyeBreakUntil: Date | null;
    eyeBreakAsk: string | null;
  },
  now: Date,
): EyeBreak | null {
  if (c.eyeBreakEvery === null) return null;
  const current =
    c.eyeBreakAt && c.eyeBreakUntil
      ? {
          id: c.eyeBreakAt.toISOString(),
          secondsLeft: Math.max(0, Math.ceil((c.eyeBreakUntil.getTime() - now.getTime()) / 1000)),
          ask: (c.eyeBreakAsk ?? null) as EyeBreakAsk | null,
        }
      : null;
  return { every: c.eyeBreakEvery, rest: c.eyeBreakRest, current };
}

/**
 * Телефон: время экрана вышло — перерыв начинается (если уже не идёт); ребёнок просит ещё —
 * просьба запоминается один раз за перерыв. Возвращает, ушла ли просьба впервые (push родителю).
 */
export async function eyeBreakAction(
  db: Db,
  childId: string,
  now: Date,
  action: 'start' | 'ask',
): Promise<{ asked: boolean }> {
  const [c] = await db
    .select({
      every: children.eyeBreakEvery,
      rest: children.eyeBreakRest,
      until: children.eyeBreakUntil,
    })
    .from(children)
    .where(eq(children.id, childId));
  if (!c || c.every === null) return { asked: false };
  const active = c.until !== null && c.until.getTime() > now.getTime();
  if (action === 'start') {
    if (!active)
      await db
        .update(children)
        .set({
          eyeBreakAt: now,
          eyeBreakUntil: new Date(now.getTime() + c.rest * 60_000),
          eyeBreakAsk: null,
        })
        .where(eq(children.id, childId));
    return { asked: false };
  }
  if (!active) return { asked: false };
  // Условное обновление: две просьбы подряд не пришлют push дважды.
  const first = await db
    .update(children)
    .set({ eyeBreakAsk: 'asked' })
    .where(
      and(eq(children.id, childId), isNull(children.eyeBreakAsk), gt(children.eyeBreakUntil, now)),
    )
    .returning({ id: children.id });
  return { asked: first.length > 0 };
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
export async function applyControl(db: Db, childId: string, now: Date, action: ControlRequest) {
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
    case 'rest':
    case 'wake':
      // «Разбудить» ночью снимает и ночь по расписанию сна (только эту).
      if (action.action === 'wake' && day.today.bedtime?.phase === 'night')
        await db
          .update(schema.bedtimes)
          .set({ skipNight: day.today.bedtime.night })
          .where(eq(schema.bedtimes.childId, childId));
      await db
        .update(children)
        .set({ rest: action.action === 'rest' ? action.reason : null })
        .where(eq(children.id, childId));
      return;
    case 'call':
      set.calledAt = now;
      break;
    case 'volume':
      // Громкость — свойство телефона, а не дня.
      await db.update(children).set({ volume: action.level }).where(eq(children.id, childId));
      return;
    case 'eyeBreak': {
      // Только идущий перерыв: «разрешить» снимает его, «пусть отдохнёт» — ответ на просьбу.
      const active = and(eq(children.id, childId), gt(children.eyeBreakUntil, now));
      await db
        .update(children)
        .set(action.allow ? { eyeBreakUntil: now, eyeBreakAsk: 'yes' } : { eyeBreakAsk: 'no' })
        .where(active);
      return;
    }
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

/**
 * Видео темы, которое стало недоступно (удалено, YouTube не даёт встроить), заменяется другим
 * доступным видео ребёнка по тому же предмету — сначала похожим по названию. Замены нет — пункт
 * просто выпадает (buildKidItems недоступное не отдаёт).
 */
async function replaceUnavailable(
  db: Db,
  childId: string,
  subject: Subject,
  refs: ItemRef[],
): Promise<ItemRef[]> {
  const ids = refs.flatMap((r) => (r.segmentId ? [r.segmentId] : []));
  if (!ids.length) return refs;
  const rows = await db
    .select({ id: videoSegments.id, title: videoSegments.title, status: videoSources.status })
    .from(videoSegments)
    .innerJoin(videoSources, eq(videoSources.id, videoSegments.sourceId))
    .where(inArray(videoSegments.id, ids));
  const broken = new Map(
    rows.filter((r) => r.status !== 'available').map((r) => [r.id, r.title] as const),
  );
  // Удалённые фрагменты (нет строки) — тоже заменяем.
  for (const id of ids) if (!rows.some((r) => r.id === id)) broken.set(id, '');
  if (!broken.size) return refs;

  const used = new Set(refs.map(refKey));
  const spare = (await childMaterials(db, childId)).filter(
    (m) => m.subject === subject && m.item.kind === 'segment' && !used.has(m.item.refId),
  );
  return refs.flatMap((r) => {
    if (!r.segmentId || !broken.has(r.segmentId)) return [r];
    const want = stems(broken.get(r.segmentId)!);
    let best = 0;
    let bestScore = -1;
    spare.forEach((m, i) => {
      let n = 0;
      for (const x of stems(m.title)) if (want.has(x)) n++;
      if (n > bestScore) {
        bestScore = n;
        best = i;
      }
    });
    const [pick] = spare.splice(best, 1);
    return pick ? [{ segmentId: pick.item.refId, deckId: null, interactiveId: null }] : [];
  });
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
      return replaceUnavailable(db, childId, subject, [
        ...lessonOrder(current, day.clock.date),
        ...items(week - 1).filter((r) => !seen.has(refKey(r))),
      ]);
    }
  }
  return lessonOrder(await assignedRefs(db, childId, subject), day.clock.date);
}
