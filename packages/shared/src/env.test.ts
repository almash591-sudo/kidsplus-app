import { describe, expect, it } from 'vitest';
import { apiEnvSchema, parseEnv, workerEnvSchema } from './env';

const DATABASE_URL = 'postgres://u:p@localhost:5432/db';

describe('parseEnv', () => {
  it('подставляет значения по умолчанию', () => {
    const env = parseEnv(apiEnvSchema, { DATABASE_URL });
    expect(env).toMatchObject({
      NODE_ENV: 'development',
      LOG_LEVEL: 'info',
      HOST: '::',
      PORT: 3000,
      DATABASE_URL,
      KID_APP_URL: 'http://localhost:5173',
      TRUST_PROXY_HOPS: 2,
      STORAGE_DRIVER: 'fs',
      TTS_PROVIDER: 'browser',
      TTS_SPEED: 0.85,
    });
  });

  it('STORAGE_DRIVER=s3 требует параметры bucket', () => {
    expect(() => parseEnv(workerEnvSchema, { DATABASE_URL, STORAGE_DRIVER: 's3' })).toThrow(
      /S3_BUCKET/,
    );
    const ok = parseEnv(workerEnvSchema, {
      DATABASE_URL,
      STORAGE_DRIVER: 's3',
      S3_ENDPOINT: 'https://storage.example.com',
      S3_BUCKET: 'b',
      S3_ACCESS_KEY_ID: 'id',
      S3_SECRET_ACCESS_KEY: 'secret',
      S3_FORCE_PATH_STYLE: 'true',
    });
    expect(ok.S3_FORCE_PATH_STYLE).toBe(true);
  });

  it('пустой SETUP_TOKEN — как не заданный', () => {
    expect(parseEnv(apiEnvSchema, { DATABASE_URL, SETUP_TOKEN: '' }).SETUP_TOKEN).toBeUndefined();
  });

  it('отклоняет слишком короткий SETUP_TOKEN', () => {
    expect(() => parseEnv(apiEnvSchema, { DATABASE_URL, SETUP_TOKEN: 'short' })).toThrow(
      /SETUP_TOKEN/,
    );
  });

  it('приводит PORT к числу', () => {
    expect(parseEnv(apiEnvSchema, { DATABASE_URL, PORT: '8080' }).PORT).toBe(8080);
  });

  it('падает без DATABASE_URL и называет переменную', () => {
    expect(() => parseEnv(workerEnvSchema, {})).toThrow(/DATABASE_URL/);
  });

  it('отклоняет не-postgres строку подключения', () => {
    expect(() => parseEnv(workerEnvSchema, { DATABASE_URL: 'mysql://x' })).toThrow(/postgres/);
  });

  it('отклоняет неизвестный LOG_LEVEL', () => {
    expect(() => parseEnv(workerEnvSchema, { DATABASE_URL, LOG_LEVEL: 'loud' })).toThrow(
      /LOG_LEVEL/,
    );
  });
});
