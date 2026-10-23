// Аудиотека семьи (этап 20): родители загружают mp3/m4a с любого устройства кабинета, слушают
// оттуда же; на телефоны детей попадают только треки с отметкой «детям» (п. «контент — после
// одобрения родителем»: загрузил и отметил родитель — значит, одобрено).
import { schema } from '@kidsplus/db';
import {
  AUDIO_TRACK_MAX_BYTES,
  audioUpdate,
  audioUploadQuery,
  isVideo,
  parseRange,
  sniffAudio,
  type AudioTrack,
  type KidAudioTrack,
} from '@kidsplus/shared/audio';
import { and, desc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { requireDevice, requireParent, requireParentOrDevice } from '../auth';
import type { Ctx } from '../context';
import { HttpError, idFrom, notFound, parse } from '../lib/http';

const { audioTracks } = schema;

const EXT: Record<string, string> = { 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'video/mp4': 'mp4' };
const fileUrl = (id: string) => `/api/audio/${id}/file`;

const toTrack = (r: typeof audioTracks.$inferSelect): AudioTrack => ({
  id: r.id,
  title: r.title,
  mimeType: r.mimeType,
  bytes: r.bytes,
  forKids: r.forKids,
  url: fileUrl(r.id),
  createdAt: r.createdAt.toISOString(),
});

export function audioRoutes(app: FastifyInstance, ctx: Ctx) {
  const { db, audioStorage: storage } = ctx;
  const parentOnly = requireParent(ctx);
  const deviceOnly = requireDevice(ctx);
  const parentOrDevice = requireParentOrDevice(ctx);

  // Тело — «сырой» файл: разбор audio/* общий с «Маминым голосом» (family-voice.ts), предел — свой.
  // Видео (этап 42) — тоже «сырым» телом.
  app.addContentTypeParser(
    'video/mp4',
    { parseAs: 'buffer', bodyLimit: AUDIO_TRACK_MAX_BYTES },
    (_request, body, done) => done(null, body),
  );

  const load = async (id: string) => {
    const [row] = await db.select().from(audioTracks).where(eq(audioTracks.id, id));
    if (!row) throw notFound('трек не найден');
    return row;
  };

  app.get('/api/parent/audio', { preHandler: parentOnly }, async (request): Promise<AudioTrack[]> =>
    (
      await db
        .select()
        .from(audioTracks)
        .where(eq(audioTracks.familyId, request.parent!.familyId))
        .orderBy(desc(audioTracks.createdAt))
    ).map(toTrack),
  );

  app.post(
    '/api/parent/audio',
    {
      preHandler: parentOnly,
      bodyLimit: AUDIO_TRACK_MAX_BYTES,
      config: { rateLimit: { max: 60, timeWindow: '1 hour' } },
    },
    async (request, reply): Promise<AudioTrack> => {
      const q = parse(audioUploadQuery, request.query);
      const body = request.body;
      if (!(body instanceof Buffer) || body.byteLength === 0)
        throw new HttpError(400, 'validation', 'нет файла');
      const data = new Uint8Array(body);
      const mime = sniffAudio(data);
      if (!mime) throw new HttpError(415, 'unsupported_media', 'это не MP3, M4A или MP4');
      const id = crypto.randomUUID();
      const key = `tracks/${id}.${EXT[mime]}`;
      await storage.put(key, data, mime);
      const [row] = await db
        .insert(audioTracks)
        .values({
          id,
          title: q.title,
          mimeType: mime,
          bytes: data.byteLength,
          storageKey: key,
          forKids: q.forKids,
          createdBy: request.parent!.id,
          familyId: request.parent!.familyId,
        })
        .returning();
      reply.code(201);
      return toTrack(row!);
    },
  );

  app.patch('/api/parent/audio/:id', { preHandler: parentOnly }, async (request) => {
    const id = idFrom(request.params);
    const body = parse(audioUpdate, request.body);
    await load(id);
    const [row] = await db.update(audioTracks).set(body).where(eq(audioTracks.id, id)).returning();
    return toTrack(row!);
  });

  app.delete('/api/parent/audio/:id', { preHandler: parentOnly }, async (request, reply) => {
    const [row] = await db
      .delete(audioTracks)
      .where(eq(audioTracks.id, idFrom(request.params)))
      .returning();
    if (!row) throw notFound('трек не найден');
    await storage.delete(row.storageKey).catch(() => {});
    reply.code(204);
  });

  app.get('/api/kid/audio', { preHandler: deviceOnly }, async (request): Promise<KidAudioTrack[]> =>
    (
      await db
        .select({ id: audioTracks.id, title: audioTracks.title, mimeType: audioTracks.mimeType })
        .from(audioTracks)
        .innerJoin(schema.children, eq(schema.children.familyId, audioTracks.familyId))
        .where(and(eq(audioTracks.forKids, true), eq(schema.children.id, request.device!.childId)))
        .orderBy(desc(audioTracks.createdAt))
    ).map((t) => ({ id: t.id, title: t.title, url: fileUrl(t.id), video: isVideo(t.mimeType) })),
  );

  /**
   * Файл трека: родителю — любой, телефону ребёнка — только «детям». Поддерживает Range: плеер
   * начинает играть, не скачав файл целиком, и перематывает.
   */
  app.get('/api/audio/:id/file', { preHandler: parentOrDevice }, async (request, reply) => {
    const row = await load(idFrom(request.params));
    if (!request.parent && !row.forKids) throw notFound('трек не найден');

    const headers = {
      'content-type': row.mimeType,
      'accept-ranges': 'bytes',
      'x-content-type-options': 'nosniff',
      'cache-control': 'private, max-age=86400',
    };
    const range = parseRange(request.headers.range, row.bytes);
    if (range === 'invalid')
      return reply
        .code(416)
        .headers({ ...headers, 'content-range': `bytes */${row.bytes}` })
        .send();
    if (!range) {
      const data = await storage.get(row.storageKey);
      if (!data) throw notFound('файл не найден');
      return reply.headers(headers).send(Buffer.from(data));
    }
    const part = storage.getRange
      ? await storage.getRange(row.storageKey, range.start, range.end)
      : (await storage.get(row.storageKey))?.slice(range.start, range.end + 1);
    if (!part) throw notFound('файл не найден');
    return reply
      .code(206)
      .headers({
        ...headers,
        'content-range': `bytes ${range.start}-${range.end}/${row.bytes}`,
      })
      .send(Buffer.from(part));
  });
}
