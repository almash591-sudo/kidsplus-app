// Черновик учебного плана (п. 6.1 ТЗ): модель предлагает темы по неделям, родитель правит.
// В модель уходят только возраст, предметы и число недель — без имени ребёнка.
import { schema, type Db } from '@kidsplus/db';
import { tokenUsage } from '@kidsplus/db/llm-usage';
import { LlmError, llmJson, type LlmProvider } from '@kidsplus/providers';
import { curriculumDraftPrompt } from '@kidsplus/providers/prompts/curriculum-draft.v1';
import { curriculumDraftResult, type CurriculumDraftResult } from '@kidsplus/shared/schedule';
import { and, eq, inArray, lt, sql } from 'drizzle-orm';
import type { Logger } from 'pino';
import { tokenAlert, type Notify } from './alerts';

const { curriculumDrafts, llmUsage } = schema;

/** После стольких попыток (временные ошибки модели) черновик помечается failed. */
export const MAX_DRAFT_ATTEMPTS = 3;

/** Названия предметов для промпта (как в кабинете). */
const SUBJECT_NAMES: Record<string, string> = {
  english: 'английский язык',
  chinese: 'китайский язык',
  math: 'математика и геометрия',
  geography: 'география',
  nature: 'природа (естествознание)',
  games: 'развивающие игры (логика, внимание, моторика)',
  other: 'разное (общее развитие)',
};

export interface DraftRequest {
  ageYears: number;
  subjects: string[];
  weeks: number;
}

export interface DraftDeps {
  db: Db;
  llm: LlmProvider | null;
  log: Logger;
  limits: { daily: number; total: number };
  now?: () => Date;
  notify?: Notify;
}

/** Ровно одна тема на неделю и предмет, только из запроса (лишнее модели — отбрасываем). */
export function cleanDraft(r: CurriculumDraftResult, req: DraftRequest): CurriculumDraftResult {
  const seen = new Set<string>();
  const topics = r.topics.filter((t) => {
    const key = `${t.week}:${t.subject}`;
    if (t.week > req.weeks || !req.subjects.includes(t.subject) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  topics.sort(
    (a, b) => a.week - b.week || req.subjects.indexOf(a.subject) - req.subjects.indexOf(b.subject),
  );
  return { topics };
}

/** Берёт один черновик из очереди. 'idle' — очередь пуста, 'paused' — нет ключа или лимит. */
export async function processDraft(deps: DraftDeps): Promise<'idle' | 'done' | 'paused'> {
  const { db, llm, log } = deps;
  const now = deps.now?.() ?? new Date();
  if (!llm) return 'paused';
  const used = await tokenUsage(db, now);
  if (used.total >= deps.limits.total || used.today >= deps.limits.daily) return 'paused';

  const [item] = await db
    .update(curriculumDrafts)
    .set({ status: 'processing', attempts: sql`${curriculumDrafts.attempts} + 1`, updatedAt: now })
    .where(
      inArray(
        curriculumDrafts.id,
        db
          .select({ id: curriculumDrafts.id })
          .from(curriculumDrafts)
          .where(
            and(
              eq(curriculumDrafts.status, 'queued'),
              lt(curriculumDrafts.attempts, MAX_DRAFT_ATTEMPTS),
            ),
          )
          .orderBy(curriculumDrafts.createdAt)
          .limit(1)
          .for('update', { skipLocked: true }),
      ),
    )
    .returning();
  if (!item) return 'idle';

  const req = item.request as DraftRequest;
  try {
    const result = await llmJson(
      llm,
      {
        prompt: curriculumDraftPrompt({
          ageYears: req.ageYears,
          weeks: req.weeks,
          subjects: req.subjects.map((code) => ({ code, label: SUBJECT_NAMES[code] ?? code })),
        }),
        schema: curriculumDraftResult,
      },
      {
        onUsage: async (u) => {
          await db.insert(llmUsage).values({
            task: 'curriculum-draft',
            model: u.model,
            inputTokens: u.inputTokens,
            outputTokens: u.outputTokens,
          });
        },
      },
    );
    await db
      .update(curriculumDrafts)
      .set({ status: 'ready', result: cleanDraft(result, req), error: null, updatedAt: now })
      .where(eq(curriculumDrafts.id, item.id));
    log.info({ draftId: item.id }, 'план: черновик готов');
    await tokenAlert(db, deps.limits, deps.notify, now);
  } catch (err) {
    const message = (err as Error).message.slice(0, 500);
    const retry = err instanceof LlmError && err.retryable && item.attempts < MAX_DRAFT_ATTEMPTS;
    await db
      .update(curriculumDrafts)
      .set({ status: retry ? 'queued' : 'failed', error: message, updatedAt: now })
      .where(eq(curriculumDrafts.id, item.id));
    log.warn({ draftId: item.id, err: message, retry }, 'план: ошибка черновика');
  }
  return 'done';
}

/** Цикл черновиков планов; останавливается через возвращённую функцию. */
export function startDraftLoop(deps: DraftDeps, intervalMs = 10_000) {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const tick = async () => {
    let delay = intervalMs;
    try {
      const r = await processDraft(deps);
      if (r === 'done') delay = 0;
      if (r === 'paused') delay = 60_000;
    } catch (err) {
      deps.log.error({ err }, 'план: сбой цикла');
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
