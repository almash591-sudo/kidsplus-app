import type { MediaStorage } from './storage';

/**
 * Переезд медиа из базы в bucket (2026-10-18): новые файлы пишутся в основное хранилище,
 * читаются сначала из него, потом из прежнего — пока worker не перенёс всё.
 */
export class TieredStorage implements MediaStorage {
  constructor(
    private readonly primary: MediaStorage,
    private readonly legacy: MediaStorage,
  ) {}

  put(key: string, data: Uint8Array, mimeType: string): Promise<void> {
    return this.primary.put(key, data, mimeType);
  }

  async get(key: string): Promise<Uint8Array | null> {
    return (await this.primary.get(key)) ?? this.legacy.get(key);
  }

  async getRange(key: string, start: number, end: number): Promise<Uint8Array | null> {
    const hit = this.primary.getRange
      ? await this.primary.getRange(key, start, end)
      : ((await this.primary.get(key))?.subarray(start, end + 1) ?? null);
    if (hit) return hit;
    if (this.legacy.getRange) return this.legacy.getRange(key, start, end);
    return (await this.legacy.get(key))?.subarray(start, end + 1) ?? null;
  }

  async exists(key: string): Promise<boolean> {
    return (await this.primary.exists(key)) || this.legacy.exists(key);
  }

  async delete(key: string): Promise<void> {
    await Promise.all([this.primary.delete(key), this.legacy.delete(key)]);
  }
}
