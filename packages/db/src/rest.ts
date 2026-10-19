// «Пройденное отдыхает» (этап 34): дети по пятому кругу открывали одно и то же. По журналу
// событий — сколько раз и когда пройден каждый пункт; пройденное сегодня отдыхает до завтра,
// «выученное» (3 раза) — неделю (или навсегда — по настройке родителя).
import type { RepeatMode } from '@kidsplus/shared/api';
import { localClock } from '@kidsplus/shared/schedule';
import { and, eq, gte, inArray } from 'drizzle-orm';
import type { Db } from './index';
import { events } from './schema';

export type RestState = 'today' | 'learned';
export type RestKind = 'segment' | 'deck' | 'interactive';
export const restKey = (kind: RestKind, id: string) => `${kind}:${id}`;

/** Сколько раз пройти, чтобы пункт стал «выученным». */
export const LEARNED_TIMES = 3;
const LEARNED_REST_MS = 7 * 86_400_000;
const HISTORY_MS = 60 * 86_400_000;

const DONE = {
  segment_complete: 'segment',
  deck_complete: 'deck',
  interactive_complete: 'interactive',
} as const;

/** Расчёт по готовым прохождениям (без базы) — для тестов и для `restMap`. */
export function restFrom(
  done: { key: string; at: Date }[],
  now: Date,
  timezone: string,
  mode: RepeatMode,
): Map<string, RestState> {
  const out = new Map<string, RestState>();
  if (mode === 'free') return out;
  const today = localClock(now, timezone).date;
  const stat = new Map<string, { n: number; last: Date }>();
  for (const d of done) {
    const s = stat.get(d.key);
    if (!s) stat.set(d.key, { n: 1, last: d.at });
    else {
      s.n++;
      if (d.at > s.last) s.last = d.at;
    }
  }
  for (const [key, s] of stat) {
    if (localClock(s.last, timezone).date === today) out.set(key, 'today');
    else if (
      s.n >= LEARNED_TIMES &&
      (mode === 'never' || now.getTime() - s.last.getTime() < LEARNED_REST_MS)
    )
      out.set(key, 'learned');
  }
  return out;
}

/** Что сейчас «отдыхает» у ребёнка: ключ `kind:id` → почему. */
export async function restMap(
  db: Db,
  childId: string,
  now: Date,
  timezone: string,
  mode: RepeatMode,
): Promise<Map<string, RestState>> {
  if (mode === 'free') return new Map();
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
        inArray(events.type, Object.keys(DONE)),
        gte(events.createdAt, new Date(now.getTime() - HISTORY_MS)),
      ),
    );
  const done = rows.flatMap((r) => {
    const kind = DONE[r.type as keyof typeof DONE];
    const id =
      kind === 'segment'
        ? r.segmentId
        : (r.payload?.[kind === 'deck' ? 'deckId' : 'interactiveId'] as string | undefined);
    return id ? [{ key: restKey(kind, id), at: r.at }] : [];
  });
  return restFrom(done, now, timezone, mode);
}
