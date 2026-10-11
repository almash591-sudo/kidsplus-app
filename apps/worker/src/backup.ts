// Резервные копии базы (этап 15а): каждую ночь pg_dump → Google Диск владельца, храним 14.
// В базе всё: профили, планы, прогресс, одобренный контент, фото и видео с камеры, озвучка.
import { spawn } from 'node:child_process';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { schema, type Db } from '@kidsplus/db';
import type { DriveFile } from '@kidsplus/providers/google-drive';
import {
  BACKUP_FOLDER,
  BACKUP_KEEP,
  BACKUP_REQUEST_KEY,
  BACKUP_STATUS_KEY,
  type BackupStatus,
} from '@kidsplus/shared/backup';
import { eq, sql } from 'drizzle-orm';
import type { Logger } from 'pino';

const { appSettings } = schema;

/** То, что нужно от Google Drive (подменяется в тестах). */
export interface BackupDrive {
  folder(name: string): Promise<string>;
  list(folderId: string): Promise<DriveFile[]>;
  remove(fileId: string): Promise<void>;
  upload(folderId: string, name: string, path: string, mimeType: string): Promise<DriveFile>;
}

export interface BackupDeps {
  db: Db;
  drive: BackupDrive | null;
  log: Logger;
  /** Сделать дамп в файл (по умолчанию — pg_dump). */
  dump?: (path: string) => Promise<void>;
  now?: () => Date;
}

/** pg_dump в формате custom: сжатый, восстанавливается pg_restore. */
export const pgDump = (databaseUrl: string) => (path: string) =>
  new Promise<void>((resolve, reject) => {
    const p = spawn('pg_dump', ['-Fc', '--no-owner', '--no-acl', '-f', path, databaseUrl], {
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let err = '';
    p.stderr.on('data', (d: Buffer) => (err += d.toString()));
    p.on('error', reject);
    p.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(`pg_dump: код ${code}: ${err.slice(0, 300)}`)),
    );
  });

async function readSetting<T>(db: Db, key: string): Promise<T | null> {
  const [row] = await db.select().from(appSettings).where(eq(appSettings.key, key));
  return (row?.value as T | undefined) ?? null;
}

async function writeSetting(db: Db, key: string, value: unknown) {
  await db
    .insert(appSettings)
    .values({ key, value })
    .onConflictDoUpdate({ target: appSettings.key, set: { value, updatedAt: sql`now()` } });
}

export async function backupStatus(db: Db): Promise<BackupStatus | null> {
  return readSetting<BackupStatus>(db, BACKUP_STATUS_KEY);
}

/** Записать, настроены ли копии (кабинет показывает «не настроено», если нет ключей). */
export async function markConfigured(db: Db, configured: boolean) {
  const prev = await backupStatus(db);
  await writeSetting(db, BACKUP_STATUS_KEY, {
    last: null,
    error: null,
    requestedAt: null,
    ...prev,
    keep: BACKUP_KEEP,
    configured,
  } satisfies BackupStatus);
}

/** Одна копия: дамп → Диск → удалить лишние старые → статус. */
export async function runBackup(deps: BackupDeps): Promise<'done' | 'skipped' | 'failed'> {
  const { db, drive, log } = deps;
  const now = deps.now?.() ?? new Date();
  if (!drive) return 'skipped';
  const prev = (await backupStatus(db)) ?? {
    configured: true,
    last: null,
    error: null,
    requestedAt: null,
    keep: BACKUP_KEEP,
  };
  const dir = await mkdtemp(join(tmpdir(), 'kidsplus-backup-'));
  const name = `kidsplus-${now.toISOString().slice(0, 16).replace(/[:T]/g, '-')}.dump`;
  const path = join(dir, name);
  try {
    await (deps.dump ?? pgDump(process.env.DATABASE_URL!))(path);
    const bytes = (await stat(path)).size;
    const folder = await drive.folder(BACKUP_FOLDER);
    await drive.upload(folder, name, path, 'application/octet-stream');
    // Храним последние BACKUP_KEEP копий (только свои — других файлов приложение не видит).
    const files = (await drive.list(folder)).filter((f) => f.name.endsWith('.dump'));
    for (const old of files.slice(BACKUP_KEEP)) await drive.remove(old.id);
    await writeSetting(db, BACKUP_STATUS_KEY, {
      ...prev,
      configured: true,
      last: { at: now.toISOString(), name, bytes },
      error: null,
      requestedAt: null,
    } satisfies BackupStatus);
    log.info({ name, bytes }, 'резервная копия: готово');
    return 'done';
  } catch (err) {
    const message = (err as Error).message.slice(0, 300);
    await writeSetting(db, BACKUP_STATUS_KEY, {
      ...prev,
      configured: true,
      error: { at: now.toISOString(), message },
      requestedAt: null,
    } satisfies BackupStatus);
    log.error({ err: message }, 'резервная копия: ошибка');
    return 'failed';
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** Родитель нажал «Сделать копию сейчас» — проверяем раз в минуту. */
export function startBackupRequests(deps: BackupDeps, intervalMs = 60_000) {
  let busy = false;
  const timer = setInterval(() => {
    if (busy) return;
    busy = true;
    void (async () => {
      const req = await readSetting<{ at: string }>(deps.db, BACKUP_REQUEST_KEY);
      if (!req) return;
      await deps.db.delete(appSettings).where(eq(appSettings.key, BACKUP_REQUEST_KEY));
      await runBackup(deps);
    })()
      .catch((err: unknown) => deps.log.error({ err }, 'резервная копия: сбой запроса'))
      .finally(() => {
        busy = false;
      });
  }, intervalMs);
  return () => clearInterval(timer);
}
