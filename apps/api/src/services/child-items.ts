import { schema, type Db } from '@kidsplus/db';
import { and, eq, inArray, max } from 'drizzle-orm';
import { HttpError } from '../lib/http';

const { childItems, children } = schema;

type Exec = Pick<Db, 'select' | 'insert' | 'delete'>;
export type ItemKind = 'segment' | 'deck' | 'interactive';

const refColumn = (kind: ItemKind) =>
  kind === 'segment'
    ? childItems.segmentId
    : kind === 'deck'
      ? childItems.deckId
      : childItems.interactiveId;

const refValues = (kind: ItemKind, refId: string) =>
  kind === 'segment'
    ? { segmentId: refId }
    : kind === 'deck'
      ? { deckId: refId }
      : { interactiveId: refId };

export async function assertChildrenExist(exec: Pick<Db, 'select'>, childIds: string[]) {
  if (!childIds.length) return;
  const found = await exec
    .select({ id: children.id })
    .from(children)
    .where(inArray(children.id, childIds));
  if (found.length !== new Set(childIds).size)
    throw new HttpError(400, 'validation', 'неизвестный ребёнок');
}

/**
 * Приводит назначение фрагмента, набора карточек или игры к списку childIds:
 * лишних детей убирает, новым добавляет в конец их списка.
 */
export async function syncChildItems(
  exec: Exec,
  kind: ItemKind,
  refId: string,
  childIds: string[],
) {
  await assertChildrenExist(exec, childIds);
  const col = refColumn(kind);
  const wanted = new Set(childIds);
  const current = await exec
    .select({ childId: childItems.childId })
    .from(childItems)
    .where(eq(col, refId));
  const have = new Set(current.map((c) => c.childId));

  const removed = [...have].filter((id) => !wanted.has(id));
  if (removed.length) {
    await exec.delete(childItems).where(and(eq(col, refId), inArray(childItems.childId, removed)));
  }
  for (const childId of [...wanted].filter((id) => !have.has(id))) {
    const [last] = await exec
      .select({ pos: max(childItems.position) })
      .from(childItems)
      .where(eq(childItems.childId, childId));
    await exec.insert(childItems).values({
      childId,
      kind,
      ...refValues(kind, refId),
      position: (last?.pos ?? -1) + 1,
    });
  }
}

/** childIds для фрагментов, наборов карточек или игр. */
export async function childIdsByRef(exec: Pick<Db, 'select'>, kind: ItemKind, refIds: string[]) {
  const map = new Map<string, string[]>();
  if (!refIds.length) return map;
  const col = refColumn(kind);
  const rows = await exec
    .select({
      childId: childItems.childId,
      segmentId: childItems.segmentId,
      deckId: childItems.deckId,
      interactiveId: childItems.interactiveId,
    })
    .from(childItems)
    .where(inArray(col, refIds));
  for (const r of rows) {
    const ref = (kind === 'segment' ? r.segmentId : kind === 'deck' ? r.deckId : r.interactiveId)!;
    map.set(ref, [...(map.get(ref) ?? []), r.childId]);
  }
  return map;
}
