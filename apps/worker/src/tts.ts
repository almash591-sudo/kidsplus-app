import { schema, type Db } from '@kidsplus/db';
import {
  TtsError,
  type MediaStorage,
  type TtsLanguage,
  type TtsProvider,
} from '@kidsplus/providers';
import { and, desc, eq, inArray, lt, sql } from 'drizzle-orm';
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
  /** Провайдер попросил подождать (429/402): пачка остановлена, попытки не потрачены. */
  throttled: boolean;
}

export interface TtsBatchOptions {
  batch?: number;
  /** Пауза между запросами к провайдеру: у посредников лимит частоты (ProxyAPI — 429). */
  gapMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Генерирует ожидающую озвучку (status = pending). Каждая фраза — одна запись с уникальным
 * ключом кэша, поэтому одинаковый текст провайдеру повторно не отправляется.
 */
export async function processPendingTts(
  deps: TtsDeps,
  { batch = 5, gapMs = 0, sleep = realSleep }: TtsBatchOptions = {},
): Promise<TtsBatchResult> {
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
          // Сначала новые: прослушивание голоса в кабинете и фразы, которые телефон ждёт сейчас,
          // не стоят в очереди за тысячами фраз переозвучки.
          .orderBy(desc(mediaAssets.createdAt))
          .limit(batch)
          .for('update', { skipLocked: true }),
      ),
    )
    .returning();

  const result: TtsBatchResult = { done: 0, failed: 0, retryLater: false, throttled: false };
  for (const [i, asset] of claimed.entries()) {
    if (i > 0 && gapMs) await sleep(gapMs);
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
      if (err instanceof TtsError && err.wait) {
        // Лимит частоты или пустой баланс: эта и оставшиеся фразы пачки ждут без потери попытки.
        const rest = claimed.slice(i).map((a) => a.id);
        await db
          .update(mediaAssets)
          .set({
            attempts: sql`greatest(${mediaAssets.attempts} - 1, 0)`,
            error: err.message.slice(0, 500),
          })
          .where(inArray(mediaAssets.id, rest));
        log.warn(
          { assetId: asset.id, err: err.message.slice(0, 200) },
          'tts: провайдер просит подождать',
        );
        result.retryLater = true;
        result.throttled = true;
        break;
      }
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
export function startTtsLoop(deps: TtsDeps, intervalMs = 3000, gapMs = 1500) {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  // Пауза после «подождите» растёт: 20 с, 40 с, … до 5 минут; после удачной пачки — снова 20 с.
  let throttle = 0;

  const tick = async () => {
    let delay = intervalMs;
    try {
      const r = await processPendingTts(deps, { gapMs });
      // Полная пачка — сразу следующая; временная ошибка провайдера — пауза подольше.
      if (r.done + r.failed >= 5) delay = gapMs;
      if (r.retryLater) delay = 30_000;
      if (r.throttled) {
        throttle = r.done ? 0 : throttle + 1;
        delay = Math.min(300_000, 20_000 * 2 ** throttle);
      } else if (r.done) throttle = 0;
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
