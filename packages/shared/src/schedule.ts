// Учебный план и расписание дня (п. 4, 5.2 ТЗ): схемы для API и чистые функции расчёта дня.
// Время считает сервер; здесь — только арифметика, без БД, чтобы её легко было проверить тестами.
import type { BedtimeNow } from './bedtime';
import { z } from 'zod';
import { GAME_CATEGORIES, type GameCategory } from './api';

export const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
export type Weekday = (typeof WEEKDAYS)[number];

/** Предмет плана — раздел главного экрана (кроме видео): английский, математика, природа… */
export const SUBJECTS = GAME_CATEGORIES;
export type Subject = GameCategory;

/** Названия предметов (как на главном экране ребёнка и в кабинете). */
export const SUBJECT_LABELS: Record<Subject, string> = {
  games: 'Игры',
  english: 'Английский',
  chinese: 'Китайский',
  math: 'Математика и геометрия',
  geography: 'География',
  nature: 'Природа',
  music: 'Музыка',
  letters: 'Буквы',
  other: 'Разное',
};
const subject = z.enum(SUBJECTS);

/**
 * Предмет по теме, с которой видео ставили в модерацию («Английский», «Математика и
 * геометрия», english…). Неизвестная тема — «Разное», пустая — без предмета.
 */
export function subjectFromTopic(topic: string | null | undefined): Subject | null {
  const t = topic?.trim().toLowerCase();
  if (!t) return null;
  for (const s of SUBJECTS) {
    if (s === t || SUBJECT_LABELS[s].toLowerCase() === t) return s;
  }
  return 'other';
}

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'время в виде ЧЧ:ММ');
const toMinutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));

/** Разрешённое окно дня; null — выходной, заниматься нельзя. */
export const dayWindow = z
  .object({ from: hhmm, to: hhmm })
  .refine((w) => toMinutes(w.from) < toMinutes(w.to), {
    message: 'окно заканчивается раньше начала',
  })
  .nullable();
export type DayWindow = z.infer<typeof dayWindow>;

const isTimezone = (tz: string) => {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};

export const scheduleInput = z.object({
  /** Выключено — как раньше: разделы на выбор без лимитов. */
  enabled: z.boolean(),
  subjectsPerDay: z.number().int().min(1).max(5),
  minutesPerSubject: z.number().int().min(5).max(60),
  /** Свободное время после уроков (разделы на выбор), минут. */
  freeMinutes: z.number().int().min(0).max(120),
  timezone: z.string().refine(isTimezone, 'неизвестный часовой пояс'),
  windows: z.object(
    Object.fromEntries(WEEKDAYS.map((d) => [d, dayWindow])) as Record<Weekday, typeof dayWindow>,
  ),
});
export type ScheduleInput = z.infer<typeof scheduleInput>;
export type Schedule = ScheduleInput;

/** Расписание по умолчанию (решение владельца 2026-10-10): 3 × 20 минут, будни 9–21, выходные 10–22. */
export const DEFAULT_SCHEDULE: Schedule = {
  enabled: false,
  subjectsPerDay: 3,
  minutesPerSubject: 20,
  freeMinutes: 20,
  timezone: 'Europe/Moscow',
  windows: {
    mon: { from: '09:00', to: '21:00' },
    tue: { from: '09:00', to: '21:00' },
    wed: { from: '09:00', to: '21:00' },
    thu: { from: '09:00', to: '21:00' },
    fri: { from: '09:00', to: '21:00' },
    sat: { from: '10:00', to: '22:00' },
    sun: { from: '10:00', to: '22:00' },
  },
};

// ─── Учебный план ────────────────────────────────────────────────────────────

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'дата в виде ГГГГ-ММ-ДД');
const uuid = z.uuid();

export const topicItem = z.object({
  kind: z.enum(['segment', 'deck', 'interactive']),
  refId: uuid,
});
export type TopicItem = z.infer<typeof topicItem>;

export const topicInput = z.object({
  subject,
  week: z.number().int().min(1).max(52),
  title: z.string().trim().min(1, 'укажите тему').max(120),
  items: z.array(topicItem).max(60).default([]),
});
export type TopicInput = z.input<typeof topicInput>;

export const curriculumInput = z.object({
  title: z.string().trim().min(1, 'укажите название').max(120),
  startsOn: isoDate,
  weeks: z.number().int().min(1).max(52),
  subjects: z.array(subject).min(1).max(8),
  topics: z.array(topicInput).max(400).default([]),
});
export type CurriculumInput = z.input<typeof curriculumInput>;

export interface Topic {
  id: string;
  subject: Subject;
  week: number;
  title: string;
  items: TopicItem[];
}

export interface Curriculum {
  id: string;
  childId: string;
  title: string;
  startsOn: string;
  weeks: number;
  subjects: Subject[];
  topics: Topic[];
}

// ─── День ребёнка ────────────────────────────────────────────────────────────

