import { schema, type Db } from '@kidsplus/db';
import { createTestDb } from '@kidsplus/db/testing';
import { LlmError, type LlmProvider } from '@kidsplus/providers';
import { eq } from 'drizzle-orm';
import { pino } from 'pino';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { processStory, scrubNames } from './stories';

const { children, stories } = schema;
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
  await db
    .insert(children)
    .values({ nickname: 'Тимоша', birthYear: 2023, birthMonth: 1, gender: 'm' });
  child = c!.id;
});
afterEach(() => close());

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

const queue = async (theme: string) =>
  (
    await db
      .insert(stories)
      .values({ childId: child, theme, status: 'queued', ageYears: 4 })
      .returning()
  )[0]!.id;
const byId = async (id: string) => (await db.select().from(stories).where(eq(stories.id, id)))[0]!;

const STORY = {
  title: 'Ёжик и луна',
  paragraphs: ['Жил ёжик.', 'Он смотрел на луну.', 'Луна светила.', 'Ёжик уснул. Спокойной ночи.'],
};

describe('сказки на ночь', () => {
  it('модель пишет сказку — черновик ждёт родителя; прозвища детей в модель не уходят', async () => {
    const id = await queue('про Тимошу и Зайку, которые боятся темноты');
    const { llm, prompts } = fakeLlm(() => JSON.stringify(STORY));
    expect(await processStory({ db, llm, log, limits })).toBe('done');
    expect(await byId(id)).toMatchObject({
      status: 'draft',
      title: 'Ёжик и луна',
      paragraphs: STORY.paragraphs,
    });
    expect(prompts[0]).toContain('4 лет');
    expect(prompts[0]).toContain('боятся темноты');
    expect(prompts[0]).not.toMatch(/Тимош|Зайк/i);
    expect(await processStory({ db, llm, log, limits })).toBe('idle');
  });

  it('невалидный ответ модели — повтор; неисправимая ошибка — failed', async () => {
    const id = await queue('про облачко');
    let n = 0;
    const { llm } = fakeLlm(() => (n++ === 0 ? '{"title": "x"}' : JSON.stringify(STORY)));
    await processStory({ db, llm, log, limits });
    expect((await byId(id)).status).toBe('draft');

    const bad = await queue('про дождик');
    const broken: LlmProvider = {
      id: 'fake',
      async completeJson() {
        throw new LlmError('403 ключ', false);
      },
    };
    await processStory({ db, llm: broken, log, limits });
    expect(await byId(bad)).toMatchObject({
      status: 'failed',
      error: expect.stringContaining('403'),
    });
  });

  it('без модели — пауза, заявка ждёт', async () => {
    const id = await queue('про мишку');
    expect(await processStory({ db, llm: null, log, limits })).toBe('paused');
    expect((await byId(id)).status).toBe('queued');
  });
});

describe('scrubNames', () => {
  it('вырезает прозвища во всех формах', () => {
    expect(scrubNames('Про Машу и Машеньку', ['Маша'])).toBe('Про малыш и малыш');
    expect(scrubNames('Тимоша любит мишек', ['Тимоша'])).toBe('малыш любит мишек');
    expect(scrubNames('про луну', ['Маша'])).toBe('про луну');
    expect(scrubNames('про Ли', ['Ли'])).toBe('про малыш');
  });
});
