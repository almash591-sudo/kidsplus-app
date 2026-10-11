import { eq } from 'drizzle-orm';
import type { Db } from './index';
import { mediaBlobs } from './schema';

/**
 * Хранилище медиа в PostgreSQL (таблица media_blobs). Совместимо с MediaStorage из
 * @kidsplus/providers. Подходит для небольшого объёма — картинки до 3 МБ.
 */
export class DbStorage {
  constructor(private readonly db: Db) {}

  async put(key: string, data: Uint8Array, mimeType: string): Promise<void> {
    await this.db
      .insert(mediaBlobs)
      .values({ key, data, mimeType })
      .onConflictDoUpdate({ target: mediaBlobs.key, set: { data, mimeType } });
  }

  async get(key: string): Promise<Uint8Array | null> {
    const [row] = await this.db
      .select({ data: mediaBlobs.data })
      .from(mediaBlobs)
      .where(eq(mediaBlobs.key, key));
    return row?.data ?? null;
  }

  async exists(key: string): Promise<boolean> {
    const [row] = await this.db
      .select({ key: mediaBlobs.key })
      .from(mediaBlobs)
      .where(eq(mediaBlobs.key, key));
    return Boolean(row);
  }

  async delete(key: string): Promise<void> {
    await this.db.delete(mediaBlobs).where(eq(mediaBlobs.key, key));
  }
}