/** Почему на сегодня всё. */
export type DayClosed = 'window' | 'day_off' | 'limit' | 'ended';

/**
 * «Выключить экран с поводом» (этап 29): совёнок уводит ребёнка от экрана — спать, кушать,
 * гулять… Снимает только родитель.
 */
export const REST_REASONS = ['sleep', 'eat', 'walk', 'bath', 'book', 'rest'] as const;
export type RestReason = (typeof REST_REASONS)[number];
export const REST_LABELS: Record<RestReason, string> = {
  sleep: 'Совёнок спит',
  eat: 'Пора кушать',
  walk: 'Гулять!',
  bath: 'Купаться',
  book: 'Читаем книжку',
  rest: 'Глазкам отдых',
};

export interface KidToday {
  /** off — расписание выключено (разделы на выбор, как раньше). */
  mode: 'off' | 'plan';
  closed: DayClosed | null;
  paused: boolean;
  subjects: { subject: Subject; secondsLeft: number; done: boolean }[];
  /** Свободное время — после всех предметов дня. */
  free: { open: boolean; secondsLeft: number };
  /** До конца разрешённого окна, секунд (null — расписание выключено). */
  windowSecondsLeft: number | null;
  /** Родитель «выключил экран» с поводом (этап 29); null — нет. */
  rest: RestReason | null;
  /** Родитель позвал ребёнка (ISO-время); телефон показывает «Мама зовёт!» один раз. */
  calledAt: string | null;
  /** Громкость телефона, 0–100, заданная родителем (киоск); null — не трогаем. */
  volume: number | null;
  /** «Пора спать» (этап 31): скоро отбой или ночь; null — день. */
  bedtime: BedtimeNow | null;
}

/** Чем занят ребёнок: предмет урока, свободное время или экран «Сегодня». */
export const activity = z.union([subject, z.literal('free')]).nullable();
export type Activity = z.infer<typeof activity>;

export const heartbeatRequest = z.object({
  activity,
  /** Приложение на экране и не на паузе — время идёт. */
  active: z.boolean(),
  /** Что сейчас на экране — для «Управление сейчас». */
  item: z
    .object({ kind: z.enum(['segment', 'deck', 'interactive', 'quiz']), id: uuid })
    .nullable()
    .default(null),
});
export type HeartbeatRequest = z.input<typeof heartbeatRequest>;

export interface HeartbeatResponse extends KidToday {
  /** Время текущего занятия вышло: доиграть блок и не начинать новый. */
  stop: boolean;
}

export const controlRequest = z.discriminatedUnion('action', [
  z.object({ action: z.literal('pause') }),
  z.object({ action: z.literal('resume') }),
  z.object({ action: z.literal('end') }),
  z.object({ action: z.literal('reopen') }),
  z.object({ action: z.literal('add'), minutes: z.number().int().min(1).max(120) }),
  z.object({ action: z.literal('rest'), reason: z.enum(REST_REASONS) }),
  z.object({ action: z.literal('wake') }),
  z.object({ action: z.literal('call') }),
  z.object({ action: z.literal('volume'), level: z.number().int().min(0).max(100) }),
]);
export type ControlRequest = z.infer<typeof controlRequest>;

/** «Управление сейчас»: день ребёнка и что на экране. */
export interface ChildNow extends KidToday {
  online: boolean;
  activity: Activity;
  item: { kind: string; id: string; title: string | null } | null;
  lastSeenAt: string | null;
  usedSeconds: number;
  extraMinutes: number;
  /** Заряд телефона ребёнка (последнее показание); null — телефон ещё не сообщал. */
  battery: { level: number; charging: boolean; at: string } | null;
}

// ─── Расчёт ──────────────────────────────────────────────────────────────────

export interface LocalClock {
  /** Дата в часовом поясе расписания, ГГГГ-ММ-ДД. */
  date: string;
  weekday: Weekday;
  /** Минут от полуночи. */
  minute: number;
  second: number;
}

export function localClock(now: Date, timezone: string): LocalClock {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    weekday: parts.weekday!.toLowerCase().slice(0, 3) as Weekday,
    minute: Number(parts.hour) * 60 + Number(parts.minute),
    second: Number(parts.second),
  };
}

/** Номер дня от 1970-01-01 — для чередования предметов и материалов по дням. */
export const dayNumber = (date: string) => Math.floor(Date.parse(`${date}T00:00:00Z`) / 86_400_000);

/** Неделя плана (1…), 0 — план ещё не начался. */
export const planWeek = (startsOn: string, date: string) => {
  const d = dayNumber(date) - dayNumber(startsOn);
  return d < 0 ? 0 : Math.floor(d / 7) + 1;
};

/**
 * Предметы дня: если предметов в плане не больше, чем в день, — все; иначе по кругу,
 * каждый день следующие (так за несколько дней проходятся все).
 */
