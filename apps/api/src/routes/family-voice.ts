import { schema } from '@kidsplus/db';
import {
  AUDIO_MAX_BYTES,
  cardVoiceInput,
  familyPhraseInput,
  type FamilyPhrase,
  type FamilyPhraseKind,
} from '@kidsplus/shared/family-voice';
import type { Deck, MediaRef } from '@kidsplus/shared/api';
import { asc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { requireParent } from '../auth';
import type { Ctx } from '../context';
import { HttpError, idFrom, parse } from '../lib/http';
import { loadAssets, saveAudioUpload, toMediaRef } from '../services/media';
import { loadDecks } from './decks';

const { familyPhrases, flashcards, flashcardDecks, mediaAssets } = schema;
const AUDIO_TYPES = ['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/x-m4a'];

/** «Мамин голос» (этап 15в): записи родителя — похвала и слова карточек. */
export function familyVoiceRoutes(app: FastifyInstance, ctx: Ctx) {
  const { db, storage } = ctx;
  const preHandler = requireParent(ctx);
  const notFound = (what: string) => new HttpError(404, 'not_found', `${what} не найдена`);

  app.addContentTypeParser(
    AUDIO_TYPES,
    { parseAs: 'buffer', bodyLimit: AUDIO_MAX_BYTES },
    (_request, body, done) => done(null, body),
  );

  app.post(
    '/api/parent/media/audio',
    { preHandler, bodyLimit: AUDIO_MAX_BYTES },
    async (request, reply): Promise<MediaRef> => {
      if (!Buffer.isBuffer(request.body) || request.body.length < 100)
        throw new HttpError(415, 'unsupported_audio', 'пустая запись');
      const asset = await saveAudioUpload(db, storage, new Uint8Array(request.body));
      reply.code(201);
      return toMediaRef(asset);
    },
  );

  const assertRecording = async (audioId: string) => {
    const [a] = await db.select().from(mediaAssets).where(eq(mediaAssets.id, audioId));
    if (a?.kind !== 'audio' || a.source !== 'upload') throw notFound('запись');
  };

  const list = async (): Promise<FamilyPhrase[]> => {
    const rows = await db.select().from(familyPhrases).orderBy(asc(familyPhrases.createdAt));
    const assets = await loadAssets(
      db,
      rows.map((r) => r.audioId),
    );
    return rows.map((r) => ({
      id: r.id,
      kind: r.kind as FamilyPhraseKind,
      label: r.label,
      audio: toMediaRef(assets.get(r.audioId)!),
    }));
  };

  app.get('/api/parent/family-phrases', { preHandler }, list);

  app.post('/api/parent/family-phrases', { preHandler }, async (request, reply) => {
    const body = parse(familyPhraseInput, request.body);
    await assertRecording(body.audioId);
    await db.insert(familyPhrases).values(body);
    reply.code(201);
    return list();
  });

  app.delete('/api/parent/family-phrases/:id', { preHandler }, async (request) => {
    const [row] = await db
      .delete(familyPhrases)
      .where(eq(familyPhrases.id, idFrom(request.params)))
      .returning();
    if (!row) throw notFound('запись');
    return list();
  });

  /** Слово карточки своим голосом; audioId: null — снова нейроголос. */
  app.put('/api/parent/cards/:id/voice', { preHandler }, async (request): Promise<Deck> => {
    const id = idFrom(request.params);
    const { audioId } = parse(cardVoiceInput, request.body);
    if (audioId) await assertRecording(audioId);
    const [row] = await db
      .update(flashcards)
      .set({ customAudioId: audioId })
      .where(eq(flashcards.id, id))
      .returning({ deckId: flashcards.deckId });
    if (!row) throw notFound('карточка');
    const [deck] = await loadDecks(db, eq(flashcardDecks.id, row.deckId));
    return deck!;
  });
}
