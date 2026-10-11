import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { assertStorageKey, type MediaStorage } from './storage';

/** Хранилище на диске — для локальной разработки. */
export class FsStorage implements MediaStorage {
  constructor(private readonly root: string) {}

  private path(key: string) {
    assertStorageKey(key);
    return join(this.root, ...key.split('/'));
  }

  // Тип содержимого на диске не хранится: его знает запись в media_assets.
  async put(key: string, data: Uint8Array, _mimeType?: string): Promise<void> {
    const p = this.path(key);
    await mkdir(dirname(p), { recursive: true });
    await writeFile(p, data);
  }

  async get(key: string): Promise<Uint8Array | null> {
    try {
      return new Uint8Array(await readFile(this.path(key)));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw err;
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      return (await stat(this.path(key))).isFile();
    } catch {
      return false;
    }
  }

  async delete(key: string): Promise<void> {
    await rm(this.path(key), { force: true });
  }
}

/** Хранилище в памяти — для тестов. */
export class MemoryStorage implements MediaStorage {
  readonly files = new Map<string, { data: Uint8Array; mimeType: string }>();

  async put(key: string, data: Uint8Array, mimeType: string): Promise<void> {
    assertStorageKey(key);
    this.files.set(key, { data, mimeType });
  }
  async get(key: string): Promise<Uint8Array | null> {
    return this.files.get(key)?.data ?? null;
  }
  async exists(key: string): Promise<boolean> {
    return this.files.has(key);
  }
  async delete(key: string): Promise<void> {
    this.files.delete(key);
  }
}
