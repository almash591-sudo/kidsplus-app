import type { UsageItem } from '@kidsplus/shared/analytics';
import { describe, expect, it } from 'vitest';
import { openedOf, rankUsage, tallyUsage, type UsageEvent } from './usage';

const at = new Date('2026-10-20T09:00:00Z');
const ev = (type: string, id: string, o: Partial<UsageEvent> = {}): UsageEvent => ({
  type,
  kind: type.startsWith('segment') ? 'segment' : type.startsWith('deck') ? 'deck' : 'interactive',
  id,
  at,
  from: null,
  seconds: null,
  ...o,
});
const item = (id: string, o: Partial<UsageItem>): UsageItem => ({
  kind: 'interactive',
  id,
  title: id,
  gameKind: 'race',
  opened: 0,
  completed: 0,
  left: 0,
  chosen: 0,
  leftAfterSec: null,
  ...o,
});

describe('что нравится (этап 44)', () => {
  it('счёт: открыл, сам выбрал, прошёл, ушёл и через сколько', () => {
    const t = tallyUsage([
      ev('interactive_start', 'g', { from: 'free' }),
      ev('interactive_complete', 'g'),
      ev('interactive_start', 'g', { from: 'lesson' }),
      ev('interactive_exit', 'g', { seconds: 40 }),
      ev('interactive_start', 'g', { from: 'free' }),
      ev('interactive_exit', 'g', { seconds: 20 }),
      ev('segment_start', 'v'),
      ev('segment_exit', 'v', { seconds: 95 }),
    ]);
    expect(t.get('interactive:g')).toMatchObject({
      starts: 3,
      completed: 1,
      left: 2,
      chosen: 2,
      leftSecs: [40, 20],
    });
    expect(t.get('segment:v')).toMatchObject({ starts: 1, left: 1, leftSecs: [95] });
  });

  it('до этапа 44 игры не сообщали об открытии — открытий не меньше прохождений', () => {
    const t = tallyUsage([ev('interactive_complete', 'g'), ev('interactive_complete', 'g')]);
    expect(openedOf(t.get('interactive:g')!)).toBe(2);
    expect(openedOf({ starts: 5, completed: 1, left: 1 })).toBe(5);
  });

  it('любимое — сам выбирает и проходит; бросает — от 3 открытий, прошёл меньше половины', () => {
    const { favorites, dropped } = rankUsage([
      item('часто-сам', { opened: 4, completed: 4, chosen: 4 }),
      item('в-уроке', { opened: 5, completed: 5 }),
      item('раз', { opened: 1, completed: 1, chosen: 1 }),
      item('бросает', { opened: 5, completed: 1, left: 3 }),
      item('пополам', { opened: 4, completed: 2, left: 2 }),
      item('два-раза', { opened: 2, completed: 0, left: 2 }),
    ]);
    expect(favorites.map((i) => i.id)).toEqual(['часто-сам', 'в-уроке', 'пополам']);
    expect(dropped.map((i) => i.id)).toEqual(['бросает']);
  });

  it('не больше пяти строк в каждом списке', () => {
    const many = Array.from({ length: 8 }, (_, i) =>
      item(`g${i}`, { opened: 3, completed: 3, chosen: i }),
    );
    expect(rankUsage(many).favorites.map((i) => i.id)).toEqual(['g7', 'g6', 'g5', 'g4', 'g3']);
  });
});
