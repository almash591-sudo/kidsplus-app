import { schema, type Db } from '@kidsplus/db';
import {
  TtsError,
  type MediaStorage,
  type TtsLanguage,
  type TtsProvider,
} from '@kidsplus/providers';
import { and, eq, inArray, lt, sql } from 'drizzle-orm';
import type { Logger } from 'pino';

const { mediaAssets } = schema;

/** После стольких неудачных попыток озвучка помечается failed. */
export const MAX_TTS_ATTEMPTS = 5;

export interface TtsDeps {
  db: Db;
  storage: MediaStorage;
  provider: TtsProvider;
  log: Logger;
}

export interface TtsBatchResult {
  done: number;
  failed: number;
  /** Была временная ошибка провайдера — стоит подождать подольше. */
  retryLater: boolean;
}

/**
 * Генерирует ожидающую озвучку (status = pending). Каждая фраза — одна запись с уникальным
 * ключом кэша, поэтому одинаковый текст провайдеру повторно не отправляется.
 */
export async function processPendingTts(deps: TtsDeps, batch = 5): Promise<TtsBatchResult> {
  const { db, storage, provider, log } = deps;

  // Забираем пачку и сразу увеличиваем счётчик попыток (SKIP LOCKED — на случай нескольких worker'ов).
  const claimed = await db
    .update(mediaAssets)
    .set({ attempts: sql`${mediaAssets.attempts} + 1` })
    .where(
      inArray(
        mediaAssets.id,
        db
          .select({ id: mediaAssets.id })
          .from(mediaAssets)
          .where(
            and(
              eq(mediaAssets.status, 'pending'),
              eq(mediaAssets.source, 'tts'),
              lt(mediaAssets.attempts, MAX_TTS_ATTEMPTS),
            ),
          )
          .limit(batch)
          .for('update', { skipLocked: true }),
      ),
    )
    .returning();

  const result: TtsBatchResult = { done: 0, failed: 0, retryLater: false };
  for (const asset of claimed) {
    try {
      const audio = await provider.synthesize({
        text: asset.ttsText!,
        lang: asset.ttsLang as TtsLanguage,
        speed: asset.ttsSpeed ?? 1,
        ...(asset.ttsVoice ? { voice: asset.ttsVoice } : {}),
      });
      const key = `tts/${asset.ttsKey!.slice(0, 2)}/${asset.ttsKey}.mp3`;
      await storage.put(key, audio.audio, audio.mimeType);
      await db
        .update(mediaAssets)
        .set({
          status: 'ready',
          storageKey: key,
          mimeType: audio.mimeType,
          bytes: audio.audio.byteLength,
          error: null,
        })
        .where(eq(mediaAssets.id, asset.id));
      result.done++;
    } catch (err) {
      const retryable = !(err instanceof TtsError) || err.retryable;
      const final = !retryable || asset.attempts >= MAX_TTS_ATTEMPTS;
      const message = (err as Error).message.slice(0, 500);
      await db
        .update(mediaAssets)
        .set({ error: message, ...(final ? { status: 'failed' as const } : {}) })
        .where(eq(mediaAssets.id, asset.id));
      // В лог — только id и ошибку: текст фраз не содержит персональных данных, но он и не нужен.
      log.warn({ assetId: asset.id, attempt: asset.attempts, final, err: message }, 'tts: ошибка');
      if (final) result.failed++;
      else result.retryLater = true;
    }
  }
  if (result.done || result.failed) log.info(result, 'tts: обработано');
  return result;
}

/** Бесконечный цикл озвучки; останавливается через возвращённую функцию. */
export function startTtsLoop(deps: TtsDeps, intervalMs = 3000) {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const tick = async () => {
    let delay = intervalMs;
    try {
      const r = await processPendingTts(deps);
      // Полная пачка — сразу следующая; временная ошибка провайдера — пауза подольше.
      if (r.done + r.failed >= 5) delay = 0;
      if (r.retryLater) delay = 30_000;
    } catch (err) {
      deps.log.error({ err }, 'tts: сбой цикла');
      delay = 30_000;
    }
    if (!stopped) timer = setTimeout(tick, delay);
  };
  timer = setTimeout(tick, 0);

  return () => {
    stopped = true;
    clearTimeout(timer);
  };
}
