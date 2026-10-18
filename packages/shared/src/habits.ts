// Привычки (этап 30): утренние и вечерние дела ребёнка, отметка «сделал» — звёздочка в копилку,
// награды за звёзды (в жизни или бонусные минуты), напоминания в заданное время.
import { z } from 'zod';
import type { Speech } from './api';

export const HABIT_SLOTS = ['morning', 'day', 'evening'] as const;
export type HabitSlot = (typeof HABIT_SLOTS)[number];
export const HABIT_SLOT_LABELS: Record<HabitSlot, string> = {
  morning: 'Утро',
  day: 'День',
  evening: 'Вечер',
};

/** Какое время дня сейчас: утро до 12:00, день до 18:00, потом вечер. */
export const slotAt = (minuteOfDay: number): HabitSlot =>
  minuteOfDay < 12 * 60 ? 'morning' : minuteOfDay < 18 * 60 ? 'day' : 'evening';

/** Готовые дела: картинка `/habits/<код>.webp` в детском приложении. */
export const HABIT_PRESETS = {
  teeth: {
    title: 'Почистить зубы',
    remind: 'Пора чистить зубки!',
    slot: 'evening',
    timerSec: 120,
  },
  wash: { title: 'Умыться', remind: 'Пора умываться!', slot: 'morning' },
  dress: { title: 'Одеться', remind: 'Пора одеваться!', slot: 'morning' },
  bed: { title: 'Заправить кровать', remind: 'Пора заправить кроватку!', slot: 'morning' },
  hands: { title: 'Помыть руки', remind: 'Пора мыть ручки!', slot: 'day' },
  toys: { title: 'Убрать игрушки', remind: 'Пора убрать игрушки!', slot: 'evening' },
  pajama: { title: 'Надеть пижаму', remind: 'Пора надевать пижамку!', slot: 'evening' },
  clothes: { title: 'Сложить одежду', remind: 'Пора сложить одежду!', slot: 'evening' },
  flower: { title: 'Полить цветок', remind: 'Цветочек хочет пить!', slot: 'day' },
  pet: { title: 'Покормить питомца', remind: 'Пора покормить питомца!', slot: 'day' },
  potty: { title: 'Сходить на горшок', remind: 'Пора на горшок!', slot: 'day' },
} as const satisfies Record<
  string,
  { title: string; remind: string; slot: HabitSlot; timerSec?: number }
>;
export type HabitPreset = keyof typeof HABIT_PRESETS;
export const HABIT_PRESET_CODES = Object.keys(HABIT_PRESETS) as HabitPreset[];

/** Напоминание для своего дела родителя. */
export const customRemind = (title: string) => `Пора! ${title}.`;

const time = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'время — ЧЧ:ММ')
  .nullable();
const title = z.string().trim().min(1, 'нужно название').max(40, 'название — до 40 символов');

export const habitInput = z.object({
  preset: z
    .enum(HABIT_PRESET_CODES as [HabitPreset, ...HabitPreset[]])
    .nullable()
    .default(null),
  title,
  slot: z.enum(HABIT_SLOTS),
  remindAt: time.default(null),
});
export type HabitInput = z.input<typeof habitInput>;

export const habitUpdate = z
  .object({ title, slot: z.enum(HABIT_SLOTS), remindAt: time, position: z.number().int() })
  .partial();
export type HabitUpdate = z.input<typeof habitUpdate>;

export const rewardInput = z.object({
  title: z.string().trim().min(1, 'нужно название').max(60),
  price: z.number().int().min(1).max(100),
  /** Бонусные минуты: при выдаче сами прибавляются к времени дня. */
  bonusMinutes: z.number().int().min(1).max(120).nullable().default(null),
});
export type RewardInput = z.input<typeof rewardInput>;

export interface Habit {
  id: string;
  preset: HabitPreset | null;
  title: string;
  slot: HabitSlot;
  remindAt: string | null;
  position: number;
}

export interface Reward {
  id: string;
  title: string;
  price: number;
  bonusMinutes: number | null;
}

export interface RewardGrant {
  id: string;
  title: string;
  price: number;
  bonusMinutes: number | null;
  at: string;
}

/** Страница «Привычки» в кабинете. */
export interface ParentHabits {
  /** Сегодня в часовом поясе расписания. */
  today: string;
  /** Последние 7 дней, от старых к сегодняшнему. */
  dates: string[];
  habits: Habit[];
  /** Отметки за эти 7 дней: id привычки → даты. */
  marks: Record<string, string[]>;
  /** Сколько дней подряд (до сегодня включительно или до вчера) сделано всё. */
  streakDays: number;
  stars: number;
  rewards: Reward[];
  grants: RewardGrant[];
}

export interface KidHabit {
  id: string;
  preset: HabitPreset | null;
  slot: HabitSlot;
  remindAt: string | null;
  timerSec: number | null;
  title: Speech;
  remind: Speech;
  done: boolean;
}

/** «Мои дела» на телефоне ребёнка. */
export interface KidHabits {
  date: string;
  habits: KidHabit[];
  stars: number;
  /** Ближайшая цель копилки — самая дешёвая награда, которой ещё не хватает (или первая). */
  goal: { title: Speech; price: number } | null;
  /** Последняя выданная награда — праздник на телефоне один раз. */
  lastGrant: { id: string; title: Speech } | null;
}

export interface KidHabitDone {
  stars: number;
}
