import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { children, videoSegments, videoSources } from './schema';
import { createTestDb } from './testing';
import type { Db } from './index';

describe('схема и миграции', () => {
  let db: Db;
  let close: () => Promise<void>;

  beforeAll(async () => {
    ({ db, close } = await createTestDb());
  });
  afterAll(() => close());

  it('профиль ребёнка: языки по умолчанию — русский', async () => {
    const [c] = await db
      .insert(children)
      .values({ nickname: 'Солнышко', birthYear: 2024, birthMonth: 3, gender: 'f' })
      .returning();
    expect(c?.languages).toEqual(['ru']);
  });

  it('месяц рождения вне 1–12 отклоняется', async () => {
    await expect(
      db.insert(children).values({ nickname: 'x', birthYear: 2021, birthMonth: 13, gender: 'f' }),
    ).rejects.toThrow();
  });

  it('фрагмент с концом раньше начала отклоняется', async () => {
    const [src] = await db
      .insert(videoSources)
      .values({ provider: 'youtube', externalId: 'abc', title: 't' })
      .returning();
    await expect(
      db.insert(videoSegments).values({ sourceId: src!.id, title: 't', startSec: 100, endSec: 50 }),
    ).rejects.toThrow();
  });
});
