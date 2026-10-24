// Аналитика (п. 9 ТЗ): сводки по ребёнку за период и недельный отчёт.
import { z } from 'zod';
import type { GameKind } from './games';
import type { Subject } from './schedule';

/** Слабое место: верно с первой попытки меньше этой доли (при достаточном числе ответов). */
export const WEAK_RATE = 0.6;
/** «Слишком легко»: верно с первой попытки не меньше этой доли и ответы быстрые. */
export const EASY_RATE = 0.95;
export const EASY_MS = 4000;
/** Меньше ответов — выводов не делаем. */
export const MIN_ANSWERS = 3;

export interface AnswerStats {
  answers: number;
  firstTry: number;
  /** Среднее время до верного ответа, мс (null — ответов нет). */
  avgMs: number | null;
}

export interface MaterialStats extends AnswerStats {
  kind: 'segment' | 'deck';
  id: string;
  title: string;
  subject: Subject | null;
}

export interface ChildAnalytics {
  from: string;
  to: string;
  /** Время по дням: секунд по предмету и 'free'. */
  days: { date: string; seconds: Partial<Record<Subject | 'free', number>> }[];
  subjects: ({ subject: Subject; seconds: number } & AnswerStats)[];
  materials: MaterialStats[];
  /** Повторить: точность ниже WEAK_RATE. */
  weak: MaterialStats[];
  /** Слишком легко: почти всё верно и быстро — можно сложнее. */
  easy: MaterialStats[];
  video: {
    started: number;
    completed: number;
    exited: number;
    unavailable: { id: string; title: string }[];
  };
  done: { decks: number; games: number; quizzes: number };
  plan: { title: string; week: number; weeks: number; topics: string[] } | null;
}

/** Ответ модели к недельному отчёту (проверяется по схеме). */
export const weeklyAdvice = z.object({
  summary: z.string().trim().min(1).max(600),
  tips: z.array(z.string().trim().min(1).max(200)).max(5),
});
export type WeeklyAdvice = z.infer<typeof weeklyAdvice>;

export interface WeeklyReport {
  id: string;
  childId: string;
  weekStart: string;
  createdAt: string;
  stats: ChildAnalytics;
  /** Рекомендации по правилам (всегда). */
  rules: string[];
  /** Текст от языковой модели (если есть ключ и лимит). */
  advice: WeeklyAdvice | null;
}

export const rate = (s: Pick<AnswerStats, 'answers' | 'firstTry'>) =>
  s.answers ? s.firstTry / s.answers : null;

/** Рекомендации по правилам — понятные родителю, без модели. */
export function ruleAdvice(a: ChildAnalytics, labels: Record<string, string>): string[] {
  const pct = (s: AnswerStats) => `${Math.round((rate(s) ?? 0) * 100)} %`;
  const out: string[] = [];
  for (const m of a.weak.slice(0, 3))
    out.push(
      `Повторить «${m.title}»: верно с первой попытки ${pct(m)} — уже стоит в ближайших уроках.`,
    );
  for (const m of a.easy.slice(0, 2))
    out.push(`«${m.title}» даётся легко (${pct(m)}) — можно взять тему сложнее.`);
  const total = a.days.reduce(
    (n, d) => n + Object.values(d.seconds).reduce((x, y) => x + (y ?? 0), 0),
    0,
  );
  const active = a.days.filter((d) => Object.values(d.seconds).some((s) => (s ?? 0) > 0)).length;
  if (active) out.push(`Занятий: ${active} дн., всего ${Math.round(total / 60)} мин.`);
  const idle = a.subjects.filter((s) => s.seconds === 0).map((s) => labels[s.subject] ?? s.subject);
  if (idle.length) out.push(`Не было занятий: ${idle.join(', ')}.`);
  if (a.video.unavailable.length)
    out.push(`Недоступно видео: ${a.video.unavailable.length} — замените в разделе «Видео».`);
  return out;
}

// ─── Что нравится (этап 44) ──────────────────────────────────────────────────

export type UsageKind = 'segment' | 'deck' | 'interactive';

export interface UsageItem {
  kind: UsageKind;
  id: string;
  title: string;
  /** Вид игры — у игр. */
  gameKind: GameKind | null;
  /** Открывал: начал смотреть видео, открыл карточки или игру. */
  opened: number;
  completed: number;
  /** Ушёл сам, не пройдя (кнопка «домой»). */
  left: number;
  /** Сколько раз открыл сам, в разделе, а не в уроке «Сегодня». */
  chosen: number;
  /** Обычно уходит через столько секунд (медиана); null — не уходил или неизвестно. */
  leftAfterSec: number | null;
}

/** Виды игр: что ребёнок выбирает и бросает (по всем играм этого вида). */
export interface UsageKindStats {
  kind: GameKind;
  opened: number;
  completed: number;
  left: number;
  chosen: number;
}

export interface ChildUsage {
  days: number;
  /** Любимое: сам выбирает и проходит. */
  favorites: UsageItem[];
  /** Бросает: открывал не меньше DROP_MIN_OPENS раз, прошёл меньше половины. */
  dropped: UsageItem[];
  /** Назначено давно, а за UNOPENED_DAYS дней ни разу не открыл. */
  unopened: { kind: UsageKind; id: string; title: string; gameKind: GameKind | null }[];
  kinds: UsageKindStats[];
}

export const DROP_MIN_OPENS = 3;
export const UNOPENED_DAYS = 30;
/** Назначенное недавно ещё не «не открывает». */
export const UNOPENED_MIN_AGE_DAYS = 14;
/** Сколько строк в «Любимом» и «Бросает». */
export const USAGE_TOP = 5;
