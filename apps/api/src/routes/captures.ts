// Снимки ребёнка (этап 9): телефон присылает копию фото и видео, родитель смотрит и удаляет.
// Ребёнку чужие снимки недоступны: телефон только загружает, смотреть может родитель.
import { schema } from '@kidsplus/db';
import { loadDay, loadSchedule } from '@kidsplus/db/day';
import {
  CAPTURE_DAILY_LIMIT,
  CAPTURE_MAX_BYTES,
  CAPTURE_MIME,
  captureUploadQuery,
  sniffCapture,
  type CaptureKind,
  type CaptureToday,
  type CaptureUsage,
  type ParentCapture,
} from '@kidsplus/shared/captures';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireDevice, requireParent } from '../auth';
import type { Ctx } from '../context';
import { HttpError, idFrom, notFound, parse } from '../lib/http';

const { kidCaptures } = schema;

const EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
};
const CAPTURE_BODY_LIMIT = Math.max(...Object.values(CAPTURE_MAX_BYTES));

const listQuery = z.object({ childId: z.uuid().optional() });

const toParent = (r: typeof kidCaptures.$inferSelect): ParentCapture => ({
  id: r.id,
  childId: r.childId,
  kind: r.kind as CaptureKind,
  mimeType: r.mimeType,
  bytes: r.bytes,
  durationMs: r.durationMs,
  takenAt: r.takenAt.toISOString(),
});

