import { createDb, runMigrations } from '@kidsplus/db';
import { DbStorage } from '@kidsplus/db/blob-storage';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MemoryStorage } from '@kidsplus/providers';
import { buildApp } from './app';
import { TEST_TTS } from './test/helpers';

// Настоящий PostgreSQL через node-postgres — только при заданном DATABASE_URL (в CI).
// Остальные тесты API работают на PGlite.
const url = process.env.DATABASE_URL;

describe.skipIf(!url)('интеграция с PostgreSQL', () => {
  const { db, pool } = createDb(url ?? '');

  beforeAll(async () => {
    await runMigrations(url!);
  });
  afterAll(async () => {
    await pool.end();
  });

  it('миграции применены: таблицы этапа 2 есть, child_segments перенесена и удалена', async () => {
    const res = await pool.query<{
      items: string | null;
      media: string | null;
      old: string | null;
    }>(
      `select to_regclass('public.child_items')::text as items,
              to_regclass('public.media_assets')::text as media,
              to_regclass('public.child_segments')::text as old`,
    );
    expect(res.rows[0]).toEqual({ items: 'child_items', media: 'media_assets', old: null });
  });

  it('хранилище в БД: bytea через node-postgres возвращается как Uint8Array', async () => {
    const s = new DbStorage(db);
    await s.put('test/blob.bin', new Uint8Array([0, 7, 255]), 'application/octet-stream');
    const got = await s.get('test/blob.bin');
    expect(got).toBeInstanceOf(Uint8Array);
    expect([...got!]).toEqual([0, 7, 255]);
    await s.delete('test/blob.bin');
  });

  it('/api/health отвечает ok с настоящей БД', async () => {
    const app = await buildApp({
      db,
      storage: new MemoryStorage(),
      config: { kidAppUrl: 'https://kid.example.test', trustProxyHops: 0, tts: TEST_TTS },
      pingDb: async () => {
        await pool.query('select 1');
      },
    });
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});
