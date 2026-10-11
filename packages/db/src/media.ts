import { and, eq } from 'drizzle-orm';
import type { Db } from './index';
import { mediaAssets } from './schema';

/** Хранилище файлов — только запись (интерфейс MediaStorage из @kidsplus/providers). */
export interface MediaWriter {
  put(key: string, data: Uint8Array, mimeType: string): Promise<void>;
}

export const TWEMOJI_ATTRIBUTION = 'Twemoji © Twitter, Inc and other contributors, CC BY 4.0';

/**
 * Картинка SVG с источником: одна запись на (source, sourceRef) — повторно не сохраняется.
 * twemoji — эмодзи по коду; generated — нарисованная моделью (sourceRef — хэш описания).
 */
export async function saveSvgAsset(
  db: Pick<Db, 'select' | 'insert'>,
  storage: MediaWriter,
  a: { source: 'twemoji' | 'generated'; sourceRef: string; svg: Uint8Array; storageKey: string },
) {
  const find = async () =>
    (
      await db
        .select()
        .from(mediaAssets)
        .where(and(eq(mediaAssets.source, a.source), eq(mediaAssets.sourceRef, a.sourceRef)))
    )[0];
  const existing = await find();
  if (existing) return existing;

  await storage.put(a.storageKey, a.svg, 'image/svg+xml');
  const [row] = await db
    .insert(mediaAssets)
    .values({
      kind: 'image',
      source: a.source,
      sourceRef: a.sourceRef,
      storageKey: a.storageKey,
      mimeType: 'image/svg+xml',
      bytes: a.svg.byteLength,
      ...(a.source === 'twemoji'
        ? { license: 'CC-BY-4.0', attribution: TWEMOJI_ATTRIBUTION }
        : { attribution: 'Нарисовано моделью Gemini' }),
    })
    .onConflictDoNothing()
    .returning();
  // Параллельный запрос мог успеть вставить ту же картинку.
  return row ?? (await find())!;
}
