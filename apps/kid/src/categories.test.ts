import type { DeckCategory, KidItem } from '@kidsplus/shared/api';
import { describe, expect, it } from 'vitest';
import { categoriesOf, isPathItem, itemsOf, needsCategoryPick, pathLength } from './categories';

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

  it('свободный режим (этап 38): редко пройденное — вперёд, любимое — в конец', () => {
    const played = (item: KidItem, plays: number): KidItem => ({ ...item, plays });
    const list = [
      played(segment('a'), 5),
      played(segment('b'), 0),
      played(segment('c'), 2),
      played(segment('d'), 0),
    ];
    // Поровну пройденные — в порядке родителя (b раньше d).
    expect(itemsOf(list, 'video').map((i) => i.id)).toEqual(['b', 'd', 'c', 'a']);
  });
});

describe('дорожка «Счёт» в «Математике» (этап 49)', () => {
  const game = (id: string, kind: 'numberHouse' | 'counting', rest?: 'today'): KidItem => ({
    kind: 'interactive',
    id,
    category: 'math',
    spec:
      kind === 'numberHouse'
        ? { kind, numbers: [5], dots: true, choices: 3, rounds: 3 }
        : { kind, max: 5, imageIds: ['i'], rounds: 3 },
    ...(rest ? { rest } : {}),
  });
  const list = [
    game('c1', 'counting', 'today'),
    deck('d', 'math'),
    game('h1', 'numberHouse', 'today'),
    game('c2', 'counting'),
    game('h2', 'numberHouse'),
  ];

  it('уроки «Счёт» — впереди в порядке родителя, остальное — под ними, новое раньше', () => {
    const items = itemsOf(list, 'math');
    expect(items.map((i) => i.id)).toEqual(['h1', 'h2', 'd', 'c2', 'c1']);
    expect(pathLength(items)).toBe(2);
    expect(isPathItem(items[0])).toBe(true);
    expect(isPathItem(items[2])).toBe(false);
  });

  it('в уроке «Сегодня» дорожки нет — порядок как пришёл, пройденное в конце', () => {
    expect(itemsOf(list, null, true).map((i) => i.id)).toEqual(['d', 'c2', 'h2', 'c1', 'h1']);
  });

  it('раздел из одних уроков — как есть, даже пройденные', () => {
    const only = [game('h1', 'numberHouse', 'today'), game('h2', 'numberHouse')];
    expect(itemsOf(only, 'math').map((i) => i.id)).toEqual(['h1', 'h2']);
    expect(pathLength(only)).toBe(2);
  });
});
