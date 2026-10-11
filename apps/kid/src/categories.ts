import type { KidCategory, KidItem } from '@kidsplus/shared/api';

/** Порядок разделов на главном экране. */
export const CATEGORY_ORDER: readonly KidCategory[] = [
  'video',
  'english',
  'math',
  'chinese',
  'geography',
  'nature',
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
  return inCategory.length ? inCategory : [...items];
}

/** Нужен ли экран выбора раздела: разделов больше одного и раздел ещё не выбран. */
export const needsCategoryPick = (items: readonly KidItem[], category: KidCategory | null) =>
  categoriesOf(items).length > 1 && !(category && items.some((i) => categoryOf(i) === category));
