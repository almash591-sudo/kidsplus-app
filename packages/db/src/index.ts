import { fileURLToPath } from 'node:url';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import * as schema from './schema';

export { schema };
export type Schema = typeof schema;

/** Общий тип БД: и node-postgres (продакшн), и PGlite (тесты). */
export type Db = PgDatabase<PgQueryResultHKT, Schema>;

export function createDb(connectionString: string) {
  const pool = new pg.Pool({ connectionString, max: 10 });
  const db = drizzle({ client: pool, schema, casing: 'snake_case' });
  return { db: db as unknown as Db, pool };
}

/**
 * Папка с SQL-миграциями. Путь считается от файла, в который попал этот код:
 * из исходников — `packages/db/drizzle`; из бандла `apps/api/dist/*.js` — `apps/api/drizzle`
 * (в Docker-образ миграции копируются именно туда).
 */
export const defaultMigrationsFolder = fileURLToPath(new URL('../drizzle', import.meta.url));

export async function runMigrations(
  connectionString: string,
  migrationsFolder = defaultMigrationsFolder,
): Promise<void> {
  const pool = new pg.Pool({ connectionString, max: 1 });
  try {
    await migrate(drizzle({ client: pool }), { migrationsFolder });
  } finally {
    await pool.end();
  }
}
