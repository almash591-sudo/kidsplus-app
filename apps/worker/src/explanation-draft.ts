// «Предложить пояснение» к вопросу квиза (этап 39): модель предлагает 1–2 предложения, родитель
// правит и сохраняет сам — ребёнку звучит только сохранённое. В модель уходят вопрос и подписи
// вариантов (их пишет родитель) — без данных ребёнка.
import { schema } from '@kidsplus/db';
import { tokenUsage } from '@kidsplus/db/llm-usage';
import { LlmError, llmJson } from '@kidsplus/providers';
import { quizExplanationPrompt } from '@kidsplus/providers/prompts/quiz-explanation.v1';
import { explanationDraftResult, type ExplanationDraftRequest } from '@kidsplus/shared/api';
import { and, eq, inArray, lt, sql } from 'drizzle-orm';
import { tokenAlert } from './alerts';
import { MAX_DRAFT_ATTEMPTS, type DraftDeps } from './curriculum-draft';

const { explanationDrafts, llmUsage } = schema;

/** Берёт одно пояснение из очереди. 'idle' — очередь пуста, 'paused' — нет ключа или лимит. */
export async function processExplanation(deps: DraftDeps): Promise<'idle' | 'done' | 'paused'> {
  const { db, llm, log } = deps;
  const now = deps.now?.() ?? new Date();
  if (!llm) return 'paused';
  const queued = and(
    eq(explanationDrafts.status, 'queued'),
    lt(explanationDrafts.attempts, MAX_DRAFT_ATTEMPTS),
  );
  // Очередь почти всегда пуста — сначала дешёвая проверка, лимиты токенов — только если есть что делать.
  const [any] = await db
    .select({ id: explanationDrafts.id })
    .from(explanationDrafts)
    .where(queued)
    .limit(1);
  if (!any) return 'idle';
  const used = await tokenUsage(db, now);
  if (used.total >= deps.limits.total || used.today >= deps.limits.daily) return 'paused';

  const [item] = await db
    .update(explanationDrafts)
    .set({ status: 'processing', attempts: sql`${explanationDrafts.attempts} + 1`, updatedAt: now })
    .where(
      inArray(
        explanationDrafts.id,
        db
          .select({ id: explanationDrafts.id })
          .from(explanationDrafts)
          .where(queued)
          .orderBy(explanationDrafts.createdAt)
          .limit(1)
          .for('update', { skipLocked: true }),
      ),
    )
    .returning();
  if (!item) return 'idle';

  const req = item.request as Required<ExplanationDraftRequest>;
  try {
    const { explanation } = await llmJson(
      llm,
      {
        prompt: quizExplanationPrompt({
          question: req.prompt,
          correct: req.correct,
          wrong: req.wrong,
        }),
        schema: explanationDraftResult,
      },
      {
        onUsage: async (u) => {
          await db.insert(llmUsage).values({
            task: 'quiz-explanation',
            model: u.model,
            inputTokens: u.inputTokens,
            outputTokens: u.outputTokens,
          });
        },
      },
    );
    await db
      .update(explanationDrafts)
      .set({ status: 'ready', result: explanation, error: null, updatedAt: now })
      .where(eq(explanationDrafts.id, item.id));
    await tokenAlert(db, deps.limits, deps.notify, now);
  } catch (err) {
    const message = (err as Error).message.slice(0, 500);
    const retry = err instanceof LlmError && err.retryable && item.attempts < MAX_DRAFT_ATTEMPTS;
    await db
      .update(explanationDrafts)
      .set({ status: retry ? 'queued' : 'failed', error: message, updatedAt: now })
      .where(eq(explanationDrafts.id, item.id));
    log.warn({ draftId: item.id, err: message, retry }, 'пояснение: ошибка модели');
  }
  return 'done';
}

/** Цикл пояснений: родитель ждёт ответа в кабинете — опрашиваем очередь часто. */
export function startExplanationLoop(deps: DraftDeps, intervalMs = 4_000) {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const tick = async () => {
    let delay = intervalMs;
    try {
      const r = await processExplanation(deps);
      if (r === 'done') delay = 0;
      if (r === 'paused') delay = 60_000;
    } catch (err) {
      deps.log.error({ err }, 'пояснение: сбой цикла');
      delay = 60_000;
    }
    if (!stopped) timer = setTimeout(tick, delay);
  };
  timer = setTimeout(tick, 0);
  return () => {
    stopped = true;
    clearTimeout(timer);
  };
}
