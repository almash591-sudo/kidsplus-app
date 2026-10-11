// Аналитика по ребёнку за период (п. 9 ТЗ): время, точность квизов, слабые места, видео, план.
import type { Db } from './index';
import * as schema from './schema';
import {
  EASY_MS,
  EASY_RATE,
  MIN_ANSWERS,
  rate,
  WEAK_RATE,
  type AnswerStats,
  type ChildAnalytics,
  type MaterialStats,
} from '@kidsplus/shared/analytics';
import { gameCategory } from '@kidsplus/shared/api';
import { dayNumber, planWeek, SUBJECTS, type Subject } from '@kidsplus/shared/schedule';
import { and, eq, gte, inArray } from 'drizzle-orm';
import { loadDay, type ItemRef } from './day';

const {
  childItems,
  curriculumTopics,
  dayUsage,
  events,
  flashcardDecks,
  videoSegments,
  videoSources,
} = schema;

/** Ответ квиза из события quiz_answer. */
export interface Answer {
  kind: 'segment' | 'deck';
  id: string;
  firstTry: boolean;
  timeMs: number;
}

const emptyStats = (): AnswerStats => ({ answers: 0, firstTry: 0, avgMs: null });

function add(s: AnswerStats, a: Answer) {
  const total = (s.avgMs ?? 0) * s.answers + a.timeMs;
  s.answers++;
  if (a.firstTry) s.firstTry++;
  s.avgMs = Math.round(total / s.answers);
}

/** Точность по материалам; слабые (повторить) и лёгкие (можно сложнее). */
export function materialStats(
  answers: readonly Answer[],
  meta: Map<string, { title: string; subject: Subject | null }>,
) {
  const by = new Map<string, MaterialStats>();
  for (const a of answers) {
    const m = meta.get(a.id);
    if (!m) continue;
    let s = by.get(a.id);
    if (!s) by.set(a.id, (s = { kind: a.kind, id: a.id, ...m, ...emptyStats() }));
    add(s, a);
  }
  const materials = [...by.values()].sort((a, b) => b.answers - a.answers);
  const enough = materials.filter((m) => m.answers >= MIN_ANSWERS);
  return {
    materials,
    weak: enough
      .filter((m) => (rate(m) ?? 1) < WEAK_RATE)
      .sort((a, b) => (rate(a) ?? 0) - (rate(b) ?? 0)),
    easy: enough.filter((m) => (rate(m) ?? 0) >= EASY_RATE && (m.avgMs ?? Infinity) <= EASY_MS),
  };
}

const isSubject = (v: string | null | undefined): v is Subject =>
  Boolean(v && (SUBJECTS as readonly string[]).includes(v));

/** Ответы за период и названия/предметы материалов. */
async function loadAnswers(db: Db, childId: string, since: Date) {
  const rows = await db
    .select()
    .from(events)
    .where(and(eq(events.childId, childId), gte(events.createdAt, since)));
  const answers: Answer[] = [];
  for (const e of rows) {
    if (e.type !== 'quiz_answer') continue;
    const p = (e.payload ?? {}) as Record<string, unknown>;
    const timeMs = Number(p.timeMs);
    const base = { firstTry: p.firstTry === true, timeMs: Number.isFinite(timeMs) ? timeMs : 0 };
    if (e.segmentId) answers.push({ kind: 'segment', id: e.segmentId, ...base });
    else if (typeof p.deckId === 'string') answers.push({ kind: 'deck', id: p.deckId, ...base });
  }
  const segIds = [...new Set(answers.filter((a) => a.kind === 'segment').map((a) => a.id))];
  const deckIds = [...new Set(answers.filter((a) => a.kind === 'deck').map((a) => a.id))];
  const meta = new Map<string, { title: string; subject: Subject | null }>();
  if (segIds.length)
    for (const s of await db
      .select({ id: videoSegments.id, title: videoSegments.title, subject: videoSegments.subject })
      .from(videoSegments)
      .where(inArray(videoSegments.id, segIds)))
      meta.set(s.id, { title: s.title, subject: isSubject(s.subject) ? s.subject : null });
  if (deckIds.length)
    for (const d of await db
      .select({
        id: flashcardDecks.id,
        title: flashcardDecks.title,
        category: flashcardDecks.category,
      })
      .from(flashcardDecks)
      .where(inArray(flashcardDecks.id, deckIds)))
      meta.set(d.id, { title: d.title, subject: gameCategory(d.category) });
  return { rows, answers, meta };
}

