// Тестовая БД: PostgreSQL в WebAssembly (PGlite), в памяти, своя на каждый вызов.
// Не импортировать из продакшн-кода.
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { defaultMigrationsFolder, type Db } from './index';
import * as schema from './schema';

export async function createTestDb(): Promise<{ db: Db; close: () => Promise<void> }> {
  const client = new PGlite();
  const db = drizzle({ client, schema, casing: 'snake_case' });
  await migrate(db, { migrationsFolder: defaultMigrationsFolder });
  return { db: db as unknown as Db, close: () => client.close() };
}
