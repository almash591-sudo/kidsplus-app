// Журнал действий ребёнка за день (этап 29): события телефона, звонки и снимки — одной лентой.
import { schema, type Db } from '@kidsplus/db';
import { loadSchedule } from '@kidsplus/db/day';
import { POEMS, type Poem, type PoemGenre } from '@kidsplus/shared/poems';
import { localClock, type ActivityEntry } from '@kidsplus/shared/schedule';
import { and, desc, eq, gte, inArray } from 'drizzle-orm';

const {
  callMembers,
  calls,
  events,
  flashcardDecks,
  habitMarks,
  habits,
  interactives,
  kidCaptures,
  rewardGrants,
  videoSegments,
  videoSources,
} = schema;

const DAY_MS = 86_400_000;

/** «Учил сказку…», «Послушал рассказ…»; потешка и стихотворение — «стих». */
const POEM_WHAT: Partial<Record<PoemGenre, string>> = {
  tale: 'сказку',
  fable: 'басню',
  story: 'рассказ',
};

/**
 * Стих или сказка (этап 45): что выучено — «Учил стих «Осень наступила»: часть 2 из 4»,
 * «Выучил наизусть…», «Рассказал вместе с голосом…». Не стих — null.
 */
function poemDone(p: Record<string, unknown>): string | null {
  const poem = (POEMS as Record<string, Poem>)[String(p.poem)];
  if (p.kind !== 'poem' || !poem) return null;
  const what = POEM_WHAT[poem.genre] ?? 'стих';
  const title = `«${poem.title}»`;
  const parts = Number(p.parts) || 0;
  if (p.recall === true) return `Рассказал вместе с голосом ${what} ${title}`;
  if (p.learned === true) return `Выучил наизусть ${what} ${title}`;
  if (parts && Number(p.part) > 0)
    return `Учил ${what} ${title}: часть ${Number(p.part)} из ${parts}`;
  return `Послушал ${what} ${title}`;
}

