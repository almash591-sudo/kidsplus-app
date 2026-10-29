import { describe, expect, it } from 'vitest';
import {
  bedtimeAt,
  bedtimeInput,
  bookPlayedInput,
  DEFAULT_BEDTIME,
  nightChapter,
  storyResult,
} from './bedtime';
import { STORY_LIBRARY } from './stories-library';

const on = { ...DEFAULT_BEDTIME, enabled: true };
const at = (weekday: 'mon' | 'tue' | 'sun', date: string, hhmm: string) => ({
  weekday,
  date,
  minute: Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3)),
});

describe('bedtimeAt', () => {
  it('выключено — ничего', () => {
    expect(bedtimeAt(at('mon', '2026-10-12', '23:00'), DEFAULT_BEDTIME)).toBeNull();
  });
  it('предупреждение, ночь, утро', () => {
    expect(bedtimeAt(at('mon', '2026-10-12', '20:14'), on)).toBeNull();
    expect(bedtimeAt(at('mon', '2026-10-12', '20:15'), on)).toEqual({
      phase: 'soon',
      minutesLeft: 15,
      night: '2026-10-12',
    });
    expect(bedtimeAt(at('mon', '2026-10-12', '20:30'), on)).toMatchObject({
      phase: 'night',
      minutesLeft: 630,
    });
    expect(bedtimeAt(at('tue', '2026-10-13', '06:59'), on)).toMatchObject({
      phase: 'night',
      minutesLeft: 1,
      night: '2026-10-12',
    });
    expect(bedtimeAt(at('tue', '2026-10-13', '07:00'), on)).toBeNull();
  });
  it('ночь воскресенья переходит в понедельник; снятая ночь — только она', () => {
    const sun = { ...on, days: ['sun' as const] };
    expect(bedtimeAt(at('mon', '2026-10-19', '03:00'), sun)?.night).toBe('2026-10-18');
    expect(bedtimeAt(at('mon', '2026-10-19', '03:00'), sun, '2026-10-18')).toBeNull();
    expect(bedtimeAt(at('mon', '2026-10-19', '21:00'), sun)).toBeNull();
  });
  it('проверка ввода', () => {
    expect(bedtimeInput.safeParse(on).success).toBe(true);
    expect(bedtimeInput.safeParse({ ...on, at: '12:00' }).success).toBe(false);
    expect(bedtimeInput.safeParse({ ...on, wakeAt: '12:00' }).success).toBe(false);
    expect(bedtimeInput.safeParse({ ...on, companion: 'track' }).success).toBe(false);
  });
});

describe('готовые сказки', () => {
  it('проходят ту же схему, что и ответы модели; коды уникальны', () => {
    for (const s of STORY_LIBRARY) expect(storyResult.safeParse(s).success, s.code).toBe(true);
    expect(new Set(STORY_LIBRARY.map((s) => s.code)).size).toBe(STORY_LIBRARY.length);
  });
});

describe('книжка на ночь (этап 52)', () => {
  it('без книжки «Книжку на ночь» не сохранить; книжка — из библиотеки', () => {
    const book = { ...DEFAULT_BEDTIME, companion: 'book' as const };
    expect(bedtimeInput.safeParse(book).success).toBe(false);
    expect(bedtimeInput.safeParse({ ...book, bookCode: 'nope' }).success).toBe(false);
    expect(bedtimeInput.parse({ ...book, bookCode: 'gadkiyUtenok' }).bookCode).toBe('gadkiyUtenok');
    // Старые настройки без книжки по-прежнему проходят.
    const old: Partial<typeof DEFAULT_BEDTIME> = { ...DEFAULT_BEDTIME };
    delete old.bookCode;
    expect(bedtimeInput.parse(old).bookCode).toBeNull();
  });

  it('глава ночи: следующая; уже звучала этой ночью — та же; по кругу', () => {
    // «Гадкий утёнок» — две главы.
    expect(nightChapter('gadkiyUtenok', { chapter: 0, night: null }, '2026-10-14')).toBe(0);
    expect(nightChapter('gadkiyUtenok', { chapter: 1, night: '2026-10-14' }, '2026-10-14')).toBe(0);
    expect(nightChapter('gadkiyUtenok', { chapter: 1, night: '2026-10-14' }, '2026-10-15')).toBe(1);
    expect(nightChapter('gadkiyUtenok', { chapter: 0, night: '2026-10-15' }, '2026-10-15')).toBe(1);
    expect(nightChapter('gadkiyUtenok', { chapter: 1, night: '2026-10-14' }, null)).toBe(1);
    // Короткая книжка — каждую ночь целиком.
    expect(nightChapter('kotPetuh', { chapter: 0, night: '2026-10-14' }, '2026-10-14')).toBe(0);
  });

  it('отметка «дослушали» — книжка, глава и дата ночи', () => {
    const ok = { book: 'gadkiyUtenok', chapter: 1, night: '2026-10-14' };
    expect(bookPlayedInput.safeParse(ok).success).toBe(true);
    expect(bookPlayedInput.safeParse({ ...ok, night: '14.10.2026' }).success).toBe(false);
    expect(bookPlayedInput.safeParse({ ...ok, chapter: -1 }).success).toBe(false);
  });
});
