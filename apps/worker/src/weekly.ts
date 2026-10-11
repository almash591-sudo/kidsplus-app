// Недельный отчёт (п. 9 ТЗ): сводка за 7 дней, рекомендации по правилам и от модели,
// push родителям. Запускается в воскресенье в 19:00 по Москве.
import { schema, type Db } from '@kidsplus/db';
import { childAnalytics } from '@kidsplus/db/analytics';
import { tokenUsage } from '@kidsplus/db/llm-usage';
import { llmJson, type LlmProvider } from '@kidsplus/providers';
import { weeklyAdvicePrompt } from '@kidsplus/providers/prompts/weekly-advice.v1';
import {
  rate,
  ruleAdvice,
  weeklyAdvice,
  type ChildAnalytics,
  type WeeklyAdvice,
} from '@kidsplus/shared/analytics';
import { pushMessages } from '@kidsplus/shared/push';
import { dayNumber, SUBJECT_LABELS } from '@kidsplus/shared/schedule';
import type { Logger } from 'pino';
import { tokenAlert, type Notify } from './alerts';

const { children, llmUsage, weeklyReports } = schema;

export interface WeeklyDeps {
  db: Db;
  llm: LlmProvider | null;
  log: Logger;
  limits: { daily: number; total: number };
  notify?: Notify;
  now?: () => Date;
}

/** Понедельник недели, в которую входит дата (ГГГГ-ММ-ДД). */
export function mondayOf(date: string): string {
  const n = dayNumber(date);
  // 1970-01-01 — четверг: (n + 3) % 7 — номер дня от понедельника.
  return new Date((n - ((n + 3) % 7)) * 86_400_000).toISOString().slice(0, 10);
}

const pct = (r: number | null) => (r === null ? null : Math.round(r * 100));

/** Обезличенные цифры для модели: возраст, предметы, проценты, названия материалов. */
export function adviceInput(stats: ChildAnalytics, ageYears: number) {
  const minutes = (s: number) => Math.round(s / 60);
  return {
    ageYears,
    activeDays: stats.days.filter((d) => Object.values(d.seconds).some((s) => (s ?? 0) > 0)).length,
    totalMinutes: minutes(
      stats.days.reduce(
        (n, d) => n + Object.values(d.seconds).reduce((a, b) => a + (b ?? 0), 0),
        0,
      ),
    ),
    subjects: stats.subjects.map((s) => ({
      label: SUBJECT_LABELS[s.subject],
      minutes: minutes(s.seconds),
      answers: s.answers,
      firstTryPct: pct(rate(s)),
    })),
    weak: stats.weak.map((m) => ({ title: m.title, firstTryPct: pct(rate(m)) ?? 0 })),
    easy: stats.easy.map((m) => ({ title: m.title, firstTryPct: pct(rate(m)) ?? 0 })),
    planTopics: stats.plan?.topics ?? [],
  };
}

/** Отчёты по всем детям за прошедшую неделю. Повторный запуск в ту же неделю — обновляет. */
export async function buildWeeklyReports(deps: WeeklyDeps): Promise<number> {
  const { db, llm, log } = deps;
  const now = deps.now?.() ?? new Date();
  const kids = await db.select().from(children);
  for (const c of kids) {
    const stats = await childAnalytics(db, c.id, now, 7);
    const rules = ruleAdvice(stats, SUBJECT_LABELS);
    let advice: WeeklyAdvice | null = null;
    const used = await tokenUsage(db, now);
    if (llm && used.today < deps.limits.daily && used.total < deps.limits.total) {
      const months = (now.getFullYear() - c.birthYear) * 12 + (now.getMonth() + 1 - c.birthMonth);
      try {
        advice = await llmJson(
          llm,
          {
            prompt: weeklyAdvicePrompt(adviceInput(stats, Math.max(1, Math.floor(months / 12)))),
            schema: weeklyAdvice,
          },
          {
            onUsage: async (u) => {
              await db.insert(llmUsage).values({
                task: 'weekly-advice',
                model: u.model,
                inputTokens: u.inputTokens,
                outputTokens: u.outputTokens,
              });
            },
          },
        );
      } catch (err) {
        log.warn({ err: (err as Error).message }, 'отчёт: рекомендации модели не получены');
      }
    }
    const values = {
      childId: c.id,
      weekStart: mondayOf(stats.to),
      stats: stats as unknown as Record<string, unknown>,
      rules,
      advice,
    };
    await db
      .insert(weeklyReports)
      .values(values)
      .onConflictDoUpdate({
        target: [weeklyReports.childId, weeklyReports.weekStart],
        set: { stats: values.stats, rules, advice, createdAt: now },
      });
    await deps.notify?.(pushMessages.weekly(c.id));
  }
  await tokenAlert(db, deps.limits, deps.notify, now);
  log.info({ children: kids.length }, 'недельные отчёты готовы');
  return kids.length;
}
