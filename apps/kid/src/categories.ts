import type { KidCategory, KidItem } from '@kidsplus/shared/api';

/** Порядок разделов на главном экране. */
export const CATEGORY_ORDER: readonly KidCategory[] = [
  'video',
  'english',
  'math',
  'chinese',
  'geography',
  'nature',
  'letters',
  'poems',
  'music',
  'games',
  'other',
];

export const categoryOf = (item: KidItem): KidCategory =>
  item.kind === 'segment' ? 'video' : item.category;

/** Разделы, в которых есть что посмотреть, — в порядке CATEGORY_ORDER. */
export function categoriesOf(items: readonly KidItem[]): KidCategory[] {
  const present = new Set(items.map(categoryOf));
  return CATEGORY_ORDER.filter((c) => present.has(c));
}

/**
 * Пункты выбранного раздела. Без раздела (или если раздел опустел) — все пункты:
 * когда раздел один, экран разделов не показывается.
 */
export function itemsOf(
  items: readonly KidItem[],
  category: KidCategory | null,
  lesson = false,
): KidItem[] {
  const inCategory = category ? items.filter((i) => categoryOf(i) === category) : [];
  return freshFirst(inCategory.length ? inCategory : [...items], lesson);
}

/** Игры «Счёт» (этап 49) — уроки по порядку: дорожка в «Математике», другие игры — под ней. */
const COUNT_KINDS: readonly string[] = [
  'numberHouse',
  'numberNeighbors',
  'compareSign',
  'wordProblem',
];

/** Урок дорожки: игры музыки и букв, «Счёт» в математике. */
export const isPathItem = (item: KidItem | undefined) =>
  item?.kind === 'interactive' &&
  (item.category === 'music' ||
    item.category === 'letters' ||
    (item.category === 'math' && COUNT_KINDS.includes(item.spec.kind)));

/** Сколько пунктов в начале списка — дорожка уроков (freshFirst ставит их вперёд). */
export const pathLength = (items: readonly KidItem[]) => {
  const i = items.findIndex((item) => !isPathItem(item));
  return i < 0 ? items.length : i;
};

/**
 * Этап 34: сначала новое, пройденное (отдыхает) — в конце, в прежнем порядке. Этап 38: в свободном
 * режиме (есть plays) — редко пройденное вперёд, любимое — в конец; поровну — порядок родителя.
 * Дорожка уроков музыки, букв и «Счёта» — впереди и как есть: там свой порядок и звёздочки.
 * В уроке «Сегодня» дорожки нет: порядок пришёл с сервера, только пройденное — в конец.
 */
export function freshFirst(list: KidItem[], lesson = false): KidItem[] {
  if (list.every(isPathItem)) return list;
  const path = lesson ? [] : list.filter(isPathItem);
  const rest = lesson ? list : list.filter((i) => !isPathItem(i));
  if (rest.some((i) => i.plays !== undefined))
    return [...path, ...rest.sort((a, b) => (a.plays ?? 0) - (b.plays ?? 0))];
  return [...path, ...rest.filter((i) => !i.rest), ...rest.filter((i) => i.rest)];
}

/** Пункт отдыхает и открыть его нельзя: в разделе есть что-то новое (иначе — повторяем). */
export const restingIn = (list: readonly KidItem[], item: KidItem) =>
  Boolean(item.rest) && list.some((i) => !i.rest);

/** Нужен ли экран выбора раздела: разделов больше одного и раздел ещё не выбран. */
export const needsCategoryPick = (items: readonly KidItem[], category: KidCategory | null) =>
  categoriesOf(items).length > 1 && !(category && items.some((i) => categoryOf(i) === category));
