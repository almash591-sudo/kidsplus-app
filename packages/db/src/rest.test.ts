import { describe, expect, it } from 'vitest';
import { restFrom } from './rest';

const TZ = 'Europe/Moscow';
/** Время по Москве (UTC+3). */
const msk = (day: number, h = 12) => new Date(Date.UTC(2026, 9, day, h - 3));
const now = msk(20, 12);
const done = (key: string, ...days: number[]) => days.map((d) => ({ key, at: msk(d) }));

describe('пройденное отдыхает', () => {
  it('сегодня пройдено — до завтра; вчера один раз — уже можно', () => {
    const r = restFrom([...done('a', 20), ...done('b', 19)], now, TZ, 'weekly');
    expect(r.get('a')).toBe('today');
    expect(r.has('b')).toBe(false);
  });

  it('полночь по Москве: пройдено в 23:30 — утром уже можно', () => {
    const late = [{ key: 'a', at: new Date(Date.UTC(2026, 9, 19, 20, 30)) }];
    expect(restFrom(late, msk(20, 8), TZ, 'weekly').has('a')).toBe(false);
  });

  it('выучено (3 раза) — отдыхает неделю, потом снова можно', () => {
    expect(restFrom(done('a', 10, 12, 14), now, TZ, 'weekly').get('a')).toBe('learned');
    expect(restFrom(done('a', 5, 7, 9), msk(20), TZ, 'weekly').has('a')).toBe(false);
  });

  it('«никогда» — выученное больше не предлагается; «без ограничений» — ничего не отдыхает', () => {
    expect(restFrom(done('a', 1, 2, 3), now, TZ, 'never').get('a')).toBe('learned');
    expect(restFrom(done('a', 20, 20, 20), now, TZ, 'free').size).toBe(0);
  });
});
