import { schema, type Db } from '@kidsplus/db';
import { createTestDb } from '@kidsplus/db/testing';
import type { LlmProvider } from '@kidsplus/providers';
import { eq } from 'drizzle-orm';
import { pino } from 'pino';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { processExplanation } from './explanation-draft';

const { explanationDrafts, families, llmUsage } = schema;
const log = pino({ level: 'silent' });
const limits = { daily: 1_000_000, total: 10_000_000 };

let db: Db;
let close: () => Promise<void>;
let family: string;
beforeEach(async () => {
  ({ db, close } = await createTestDb());
  const [f] = await db.insert(families).values({ name: 'Демо' }).returning();
  family = f!.id;
});
afterEach(() => close());

function fakeLlm(reply: string) {
  const prompts: string[] = [];
  const llm: LlmProvider = {
    id: 'fake',
    async completeJson(req) {
      prompts.push(req.prompt);
      return { text: reply, usage: { model: 'fake-model', inputTokens: 80, outputTokens: 20 } };
    },
  };
  return { llm, prompts };
}

const queue = async () =>
  (
    await db
      .insert(explanationDrafts)
      .values({
        familyId: family,
        request: { prompt: 'Кто говорит «мяу»?', correct: 'кошка', wrong: ['рыба'] },
      })
      .returning()
  )[0]!.id;

describe('«Предложить пояснение» (этап 39)', () => {
  it('модель предлагает пояснение по вопросу и подписям', async () => {
    const id = await queue();
    const { llm, prompts } = fakeLlm(JSON.stringify({ explanation: ' Кошка мяукает. ' }));
    expect(await processExplanation({ db, llm, log, limits })).toBe('done');
    const [row] = await db.select().from(explanationDrafts).where(eq(explanationDrafts.id, id));
    expect(row).toMatchObject({ status: 'ready', result: 'Кошка мяукает.' });
    expect(prompts[0]).toContain('Кто говорит «мяу»?');
    expect(prompts[0]).toContain('«рыба»');
    expect(await db.select().from(llmUsage)).toMatchObject([{ task: 'quiz-explanation' }]);
    expect(await processExplanation({ db, llm, log, limits })).toBe('idle');
  });

  it('ответ не по схеме — failed, родитель пишет сам', async () => {
    const id = await queue();
    const { llm } = fakeLlm(JSON.stringify({ text: 'не то' }));
    await processExplanation({ db, llm, log, limits });
    const [row] = await db.select().from(explanationDrafts).where(eq(explanationDrafts.id, id));
    expect(row!.status).toBe('failed');
    expect(row!.result).toBeNull();
  });

  it('без ключа — ждёт', async () => {
    await queue();
    expect(await processExplanation({ db, llm: null, log, limits })).toBe('paused');
  });
});
