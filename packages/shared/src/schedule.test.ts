import { describe, expect, it } from 'vitest';
import {
  activityLeft,
  computeToday,
  daySubjects,
  DEFAULT_SCHEDULE,
  localClock,
  planWeek,
  scheduleInput,
  subjectFromTopic,
  type DayState,
} from './schedule';

const on = { ...DEFAULT_SCHEDULE, enabled: true };
const SUBJECTS = ['english', 'math', 'nature'] as const;

/** Среда, 14 октября 2026, 12:00 по Москве. */
const NOON = localClock(new Date('2026-10-14T09:00:00Z'), 'Europe/Moscow');

const day = (o: Partial<DayState> = {}): DayState => ({
  schedule: on,
  clock: NOON,
  subjects: [...SUBJECTS],
  used: {},
  extraSeconds: 0,
  extendSeconds: 0,
  paused: false,
  ended: false,
  ...o,
});

describe('часы расписания', () => {
  it('дата, день недели и время — в часовом поясе расписания', () => {
    const c = localClock(new Date('2026-10-14T21:30:00Z'), 'Europe/Moscow');
    expect(c).toMatchObject({ date: '2026-10-15', weekday: 'thu', minute: 30 });
    expect(NOON).toMatchObject({ date: '2026-10-14', weekday: 'wed', minute: 12 * 60 });
  });

  it('неделя плана считается от даты начала', () => {
    expect(planWeek('2026-10-12', '2026-10-11')).toBe(0);
    expect(planWeek('2026-10-12', '2026-10-12')).toBe(1);
    expect(planWeek('2026-10-12', '2026-10-18')).toBe(1);
    expect(planWeek('2026-10-12', '2026-10-19')).toBe(2);
  });

  it('предметов больше, чем в день, — каждый день следующие по кругу', () => {
    const pool = ['a', 'b', 'c', 'd', 'e'];
    expect(daySubjects(pool.slice(0, 3), 3, '2026-10-14')).toEqual(['a', 'b', 'c']);
    const days = ['2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18'];
    const seen = days.map((d) => daySubjects(pool, 3, d));
    for (const s of seen) expect(new Set(s).size).toBe(3);
    // За несколько дней проходятся все предметы, и поровну.
    const count = new Map<string, number>();
    seen.flat().forEach((x) => count.set(x, (count.get(x) ?? 0) + 1));
    expect([...count.values()]).toEqual([3, 3, 3, 3, 3]);
  });
});

describe('день ребёнка', () => {
  it('ровно 3 предмета по 20 минут; свободное время — после всех', () => {
    const t = computeToday(day());
    expect(t.subjects).toHaveLength(3);
    expect(t.subjects.every((s) => s.secondsLeft === 20 * 60 && !s.done)).toBe(true);
    expect(t.free).toEqual({ open: false, secondsLeft: 20 * 60 });
    expect(t.closed).toBeNull();
    expect(t.windowSecondsLeft).toBe(9 * 3600);
  });

  it('предмет пройден, когда его 20 минут вышли; потом открывается свободное время', () => {
    const t = computeToday(day({ used: { english: 1200, math: 1250 } }));
    expect(t.subjects.map((s) => s.done)).toEqual([true, true, false]);
    expect(activityLeft(t, 'english')).toBe(0);
    expect(activityLeft(t, 'nature')).toBe(1200);
    expect(activityLeft(t, 'free')).toBe(0);
    const after = computeToday(day({ used: { english: 1200, math: 1200, nature: 1200 } }));
    expect(after.free.open).toBe(true);
    expect(activityLeft(after, 'free')).toBe(1200);
  });

  it('всё потрачено — «на сегодня всё»; родитель добавил минуты — можно ещё', () => {
    const used = { english: 1200, math: 1200, nature: 1200, free: 1200 };
    expect(computeToday(day({ used })).closed).toBe('limit');
    const more = computeToday(day({ used, extraSeconds: 600 }));
    expect(more.closed).toBeNull();
    expect(more.free).toEqual({ open: true, secondsLeft: 600 });
  });

  it('вне окна и в выходной — закрыто; добавленное время открывает окно', () => {
    const late = localClock(new Date('2026-10-14T18:30:00Z'), 'Europe/Moscow'); // 21:30
    expect(computeToday(day({ clock: late })).closed).toBe('window');
    const early = localClock(new Date('2026-10-14T05:00:00Z'), 'Europe/Moscow'); // 8:00
    expect(computeToday(day({ clock: early })).closed).toBe('window');
    const off = { ...on, windows: { ...on.windows, wed: null } };
    expect(computeToday(day({ schedule: off })).closed).toBe('day_off');
    const extended = computeToday(day({ clock: late, extendSeconds: 600 }));
    expect(extended.closed).toBeNull();
    expect(extended.windowSecondsLeft).toBe(600);
  });

  it('родитель завершил день или поставил паузу', () => {
    expect(computeToday(day({ ended: true })).closed).toBe('ended');
    expect(computeToday(day({ paused: true }))).toMatchObject({ paused: true, closed: null });
  });

  it('расписание выключено — без ограничений', () => {
    const t = computeToday(day({ schedule: DEFAULT_SCHEDULE }));
    expect(t).toMatchObject({ mode: 'off', closed: null });
    expect(activityLeft(t, 'math')).toBe(Infinity);
  });
});

describe('настройки расписания', () => {
  it('проверяются окна и часовой пояс', () => {
    expect(scheduleInput.safeParse(DEFAULT_SCHEDULE).success).toBe(true);
    const bad = (o: object) => scheduleInput.safeParse({ ...DEFAULT_SCHEDULE, ...o }).success;
    expect(bad({ timezone: 'Mars/Olympus' })).toBe(false);
    expect(
      bad({ windows: { ...DEFAULT_SCHEDULE.windows, mon: { from: '21:00', to: '09:00' } } }),
    ).toBe(false);
    expect(
      bad({ windows: { ...DEFAULT_SCHEDULE.windows, mon: { from: '9:00', to: '21:00' } } }),
    ).toBe(false);
    expect(bad({ minutesPerSubject: 2 })).toBe(false);
  });
});

describe('subjectFromTopic', () => {
  it('название предмета, код, неизвестная и пустая тема', () => {
    expect(subjectFromTopic('Английский')).toBe('english');
    expect(subjectFromTopic(' математика и геометрия ')).toBe('math');
    expect(subjectFromTopic('music')).toBe('music');
    expect(subjectFromTopic('роботы-игрушки')).toBe('other');
    expect(subjectFromTopic(null)).toBeNull();
  });
});
