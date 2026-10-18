// Резервные копии в S3-совместимом bucket (Cloudflare R2 владельца, 2026-10-18) — когда Google Диск
// не подключён. «Папка» — префикс ключей, интерфейс тот же, что у GoogleDrive.
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import {
  DeleteObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import type { DriveFile } from './google-drive';
import type { S3StorageConfig } from './storage-s3';

export class S3Backups {
  private readonly client: S3Client;

  constructor(
    private readonly config: Omit<S3StorageConfig, 'prefix'>,
    /** Все копии лежат под этим префиксом. */
    private readonly prefix = 'backups/',
    client?: S3Client,
  ) {
    this.client =
      client ??
      new S3Client({
        endpoint: config.endpoint,
        region: config.region,
        forcePathStyle: config.forcePathStyle ?? false,
        credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
      });
  }

  /** Имя папки не нужно: у копий один префикс. */
  folder(_name: string): Promise<string> {
    return Promise.resolve(this.prefix);
  }

  /** Копии, новые первыми (как у Google Диска). */
  async list(folder: string): Promise<DriveFile[]> {
    const files: DriveFile[] = [];
    let token: string | undefined;
    do {
      const res = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.config.bucket,
          Prefix: folder,
          ContinuationToken: token,
        }),
      );
      for (const o of res.Contents ?? []) {
        if (!o.Key) continue;
        files.push({
          id: o.Key,
          name: o.Key.slice(folder.length),
          createdTime: (o.LastModified ?? new Date(0)).toISOString(),
          ...(o.Size !== undefined ? { size: String(o.Size) } : {}),
        });
      }
      token = res.IsTruncated ? res.NextContinuationToken : undefined;
    } while (token);
    return files.sort((a, b) => b.createdTime.localeCompare(a.createdTime));
  }

  async remove(id: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.config.bucket, Key: id }));
  }

  async upload(folder: string, name: string, path: string, mimeType: string): Promise<DriveFile> {
    const { size } = await stat(path);
    const key = `${folder}${name}`;
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
        Body: createReadStream(path),
        ContentLength: size,
        ContentType: mimeType,
      }),
    );
    return { id: key, name, createdTime: new Date().toISOString(), size: String(size) };
  }
}
