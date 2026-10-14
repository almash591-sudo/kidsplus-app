import { schema, type Db } from '@kidsplus/db';
import type { TtsLanguage } from '@kidsplus/providers';
import {
  cardInput,
  deckInput,
  type Card,
  type Deck,
  type DeckCategory,
  type Language,
} from '@kidsplus/shared/api';
import { asc, desc, eq, inArray, max } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { requireParent } from '../auth';
import type { Ctx } from '../context';
import { idFrom, notFound, parse } from '../lib/http';
import { assignOnly, childIdsByRef, syncChildItems } from '../services/child-items';
import { assertImages, ensureTts, loadAssets, toMediaRef } from '../services/media';

const { flashcardDecks, flashcards } = schema;

export async function loadDecks(
  db: Pick<Db, 'select'>,
  where?: ReturnType<typeof eq>,
): Promise<Deck[]> {
  const decks = await db
    .select()
    .from(flashcardDecks)
    .where(where)
    .orderBy(desc(flashcardDecks.createdAt));
  if (!decks.length) return [];
  const ids = decks.map((d) => d.id);
  const cards = await db
    .select()
    .from(flashcards)
    .where(inArray(flashcards.deckId, ids))
    .orderBy(asc(flashcards.position));
  const assets = await loadAssets(
    db,
    cards.flatMap((c) => [
      c.imageId,
      c.audioId,
      c.translationAudioId,
      c.questionAudioId,
      c.customAudioId,
    ]),
  );
  const ref = (id: string | null) => (id && assets.get(id) ? toMediaRef(assets.get(id)!) : null);
  const childIds = await childIdsByRef(db, 'deck', ids);
  return decks.map((d) => ({
    id: d.id,
    title: d.title,
    lang: d.lang as Language,
    category: d.category as DeckCategory,
    childIds: childIds.get(d.id) ?? [],
    cards: cards
      .filter((c) => c.deckId === d.id)
      .map((c): Card => ({
        id: c.id,
        text: c.text,
        translation: c.translation,
        question: c.question,
        image: ref(c.imageId)!,
        audio: ref(c.audioId),
        translationAudio: ref(c.translationAudioId),
        questionAudio: ref(c.questionAudioId),
        voice: ref(c.customAudioId),
      })),
  }));
}

