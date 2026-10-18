import { schema, type Db } from '@kidsplus/db';
import { DbStorage } from '@kidsplus/db/blob-storage';
import { createTestDb } from '@kidsplus/db/testing';
import { MemoryStorage, type MediaStorage } from '@kidsplus/providers';
import { TieredStorage } from '@kidsplus/providers/storage-tiered';
import { pino } from 'pino';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { moveBlobBatch } from './blob-move';

const { mediaBlobs } = schema;
const log = pino({ level: 'silent' });

let db: Db;
let close: () => Promise<void>;
beforeEach(async () => {
  ({ db, close } = await createTestDb());
});
afterEach(() => close());

const bytes = (n: number) => new Uint8Array([n, n, n]);

describe('перенос медиа из базы в bucket', () => {
  it('копирует порциями и удаляет из базы; чтение не прерывается', async () => {
    const legacy = new DbStorage(db);
    for (let i = 0; i < 5; i++) await legacy.put(`tts/a${i}.mp3`, bytes(i), 'audio/mpeg');
    const bucket = new MemoryStorage();
    const read = new TieredStorage(bucket, legacy);

    expect(await moveBlobBatch({ db, target: bucket, log, batch: 2 })).toBe(2);
    expect(await bucket.get('tts/a0.mp3')).toEqual(bytes(0));
    expect(await legacy.exists('tts/a0.mp3')).toBe(false);
    // Ещё не перенесённый — из базы, перенесённый — из bucket.
    expect(await read.get('tts/a4.mp3')).toEqual(bytes(4));
    expect(await read.get('tts/a1.mp3')).toEqual(bytes(1));

    expect(await moveBlobBatch({ db, target: bucket, log, batch: 10 })).toBe(3);
    expect(await moveBlobBatch({ db, target: bucket, log, batch: 10 })).toBe(0);
    expect(await db.select().from(mediaBlobs)).toHaveLength(0);
    expect(await bucket.get('tts/a4.mp3')).toEqual(bytes(4));
  });

  it('сбой записи в bucket — файл остаётся в базе', async () => {
    const legacy = new DbStorage(db);
    await legacy.put('images/x.webp', bytes(7), 'image/webp');
    const broken: MediaStorage = {
      put: () => Promise.reject(new Error('нет сети')),
      get: () => Promise.resolve(null),
      exists: () => Promise.resolve(false),
      delete: () => Promise.resolve(),
    };
    await expect(moveBlobBatch({ db, target: broken, log })).rejects.toThrow('нет сети');
    expect(await legacy.get('images/x.webp')).toEqual(bytes(7));
  });
});

describe('TieredStorage', () => {
  it('пишет в основное, кусок файла читает из любого, удаляет из обоих', async () => {
    const primary = new MemoryStorage();
    const legacy = new MemoryStorage();
    const s = new TieredStorage(primary, legacy);
    await legacy.put('a/old.mp3', new Uint8Array([1, 2, 3, 4]), 'audio/mpeg');
    await s.put('a/new.mp3', new Uint8Array([5, 6, 7]), 'audio/mpeg');
    expect(await legacy.exists('a/new.mp3')).toBe(false);
    expect(await s.exists('a/old.mp3')).toBe(true);
    expect(await s.getRange('a/old.mp3', 1, 2)).toEqual(new Uint8Array([2, 3]));
    expect(await s.getRange('a/new.mp3', 0, 0)).toEqual(new Uint8Array([5]));
    expect(await s.get('a/none.mp3')).toBeNull();
    await s.delete('a/old.mp3');
    expect(await s.exists('a/old.mp3')).toBe(false);
  });
});
