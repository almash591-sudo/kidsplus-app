import { schema } from '@kidsplus/db';
import {
  BACKUP_KEEP,
  BACKUP_REQUEST_KEY,
  BACKUP_STATUS_KEY,
  type BackupStatus,
} from '@kidsplus/shared/backup';
import { inArray, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { requireParent } from '../auth';
import type { Ctx } from '../context';
import { HttpError } from '../lib/http';

const { appSettings } = schema;

/** Резервные копии (этап 15а): статус для кабинета и «сделать сейчас». Делает их worker. */
export function backupRoutes(app: FastifyInstance, ctx: Ctx) {
  const { db } = ctx;
  const preHandler = requireParent(ctx);

  async function status(): Promise<BackupStatus> {
    const rows = await db
      .select()
      .from(appSettings)
      .where(inArray(appSettings.key, [BACKUP_STATUS_KEY, BACKUP_REQUEST_KEY]));
    const saved = rows.find((r) => r.key === BACKUP_STATUS_KEY)?.value as BackupStatus | undefined;
    const request = rows.find((r) => r.key === BACKUP_REQUEST_KEY)?.value as
      { at: string } | undefined;
    return {
      configured: saved?.configured ?? false,
      last: saved?.last ?? null,
      error: saved?.error ?? null,
      requestedAt: request?.at ?? null,
      keep: BACKUP_KEEP,
    };
  }

  app.get('/api/parent/backup', { preHandler }, status);

  app.post('/api/parent/backup', { preHandler }, async () => {
    if (!(await status()).configured)
      throw new HttpError(409, 'not_configured', 'резервные копии не настроены');
    const value = { at: new Date().toISOString() };
    await db
      .insert(appSettings)
      .values({ key: BACKUP_REQUEST_KEY, value })
      .onConflictDoUpdate({ target: appSettings.key, set: { value, updatedAt: sql`now()` } });
    return status();
  });
}
