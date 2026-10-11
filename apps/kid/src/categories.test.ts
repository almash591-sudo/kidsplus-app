import type { DeckCategory, KidItem } from '@kidsplus/shared/api';
import { describe, expect, it } from 'vitest';
import { categoriesOf, itemsOf, needsCategoryPick } from './categories';

const segment = (id: string): KidItem => ({
  kind: 'segment',
  id,
  provider: 'youtube',
  externalId: 'x',
  startSec: 0,
  endSec: 60,
  thumbnailUrl: null,
  questions: [],
});
const deck = (id: string, category: DeckCategory): KidItem => ({
  kind: 'deck',
  id,
  category,
  coverUrl: '/c.svg',
  cards: [],
});

describe('разделы главного экрана', () => {
  const items = [deck('zh', 'chinese'), segment('v'), deck('m', 'math'), deck('en', 'english')];

  it('игра попадает в свой раздел: про природу — в «Природу»', () => {
    const game = (id: string, category: 'games' | 'nature'): KidItem => ({
      kind: 'interactive',
      id,
      category,
      spec: { kind: 'tracing', shapes: ['1'] },
    });
    expect(
      categoriesOf([game('g', 'games'), game('n', 'nature'), deck('geo', 'geography')]),
    ).toEqual(['geography', 'nature', 'games']);
  });

  it('разделы — в постоянном порядке, только непустые', () => {
    expect(categoriesOf(items)).toEqual(['video', 'english', 'math', 'chinese']);
    expect(categoriesOf([deck('a', 'math')])).toEqual(['math']);
  });

  it('пункты раздела сохраняют порядок родителя', () => {
    const more = [...items, deck('m2', 'math')];
    expect(itemsOf(more, 'math').map((i) => i.id)).toEqual(['m', 'm2']);
    expect(itemsOf(more, 'video').map((i) => i.id)).toEqual(['v']);
  });

  it('без раздела или с опустевшим разделом — все пункты', () => {
    expect(itemsOf(items, null)).toHaveLength(4);
    expect(itemsOf(items, 'other')).toHaveLength(4);
  });

  it('экран разделов — только если разделов больше одного и раздел не выбран', () => {
    expect(needsCategoryPick(items, null)).toBe(true);
    expect(needsCategoryPick(items, 'math')).toBe(false);
    expect(needsCategoryPick(items, 'other')).toBe(true);
    expect(needsCategoryPick([deck('a', 'math'), deck('b', 'math')], null)).toBe(false);
  });
});
