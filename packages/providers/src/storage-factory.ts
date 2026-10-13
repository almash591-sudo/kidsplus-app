import { resolve } from 'node:path';
import type { MediaStorage } from './storage';
import { FsStorage } from './storage-fs';
import { S3Storage } from './storage-s3';

export interface StorageSettings {
  STORAGE_DRIVER: 'fs' | 'db' | 's3';
  MEDIA_DIR: string;
  S3_ENDPOINT?: string | undefined;
  S3_REGION: string;
  S3_BUCKET?: string | undefined;
  S3_ACCESS_KEY_ID?: string | undefined;
  S3_SECRET_ACCESS_KEY?: string | undefined;
  S3_FORCE_PATH_STYLE: boolean;
}

/**
 * Хранилище по переменным окружения (проверены схемой в @kidsplus/shared/env).
 * Для STORAGE_DRIVER=db передайте `db` — хранилище в PostgreSQL из @kidsplus/db/blob-storage.
 */
export function createStorage(
  env: StorageSettings,
  db?: MediaStorage,
  prefix = 'media/',
): MediaStorage {
  if (env.STORAGE_DRIVER === 'db') {
    if (!db) throw new Error('STORAGE_DRIVER=db: не передано хранилище в БД');
    return db;
  }
  if (env.STORAGE_DRIVER === 'fs') return new FsStorage(resolve(env.MEDIA_DIR));
  return new S3Storage({
    endpoint: env.S3_ENDPOINT!,
    region: env.S3_REGION,
    bucket: env.S3_BUCKET!,
    accessKeyId: env.S3_ACCESS_KEY_ID!,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY!,
    forcePathStyle: env.S3_FORCE_PATH_STYLE,
    prefix,
  });
}

/**
 * Хранилище аудиотеки: S3-совместимый bucket (Cloudflare R2), если заданы S3_ENDPOINT, S3_BUCKET
 * и ключи, — даже при STORAGE_DRIVER=db (картинки остаются в базе). Иначе — общее хранилище медиа.
 */
export function createAudioStorage(env: StorageSettings, fallback: MediaStorage): MediaStorage {
  if (!env.S3_ENDPOINT || !env.S3_BUCKET || !env.S3_ACCESS_KEY_ID || !env.S3_SECRET_ACCESS_KEY)
    return fallback;
  return new S3Storage({
    endpoint: env.S3_ENDPOINT,
    region: env.S3_REGION,
    bucket: env.S3_BUCKET,
    accessKeyId: env.S3_ACCESS_KEY_ID,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY,
    forcePathStyle: env.S3_FORCE_PATH_STYLE,
    prefix: 'audio/',
  });
}
