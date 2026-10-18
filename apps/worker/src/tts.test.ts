import { schema, type Db } from '@kidsplus/db';
import { createTestDb } from '@kidsplus/db/testing';
import { MemoryStorage, TtsError, ttsCacheKey, type TtsProvider } from '@kidsplus/providers';
import { eq } from 'drizzle-orm';
import { pino } from 'pino';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_TTS_ATTEMPTS, processPendingTts } from './tts';

const { mediaAssets } = schema;
const log = pino({ level: 'silent' });

let db: Db;
let close: () => Promise<void>;
let storage: MemoryStorage;
beforeEach(async () => {
  ({ db, close } = await createTestDb());
  storage = new MemoryStorage();
});
afterEach(() => close());

function fakeProvider(
  impl?: () => Promise<never>,
): TtsProvider & { calls: ReturnType<typeof vi.fn> } {
  const calls = vi.fn(
    impl ?? (async () => ({ audio: new Uint8Array([1, 2, 3]), mimeType: 'audio/mpeg' })),
  );
  return { id: 'fake', synthesize: calls, calls };
}

async function pending(text: string, lang = 'ru') {
  const ttsKey = ttsCacheKey('fake', { text, lang: lang as 'ru', speed: 0.85 });
  const [row] = await db
    .insert(mediaAssets)
    .values({
      kind: 'audio',
      status: 'pending',
      source: 'tts',
      ttsKey,
      ttsText: text,
      ttsLang: lang,
      ttsSpeed: 0.85,
    })
    .returning();
  return row!;
}

const byId = async (id: string) =>
  (await db.select().from(mediaAssets).where(eq(mediaAssets.id, id)))[0]!;

describe('processPendingTts', () => {
  it('генерирует озвучку, кладёт в хранилище и помечает готовой', async () => {
    const provider = fakeProvider();
    const a = await pending('Где кошка?');
    const r = await processPendingTts({ db, storage, provider, log });

    expect(r.done).toBe(1);
    expect(provider.calls).toHaveBeenCalledWith({ text: 'Где кошка?', lang: 'ru', speed: 0.85 });
    const row = await byId(a.id);
    expect(row).toMatchObject({ status: 'ready', mimeType: 'audio/mpeg', bytes: 3 });
    expect(storage.files.has(row.storageKey!)).toBe(true);
  });

  it('готовую озвучку повторно не генерирует', async () => {
    const provider = fakeProvider();
    await pending('Молодец!');
    await processPendingTts({ db, storage, provider, log });
    await processPendingTts({ db, storage, provider, log });
    await processPendingTts({ db, storage, provider, log });
    expect(provider.calls).toHaveBeenCalledTimes(1);
  });

  it('неисправимая ошибка (неверный ключ) — сразу failed', async () => {
    const provider = fakeProvider(async () => {
      throw new TtsError('Google TTS 403: API key not valid', false);
    });
    const a = await pending('Где собака?');
    const r = await processPendingTts({ db, storage, provider, log });
    expect(r).toMatchObject({ failed: 1, retryLater: false });
    expect(await byId(a.id)).toMatchObject({
      status: 'failed',
      error: expect.stringContaining('403'),
    });
  });

  it('временная ошибка — повтор, после лимита попыток — failed', async () => {
    const provider = fakeProvider(async () => {
      throw new TtsError('Google TTS 503', true);
    });
    const a = await pending('Попробуй ещё.');
    for (let i = 1; i < MAX_TTS_ATTEMPTS; i++) {
      const r = await processPendingTts({ db, storage, provider, log });
      expect(r.retryLater).toBe(true);
      expect(await byId(a.id)).toMatchObject({ status: 'pending', attempts: i });
    }
    await processPendingTts({ db, storage, provider, log });
    expect(await byId(a.id)).toMatchObject({ status: 'failed', attempts: MAX_TTS_ATTEMPTS });
    // Больше не берётся.
    await processPendingTts({ db, storage, provider, log });
    expect(provider.calls).toHaveBeenCalledTimes(MAX_TTS_ATTEMPTS);
  });

  it('картинки и загрузки не трогает', async () => {
    const provider = fakeProvider();
    await db.insert(mediaAssets).values({ kind: 'image', status: 'pending', source: 'upload' });
    const r = await processPendingTts({ db, storage, provider, log });
    expect(r.done).toBe(0);
    expect(provider.calls).not.toHaveBeenCalled();
  });

  it('«подождите» (429) — пачка останавливается, попытки не тратятся, потом всё озвучивается', async () => {
    let limited = true;
    let n = 0;
    const provider = fakeProvider(async () => {
      n++;
      // Первая фраза проходит, вторая упирается в лимит частоты.
      if (limited && n === 2) throw new TtsError('озвучка 429: Too Many Requests', true, true);
      return { audio: new Uint8Array([1]), mimeType: 'audio/mpeg' } as never;
    });
    const rows = [];
    for (let i = 0; i < 4; i++) rows.push(await pending(`Фраза ${i}`));
    const slept: number[] = [];
    const sleep = async (ms: number) => void slept.push(ms);
    const r = await processPendingTts({ db, storage, provider, log }, { gapMs: 1500, sleep });
    expect(r).toMatchObject({ done: 1, throttled: true, retryLater: true });
    expect(provider.calls).toHaveBeenCalledTimes(2); // после 429 дальше не шлёт
    expect(slept).toEqual([1500]);
    const left = await Promise.all(rows.map((a) => byId(a.id)));
    expect(left.filter((a) => a.status === 'pending').map((a) => a.attempts)).toEqual([0, 0, 0]);

    limited = false;
    for (let i = 0; i < MAX_TTS_ATTEMPTS + 2; i++)
      await processPendingTts({ db, storage, provider, log }, { sleep });
    const after = await Promise.all(rows.map((a) => byId(a.id)));
    expect(after.every((a) => a.status === 'ready')).toBe(true);
  });

  it('много 429 подряд не переводят фразу в failed', async () => {
    const provider = fakeProvider(async () => {
      throw new TtsError('озвучка 402: Недостаточно средств', true, true);
    });
    const a = await pending('Умница!');
    for (let i = 0; i < MAX_TTS_ATTEMPTS * 2; i++)
      await processPendingTts({ db, storage, provider, log });
    expect(await byId(a.id)).toMatchObject({ status: 'pending', attempts: 0 });
  });
});
