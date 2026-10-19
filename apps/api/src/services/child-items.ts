import { schema, type Db } from '@kidsplus/db';
import { and, eq, inArray, max } from 'drizzle-orm';
import { HttpError } from '../lib/http';

const { childItems, children, videoSegments, flashcardDecks, interactives } = schema;

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
  /** Этап 23: меняются назначения только детям этой семьи; чужие дети не трогаются. */
  familyId: string,
) {
  await assertChildrenExist(exec, childIds);
  const own = new Set(
    (
      await exec.select({ id: children.id }).from(children).where(eq(children.familyId, familyId))
    ).map((c) => c.id),
  );
  const col = refColumn(kind);
  const wanted = new Set(childIds.filter((id) => own.has(id)));
  const current = await exec
    .select({ childId: childItems.childId })
    .from(childItems)
    .where(eq(col, refId));
  const have = new Set(current.map((c) => c.childId).filter((id) => own.has(id)));

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

/**
 * Семья без прав администратора меняет у общего материала только назначение своим детям.
 * Материал должен существовать — иначе 404.
 */
export async function assignOnly(
  db: Db,
  kind: ItemKind,
  refId: string,
  childIds: string[],
  familyId: string,
) {
  const table =
    kind === 'segment' ? videoSegments : kind === 'deck' ? flashcardDecks : interactives;
  const [row] = await db.select({ id: table.id }).from(table).where(eq(table.id, refId));
  if (!row) throw new HttpError(404, 'not_found', 'не найдено');
  await db.transaction((tx) => syncChildItems(tx, kind, refId, childIds, familyId));
}

const KINDS: ItemKind[] = ['segment', 'deck', 'interactive'];
const tableOf = (kind: ItemKind) =>
  kind === 'segment' ? videoSegments : kind === 'deck' ? flashcardDecks : interactives;

/**
 * Массовое назначение одному ребёнку (этап 33): убирает и добавляет сразу много пунктов.
 * Новые — в конец списка в переданном порядке; несуществующие и уже назначенные пропускаются.
 */
export async function bulkChildItems(
  exec: Exec,
  childId: string,
  add: { kind: ItemKind; refId: string }[],
  remove: { kind: ItemKind; refId: string }[],
) {
  let removed = 0;
  for (const kind of KINDS) {
    const ids = [...new Set(remove.filter((r) => r.kind === kind).map((r) => r.refId))];
    if (!ids.length) continue;
    const gone = await exec
      .delete(childItems)
      .where(and(eq(childItems.childId, childId), inArray(refColumn(kind), ids)))
      .returning({ id: childItems.id });
    removed += gone.length;
  }

  const [last] = await exec
    .select({ pos: max(childItems.position) })
    .from(childItems)
    .where(eq(childItems.childId, childId));
  let position = (last?.pos ?? -1) + 1;
  let added = 0;
  const wanted = add.filter((a, i) => add.findIndex((b) => b.refId === a.refId) === i);
  const valid = new Set<string>();
  const present = new Set<string>();
  for (const kind of KINDS) {
    const ids = wanted.filter((r) => r.kind === kind).map((r) => r.refId);
    if (!ids.length) continue;
    const table = tableOf(kind);
    for (const r of await exec.select({ id: table.id }).from(table).where(inArray(table.id, ids)))
      valid.add(r.id);
    const col = refColumn(kind);
    for (const r of await exec
      .select({ ref: col })
      .from(childItems)
      .where(and(eq(childItems.childId, childId), inArray(col, ids))))
      if (r.ref) present.add(r.ref);
  }
  const rows = wanted
    .filter((a) => valid.has(a.refId) && !present.has(a.refId))
    .map((a) => ({ childId, kind: a.kind, ...refValues(a.kind, a.refId), position: position++ }));
  for (let i = 0; i < rows.length; i += 500) {
    await exec.insert(childItems).values(rows.slice(i, i + 500));
    added += rows.slice(i, i + 500).length;
  }
  return { added, removed };
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
