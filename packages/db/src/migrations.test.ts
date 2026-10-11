import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, describe, expect, it } from 'vitest';
import { defaultMigrationsFolder } from './index';

/** Применяет SQL-миграции с номерами из диапазона по одной, как drizzle. */
async function apply(db: PGlite, from: number, to: number) {
  const files = readdirSync(defaultMigrationsFolder)
    .filter((f) => /^\d{4}_.*\.sql$/.test(f))
    .sort()
    .filter((f) => {
      const n = Number(f.slice(0, 4));
      return n >= from && n <= to;
    });
  for (const f of files) {
    const sql = readFileSync(join(defaultMigrationsFolder, f), 'utf8');
    for (const statement of sql.split('--> statement-breakpoint')) {
      if (statement.trim()) await db.exec(statement);
    }
  }
}

describe('миграция этапа 2 сохраняет данные этапа 1', () => {
  const db = new PGlite();
  afterAll(() => db.close());

  it('списки фрагментов детей переносятся в child_items с порядком', async () => {
    await apply(db, 0, 1);
    await db.exec(`
      insert into children (id, nickname, birth_year, birth_month, gender)
        values ('00000000-0000-4000-8000-000000000001', 'Малышка', 2024, 3, 'f');
      insert into video_sources (id, provider, external_id, title)
        values ('00000000-0000-4000-8000-0000000000a1', 'youtube', 'aaaaaaaaaaa', 'A');
      insert into video_segments (id, source_id, title, start_sec, end_sec) values
        ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000a1', 'один', 0, 90),
        ('00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-0000000000a1', 'два', 100, 200);
      insert into child_segments (child_id, segment_id, position) values
        ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000b2', 0),
        ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000b1', 1);
    `);

    await apply(db, 2, 99);

    const items = await db.query<{ kind: string; segment_id: string; position: number }>(
      `select kind, segment_id, position from child_items order by position`,
    );
    expect(items.rows).toEqual([
      { kind: 'segment', segment_id: '00000000-0000-4000-8000-0000000000b2', position: 0 },
      { kind: 'segment', segment_id: '00000000-0000-4000-8000-0000000000b1', position: 1 },
    ]);
    const old = await db.query<{ t: string | null }>(
      `select to_regclass('public.child_segments')::text as t`,
    );
    expect(old.rows[0]?.t).toBeNull();
  });
});
