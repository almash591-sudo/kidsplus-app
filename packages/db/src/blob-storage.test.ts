import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DbStorage } from './blob-storage';
import type { Db } from './index';
import { createTestDb } from './testing';

describe('DbStorage', () => {
  let db: Db;
  let close: () => Promise<void>;
  beforeAll(async () => {
    ({ db, close } = await createTestDb());
  });
  afterAll(() => close());

  it('сохраняет, читает, перезаписывает и удаляет байты', async () => {
    const s = new DbStorage(db);
    expect(await s.get('images/a.png')).toBeNull();

    await s.put('images/a.png', new Uint8Array([0, 1, 2, 255]), 'image/png');
    expect(await s.exists('images/a.png')).toBe(true);
    const got = await s.get('images/a.png');
    expect(got).toBeInstanceOf(Uint8Array);
    expect([...got!]).toEqual([0, 1, 2, 255]);

    await s.put('images/a.png', new Uint8Array([9]), 'image/png');
    expect([...(await s.get('images/a.png'))!]).toEqual([9]);

    await s.delete('images/a.png');
    expect(await s.exists('images/a.png')).toBe(false);
  });
});
