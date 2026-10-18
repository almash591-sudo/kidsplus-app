import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  DeleteObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  type S3Client,
} from '@aws-sdk/client-s3';
import { afterEach, describe, expect, it } from 'vitest';
import { S3Backups } from './backup-s3';

const config = {
  endpoint: 'https://r2.example',
  region: 'auto',
  bucket: 'b',
  accessKeyId: 'k',
  secretAccessKey: 's',
};

/** Поддельный S3: хранит ключи и даты, отдаёт список страницами по 2. */
function fakeClient() {
  const objects = new Map<string, { at: Date; size: number }>();
  let clock = 0;
  const send = async (cmd: unknown) => {
    if (cmd instanceof PutObjectCommand) {
      objects.set(cmd.input.Key!, { at: new Date(1e12 + ++clock * 1000), size: 3 });
      return {};
    }
    if (cmd instanceof DeleteObjectCommand) {
      objects.delete(cmd.input.Key!);
      return {};
    }
    if (cmd instanceof ListObjectsV2Command) {
      const all = [...objects]
        .filter(([k]) => k.startsWith(cmd.input.Prefix ?? ''))
        .sort(([a], [b]) => a.localeCompare(b));
      const from = Number(cmd.input.ContinuationToken ?? 0);
      const page = all.slice(from, from + 2);
      return {
        Contents: page.map(([Key, o]) => ({ Key, LastModified: o.at, Size: o.size })),
        IsTruncated: from + 2 < all.length,
        NextContinuationToken: String(from + 2),
      };
    }
    throw new Error('неожиданная команда');
  };
  return { client: { send } as unknown as S3Client, objects };
}

let dir: string | undefined;
afterEach(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
});

describe('S3Backups', () => {
  it('загружает под префикс, перечисляет новые первыми, удаляет', async () => {
    dir = await mkdtemp(join(tmpdir(), 'kp-backup-'));
    const path = join(dir, 'x.dump');
    await writeFile(path, 'abc');
    const { client, objects } = fakeClient();
    objects.set('media/other.webp', { at: new Date(0), size: 1 });
    const b = new S3Backups(config, 'backups/', client);
    const folder = await b.folder('любое имя');
    for (const n of ['a.dump', 'b.dump', 'c.dump']) {
      const f = await b.upload(folder, n, path, 'application/octet-stream');
      expect(f.id).toBe(`backups/${n}`);
    }
    const list = await b.list(folder);
    expect(list.map((f) => f.name)).toEqual(['c.dump', 'b.dump', 'a.dump']);
    expect(list[0]!.size).toBe('3');
    await b.remove(list[2]!.id);
    expect([...objects.keys()].sort()).toEqual([
      'backups/b.dump',
      'backups/c.dump',
      'media/other.webp',
    ]);
  });
});