export function capturesRoutes(app: FastifyInstance, ctx: Ctx) {
  const { db, storage } = ctx;
  const deviceOnly = requireDevice(ctx);
  const parentOnly = requireParent(ctx);
  const quota = ctx.config.captures.quotaBytes;

  // Файл приходит «сырым» телом; настоящий тип проверяется по содержимому.
  app.addContentTypeParser(
    'application/octet-stream',
    { parseAs: 'buffer', bodyLimit: CAPTURE_BODY_LIMIT },
    (_request, body, done) => done(null, body),
  );

  /** Сколько снято сегодня (по часовому поясу расписания ребёнка). */
  async function today(childId: string): Promise<CaptureToday> {
    const { timezone } = await loadSchedule(db, childId);
    const rows = await db
      .select({ kind: kidCaptures.kind, n: sql<number>`count(*)::int` })
      .from(kidCaptures)
      .where(
        and(
          eq(kidCaptures.childId, childId),
          sql`(${kidCaptures.takenAt} at time zone ${timezone})::date = (${ctx.now()}::timestamptz at time zone ${timezone})::date`,
        ),
      )
      .groupBy(kidCaptures.kind);
    const used = (k: CaptureKind) => rows.find((r) => r.kind === k)?.n ?? 0;
    return {
      photo: { used: used('photo'), limit: CAPTURE_DAILY_LIMIT.photo },
      video: { used: used('video'), limit: CAPTURE_DAILY_LIMIT.video },
    };
  }

  /** Сверх квоты — удаляем самые старые копии (на телефоне они остаются). */
  async function enforceQuota() {
    const [{ total }] = (await db
      .select({ total: sql<number>`coalesce(sum(${kidCaptures.bytes}), 0)::bigint` })
      .from(kidCaptures)) as [{ total: number }];
    let excess = Number(total) - quota;
    if (excess <= 0) return;
    const oldest = await db
      .select({ id: kidCaptures.id, key: kidCaptures.storageKey, bytes: kidCaptures.bytes })
      .from(kidCaptures)
      .orderBy(asc(kidCaptures.takenAt))
      .limit(500);
    for (const o of oldest) {
      if (excess <= 0) break;
      await db.delete(kidCaptures).where(eq(kidCaptures.id, o.id));
      await storage.delete(o.key).catch(() => {});
      excess -= o.bytes;
    }
  }

  app.get('/api/kid/captures/today', { preHandler: deviceOnly }, (request) =>
    today(request.device!.childId),
  );

  app.post(
    '/api/kid/captures',
    { preHandler: deviceOnly, config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const q = parse(captureUploadQuery, request.query);
      const { id: deviceId, childId } = request.device!;
      if (request.device!.preview)
        throw new HttpError(403, 'preview', 'в просмотре из кабинета снимки не сохраняются');
      const body = request.body;
      if (!(body instanceof Buffer) || body.byteLength === 0)
        throw new HttpError(400, 'validation', 'нет файла');
      const data = new Uint8Array(body);
      const mime = sniffCapture(data);
      if (!mime || !CAPTURE_MIME[q.kind].includes(mime))
        throw new HttpError(415, 'unsupported_media', 'это не фото JPEG и не видео MP4/WebM');
      if (data.byteLength > CAPTURE_MAX_BYTES[q.kind])
        throw new HttpError(413, 'too_large', 'файл слишком большой');

      // Камера — только в окне дня; пауза и «завершить» от родителя тоже закрывают её.
      const day = await loadDay(db, childId, ctx.now());
      const t = day.today;
      if (t.mode !== 'off' && (t.paused || (t.closed && t.closed !== 'limit')))
        throw new HttpError(403, 'closed', 'сейчас камера недоступна');
      const counts = await today(childId);
      if (counts[q.kind].used >= counts[q.kind].limit)
        throw new HttpError(429, 'daily_limit', 'на сегодня хватит');

      const id = crypto.randomUUID();
      const key = `captures/${childId}/${id}.${EXT[mime]}`;
      await storage.put(key, data, mime);
      const takenAt = q.takenAt ? new Date(q.takenAt) : ctx.now();
      await db.insert(kidCaptures).values({
        id,
        childId,
        deviceId,
        kind: q.kind,
        mimeType: mime,
        bytes: data.byteLength,
        durationMs: q.kind === 'video' ? (q.durationMs ?? null) : null,
        storageKey: key,
        // Время с телефона — не из будущего.
        takenAt: takenAt > ctx.now() ? ctx.now() : takenAt,
      });
      await enforceQuota();
      reply.code(201);
      return { id, today: await today(childId) };
    },
  );

  // ─── Кабинет ──────────────────────────────────────────────────────────────

  app.get('/api/parent/captures', { preHandler: parentOnly }, async (request) => {
    const { childId } = parse(listQuery, request.query);
    const rows = await db
      .select()
      .from(kidCaptures)
      .where(childId ? eq(kidCaptures.childId, childId) : undefined)
      .orderBy(desc(kidCaptures.takenAt))
      .limit(500);
    return rows.map(toParent);
  });

  app.get(
    '/api/parent/captures/usage',
    { preHandler: parentOnly },
    async (): Promise<CaptureUsage> => {
      const [{ total }] = (await db
        .select({ total: sql<number>`coalesce(sum(${kidCaptures.bytes}), 0)::bigint` })
        .from(kidCaptures)) as [{ total: number }];
      return { bytes: Number(total), quotaBytes: quota };
    },
  );

  app.get('/api/parent/captures/:id/file', { preHandler: parentOnly }, async (request, reply) => {
    const [row] = await db
      .select()
      .from(kidCaptures)
      .where(eq(kidCaptures.id, idFrom(request.params)));
    if (!row) throw notFound('снимок не найден');
    const data = await storage.get(row.storageKey);
    if (!data) throw notFound('файл не найден');
    return reply
      .headers({
        'content-type': row.mimeType,
        'x-content-type-options': 'nosniff',
        'content-security-policy': "default-src 'none'; sandbox",
        'cache-control': 'private, max-age=86400',
        'content-disposition': `inline; filename="kidsplus-${row.takenAt.toISOString().slice(0, 19).replace(/[:T]/g, '-')}.${EXT[row.mimeType] ?? 'bin'}"`,
      })
      .send(Buffer.from(data));
  });

  app.delete('/api/parent/captures/:id', { preHandler: parentOnly }, async (request, reply) => {
    const [row] = await db
      .delete(kidCaptures)
      .where(eq(kidCaptures.id, idFrom(request.params)))
      .returning();
    if (!row) throw notFound('снимок не найден');
    await storage.delete(row.storageKey).catch(() => {});
    reply.code(204);
  });
}
