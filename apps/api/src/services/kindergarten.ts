import { schema, type Db } from '@kidsplus/db';
import { GARDEN_TITLE, gardenLessons, LETTER_LESSONS } from '@kidsplus/shared/letters-lessons';
import { and, asc, eq, inArray, max, sql } from 'drizzle-orm';

const { childItems, events, interactives } = schema;

type Exec = Pick<Db, 'select' | 'selectDistinct' | 'insert' | 'update'>;

/** Раздел «Буквы» на главном экране ребёнка. */
const CATEGORY = 'letters';
const OAU_TITLES = new Set(LETTER_LESSONS.slice(60, 70).map((x) => x.title));
/** Уроки садика и «Повторяем О, А, У» — уже вставшие блоки; новый встаёт за ними. */
const isGarden = (title: string) => title.startsWith(`${GARDEN_TITLE} · `) || OAU_TITLES.has(title);

/**
 * «Буквы из садика» (этап 56): для новых отмеченных букв (по алфавиту) назначает ребёнку блоки
 * уроков — сразу после пройденного и уже назначенных блоков садика, перед непройденными
 * уроками «Букв». Игры общие для семей: ищутся по названию, недостающие создаются. Уже
 * назначенные уроки не дублируются. Возвращает, сколько уроков добавлено.
 */
export async function addKindergartenBlocks(exec: Exec, childId: string, letters: string[]) {
  const lessons = letters
    .flatMap(gardenLessons)
    .filter((l, i, all) => all.findIndex((x) => x.title === l.title) === i);
  if (!lessons.length) return 0;
  const titles = lessons.map((l) => l.title);

  const ids = new Map<string, string>();
  for (const r of await exec
    .select({ id: interactives.id, title: interactives.title })
    .from(interactives)
    .where(and(eq(interactives.category, CATEGORY), inArray(interactives.title, titles)))
    .orderBy(asc(interactives.createdAt)))
    if (!ids.has(r.title)) ids.set(r.title, r.id);
  const missing = lessons.filter((l) => !ids.has(l.title));
  if (missing.length)
    for (const r of await exec
      .insert(interactives)
      .values(
        missing.map((l) => ({
          title: l.title,
          category: CATEGORY,
          kind: l.spec.kind,
          params: l.spec,
        })),
      )
      .returning({ id: interactives.id, title: interactives.title }))
      ids.set(r.title, r.id);

  const [last] = await exec
    .select({ pos: max(childItems.position) })
    .from(childItems)
    .where(eq(childItems.childId, childId));
  let position = (last?.pos ?? -1) + 1;
  const added = await exec
    .insert(childItems)
    .values(
      lessons.map((l) => ({
        childId,
        kind: 'interactive' as const,
        interactiveId: ids.get(l.title)!,
        position: position++,
      })),
    )
    .onConflictDoNothing()
    .returning({ id: childItems.id });
  if (!added.length) return 0;

  // Порядок дорожки — по position; блок встаёт на места уроков раздела.
  const rows = await exec
    .select({
      id: childItems.id,
      interactiveId: childItems.interactiveId,
      position: childItems.position,
      title: interactives.title,
    })
    .from(childItems)
    .innerJoin(interactives, eq(interactives.id, childItems.interactiveId))
    .where(and(eq(childItems.childId, childId), eq(interactives.category, CATEGORY)))
    .orderBy(asc(childItems.position));
  const block = new Map(lessons.map((l, i) => [ids.get(l.title)!, i]));
  const done = new Set(
    (
      await exec
        .selectDistinct({ id: sql<string>`${events.payload}->>'interactiveId'` })
        .from(events)
        .where(and(eq(events.childId, childId), eq(events.type, 'interactive_complete')))
    ).map((r) => r.id),
  );
  const rest = rows.filter((r) => !block.has(r.interactiveId!));
  let anchor = -1;
  rest.forEach((r, i) => {
    if (done.has(r.interactiveId!) || isGarden(r.title)) anchor = i;
  });
  const order = [
    ...rest.slice(0, anchor + 1),
    ...rows
      .filter((r) => block.has(r.interactiveId!))
      .sort((a, b) => block.get(a.interactiveId!)! - block.get(b.interactiveId!)!),
    ...rest.slice(anchor + 1),
  ];
  const positions = rows.map((r) => r.position).sort((a, b) => a - b);
  for (const [i, r] of order.entries())
    if (r.position !== positions[i])
      await exec.update(childItems).set({ position: positions[i]! }).where(eq(childItems.id, r.id));
  return added.length;
}
