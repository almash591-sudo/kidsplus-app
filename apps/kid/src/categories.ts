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
export function itemsOf(items: readonly KidItem[], category: KidCategory | null): KidItem[] {
  const inCategory = category ? items.filter((i) => categoryOf(i) === category) : [];
  return freshFirst(inCategory.length ? inCategory : [...items]);
}

/**
 * Этап 34: сначала новое, пройденное (отдыхает) — в конце, в прежнем порядке. Этап 38: в свободном
 * режиме (есть plays) — редко пройденное вперёд, любимое — в конец; поровну — порядок родителя.
 * Дорожка уроков музыки и букв — как есть: там свой порядок и свои звёздочки.
 */
export function freshFirst(list: KidItem[]): KidItem[] {
  const path = list.every(
    (i) => i.kind === 'interactive' && (i.category === 'music' || i.category === 'letters'),
  );
  if (path) return list;
  if (list.some((i) => i.plays !== undefined))
    return [...list].sort((a, b) => (a.plays ?? 0) - (b.plays ?? 0));
  return [...list.filter((i) => !i.rest), ...list.filter((i) => i.rest)];
}

/** Пункт отдыхает и открыть его нельзя: в разделе есть что-то новое (иначе — повторяем). */
export const restingIn = (list: readonly KidItem[], item: KidItem) =>
  Boolean(item.rest) && list.some((i) => !i.rest);

/** Нужен ли экран выбора раздела: разделов больше одного и раздел ещё не выбран. */
export const needsCategoryPick = (items: readonly KidItem[], category: KidCategory | null) =>
  categoriesOf(items).length > 1 && !(category && items.some((i) => categoryOf(i) === category));
