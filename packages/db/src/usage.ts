// «Что нравится» (этап 44): по журналу событий — что ребёнок открывает сам, проходит, бросает
// и что назначено, но не открывается. Только по одному ребёнку своей семьи, без модели.
import {
  DROP_MIN_OPENS,
  UNOPENED_DAYS,
  UNOPENED_MIN_AGE_DAYS,
  USAGE_TOP,
  type ChildUsage,
  type UsageItem,
  type UsageKind,
  type UsageKindStats,
} from '@kidsplus/shared/analytics';
import type { GameKind } from '@kidsplus/shared/games';
import { planWeek } from '@kidsplus/shared/schedule';
import { and, eq, gte, inArray } from 'drizzle-orm';
import { loadDay } from './day';
import type { Db } from './index';
import * as schema from './schema';

const { childItems, curriculumTopics, events, flashcardDecks, interactives, videoSegments } =
  schema;

const DAY_MS = 86_400_000;
/** «Прошёл когда-то» — за этот срок: выученное отдыхает и в «не открывает» не попадает. */
const HISTORY_DAYS = 60;

type Step = 'open' | 'done' | 'left';
const STEPS: Record<string, [UsageKind, Step]> = {
  segment_start: ['segment', 'open'],
  segment_complete: ['segment', 'done'],
  segment_exit: ['segment', 'left'],
  deck_start: ['deck', 'open'],
  deck_complete: ['deck', 'done'],
  deck_exit: ['deck', 'left'],
  interactive_start: ['interactive', 'open'],
  interactive_complete: ['interactive', 'done'],
  interactive_exit: ['interactive', 'left'],
};
/** Видео не открылось — тоже «пробовал открыть». */
const TRIED = [...Object.keys(STEPS), 'segment_error'];

/** Событие журнала в виде для подсчёта. */
export interface UsageEvent {
  type: string;
  kind: UsageKind;
  id: string;
  at: Date;
  /** Урок «Сегодня» или сам выбрал (с этапа 44; раньше — нет). */
  from: string | null;
  /** Через сколько секунд ушёл — у выхода. */
  seconds: number | null;
}

export interface Tally {
  kind: UsageKind;
  id: string;
  starts: number;
  completed: number;
  left: number;
  chosen: number;
  leftSecs: number[];
}

export const usageKey = (kind: UsageKind, id: string) => `${kind}:${id}`;

const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return Math.round(s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2);
};

/** Счёт по пунктам: открыл, прошёл, ушёл сам, выбрал сам, через сколько уходит. */
export function tallyUsage(list: readonly UsageEvent[]): Map<string, Tally> {
  const out = new Map<string, Tally>();
  for (const e of list) {
    const step = STEPS[e.type]?.[1];
    if (!step) continue;
    const key = usageKey(e.kind, e.id);
    let t = out.get(key);
    if (!t)
      out.set(
        key,
        (t = { kind: e.kind, id: e.id, starts: 0, completed: 0, left: 0, chosen: 0, leftSecs: [] }),
      );
    if (step === 'open') {
      t.starts++;
      if (e.from === 'free') t.chosen++;
    } else if (step === 'done') t.completed++;
    else {
      t.left++;
      if (e.seconds !== null && e.seconds >= 0) t.leftSecs.push(e.seconds);
    }
  }
  return out;
}

/**
 * Открытий — не меньше, чем прохождений и выходов: до этапа 44 карточки и игры не сообщали
 * об открытии, а приложение могли закрыть, не дождавшись события.
 */
export const openedOf = (t: Pick<Tally, 'starts' | 'completed' | 'left'>) =>
  Math.max(t.starts, t.completed + t.left);

