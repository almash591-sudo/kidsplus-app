import { schema, type Db } from '@kidsplus/db';
import { createTestDb } from '@kidsplus/db/testing';
import type { LlmProvider } from '@kidsplus/providers';
import type { PushMessage } from '@kidsplus/shared/push';
import { pino } from 'pino';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { tokenAlert } from './alerts';
import { registerJobs, WEEKLY_CRON, WEEKLY_QUEUE } from './jobs';
import { buildWeeklyReports, mondayOf } from './weekly';

const { children, events, flashcardDecks, llmUsage, weeklyReports } = schema;
const log = pino({ level: 'silent' });
const limits = { daily: 1_000_000, total: 10_000_000 };
/** Воскресенье, 19:00 по Москве. */
const NOW = new Date('2026-10-18T16:00:00Z');

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

describe('недельный отчёт', () => {
  it('неделя начинается с понедельника', () => {
    expect(mondayOf('2026-10-18')).toBe('2026-10-12'); // воскресенье
    expect(mondayOf('2026-10-12')).toBe('2026-10-12'); // понедельник
    expect(mondayOf('2026-10-15')).toBe('2026-10-12');
  });

  it('сводка, советы по правилам и от модели, push родителям; имя в модель не уходит', async () => {
    const [deck] = await db
      .insert(flashcardDecks)
      .values({ title: 'Животные Африки', category: 'nature' })
      .returning();
    for (const ok of [false, false, true, false])
      await db.insert(events).values({
        childId: child,
        type: 'quiz_answer',
        payload: { deckId: deck!.id, firstTry: ok, timeMs: 3000 },
        createdAt: new Date(NOW.getTime() - 86_400_000),
      });
    const prompts: string[] = [];
    const llm: LlmProvider = {
      id: 'fake',
      async completeJson(req) {
        prompts.push(req.prompt);
        return {
          text: JSON.stringify({ summary: 'Хорошая неделя.', tips: ['Повторите животных.'] }),
          usage: { model: 'fake', inputTokens: 10, outputTokens: 5 },
        };
      },
    };
    const sent: PushMessage[] = [];
    await buildWeeklyReports({
      db,
      llm,
      log,
      limits,
      notify: async (m) => sent.push(m),
      now: () => NOW,
    });

    const [report] = await db.select().from(weeklyReports);
    expect(report).toMatchObject({ childId: child, weekStart: '2026-10-12' });
    expect((report!.rules as string[])[0]).toContain('Животные Африки');
    expect(report!.advice).toEqual({ summary: 'Хорошая неделя.', tips: ['Повторите животных.'] });
    expect(prompts[0]).toContain('5 лет');
    expect(prompts[0]).toContain('Животные Африки');
    expect(prompts[0]).not.toContain('Зайка');
    expect(sent).toEqual([expect.objectContaining({ kind: 'weekly', childId: child })]);
    expect(sent[0]!.body).not.toContain('Зайка');
    expect(await db.select().from(llmUsage)).toMatchObject([{ task: 'weekly-advice' }]);
  });

  it('без модели — отчёт только с советами по правилам', async () => {
    await buildWeeklyReports({ db, llm: null, log, limits, now: () => NOW });
    const [report] = await db.select().from(weeklyReports);
    expect(report!.advice).toBeNull();
  });

  it('расписание: воскресенье 19:00 по Москве', async () => {
    const boss = {
      createQueue: vi.fn(async () => {}),
      schedule: vi.fn(async () => {}),
      work: vi.fn(async () => 'id'),
    };
    await registerJobs(boss as never, log, undefined, async () => 0);
    expect(boss.schedule).toHaveBeenCalledWith(WEEKLY_QUEUE, WEEKLY_CRON, null, {
      tz: 'Europe/Moscow',
    });
  });
});

describe('предупреждение о токенах', () => {
  it('80 % лимита — одно уведомление в сутки', async () => {
    await db.insert(llmUsage).values({
      task: 'moderate',
      model: 'm',
      inputTokens: 700,
      outputTokens: 150,
      createdAt: NOW,
    });
    const sent: PushMessage[] = [];
    const notify = async (m: PushMessage) => sent.push(m);
    const small = { daily: 1000, total: 100_000 };
    expect(await tokenAlert(db, small, notify, NOW)).toBe(true);
    expect(await tokenAlert(db, small, notify, NOW)).toBe(false);
    expect(sent).toEqual([expect.objectContaining({ kind: 'tokens' })]);
    expect(sent[0]!.body).toContain('85 %');
    expect(await tokenAlert(db, limits, notify, NOW)).toBe(false);
  });
});
