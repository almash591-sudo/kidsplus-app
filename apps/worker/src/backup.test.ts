import { writeFile } from 'node:fs/promises';
import { schema } from '@kidsplus/db';
import { createTestDb } from '@kidsplus/db/testing';
import type { DriveFile } from '@kidsplus/providers/google-drive';
import { BACKUP_FOLDER, BACKUP_KEEP, BACKUP_REQUEST_KEY } from '@kidsplus/shared/backup';
import { pino } from 'pino';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { backupStatus, markConfigured, runBackup, startBackupRequests } from './backup';

const log = pino({ level: 'silent' });
let t: Awaited<ReturnType<typeof createTestDb>>;
beforeEach(async () => {
  t = await createTestDb();
});
afterEach(() => t.close());

/** Диск в памяти: папки и файлы, как их видит приложение с правом drive.file. */
function fakeDrive(existing = 0) {
  const files: (DriveFile & { folder: string; bytes: number })[] = [];
  for (let i = 0; i < existing; i++)
    files.push({
      id: `old${i}`,
      name: `kidsplus-old-${i}.dump`,
      createdTime: new Date(2026, 0, 1 + i).toISOString(),
      folder: 'f1',
      bytes: 1,
    });
  const drive = {
    folders: [] as string[],
    files,
    folder: vi.fn(async (name: string) => {
      if (!drive.folders.includes(name)) drive.folders.push(name);
      return 'f1';
    }),
    list: vi.fn(async (folder: string) =>
      files
        .filter((f) => f.folder === folder)
        .sort((a, b) => b.createdTime.localeCompare(a.createdTime)),
    ),
    remove: vi.fn(async (id: string) => {
      files.splice(
        files.findIndex((f) => f.id === id),
        1,
      );
    }),
    upload: vi.fn(async (folder: string, name: string) => {
      const f = {
        id: name,
        name,
        createdTime: new Date(2027, 0, 1).toISOString(),
        folder,
        bytes: 1,
      };
      files.push(f);
      return f;
    }),
  };
  return drive;
}

const dump = async (path: string) => writeFile(path, Buffer.alloc(1234));

describe('резервные копии', () => {
  it('дамп уходит в папку на Диске, статус — время и размер', async () => {
    const drive = fakeDrive();
    const now = new Date('2026-10-12T01:00:00Z');
    expect(await runBackup({ db: t.db, drive, log, dump, now: () => now })).toBe('done');
    expect(drive.folders).toEqual([BACKUP_FOLDER]);
    expect(drive.upload).toHaveBeenCalledWith(
      'f1',
      'kidsplus-2026-10-12-01-00.dump',
      expect.any(String),
      'application/octet-stream',
    );
    expect(await backupStatus(t.db)).toMatchObject({
      configured: true,
      last: { at: now.toISOString(), name: 'kidsplus-2026-10-12-01-00.dump', bytes: 1234 },
      error: null,
    });
  });

  it(`хранит только ${BACKUP_KEEP} последних копий`, async () => {
    const drive = fakeDrive(BACKUP_KEEP + 2);
    await runBackup({ db: t.db, drive, log, dump });
    expect(drive.files).toHaveLength(BACKUP_KEEP);
    expect(drive.files.some((f) => f.name.startsWith('kidsplus-2'))).toBe(true);
    // Удалены самые старые.
    expect(drive.files.map((f) => f.id)).not.toContain('old0');
    expect(drive.files.map((f) => f.id)).not.toContain('old1');
  });

  it('ошибка дампа — в статусе, прошлая удачная копия остаётся', async () => {
    const drive = fakeDrive();
    await runBackup({ db: t.db, drive, log, dump });
    const failing = async () => {
      throw new Error('pg_dump: нет связи');
    };
    expect(await runBackup({ db: t.db, drive, log, dump: failing })).toBe('failed');
    const s = await backupStatus(t.db);
    expect(s?.error?.message).toContain('нет связи');
    expect(s?.last).not.toBeNull();
  });

  it('без ключей Диска — не настроено, копия не делается', async () => {
    await markConfigured(t.db, false);
    expect(await backupStatus(t.db)).toMatchObject({ configured: false });
    expect(await runBackup({ db: t.db, drive: null, log, dump })).toBe('skipped');
  });

  it('«Сделать сейчас» из кабинета: worker видит запрос и делает копию', async () => {
    vi.useFakeTimers({ toFake: ['setInterval'] });
    try {
      const drive = fakeDrive();
      await t.db
        .insert(schema.appSettings)
        .values({ key: BACKUP_REQUEST_KEY, value: { at: new Date().toISOString() } });
      const stop = startBackupRequests({ db: t.db, drive, log, dump }, 1000);
      vi.advanceTimersByTime(1000);
      vi.useRealTimers();
      await vi.waitFor(() => expect(drive.upload).toHaveBeenCalledTimes(1));
      stop();
      const rows = await t.db.select().from(schema.appSettings);
      expect(rows.map((r) => r.key)).not.toContain(BACKUP_REQUEST_KEY);
    } finally {
      vi.useRealTimers();
    }
  });
});
