import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  NoSuchKey,
  NotFound,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { assertStorageKey, type MediaStorage } from './storage';

export interface S3StorageConfig {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Префикс всех ключей, например `media/`. */
  prefix?: string;
  forcePathStyle?: boolean;
}

/** S3-совместимое хранилище (Railway Bucket) — общее для api и worker. */
export class S3Storage implements MediaStorage {
  private readonly client: S3Client;

  constructor(private readonly config: S3StorageConfig) {
    this.client = new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      forcePathStyle: config.forcePathStyle ?? false,
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    });
  }

  private key(key: string) {
    assertStorageKey(key);
    return `${this.config.prefix ?? ''}${key}`;
  }

  async put(key: string, data: Uint8Array, mimeType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: this.key(key),
        Body: data,
        ContentType: mimeType,
      }),
    );
  }

  async get(key: string): Promise<Uint8Array | null> {
    try {
      const res = await this.client.send(
        new GetObjectCommand({ Bucket: this.config.bucket, Key: this.key(key) }),
      );
      return res.Body ? await res.Body.transformToByteArray() : null;
    } catch (err) {
      if (err instanceof NoSuchKey || err instanceof NotFound) return null;
      throw err;
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.client.send(
        new HeadObjectCommand({ Bucket: this.config.bucket, Key: this.key(key) }),
      );
      return true;
    } catch (err) {
      if (err instanceof NotFound || (err as { name?: string }).name === 'NotFound') return false;
      throw err;
    }
  }

  async delete(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.config.bucket, Key: this.key(key) }),
    );
  }
}
