import { describe, expect, it } from 'vitest';
import { leitner, orderCards } from './srs';

const day = (n: number) => new Date(Date.UTC(2026, 9, 1 + n, 10));

describe('коробки Лейтнера', () => {
  it('верно с первой попытки — дальше и реже; ошибка — снова сразу', () => {
    expect(leitner([])).toBeNull();
    expect(leitner([{ firstTry: true, at: day(0) }])).toEqual({ box: 2, dueAt: day(1) });
    expect(
      leitner([
        { firstTry: true, at: day(0) },
        { firstTry: true, at: day(1) },
      ]),
    ).toEqual({ box: 3, dueAt: day(4) });
    expect(
      leitner([
        { firstTry: true, at: day(0) },
        { firstTry: false, at: day(1) },
      ]),
    ).toEqual({ box: 1, dueAt: day(1) });
  });

  it('порядок: пора повторить → новые → выученные', () => {
    const cards = ['learned', 'new1', 'due-hard', 'new2', 'due-easy'].map((id) => ({ id }));
    const states = new Map([
      ['learned', { box: 5, dueAt: day(20) }],
      ['due-hard', { box: 1, dueAt: day(0) }],
      ['due-easy', { box: 3, dueAt: day(1) }],
    ]);
    expect(orderCards(cards, states, day(2)).map((c) => c.id)).toEqual([
      'due-hard',
      'due-easy',
      'new1',
      'new2',
      'learned',
    ]);
  });
});
