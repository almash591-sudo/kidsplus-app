import { schema, type Db } from '@kidsplus/db';
import { createTestDb } from '@kidsplus/db/testing';
import { LlmError, MemoryStorage, type LlmProvider } from '@kidsplus/providers';
import type { ModerationReport, VideoAnalysis } from '@kidsplus/shared/moderation';
import { eq } from 'drizzle-orm';
import { pino } from 'pino';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { checkAvailability } from './availability';
import {
  childrenAges,
  draftSegments,
  MODERATION_STATUS_KEY,
  processModeration,
  twemojiCode,
} from './moderation';

const { appMeta, children, llmUsage, mediaAssets, moderationItems, videoSources } = schema;
const log = pino({ level: 'silent' });
const NOW = new Date('2026-10-09T10:00:00Z');

let db: Db;
let close: () => Promise<void>;
let storage: MemoryStorage;
beforeEach(async () => {
  ({ db, close } = await createTestDb());
  storage = new MemoryStorage();
});
afterEach(() => close());

const question = (prompt: string, emojis: string[]) => ({
  prompt,
  lang: 'ru' as const,
  options: emojis.map((emoji, i) => ({
    label: `вариант ${i}`,
    picture: `картинка ${prompt} ${i}`,
    emoji,
    correct: i === 0,
  })),
});

const analysis = (over: Partial<VideoAnalysis> = {}): VideoAnalysis => ({
  summary: 'Песенка про цвета',
  language: 'ru',
  ages: [{ age: '2-3', fit: 'good', note: 'просто' }],
  educationalValue: { score: 4, note: 'цвета' },
  redFlags: [],
  recommendation: 'approve',
  segments: [
    {
      title: 'Красный и синий',
      topic: 'цвета',
      start: '0:30',
      end: '2:30',
      why: 'про цвета',
      questions: [
        question('Где кошка?', ['🐱', '🐶', '🐭', '']),
        question('Где мяч?', ['⚽', '🐱', '🦄', '🐶']),
        question('Где шарик?', ['🎈', '🐱', '🐶', '🐭']),
      ],
    },
  ],
  ...over,
});

/** Фейковая модель: анализ видео и SVG для вариантов без эмодзи. */
function fakeLlm(result: unknown = analysis()): LlmProvider & { calls: ReturnType<typeof vi.fn> } {
  const calls = vi.fn(async (r: { prompt: string; videoUrl?: string }) => ({
    text: r.videoUrl
      ? JSON.stringify(result)
      : JSON.stringify({
          svg: '<svg viewBox="0 0 200 200"><circle cx="100" cy="100" r="80" fill="#f00"/><script>x</script></svg>',
        }),
    usage: { model: 'gemini-test', inputTokens: 1000, outputTokens: 100 },
  }));
  return { id: 'gemini', completeJson: calls, calls };
}

async function queue(over: Partial<typeof moderationItems.$inferInsert> = {}) {
  const [row] = await db
    .insert(moderationItems)
    .values({
      provider: 'youtube',
      externalId: 'aaaaaaaaaaa',
      url: 'https://youtu.be/aaaaaaaaaaa',
      metadata: { title: 'Цвета', channelTitle: 'Канал', durationSec: 600, madeForKids: true },
      ...over,
    })
    .returning();
  return row!;
}

const deps = (llm: LlmProvider | null, limits = { daily: 1_000_000, total: 10_000_000 }) => ({
  db,
  storage,
  llm,
  log,
  limits,
  now: () => NOW,
});