export async function childActivity(
  db: Db,
  childId: string,
  now: Date,
  date?: string,
): Promise<{ date: string; entries: ActivityEntry[] }> {
  const { timezone } = await loadSchedule(db, childId);
  const day = date ?? localClock(now, timezone).date;
  // С запасом в сутки по обе стороны — часовой пояс расписания; лишнее отсечёт localClock.
  const from = new Date(Date.parse(`${day}T00:00:00Z`) - DAY_MS);
  const to = new Date(from.getTime() + 3 * DAY_MS);
  const inDay = (d: Date) => d < to && localClock(d, timezone).date === day;

  const rows = (
    await db
      .select()
      .from(events)
      .where(and(eq(events.childId, childId), gte(events.createdAt, from)))
      .orderBy(desc(events.createdAt))
      .limit(2000)
  ).filter((e) => inDay(e.createdAt));

  const segIds = [...new Set(rows.flatMap((e) => (e.segmentId ? [e.segmentId] : [])))];
  const ids = (key: string) => [
    ...new Set(
      rows.flatMap((e) => (typeof e.payload?.[key] === 'string' ? [e.payload[key] as string] : [])),
    ),
  ];
  const videoTitle = new Map(
    segIds.length
      ? (
          await db
            .select({ id: videoSegments.id, title: videoSources.title })
            .from(videoSegments)
            .innerJoin(videoSources, eq(videoSources.id, videoSegments.sourceId))
            .where(inArray(videoSegments.id, segIds))
        ).map((r) => [r.id, r.title])
      : [],
  );
  const deckIds = ids('deckId');
  const deckTitle = new Map(
    deckIds.length
      ? (
          await db
            .select({ id: flashcardDecks.id, title: flashcardDecks.title })
            .from(flashcardDecks)
            .where(inArray(flashcardDecks.id, deckIds))
        ).map((r) => [r.id, r.title])
      : [],
  );
  const gameIds = ids('interactiveId');
  const gameTitle = new Map(
    gameIds.length
      ? (
          await db
            .select({ id: interactives.id, title: interactives.title })
            .from(interactives)
            .where(inArray(interactives.id, gameIds))
        ).map((r) => [r.id, r.title])
      : [],
  );

  const entries: ActivityEntry[] = [];
  const add = (at: Date, kind: ActivityEntry['kind'], text: string) =>
    entries.push({ at: at.toISOString(), kind, text });
  const q = (s: string | undefined) => (s ? `«${s}»` : '');

  // Ответы на вопросы — сводкой к «вопросы пройдены»: идём от старых событий к новым.
  let answers = { total: 0, first: 0 };
  for (const e of [...rows].reverse()) {
    const p = e.payload ?? {};
    const video = q(e.segmentId ? videoTitle.get(e.segmentId) : undefined);
    switch (e.type) {
      case 'segment_start':
        add(e.createdAt, 'video', `Начал смотреть видео ${video}`.trim());
        break;
      case 'segment_complete':
        add(e.createdAt, 'video', `Досмотрел видео ${video}`.trim());
        break;
      case 'segment_exit':
        add(e.createdAt, 'video', `Вышел из видео ${video}`.trim());
        break;
      case 'segment_error':
        add(e.createdAt, 'video', `Видео не открылось ${video}`.trim());
        break;
      case 'quiz_answer':
        answers.total++;
        if (p.firstTry === true) answers.first++;
        break;
      case 'quiz_complete': {
        const n = Number(p.questions) || answers.total;
        add(
          e.createdAt,
          'quiz',
          answers.total
            ? `Ответил на вопросы: ${n}, с первой попытки — ${answers.first}`
            : `Ответил на вопросы: ${n}`,
        );
        answers = { total: 0, first: 0 };
        break;
      }
      case 'deck_complete':
        add(
          e.createdAt,
          'deck',
          `Прошёл карточки ${q(deckTitle.get(p.deckId as string))}${p.cards ? ` (${Number(p.cards)} шт.)` : ''}`.trim(),
        );
        break;
      case 'interactive_complete':
        add(
          e.createdAt,
          'game',
          poemDone(p) ?? `Прошёл игру ${q(gameTitle.get(p.interactiveId as string))}`.trim(),
        );
        break;
      // Этап 44: открыл и ушёл, не пройдя.
      case 'deck_exit':
        add(
          e.createdAt,
          'deck',
          `Вышел из карточек ${q(deckTitle.get(p.deckId as string))}${p.seen && p.cards ? ` на ${Number(p.seen)} из ${Number(p.cards)}` : ''}`.trim(),
        );
        break;
      case 'interactive_exit':
        add(
          e.createdAt,
          'game',
          `Вышел из игры ${q(gameTitle.get(p.interactiveId as string))}`.trim(),
        );
        break;
      case 'app_hidden':
        add(e.createdAt, 'app', 'Свернул приложение');
        break;
      case 'app_visible':
        add(e.createdAt, 'app', 'Вернулся в приложение');
        break;
    }
  }

  const peer = `c:${childId}`;
  const callRows = await db
    .select({ call: calls, member: callMembers })
    .from(callMembers)
    .innerJoin(calls, eq(calls.id, callMembers.callId))
    .where(and(eq(callMembers.peer, peer), gte(calls.createdAt, from)));
  for (const { call, member } of callRows) {
    if (!inDay(call.createdAt) || call.monitor) continue;
    const kind = call.video ? 'Видеозвонок' : 'Звонок';
    const mins =
      member.joinedAt && member.leftAt
        ? Math.max(1, Math.round((member.leftAt.getTime() - member.joinedAt.getTime()) / 60_000))
        : null;
    const text =
      member.state === 'missed' || member.state === 'declined' || !member.joinedAt
        ? `${kind}: не ответил`
        : `${kind}${call.createdBy === peer ? ' (позвонил сам)' : ''}${mins ? `, ${mins} мин` : ''}`;
    add(call.createdAt, 'call', text);
  }

  const shots = await db
    .select({ kind: kidCaptures.kind, takenAt: kidCaptures.takenAt })
    .from(kidCaptures)
    .where(and(eq(kidCaptures.childId, childId), gte(kidCaptures.takenAt, from)));
  for (const s of shots)
    if (inDay(s.takenAt))
      add(s.takenAt, 'capture', s.kind === 'video' ? 'Снял видео' : 'Сделал фото');

  // Привычки (этап 30): отметки дня и выданные награды.
  const done = await db
    .select({ at: habitMarks.at, title: habits.title })
    .from(habitMarks)
    .innerJoin(habits, eq(habits.id, habitMarks.habitId))
    .where(and(eq(habitMarks.childId, childId), eq(habitMarks.date, day)));
  for (const m of done) add(m.at, 'habit', `Сделал: ${m.title.toLowerCase()} ⭐`);
  const grants = await db
    .select({ at: rewardGrants.at, title: rewardGrants.title, price: rewardGrants.price })
    .from(rewardGrants)
    .where(and(eq(rewardGrants.childId, childId), gte(rewardGrants.at, from)));
  for (const g of grants)
    if (inDay(g.at)) add(g.at, 'habit', `Награда: ${g.title} (−${g.price} ⭐)`);

  entries.sort((a, b) => b.at.localeCompare(a.at));
  return { date: day, entries };
}