const isoDay = (n: number) => new Date(n * 86_400_000).toISOString().slice(0, 10);

/** Сводка за последние `days` дней (по часовому поясу расписания). */
export async function childAnalytics(
  db: Db,
  childId: string,
  now: Date,
  days: number,
): Promise<ChildAnalytics> {
  const day = await loadDay(db, childId, now);
  const toN = dayNumber(day.clock.date);
  const from = isoDay(toN - days + 1);
  const since = new Date(now.getTime() - days * 86_400_000);
  const { rows, answers, meta } = await loadAnswers(db, childId, since);

  const usage = await db
    .select()
    .from(dayUsage)
    .where(and(eq(dayUsage.childId, childId), gte(dayUsage.date, from)));
  const dayList = Array.from({ length: days }, (_, i) => {
    const date = isoDay(toN - days + 1 + i);
    const seconds: ChildAnalytics['days'][number]['seconds'] = {};
    for (const u of usage) if (u.date === date) seconds[u.activity as Subject | 'free'] = u.seconds;
    return { date, seconds };
  });

  const { materials, weak, easy } = materialStats(answers, meta);
  const subjectSet = new Set<Subject>([
    ...day.pool,
    ...usage.map((u) => u.activity).filter(isSubject),
    ...materials.flatMap((m) => (m.subject ? [m.subject] : [])),
  ]);
  const subjects = SUBJECTS.filter((s) => subjectSet.has(s)).map((subject) => {
    const s = { subject, seconds: 0, ...emptyStats() };
    for (const u of usage) if (u.activity === subject) s.seconds += u.seconds;
    for (const a of answers) if (meta.get(a.id)?.subject === subject) add(s, a);
    return s;
  });

  const count = (type: string) => rows.filter((e) => e.type === type).length;
  const unavailable = await db
    .select({ id: videoSegments.id, title: videoSegments.title })
    .from(childItems)
    .innerJoin(videoSegments, eq(videoSegments.id, childItems.segmentId))
    .innerJoin(videoSources, eq(videoSources.id, videoSegments.sourceId))
    .where(and(eq(childItems.childId, childId), eq(videoSources.status, 'unavailable')));

  let plan: ChildAnalytics['plan'] = null;
  if (day.curriculum) {
    const week = planWeek(day.curriculum.startsOn, day.clock.date);
    const topics = await db
      .select({ title: curriculumTopics.title })
      .from(curriculumTopics)
      .where(
        and(eq(curriculumTopics.curriculumId, day.curriculum.id), eq(curriculumTopics.week, week)),
      );
    plan = {
      title: day.curriculum.title,
      week,
      weeks: day.curriculum.weeks,
      topics: topics.map((t) => t.title),
    };
  }

  return {
    from,
    to: day.clock.date,
    days: dayList,
    subjects,
    materials,
    weak,
    easy,
    video: {
      started: count('segment_start'),
      completed: count('segment_complete'),
      exited: count('segment_exit'),
      unavailable,
    },
    done: {
      decks: count('deck_complete'),
      games: count('interactive_complete'),
      quizzes: count('quiz_complete'),
    },
    plan,
  };
}

const refKey = (r: ItemRef) => r.segmentId ?? r.deckId ?? r.interactiveId ?? '';

/** Урок с повторением: слабые материалы — вторым пунктом (после первого нового), без дублей. */
export function withReview(lesson: readonly ItemRef[], review: readonly ItemRef[]): ItemRef[] {
  if (!review.length) return [...lesson];
  const extra = new Set(review.map(refKey));
  const rest = lesson.filter((r) => !extra.has(refKey(r)));
  return [...rest.slice(0, 1), ...review, ...rest.slice(1)];
}

/** Окно для повторения слабых мест. */
const REVIEW_DAYS = 14;

/**
 * Повторение (п. 9 ТЗ): материалы предмета, где ребёнок чаще ошибается, — в ближайшие уроки,
 * пока точность не поднимется.
 */
export async function weakRefs(
  db: Db,
  childId: string,
  subject: Subject,
  now: Date,
): Promise<ItemRef[]> {
  const since = new Date(now.getTime() - REVIEW_DAYS * 86_400_000);
  const { answers, meta } = await loadAnswers(db, childId, since);
  return materialStats(answers, meta)
    .weak.filter((m) => m.subject === subject)
    .slice(0, 2)
    .map((m) => ({
      segmentId: m.kind === 'segment' ? m.id : null,
      deckId: m.kind === 'deck' ? m.id : null,
      interactiveId: null,
    }));
}
