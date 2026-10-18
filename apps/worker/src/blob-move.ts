// Переезд медиа из базы в bucket (2026-10-18): 500 МБ тома переполнились файлами в media_blobs.
// Небольшими порциями: файл копируется в bucket и только потом удаляется из базы — api в это время
// читает из bucket, а не найдя там — из базы (TieredStorage).
import { schema, type Db } from '@kidsplus/db';
import type { MediaStorage } from '@kidsplus/providers';
import { inArray } from 'drizzle-orm';
import type { Logger } from 'pino';

const { mediaBlobs } = schema;

export interface BlobMoveDeps {
  db: Db;
  /** Bucket — куда переносим. */
  target: MediaStorage;
  log: Logger;
  batch?: number;
  /** Пауза между порциями, чтобы не мешать api. */
  pauseMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

/** Переносит одну порцию; возвращает, сколько файлов перенесено (0 — база пуста). */
export async function moveBlobBatch(deps: BlobMoveDeps): Promise<number> {
  const rows = await deps.db
    .select()
    .from(mediaBlobs)
    .orderBy(mediaBlobs.key)
    .limit(deps.batch ?? 20);
  if (rows.length === 0) return 0;
  for (const r of rows) await deps.target.put(r.key, r.data, r.mimeType);
  await deps.db.delete(mediaBlobs).where(
    inArray(
      mediaBlobs.key,
      rows.map((r) => r.key),
    ),
  );
  return rows.length;
}

/** Переносит всё, что есть; сбой — повтор через минуту. Возвращает функцию остановки. */
export function startBlobMove(deps: BlobMoveDeps) {
  const sleep = deps.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  let stopped = false;
  void (async () => {
    let moved = 0;
    while (!stopped) {
      try {
        const n = await moveBlobBatch(deps);
        if (n === 0) break;
        moved += n;
        if (moved % 500 < n) deps.log.info({ moved }, 'медиа: перенос в bucket');
        await sleep(deps.pauseMs ?? 200);
      } catch (err) {
        deps.log.error({ err }, 'медиа: сбой переноса в bucket');
        await sleep(60_000);
      }
    }
    if (moved > 0) deps.log.info({ moved }, 'медиа: перенос в bucket закончен');
  })();
  return () => {
    stopped = true;
  };
}
