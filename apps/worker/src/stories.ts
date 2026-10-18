// Сказки на ночь (этап 31): модель пишет сказку по теме родителя; родитель читает и одобряет.
// В модель уходят только тема и возраст. Прозвища детей семьи из темы вырезаются — даже если
// родитель их вписал.
import { schema, type Db } from '@kidsplus/db';
import { tokenUsage } from '@kidsplus/db/llm-usage';
import { LlmError, llmJson, type LlmProvider } from '@kidsplus/providers';
import { bedtimeStoryPrompt } from '@kidsplus/providers/prompts/bedtime-story.v1';
import { storyResult } from '@kidsplus/shared/bedtime';
import { and, eq, inArray, lt, sql } from 'drizzle-orm';
import type { Logger } from 'pino';
import { tokenAlert, type Notify } from './alerts';

const { children, llmUsage, stories } = schema;

export const MAX_STORY_ATTEMPTS = 3;

export interface StoryDeps {
  db: Db;
  llm: LlmProvider | null;
  log: Logger;
  limits: { daily: number; total: number };
  now?: () => Date;
  notify?: Notify;
}

/** Заменяет прозвища (и их формы: «Маша», «Машей», «Машенька») на «малыш». */
export function scrubNames(text: string, names: readonly string[]): string {
  let out = text;
  for (const raw of names) {
    const name = raw.trim().toLowerCase();
    if (name.length < 2) continue;
    // Основа без последней буквы ловит падежи и ласковые формы.
    const stem = name.length > 3 ? name.slice(0, -1) : name;
    const esc = stem.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp(`(?<![а-яёa-z])${esc}[а-яёa-z]*`, 'giu'), 'малыш');
  }
  return out;
}

/** Берёт одну заявку из очереди. 'idle' — пусто, 'paused' — нет модели или лимит токенов. */
export async function processStory(deps: StoryDeps): Promise<'idle' | 'done' | 'paused'> {
  const { db, llm, log } = deps;
  const now = deps.now?.() ?? new Date();
  if (!llm) return 'paused';
  const used = await tokenUsage(db, now);
  if (used.total >= deps.limits.total || used.today >= deps.limits.daily) return 'paused';

  const [item] = await db
    .update(stories)
    .set({ status: 'processing', attempts: sql`${stories.attempts} + 1`, updatedAt: now })
    .where(
      inArray(
        stories.id,
        db
          .select({ id: stories.id })
          .from(stories)
          .where(and(eq(stories.status, 'queued'), lt(stories.attempts, MAX_STORY_ATTEMPTS)))
          .orderBy(stories.createdAt)
          .limit(1)
          .for('update', { skipLocked: true }),
      ),
    )
    .returning();
  if (!item) return 'idle';

  // Прозвища всех детей семьи этого ребёнка.
  const names = (
    await db
      .select({ nickname: children.nickname })
      .from(children)
      .where(
        eq(
          children.familyId,
          db.select({ f: children.familyId }).from(children).where(eq(children.id, item.childId)),
        ),
      )
  ).map((c) => c.nickname);

  try {
    const result = await llmJson(
      llm,
      {
        prompt: bedtimeStoryPrompt({
          ageYears: item.ageYears,
          theme: scrubNames(item.theme, names),
        }),
        schema: storyResult,
      },
      {
        onUsage: async (u) => {
          await db.insert(llmUsage).values({
            task: 'bedtime-story',
            model: u.model,
            inputTokens: u.inputTokens,
            outputTokens: u.outputTokens,
          });
        },
      },
    );
    await db
      .update(stories)
      .set({
        status: 'draft',
        title: result.title,
        paragraphs: result.paragraphs,
        error: null,
        updatedAt: now,
      })
      .where(eq(stories.id, item.id));
    log.info({ storyId: item.id }, 'сказка: готова, ждёт родителя');
    await tokenAlert(db, deps.limits, deps.notify, now);
  } catch (err) {
    const message = (err as Error).message.slice(0, 500);
    const retry = err instanceof LlmError && err.retryable && item.attempts < MAX_STORY_ATTEMPTS;
    await db
      .update(stories)
      .set({ status: retry ? 'queued' : 'failed', error: message, updatedAt: now })
      .where(eq(stories.id, item.id));
    log.warn({ storyId: item.id, err: message, retry }, 'сказка: ошибка');
  }
  return 'done';
}

export function startStoryLoop(deps: StoryDeps, intervalMs = 10_000) {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const tick = async () => {
    let delay = intervalMs;
    try {
      const r = await processStory(deps);
      if (r === 'done') delay = 0;
      if (r === 'paused') delay = 60_000;
    } catch (err) {
      deps.log.error({ err }, 'сказка: сбой цикла');
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
