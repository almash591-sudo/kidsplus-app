import type { ParentSleep } from '@kidsplus/shared/bedtime';
import { DEFAULT_BEDTIME } from '@kidsplus/shared/bedtime';
import type { ParentHabits } from '@kidsplus/shared/habits';
import type { ChildNow, Schedule } from '@kidsplus/shared/schedule';
import { describe, expect, it } from 'vitest';
import { dayLine } from './dayline';

const now = (o: Partial<ChildNow> = {}) =>
  ({
    mode: 'plan',
    online: true,
    activity: 'math',
    subjects: [
      { subject: 'english', secondsLeft: 0, done: true, progress: 1 },
      { subject: 'math', secondsLeft: 600, done: false, progress: 0.5 },
      { subject: 'nature', secondsLeft: 1200, done: false, progress: 0 },
    ],
    ...o,
  }) as ChildNow;
const schedule = {
  windows: { mon: { from: '09:30', to: '20:00' } },
  timezone: 'Europe/Moscow',
} as unknown as Schedule;
const habit = (
  id: string,
  slot: 'morning' | 'evening',
  title: string,
  remindAt: string | null = null,
) => ({
  id,
  preset: null,
  title,
  slot,
  remindAt,
  position: 0,
});
const habits = {
  today: '2026-10-19',
  habits: [
    habit('a', 'morning', 'Умыться'),
    habit('b', 'morning', 'Одеться'),
    habit('c', 'evening', 'Почистить зубы', '19:45'),
  ],
  marks: { a: ['2026-10-19'], b: ['2026-10-19'] },
} as unknown as ParentHabits;
const sleep = {
  settings: { ...DEFAULT_BEDTIME, enabled: true, at: '20:30' },
  now: null,
} as unknown as ParentSleep;

describe('лента дня', () => {
  it('утро → уроки с начала окна → вечер → отбой; отметки по делу', () => {
    const items = dayLine({ now: now(), schedule, habits, sleep, weekday: 'mon', minute: 11 * 60 });
    expect(items.map((i) => [i.time, i.label, i.state])).toEqual([
      [null, 'Утренние дела', 'done'],
      ['09:30', 'Английский', 'done'],
      [null, 'Математика и геометрия', 'now'],
      [null, 'Природа', 'later'],
      ['19:45', 'Вечерние дела', 'later'],
      ['20:30', 'Отбой', 'later'],
    ]);
    expect(items[0]!.note).toBe('умыться, одеться · 2 из 2');
    expect(items[2]!.note).toBe('осталось 10 мин');
  });

  it('ребёнок не в приложении — урок «позже», не «сейчас»; отбой выключен — нет строки', () => {
    const items = dayLine({
      now: now({ online: false }),
      schedule,
      habits: undefined,
      sleep: { ...sleep, settings: { ...sleep.settings, enabled: false } },
      weekday: 'mon',
      minute: 11 * 60,
    });
    expect(items.map((i) => i.state)).toEqual(['done', 'later', 'later']);
  });

  it('расписание выключено — без уроков; ночь — отбой «сейчас»', () => {
    const items = dayLine({
      now: now({ mode: 'off' }),
      schedule,
      habits: undefined,
      sleep: { ...sleep, now: { phase: 'night', minutesLeft: 0, night: '2026-10-19' } },
      weekday: 'mon',
      minute: 21 * 60,
    });
    expect(items.map((i) => [i.label, i.state])).toEqual([['Отбой', 'now']]);
  });

  it('день закрыт (этап 47): не пройденные уроки — «не сегодня» с причиной, не «позже»', () => {
    const at = (closed: ChildNow['closed'], minute: number) =>
      dayLine({
        now: now({ closed }),
        schedule,
        habits: undefined,
        sleep: undefined,
        weekday: 'mon',
        minute,
      })
        .filter((i) => i.tab === 'plan')
        .map((i) => [i.state, i.note]);
    expect(at('limit', 15 * 60)).toEqual([
      ['done', 'урок пройден'],
      ['missed', 'время на сегодня вышло'],
      ['missed', 'время на сегодня вышло'],
    ]);
    expect(at('ended', 12 * 60)[1]).toEqual(['missed', 'день завершён вами']);
    expect(at('day_off', 12 * 60)[1]).toEqual(['missed', 'сегодня занятий нет']);
    // Вне окна вечером — уже не будет; утром, до начала окна, — ещё впереди.
    expect(at('window', 21 * 60)[1]).toEqual(['missed', 'разрешённое время прошло']);
    const morning = at('window', 8 * 60)[1]!;
    expect(morning[0]).not.toBe('missed');
    expect(morning[1]).toBe('осталось 10 мин');
  });

  it('время дел прошло, а они не сделаны — «пропущено»; сделанные — «готово»', () => {
    const items = dayLine({
      now: undefined,
      schedule,
      habits: { ...habits, marks: { a: ['2026-10-19'] } },
      sleep: undefined,
      weekday: 'mon',
      minute: 19 * 60,
    });
    expect(items.map((i) => [i.label, i.state, i.stateLabel])).toEqual([
      ['Утренние дела', 'missed', 'пропущено'],
      ['Вечерние дела', 'now', undefined],
    ]);
    const done = dayLine({
      now: undefined,
      schedule,
      habits,
      sleep: undefined,
      weekday: 'mon',
      minute: 19 * 60,
    });
    expect(done[0]!.state).toBe('done');
  });
});