export function daySubjects<T>(pool: readonly T[], perDay: number, date: string): T[] {
  if (pool.length <= perDay) return [...pool];
  const start = (dayNumber(date) * perDay) % pool.length;
  return Array.from({ length: perDay }, (_, i) => pool[(start + i) % pool.length]!);
}

export interface DayState {
  schedule: Schedule;
  clock: LocalClock;
  subjects: Subject[];
  /** Потрачено сегодня, секунд: по предмету и 'free'. */
  used: Partial<Record<Subject | 'free', number>>;
  extraSeconds: number;
  /** Родитель добавил время вне окна: окно открыто ещё столько секунд. */
  extendSeconds: number;
  paused: boolean;
  ended: boolean;
  /** Пройдено сегодня уроков-игр по предмету (для предметов с дневной нормой уроков). */
  lessons?: Partial<Record<Subject, number>>;
}

/**
 * Предметы, где урок — короткая игра-упражнение: на сегодня хватит стольких пройденных уроков,
 * даже если время ещё осталось (20 минут одних упражнений малышу надоедают).
 */
export const LESSONS_PER_DAY: Partial<Record<Subject, number>> = { music: 3 };

/** День ребёнка: что открыто и сколько осталось. */
export function computeToday(s: DayState): KidToday {
  const per = s.schedule.minutesPerSubject * 60;
  const subjects = s.subjects.map((subject) => {
    const norm = LESSONS_PER_DAY[subject];
    const enough = norm !== undefined && (s.lessons?.[subject] ?? 0) >= norm;
    const left = enough ? 0 : Math.max(0, per - (s.used[subject] ?? 0));
    return { subject, secondsLeft: left, done: left === 0 };
  });
  const freeLeft = Math.max(0, s.schedule.freeMinutes * 60 + s.extraSeconds - (s.used.free ?? 0));
  const lessonsDone = subjects.every((x) => x.done);
  const free = { open: lessonsDone && freeLeft > 0, secondsLeft: freeLeft };

  if (!s.schedule.enabled)
    return {
      mode: 'off',
      closed: null,
      paused: false,
      subjects: [],
      free,
      windowSecondsLeft: null,
      rest: null,
      calledAt: null,
      volume: null,
      bedtime: null,
    };

  const w = s.schedule.windows[s.clock.weekday];
  const nowSec = s.clock.minute * 60 + s.clock.second;
  const inWindow = Boolean(w && nowSec >= toMinutes(w.from) * 60 && nowSec < toMinutes(w.to) * 60);
  const windowLeft = Math.max(inWindow ? toMinutes(w!.to) * 60 - nowSec : 0, s.extendSeconds);
  const closed: DayClosed | null = s.ended
    ? 'ended'
    : windowLeft === 0
      ? w
        ? 'window'
        : 'day_off'
      : lessonsDone && freeLeft === 0
        ? 'limit'
        : null;
  return {
    mode: 'plan',
    closed,
    paused: s.paused,
    subjects,
    free,
    windowSecondsLeft: windowLeft,
    rest: null,
    calledAt: null,
    volume: null,
    bedtime: null,
  };
}

/** Сколько ещё можно заниматься тем, чем ребёнок занят сейчас (0 — время вышло). */
export function activityLeft(today: KidToday, a: Activity): number {
  if (today.mode === 'off') return Infinity;
  if (today.closed || !a) return 0;
  if (a === 'free') return today.free.open ? today.free.secondsLeft : 0;
  return today.subjects.find((x) => x.subject === a)?.secondsLeft ?? 0;
}

// ─── Черновик плана от языковой модели ──────────────────────────────────────

export const curriculumDraftRequest = z.object({
  subjects: z.array(subject).min(1).max(8),
  weeks: z.number().int().min(1).max(26),
});
export type CurriculumDraftRequest = z.input<typeof curriculumDraftRequest>;

/** Ответ модели (проверяется по схеме, при ошибке — повтор). */
export const curriculumDraftResult = z.object({
  topics: z
    .array(
      z.object({
        subject,
        week: z.number().int().min(1).max(52),
        title: z.string().trim().min(1).max(80),
      }),
    )
    .max(400),
});
export type CurriculumDraftResult = z.infer<typeof curriculumDraftResult>;

export interface CurriculumDraft {
  id: string;
  status: 'queued' | 'processing' | 'ready' | 'failed';
  topics: CurriculumDraftResult['topics'];
  error: string | null;
}

// ─── Журнал действий (этап 29) ───────────────────────────────────────────────

export type ActivityKind =
  'video' | 'quiz' | 'deck' | 'game' | 'app' | 'call' | 'capture' | 'habit';

/** Строка журнала «что делал ребёнок»: время и понятная родителю подпись. */
export interface ActivityEntry {
  at: string;
  kind: ActivityKind;
  text: string;
}

export const activityQuery = z.object({
  /** ГГГГ-ММ-ДД в часовом поясе расписания; по умолчанию — сегодня. */
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});
