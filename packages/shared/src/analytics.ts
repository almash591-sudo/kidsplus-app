// Аналитика (п. 9 ТЗ): сводки по ребёнку за период и недельный отчёт.
import { z } from 'zod';
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
