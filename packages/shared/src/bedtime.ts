// «Пора спать» (этап 31): время отбоя по дням недели, предупреждение заранее, ночной экран
// со сказкой или колыбельной, утром — «Доброе утро!». Сказки — готовые или от модели; ребёнок
// слышит только одобренные родителем.
import { z } from 'zod';
import type { Speech } from './api';
import { WEEKDAYS, type LocalClock, type Weekday } from './schedule';

const hhmm = (re: RegExp, message: string) => z.string().regex(re, message);
/** Отбой — с 17:00 до 23:59, подъём — с 04:00 до 11:59: ночь всегда переходит через полночь. */
const bedAt = hhmm(/^(1[7-9]|2[0-3]):[0-5]\d$/, 'отбой — с 17:00 до 23:59');
const wakeAt = hhmm(/^(0[4-9]|1[01]):[0-5]\d$/, 'подъём — с 04:00 до 11:59');

export const BEDTIME_COMPANIONS = ['story', 'lullaby', 'track', 'none'] as const;
export type BedtimeCompanion = (typeof BEDTIME_COMPANIONS)[number];
export const BEDTIME_COMPANION_LABELS: Record<BedtimeCompanion, string> = {
  story: 'Сказка и колыбельная',
  lullaby: 'Колыбельная',
  track: 'Запись из аудиотеки',
  none: 'Тишина',
};

export const bedtimeInput = z
  .object({
    enabled: z.boolean(),
    at: bedAt,
    wakeAt,
    days: z.array(z.enum(WEEKDAYS)).max(7),
    /** За сколько минут до отбоя совёнок предупреждает. */
    warnMinutes: z.number().int().min(5).max(30),
    companion: z.enum(BEDTIME_COMPANIONS),
    trackId: z.string().uuid().nullable().default(null),
  })
  .refine((b) => b.companion !== 'track' || b.trackId, {
    message: 'выберите запись',
    path: ['trackId'],
  });
export type BedtimeInput = z.input<typeof bedtimeInput>;
export type BedtimeSettings = z.output<typeof bedtimeInput>;

export const DEFAULT_BEDTIME: BedtimeSettings = {
  enabled: false,
  at: '20:30',
  wakeAt: '07:00',
  days: [...WEEKDAYS],
  warnMinutes: 15,
  companion: 'story',
  trackId: null,
};

const minutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const prevWeekday = (d: Weekday) => WEEKDAYS[(WEEKDAYS.indexOf(d) + 6) % 7]!;
const prevDate = (date: string) =>
  new Date(Date.parse(`${date}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10);

export interface BedtimeNow {
  /** soon — скоро отбой (предупреждение), night — ночь. */
  phase: 'soon' | 'night';
  /** До отбоя (soon) или до подъёма (night), минут. */
  minutesLeft: number;
  /** Дата вечера, с которого идёт ночь (ГГГГ-ММ-ДД), — «разбудить» снимает только эту ночь. */
  night: string;
}

/**
 * Что сейчас по расписанию сна. Ночь — от отбоя в выбранный день до подъёма следующим утром;
 * `skipNight` — ночь, которую родитель снял кнопкой «Разбудить».
 */
export function bedtimeAt(
  clock: Pick<LocalClock, 'date' | 'weekday' | 'minute'>,
  s: Pick<BedtimeSettings, 'enabled' | 'at' | 'wakeAt' | 'days' | 'warnMinutes'>,
  skipNight: string | null = null,
): BedtimeNow | null {
  if (!s.enabled) return null;
  const bed = minutes(s.at);
  const wake = minutes(s.wakeAt);
  const today = s.days.includes(clock.weekday);
  let night: BedtimeNow | null = null;
  if (today && clock.minute >= bed)
    night = { phase: 'night', minutesLeft: 24 * 60 - clock.minute + wake, night: clock.date };
  else if (clock.minute < wake && s.days.includes(prevWeekday(clock.weekday)))
    night = { phase: 'night', minutesLeft: wake - clock.minute, night: prevDate(clock.date) };
  if (night) return night.night === skipNight ? null : night;
  if (today && clock.minute >= bed - s.warnMinutes)
    return { phase: 'soon', minutesLeft: bed - clock.minute, night: clock.date };
  return null;
}

// ─── Сказки ──────────────────────────────────────────────────────────────────

export const STORY_STATUSES = ['queued', 'processing', 'draft', 'approved', 'failed'] as const;
export type StoryStatus = (typeof STORY_STATUSES)[number];

/** Тема сказки от родителя: без имён — в модель уходит только тема и возраст. */
export const storyRequest = z.object({
  theme: z.string().trim().min(3, 'тема — хотя бы 3 буквы').max(120, 'тема — до 120 символов'),
});

/** Ответ модели (проверяется по схеме). */
export const storyResult = z.object({
  title: z.string().trim().min(1).max(60),
  paragraphs: z.array(z.string().trim().min(1).max(700)).min(4).max(12),
});
export type StoryResult = z.infer<typeof storyResult>;

export interface Story {
  id: string;
  /** Код готовой сказки; null — придумана моделью. */
  libraryCode: string | null;
  theme: string;
  title: string;
  paragraphs: string[];
  status: StoryStatus;
  error: string | null;
  createdAt: string;
}

export interface LibraryStoryInfo {
  code: string;
  title: string;
  theme: string;
  /** Примерно минут чтения. */
  minutes: number;
}

/** Страница «Сон» в кабинете. */
export interface ParentSleep {
  settings: BedtimeSettings;
  /** Что сейчас по расписанию. */
  now: BedtimeNow | null;
  stories: Story[];
  /** Готовые сказки, которых у ребёнка ещё нет. */
  library: LibraryStoryInfo[];
  /** Записи аудиотеки семьи для колыбельной. */
  tracks: { id: string; title: string }[];
}

/** Ночной экран на телефоне ребёнка. */
export interface KidBedtime {
  now: BedtimeNow | null;
  wakeAt: string;
  companion: BedtimeCompanion;
  /** Сказка этой ночи — по очереди из одобренных. */
  story: { id: string; title: Speech; parts: Speech[] } | null;
  track: { id: string; title: string; url: string } | null;
}

/** Примерно минут чтения вслух (~110 слов в минуту — спокойно, для малышей). */
export const readingMinutes = (paragraphs: readonly string[]) =>
  Math.max(1, Math.round(paragraphs.join(' ').split(/\s+/).length / 110));