export function decksRoutes(app: FastifyInstance, ctx: Ctx) {
  const { db } = ctx;
  const preHandler = requireParent(ctx);
  const one = async (id: string) => {
    const [deck] = await loadDecks(db, eq(flashcardDecks.id, id));
    if (!deck) throw notFound('набор не найден');
    return deck;
  };

  /** Озвучка слова и своего вопроса — на языке набора, перевода (если есть) — на русском. */
  const cardAudio = (
    exec: Pick<Db, 'select' | 'insert'>,
    lang: string,
    text: string,
    translation: string | null,
    question: string | null,
  ) =>
    Promise.all([
      ensureTts(exec, ctx.config.tts, text, lang as TtsLanguage),
      translation ? ensureTts(exec, ctx.config.tts, translation, 'ru') : Promise.resolve(null),
      question
        ? ensureTts(exec, ctx.config.tts, question, lang as TtsLanguage)
        : Promise.resolve(null),
    ]);

  app.get('/api/parent/decks', { preHandler }, () => loadDecks(db));

  app.post('/api/parent/decks', { preHandler }, async (request, reply): Promise<Deck> => {
    const body = parse(deckInput, request.body);
    const id = await db.transaction(async (tx) => {
      const [deck] = await tx
        .insert(flashcardDecks)
        .values({ title: body.title, lang: body.lang, category: body.category })
        .returning();
      await syncChildItems(tx, 'deck', deck!.id, body.childIds, request.parent!.familyId);
      return deck!.id;
    });
    reply.code(201);
    return one(id);
  });

  app.put('/api/parent/decks/:id', { preHandler }, async (request): Promise<Deck> => {
    const id = idFrom(request.params);
    const body = parse(deckInput, request.body);
    if (!request.parent!.isAdmin) {
      await assignOnly(db, 'deck', id, body.childIds, request.parent!.familyId);
      return one(id);
    }
    await db.transaction(async (tx) => {
      const [deck] = await tx
        .update(flashcardDecks)
        .set({ title: body.title, lang: body.lang, category: body.category })
        .where(eq(flashcardDecks.id, id))
        .returning();
      if (!deck) throw notFound('набор не найден');
      await syncChildItems(tx, 'deck', id, body.childIds, request.parent!.familyId);
      // Язык набора мог смениться — озвучка карточек пересчитывается (кэш переиспользуется).
      const cards = await tx.select().from(flashcards).where(eq(flashcards.deckId, id));
      for (const c of cards) {
        const [audioId, , questionAudioId] = await cardAudio(
          tx,
          body.lang,
          c.text,
          null,
          c.question,
        );
        await tx
          .update(flashcards)
          .set({ audioId, questionAudioId })
          .where(eq(flashcards.id, c.id));
      }
    });
    return one(id);
  });

  app.delete('/api/parent/decks/:id', { preHandler }, async (request, reply) => {
    const id = idFrom(request.params);
    const [row] = await db
      .delete(flashcardDecks)
      .where(eq(flashcardDecks.id, id))
      .returning({ id: flashcardDecks.id });
    if (!row) throw notFound('набор не найден');
    return reply.code(204).send();
  });

  app.post('/api/parent/decks/:id/cards', { preHandler }, async (request, reply): Promise<Deck> => {
    const deckId = idFrom(request.params);
    const body = parse(cardInput, request.body);
    await db.transaction(async (tx) => {
      const [deck] = await tx.select().from(flashcardDecks).where(eq(flashcardDecks.id, deckId));
      if (!deck) throw notFound('набор не найден');
      await assertImages(tx, [body.imageId]);
      const [audioId, translationAudioId, questionAudioId] = await cardAudio(
        tx,
        deck.lang,
        body.text,
        body.translation,
        body.question,
      );
      const [last] = await tx
        .select({ pos: max(flashcards.position) })
        .from(flashcards)
        .where(eq(flashcards.deckId, deckId));
      await tx.insert(flashcards).values({
        deckId,
        imageId: body.imageId,
        text: body.text,
        translation: body.translation,
        question: body.question,
        audioId,
        translationAudioId,
        questionAudioId,
        position: (last?.pos ?? -1) + 1,
      });
    });
    reply.code(201);
    return one(deckId);
  });

  app.put('/api/parent/cards/:id', { preHandler }, async (request): Promise<Deck> => {
    const id = idFrom(request.params);
    const body = parse(cardInput, request.body);
    const deckId = await db.transaction(async (tx) => {
      const [card] = await tx
        .select({ deckId: flashcards.deckId, lang: flashcardDecks.lang, text: flashcards.text })
        .from(flashcards)
        .innerJoin(flashcardDecks, eq(flashcardDecks.id, flashcards.deckId))
        .where(eq(flashcards.id, id));
      if (!card) throw notFound('карточка не найдена');
      await assertImages(tx, [body.imageId]);
      const [audioId, translationAudioId, questionAudioId] = await cardAudio(
        tx,
        card.lang,
        body.text,
        body.translation,
        body.question,
      );
      await tx
        .update(flashcards)
        .set({
          imageId: body.imageId,
          text: body.text,
          translation: body.translation,
          question: body.question,
          audioId,
          translationAudioId,
          questionAudioId,
          // Слово изменилось — старая запись голосом родителя к нему не подходит.
          ...(body.text !== card.text ? { customAudioId: null } : {}),
        })
        .where(eq(flashcards.id, id));
      return card.deckId;
    });
    return one(deckId);
  });

  app.delete('/api/parent/cards/:id', { preHandler }, async (request): Promise<Deck> => {
    const id = idFrom(request.params);
    const [row] = await db
      .delete(flashcards)
      .where(eq(flashcards.id, id))
      .returning({ deckId: flashcards.deckId });
    if (!row) throw notFound('карточка не найдена');
    return one(row.deckId);
  });
}
