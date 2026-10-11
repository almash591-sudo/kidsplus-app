import { schema, type Db } from '@kidsplus/db';
import { createTestDb } from '@kidsplus/db/testing';
import { LlmError, type LlmProvider } from '@kidsplus/providers';
import { eq } from 'drizzle-orm';
import { pino } from 'pino';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanDraft, processDraft } from './curriculum-draft';

const { children, curriculumDrafts, llmUsage } = schema;
const log = pino({ level: 'silent' });
const limits = { daily: 1_000_000, total: 10_000_000 };

let db: Db;
let close: () => Promise<void>;
let child: string;
beforeEach(async () => {
  ({ db, close } = await createTestDb());
  const [c] = await db
    .insert(children)
    .values({ nickname: 'Зайка', birthYear: 2021, birthMonth: 5, gender: 'f' })
    .returning();
  child = c!.id;
});
afterEach(() => close());

/** Подставная модель: запоминает промпты, отвечает заданным текстом. */
function fakeLlm(reply: () => string) {
  const prompts: string[] = [];
  const llm: LlmProvider = {
    id: 'fake',
    async completeJson(req) {
      prompts.push(req.prompt);
      return { text: reply(), usage: { model: 'fake-model', inputTokens: 100, outputTokens: 50 } };
    },
  };
  return { llm, prompts };
}

const queue = async () =>
  (
    await db
      .insert(curriculumDrafts)
      .values({ childId: child, request: { ageYears: 5, subjects: ['math', 'nature'], weeks: 2 } })
      .returning()
  )[0]!.id;

describe('черновик учебного плана', () => {
  it('модель предлагает темы; в промпте только возраст и предметы, без имени', async () => {
    const id = await queue();
    const { llm, prompts } = fakeLlm(() =>
      JSON.stringify({
        topics: [
          { subject: 'math', week: 1, title: 'Счёт до 5' },
          { subject: 'nature', week: 1, title: 'Животные леса' },
          { subject: 'math', week: 2, title: 'Фигуры' },
          // Лишнее отбрасывается: неделя вне плана, чужой предмет, повтор.
          { subject: 'math', week: 3, title: 'Лишняя неделя' },
          { subject: 'english', week: 1, title: 'Не тот предмет' },
          { subject: 'math', week: 1, title: 'Повтор' },
        ],
      }),
    );
    expect(await processDraft({ db, llm, log, limits })).toBe('done');
    const [row] = await db.select().from(curriculumDrafts).where(eq(curriculumDrafts.id, id));
    expect(row!.status).toBe('ready');
    expect(row!.result).toEqual({
      topics: [
        { subject: 'math', week: 1, title: 'Счёт до 5' },
        { subject: 'nature', week: 1, title: 'Животные леса' },
        { subject: 'math', week: 2, title: 'Фигуры' },
      ],
    });
    expect(prompts[0]).toContain('5 лет');
    expect(prompts[0]).toContain('математика');
    expect(prompts[0]).not.toContain('Зайка');
    const usage = await db.select().from(llmUsage);
    expect(usage).toMatchObject([{ task: 'curriculum-draft', inputTokens: 100 }]);
  });

  it('без ключа или при исчерпанном лимите — ждёт', async () => {
    await queue();
    expect(await processDraft({ db, llm: null, log, limits })).toBe('paused');
    const { llm } = fakeLlm(() => '{}');
    expect(await processDraft({ db, llm, log, limits: { daily: 0, total: 1 } })).toBe('paused');
  });

  it('временная ошибка — повтор, постоянная — failed', async () => {
    const id = await queue();
    const flaky: LlmProvider = {
      id: 'fake',
      completeJson: async () => {
        throw new LlmError('Gemini 503', true);
      },
    };
    await processDraft({ db, llm: flaky, log, limits });
    let [row] = await db.select().from(curriculumDrafts).where(eq(curriculumDrafts.id, id));
    expect(row!.status).toBe('queued');
    const broken: LlmProvider = {
      id: 'fake',
      completeJson: async () => {
        throw new LlmError('Gemini 402', false);
      },
    };
    await processDraft({ db, llm: broken, log, limits });
    [row] = await db.select().from(curriculumDrafts).where(eq(curriculumDrafts.id, id));
    expect(row).toMatchObject({ status: 'failed', error: 'Gemini 402' });
  });

  it('темы упорядочены по неделям и предметам', () => {
    expect(
      cleanDraft(
        {
          topics: [
            { subject: 'nature', week: 2, title: 'б' },
            { subject: 'math', week: 2, title: 'а' },
            { subject: 'nature', week: 1, title: 'в' },
          ],
        },
        { ageYears: 2, subjects: ['math', 'nature'], weeks: 2 },
      ).topics.map((t) => t.title),
    ).toEqual(['в', 'а', 'б']);
  });
});