/** Любимое и брошенное из готовых строк. */
export function rankUsage(items: readonly UsageItem[]) {
  const part = (i: UsageItem) => (i.opened ? i.completed / i.opened : 0);
  const favorites = items
    .filter((i) => i.opened >= 2 && i.completed > 0 && part(i) >= 0.5)
    .sort(
      (a, b) => b.chosen * 2 + b.completed - (a.chosen * 2 + a.completed) || b.opened - a.opened,
    )
    .slice(0, USAGE_TOP);
  const dropped = items
    .filter((i) => i.opened >= DROP_MIN_OPENS && i.left > 0 && part(i) < 0.5)
    .sort((a, b) => b.opened - b.completed - (a.opened - a.completed) || b.left - a.left)
    .slice(0, USAGE_TOP);
  return { favorites, dropped };
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** Сводка «Что нравится» за последние `days` дней; «не открывает» — всегда за 30 дней. */
export async function childUsage(
  db: Db,
  childId: string,
  now: Date,
  days: number,
): Promise<ChildUsage> {
  const since = new Date(now.getTime() - days * DAY_MS);
  const rows = await db
    .select({
      type: events.type,
      segmentId: events.segmentId,
      payload: events.payload,
      at: events.createdAt,
    })
    .from(events)
    .where(
      and(
        eq(events.childId, childId),
        inArray(events.type, TRIED),
        gte(events.createdAt, new Date(now.getTime() - HISTORY_DAYS * DAY_MS)),
      ),
    );
  const assigned = await db.select().from(childItems).where(eq(childItems.childId, childId));

  // Пункты: из событий и из назначенного — названия, вид игры, начало видео.
  const refOf = (r: (typeof rows)[number]) => {
    const kind: UsageKind = r.type === 'segment_error' ? 'segment' : STEPS[r.type]![0];
    const id =
      kind === 'segment'
        ? r.segmentId
        : (r.payload?.[kind === 'deck' ? 'deckId' : 'interactiveId'] as string | undefined);
    return id ? { kind, id } : null;
  };
  const list = rows.flatMap((r) => {
    const ref = refOf(r);
    return ref ? [{ type: r.type, at: r.at, payload: r.payload ?? {}, ...ref }] : [];
  });
  const ids = {
    segment: new Set<string>(),
    deck: new Set<string>(),
    interactive: new Set<string>(),
  };
  for (const r of list) ids[r.kind].add(r.id);
  for (const a of assigned) {
    if (a.segmentId) ids.segment.add(a.segmentId);
    if (a.deckId) ids.deck.add(a.deckId);
    if (a.interactiveId) ids.interactive.add(a.interactiveId);
  }
  const segs = ids.segment.size
    ? await db
        .select({
          id: videoSegments.id,
          title: videoSegments.title,
          startSec: videoSegments.startSec,
          status: schema.videoSources.status,
        })
        .from(videoSegments)
        .innerJoin(schema.videoSources, eq(schema.videoSources.id, videoSegments.sourceId))
        .where(inArray(videoSegments.id, [...ids.segment]))
    : [];
  const decks = ids.deck.size
    ? await db
        .select({ id: flashcardDecks.id, title: flashcardDecks.title })
        .from(flashcardDecks)
        .where(inArray(flashcardDecks.id, [...ids.deck]))
    : [];
  const games = ids.interactive.size
    ? await db
        .select({
          id: interactives.id,
          title: interactives.title,
          kind: interactives.kind,
          category: interactives.category,
        })
        .from(interactives)
        .where(inArray(interactives.id, [...ids.interactive]))
    : [];
  const segBy = new Map(segs.map((s) => [s.id, s]));
  const gameBy = new Map(games.map((g) => [g.id, g]));
  const title = new Map<string, string>([
    ...segs.map((s) => [usageKey('segment', s.id), s.title] as const),
    ...decks.map((d) => [usageKey('deck', d.id), d.title] as const),
    ...games.map((g) => [usageKey('interactive', g.id), g.title] as const),
  ]);
  const gameKindOf = (kind: UsageKind, id: string) =>
    kind === 'interactive' ? ((gameBy.get(id)?.kind as GameKind | undefined) ?? null) : null;

  const toEvents = (from: Date) =>
    list.flatMap((r): UsageEvent[] => {
      if (r.at < from || !STEPS[r.type]) return [];
      const p = r.payload;
      // У видео — где остановился относительно начала фрагмента; у игр и карточек — секунды.
      const at = num(p.at);
      const start = segBy.get(r.id)?.startSec ?? 0;
      const seconds = r.kind === 'segment' ? (at === null ? null : at - start) : num(p.seconds);
      const fromWhere = typeof p.from === 'string' ? p.from : null;
      return [{ type: r.type, kind: r.kind, id: r.id, at: r.at, from: fromWhere, seconds }];
    });

  const items: UsageItem[] = [...tallyUsage(toEvents(since)).values()].flatMap((t) => {
    const name = title.get(usageKey(t.kind, t.id));
    if (!name) return []; // материал удалён
    return [
      {
        kind: t.kind,
        id: t.id,
        title: name,
        gameKind: gameKindOf(t.kind, t.id),
        opened: openedOf(t),
        completed: t.completed,
        left: t.left,
        chosen: t.chosen,
        leftAfterSec: median(t.leftSecs),
      },
    ];
  });

  const kinds = new Map<GameKind, UsageKindStats>();
  for (const i of items) {
    if (!i.gameKind) continue;
    const k = kinds.get(i.gameKind) ?? {
      kind: i.gameKind,
      opened: 0,
      completed: 0,
      left: 0,
      chosen: 0,
    };
    k.opened += i.opened;
    k.completed += i.completed;
    k.left += i.left;
    k.chosen += i.chosen;
    kinds.set(i.gameKind, k);
  }

  return {
    days,
    ...rankUsage(items),
    unopened: await unopenedItems(db, childId, now, list, assigned, {
      title,
      segBy,
      gameBy,
      gameKindOf,
    }),
    kinds: [...kinds.values()].sort(
      (a, b) => b.chosen - a.chosen || b.completed - a.completed || b.opened - a.opened,
    ),
  };
}

/**
 * Назначено не меньше 14 дней назад, а за 30 дней ни разу не открывал и за 60 не проходил.
 * Не в счёт: дорожки «Музыки» и «Букв» (уроки идут по порядку), материалы текущей и будущих
 * недель плана, недоступные видео (о них — отдельная строка). Ребёнок вообще не занимался —
 * список пуст: дело не в материалах.
 */
async function unopenedItems(
  db: Db,
  childId: string,
  now: Date,
  list: { type: string; at: Date; kind: UsageKind; id: string }[],
  assigned: (typeof childItems.$inferSelect)[],
  meta: {
    title: Map<string, string>;
    segBy: Map<string, { status: string }>;
    gameBy: Map<string, { category: string }>;
    gameKindOf: (kind: UsageKind, id: string) => GameKind | null;
  },
): Promise<ChildUsage['unopened']> {
  const recent = new Date(now.getTime() - UNOPENED_DAYS * DAY_MS);
  const touched = new Set<string>();
  let active = false;
  for (const r of list) {
    const done = STEPS[r.type]?.[1] === 'done';
    if (r.at >= recent || done) touched.add(usageKey(r.kind, r.id));
    if (r.at >= recent) active = true;
  }
  if (!active) return [];

  const planned = new Set<string>();
  const day = await loadDay(db, childId, now);
  if (day.curriculum) {
    const week = planWeek(day.curriculum.startsOn, day.clock.date);
    const topics = await db
      .select({ week: curriculumTopics.week, items: curriculumTopics.items })
      .from(curriculumTopics)
      .where(eq(curriculumTopics.curriculumId, day.curriculum.id));
    for (const t of topics)
      if (t.week >= week)
        for (const i of (t.items ?? []) as { kind: UsageKind; refId: string }[])
          planned.add(usageKey(i.kind, i.refId));
  }

  const old = new Date(now.getTime() - UNOPENED_MIN_AGE_DAYS * DAY_MS);
  return assigned
    .filter((a) => a.createdAt <= old)
    .flatMap((a) => {
      const id = a.segmentId ?? a.deckId ?? a.interactiveId;
      if (!id) return [];
      const kind = a.kind as UsageKind;
      const key = usageKey(kind, id);
      const name = meta.title.get(key);
      if (!name || touched.has(key) || planned.has(key)) return [];
      if (kind === 'segment' && meta.segBy.get(id)?.status === 'unavailable') return [];
      const category = meta.gameBy.get(id)?.category;
      if (kind === 'interactive' && (category === 'music' || category === 'letters')) return [];
      return [{ kind, id, title: name, gameKind: meta.gameKindOf(kind, id) }];
    });
}
