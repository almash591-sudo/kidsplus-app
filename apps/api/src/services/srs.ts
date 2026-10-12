// Интервальное повторение карточек (этап 15е) — коробки Лейтнера по истории проверок «Где …?».
// Верно с первой попытки — карточка уходит в следующую коробку и вернётся позже;
// ошибка — снова в первую, повторяется сразу. Карточки не прячутся — меняется только порядок:
// сначала «пора повторить», потом новые, в конце — выученные.
import { schema, type Db } from '@kidsplus/db';
import { and, asc, eq, sql } from 'drizzle-orm';

/** Через сколько дней повторять карточку из коробки N (1 — сразу). */
export const BOX_DAYS = [0, 0, 1, 3, 7, 14] as const;
export const MAX_BOX = BOX_DAYS.length - 1;

export interface CardState {
  box: number;
  dueAt: Date;
}

/** Коробка и срок повторения по истории ответов (по времени). */
export function leitner(history: readonly { firstTry: boolean; at: Date }[]): CardState | null {
  if (!history.length) return null;
  let box = 1;
  for (const h of history) box = h.firstTry ? Math.min(MAX_BOX, box + 1) : 1;
  const last = history.at(-1)!.at;
  return { box, dueAt: new Date(last.getTime() + BOX_DAYS[box]! * 86_400_000) };
}

/**
 * Порядок карточек набора: пора повторять (сначала младшие коробки), новые, выученные (срок
 * не подошёл — ближайшие раньше). Внутри групп — порядок, заданный родителем.
 */
export function orderCards<T extends { id: string }>(
  cards: readonly T[],
  states: ReadonlyMap<string, CardState>,
  now: Date,
): T[] {
  const rank = (c: T, i: number): [number, number, number] => {
    const s = states.get(c.id);
    if (!s) return [1, 0, i];
    // Первая коробка — ошибся недавно: повторить сразу, что бы ни показывали часы.
    if (s.box <= 1 || s.dueAt <= now) return [0, s.box, i];
    return [2, s.dueAt.getTime(), i];
  };
  return cards
    .map((c, i) => ({ c, r: rank(c, i) }))
    .sort((a, b) => a.r[0] - b.r[0] || a.r[1] - b.r[1] || a.r[2] - b.r[2])
    .map((x) => x.c);
}

/** Состояние карточек ребёнка по событиям quiz_answer с cardId. */
export async function cardStates(db: Pick<Db, 'select'>, childId: string) {
  const { events } = schema;
  const rows = await db
    .select({
      cardId: sql<string>`${events.payload}->>'cardId'`,
      firstTry: sql<boolean>`coalesce((${events.payload}->>'firstTry')::boolean, false)`,
      at: events.createdAt,
    })
    .from(events)
    .where(
      and(
        eq(events.childId, childId),
        eq(events.type, 'quiz_answer'),
        sql`${events.payload} ? 'cardId'`,
      ),
    )
    .orderBy(asc(events.createdAt), asc(events.id));
  const byCard = new Map<string, { firstTry: boolean; at: Date }[]>();
  for (const r of rows) {
    const list = byCard.get(r.cardId) ?? [];
    list.push({ firstTry: r.firstTry, at: r.at });
    byCard.set(r.cardId, list);
  }
  const states = new Map<string, CardState>();
  for (const [id, h] of byCard) states.set(id, leitner(h)!);
  return states;
}