describe('processModeration', () => {
  it('анализ видео по ссылке → отчёт с фрагментами, картинками и учётом токенов', async () => {
    await db.insert(children).values([
      { nickname: 'А', gender: 'f', birthYear: 2024, birthMonth: 3 },
      { nickname: 'Б', gender: 'f', birthYear: 2021, birthMonth: 5 },
    ]);
    const item = await queue({ topic: 'цвета' });
    const llm = fakeLlm();
    expect(await processModeration(deps(llm))).toBe('done');

    const first = llm.calls.mock.calls[0]![0] as { prompt: string; videoUrl: string };
    expect(first.videoUrl).toBe('https://www.youtube.com/watch?v=aaaaaaaaaaa');
    expect(first.prompt).toContain('2 и 5 лет');
    expect(first.prompt).toContain('цвета');
    expect(first.prompt).not.toMatch(/\bА\b|\bБ\b/); // прозвища детей модели не передаются

    const [row] = await db.select().from(moderationItems).where(eq(moderationItems.id, item.id));
    expect(row!.status).toBe('ready');
    const report = row!.report as unknown as ModerationReport;
    expect(report.model).toBe('gemini-test');
    expect(report.segments[0]).toMatchObject({ startSec: 30, endSec: 150 });
    const opts = report.segments[0]!.questions.flatMap((q) => q.options);
    expect(opts.every((o) => o.imageId && o.imageUrl === `/api/media/${o.imageId}`)).toBe(true);
    expect(JSON.stringify(report)).not.toContain('emoji');

    // Эмодзи — из Twemoji, вариант без эмодзи — SVG от модели, очищенный.
    const assets = await db.select().from(mediaAssets);
    expect(
      assets
        .filter((a) => a.source === 'twemoji')
        .map((a) => a.sourceRef)
        .sort(),
    ).toEqual(['1f388', '1f42d', '1f431', '1f436', '1f984', '26bd'].sort());
    const generated = assets.filter((a) => a.source === 'generated');
    expect(generated).toHaveLength(1);
    const svg = new TextDecoder().decode(storage.files.get(generated[0]!.storageKey!)!.data);
    expect(svg).not.toContain('script');

    const usage = await db.select().from(llmUsage);
    expect(usage.map((u) => u.task).sort()).toEqual(['moderate', 'svg']);
  });

  it('без ключа модели — очередь ждёт, кабинет видит причину', async () => {
    await queue();
    expect(await processModeration(deps(null))).toBe('paused');
    const [meta] = await db.select().from(appMeta).where(eq(appMeta.key, MODERATION_STATUS_KEY));
    expect(JSON.parse(meta!.value)).toMatchObject({ paused: 'no_key' });
    expect((await db.select().from(moderationItems))[0]!.status).toBe('queued');
  });

  it('лимит токенов исчерпан — анализ не запускается', async () => {
    await queue();
    await db.insert(llmUsage).values({
      task: 'moderate',
      model: 'm',
      inputTokens: 900,
      outputTokens: 200,
      createdAt: NOW,
    });
    const llm = fakeLlm();
    expect(await processModeration(deps(llm, { daily: 1000, total: 10_000 }))).toBe('paused');
    expect(llm.calls).not.toHaveBeenCalled();
  });

  it('временная ошибка модели — снова в очередь; после попыток — failed', async () => {
    const item = await queue();
    const llm: LlmProvider = {
      id: 'gemini',
      completeJson: async () => {
        throw new LlmError('Gemini 503', true);
      },
    };
    for (let i = 0; i < 3; i++) await processModeration(deps(llm));
    const [row] = await db.select().from(moderationItems).where(eq(moderationItems.id, item.id));
    expect(row).toMatchObject({ status: 'failed', attempts: 3, error: 'Gemini 503' });
  });

  it('невалидный ответ модели — повтор, затем failed без зацикливания', async () => {
    const item = await queue();
    const llm = fakeLlm({ nope: true });
    expect(await processModeration(deps(llm))).toBe('done');
    expect(llm.calls).toHaveBeenCalledTimes(3);
    const [row] = await db.select().from(moderationItems).where(eq(moderationItems.id, item.id));
    expect(row!.status).toBe('failed');
  });
});

describe('вспомогательное', () => {
  it('фрагменты: в пределах видео и 1–5 минут', () => {
    const a = analysis({
      segments: [
        { ...analysis().segments[0]!, start: '0:10', end: '0:20' },
        { ...analysis().segments[0]!, start: '1:00', end: '9:00' },
        { ...analysis().segments[0]!, start: '9:30', end: '11:00' },
      ],
    });
    expect(draftSegments(a, 600).map((p) => [p.draft.startSec, p.draft.endSec])).toEqual([
      [10, 70],
      [60, 360],
      [540, 600],
    ]);
  });

  it('код Twemoji из эмодзи', () => {
    expect(twemojiCode('🐱')).toBe('1f431');
    expect(twemojiCode('❤️')).toBe('2764');
    expect(twemojiCode('3️⃣')).toBe('33-20e3');
    expect(twemojiCode('👩‍🍳')).toBe('1f469-200d-1f373');
  });

  it('возраст детей одной строкой', async () => {
    expect(await childrenAges(db, NOW)).toBe('2–6 лет');
    await db
      .insert(children)
      .values({ nickname: 'x', gender: 'f', birthYear: 2021, birthMonth: 5 });
    expect(await childrenAges(db, NOW)).toBe('5 лет');
  });
});

describe('checkAvailability', () => {
  it('недоступные помечаются, вернувшиеся после этой проверки — восстанавливаются', async () => {
    const [a, b, c] = await db
      .insert(videoSources)
      .values([
        { provider: 'youtube', externalId: 'aaaaaaaaaaa', title: 'a' },
        { provider: 'youtube', externalId: 'bbbbbbbbbbb', title: 'b' },
        {
          provider: 'youtube',
          externalId: 'ccccccccccc',
          title: 'c',
          status: 'unavailable',
          statusReason: 'not_found',
        },
      ])
      .returning();
    const ok = { embeddable: true, privacyStatus: 'public', regionBlocked: false };
    const youtube = {
      videos: async () => [
        { externalId: 'aaaaaaaaaaa', ...ok, regionBlocked: true },
        { externalId: 'ccccccccccc', ...ok },
      ],
    };
    const r = await checkAvailability(db, youtube as never, NOW);
    expect(r).toEqual({ checked: 3, unavailable: 2, restored: 1 });
    const rows = await db.select().from(videoSources);
    const by = (id: string) => rows.find((x) => x.id === id)!;
    expect(by(a!.id)).toMatchObject({ status: 'unavailable', statusReason: 'region_blocked' });
    expect(by(b!.id)).toMatchObject({ status: 'unavailable', statusReason: 'not_found' });
    expect(by(c!.id)).toMatchObject({ status: 'available', statusReason: null });
  });
});
