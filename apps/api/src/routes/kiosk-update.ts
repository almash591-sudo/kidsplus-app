import { createHash, timingSafeEqual } from 'node:crypto';
import { schema } from '@kidsplus/db';
import {
  APK_MAX_BYTES,
  APK_MIME,
  KIOSK_RELEASE_KEY,
  type KioskRelease,
} from '@kidsplus/shared/kiosk-update';
import { eq, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { Ctx } from '../context';
import { HttpError } from '../lib/http';

const { appSettings } = schema;
const ZIP = [0x50, 0x4b, 0x03, 0x04];

/**
 * Обновление киоска без кабеля (этап 15б). Компьютер владельца публикует подписанный APK
 * (токен KIOSK_PUBLISH_TOKEN знает только он), телефоны спрашивают последнюю версию и скачивают
 * её. APK не секретный — код открыт, — поэтому скачивание без входа.
 */
export function kioskUpdateRoutes(app: FastifyInstance, ctx: Ctx) {
  const { db, storage } = ctx;

  app.addContentTypeParser(
    APK_MIME,
    { parseAs: 'buffer', bodyLimit: APK_MAX_BYTES },
    (_request, body, done) => done(null, body),
  );

  async function latest(): Promise<KioskRelease | null> {
    const [row] = await db.select().from(appSettings).where(eq(appSettings.key, KIOSK_RELEASE_KEY));
    return (row?.value as KioskRelease | undefined) ?? null;
  }

  app.get('/api/kiosk/latest', async () => ({ release: await latest() }));

  app.get('/api/kiosk/apk/:versionCode', async (request, reply) => {
    const code = Number((request.params as { versionCode: string }).versionCode);
    const release = await latest();
    if (!release || release.versionCode !== code)
      throw new HttpError(404, 'not_found', 'нет такой версии');
    const data = await storage.get(apkKey(code));
    if (!data) throw new HttpError(404, 'not_found', 'нет такой версии');
    return reply
      .headers({
        'content-type': APK_MIME,
        'content-length': String(data.byteLength),
        'cache-control': 'public, max-age=31536000, immutable',
      })
      .send(Buffer.from(data));
  });

  app.post(
    '/api/kiosk/releases',
    { bodyLimit: APK_MAX_BYTES },
    async (request, reply): Promise<KioskRelease> => {
      const token = ctx.config.kioskPublishToken;
      const given = (request.headers.authorization ?? '').replace(/^Bearer /, '');
      if (!token || !safeEqual(given, token))
        throw new HttpError(401, 'unauthorized', 'нет доступа');
      const code = Number(request.headers['x-version-code']);
      if (!Number.isInteger(code) || code < 1 || code > 2_100_000_000)
        throw new HttpError(400, 'validation', 'нужен заголовок x-version-code');
      const body = request.body;
      if (!Buffer.isBuffer(body) || !ZIP.every((b, i) => body[i] === b))
        throw new HttpError(415, 'unsupported', 'нужен файл APK');
      const prev = await latest();
      if (prev && code <= prev.versionCode)
        throw new HttpError(409, 'old_version', `на сервере уже версия ${prev.versionCode}`);

      await storage.put(apkKey(code), new Uint8Array(body), APK_MIME);
      const release: KioskRelease = {
        versionCode: code,
        sha256: createHash('sha256').update(body).digest('hex'),
        bytes: body.byteLength,
        url: `/api/kiosk/apk/${code}`,
        publishedAt: ctx.now().toISOString(),
      };
      await db
        .insert(appSettings)
        .values({ key: KIOSK_RELEASE_KEY, value: release })
        .onConflictDoUpdate({
          target: appSettings.key,
          set: { value: release, updatedAt: sql`now()` },
        });
      // Прошлая версия больше не нужна.
      if (prev) await storage.delete(apkKey(prev.versionCode)).catch(() => {});
      reply.code(201);
      return release;
    },
  );
}

const apkKey = (code: number) => `kiosk/kidsplus-kiosk-${code}.apk`;

function safeEqual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
