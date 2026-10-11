import { createTestDb } from '@kidsplus/db/testing';
import { describe, expect, it } from 'vitest';
import { MemoryStorage } from '@kidsplus/providers';
import { buildApp } from './app';
import { TEST_TTS } from './test/helpers';

describe('GET /api/health', () => {
  const config = { kidAppUrl: 'https://kid.example.test', trustProxyHops: 0, tts: TEST_TTS };

  it('200, когда БД отвечает', async () => {
    const { db, close } = await createTestDb();
    const app = await buildApp({
      db,
      storage: new MemoryStorage(),
      config,
      pingDb: async () => {},
    });
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok', db: 'ok' });
    await app.close();
    await close();
  });

  it('503, когда БД недоступна', async () => {
    const { db, close } = await createTestDb();
    const app = await buildApp({
      db,
      storage: new MemoryStorage(),
      config,
      pingDb: async () => {
        throw new Error('connection refused');
      },
    });
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({ status: 'error', db: 'unavailable' });
    await app.close();
    await close();
  });

  it('неизвестный маршрут — 404 в формате API', async () => {
    const { db, close } = await createTestDb();
    const app = await buildApp({
      db,
      storage: new MemoryStorage(),
      config,
      pingDb: async () => {},
    });
    const res = await app.inject({ method: 'GET', url: '/api/nope' });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ error: 'not_found' });
    await app.close();
    await close();
  });
});
