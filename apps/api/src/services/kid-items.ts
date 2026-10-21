import { schema, type Db } from '@kidsplus/db';
import {
  gameCategory,
  mediaUrl,
  type DeckCategory,
  type GameCategory,
  type KidCard,
  type KidItem,
  type KidQuestion,
  type Language,
  type Speech,
} from '@kidsplus/shared/api';
import { gameImageIds, gameSpec, type GameSpec } from '@kidsplus/shared/games';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { loadAssets, type TtsSettings } from './media';
import { cardStates, orderCards, type CardState } from './srs';

const {
  children,
  flashcardDecks,
  flashcards,
  interactives,
  quizOptions,
  quizQuestions,
  videoSegments,
  videoSources,
} = schema;

/**
 * Фраза для ребёнка. С серверной озвучкой — ссылка на готовый файл; пока файл не готов
 * (или в режиме browser) — audioUrl: null, и фразу произносит голос телефона.
 */
export function toSpeech(
  tts: TtsSettings,
  text: string,
  lang: string,
  audioId: string | null,
  ready: (id: string | null) => boolean,
): Speech {
  const url = tts.providerId !== 'browser' && audioId && ready(audioId) ? mediaUrl(audioId) : null;
  return { text, lang: lang as Language, audioUrl: url };
}

import type { ItemRef } from '@kidsplus/db/day';

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;

export type { ItemRef };

/**
 * Материалы для ребёнка в заданном порядке. Только доступные видео и только вопросы/карточки
 * с готовыми картинками (и озвучкой — если она серверная); остальное пропускается.
 */
export async function buildKidItems(
  db: Db,
  tts: TtsSettings,
  items: readonly ItemRef[],
  /** Интервальное повторение: чьи ответы учитывать при порядке карточек. */
  srs?: { childId: string; now: Date },
): Promise<KidItem[]> {
  const segmentIds = items.flatMap((i) => (i.segmentId ? [i.segmentId] : []));
  const deckIds = items.flatMap((i) => (i.deckId ? [i.deckId] : []));
  const gameIds = items.flatMap((i) => (i.interactiveId ? [i.interactiveId] : []));
  // Игры с неверными параметрами (схема поменялась) ребёнку не показываются.
  const games = new Map<string, { spec: GameSpec; category: GameCategory }>();
  if (gameIds.length) {
    const rows = await db.select().from(interactives).where(inArray(interactives.id, gameIds));
    for (const g of rows) {
      const spec = gameSpec.safeParse({ ...(g.params as object), kind: g.kind });
      if (spec.success) games.set(g.id, { spec: spec.data, category: gameCategory(g.category) });
    }
  }

  const segments = segmentIds.length
    ? await db
        .select({ segment: videoSegments, source: videoSources })
        .from(videoSegments)
        .innerJoin(videoSources, eq(videoSources.id, videoSegments.sourceId))
        .where(and(inArray(videoSegments.id, segmentIds), eq(videoSources.status, 'available')))
    : [];
  const questions = segmentIds.length
    ? await db
        .select()
        .from(quizQuestions)
        .where(inArray(quizQuestions.segmentId, segmentIds))
        .orderBy(asc(quizQuestions.position))
    : [];
  const options = questions.length
    ? await db
        .select()
        .from(quizOptions)
        .where(
          inArray(
            quizOptions.questionId,
            questions.map((q) => q.id),
          ),
        )
        .orderBy(asc(quizOptions.position))
    : [];
  const cards = deckIds.length
    ? await db
        .select()
        .from(flashcards)
        .where(inArray(flashcards.deckId, deckIds))
        .orderBy(asc(flashcards.position))
    : [];

  const assets = await loadAssets(db, [
    ...questions.map((q) => q.promptAudioId),
    ...options.map((o) => o.imageId),
    ...cards.flatMap((c) => [
      c.imageId,
      c.audioId,
      c.translationAudioId,
      c.questionAudioId,
      c.customAudioId,
    ]),
    ...[...games.values()].flatMap((g) => gameImageIds(g.spec)),
  ]);
  // Авторские картинки вместо эмодзи (этап 25) — если родитель включил их ребёнку.
  const illustrated = srs
    ? (
        await db
          .select({ on: children.illustrations })
          .from(children)
          .where(eq(children.id, srs.childId))
      )[0]?.on === true
    : false;
  if (illustrated) {
    const extra = await loadAssets(
      db,
      [...assets.values()].map((a) => a.illustrationId),
    );
    for (const [id, a] of extra) assets.set(id, a);
  }
  const ready = (id: string | null) => Boolean(id && assets.get(id)?.status === 'ready');
  /** Картинка для показа: авторская, если она есть и готова, иначе исходная. */
  const shownImage = (id: string) => {
    const alt = illustrated ? assets.get(id)?.illustrationId : null;
    return alt && ready(alt) ? alt : id;
  };
  /** В параметрах игры картинки — id (uuid); подменяем их на авторские. */
  const illustrateSpec = (spec: GameSpec): GameSpec =>
    JSON.parse(JSON.stringify(spec).replace(UUID, (id) => shownImage(id))) as GameSpec;
  /** Ссылка на картинку: авторская, если она есть и готова, иначе исходная. */
  const imageUrl = (id: string) => mediaUrl(shownImage(id));

  const speech = (text: string, lang: string, audioId: string | null) =>
    toSpeech(tts, text, lang, audioId, ready);

  /**
   * Этап 39: после верного ответа — сам ответ («Это кошка.», подпись верного варианта; только
   * у русских вопросов) и пояснение родителя. Озвучивает телефон через /api/kid/speech.
   */
  const questionAnswer = (
    q: typeof quizQuestions.$inferSelect,
    opts: (typeof quizOptions.$inferSelect)[],
  ): Speech[] => {
    const label = opts.find((o) => o.isCorrect)?.label.trim();
    return [
      ...(q.lang === 'ru' && label ? [`Это ${label}.`] : []),
      ...(q.explanation ? [q.explanation] : []),
    ].map((text) => ({ text, lang: 'ru', audioUrl: null }));
  };

  const kidQuestions = (segmentId: string): KidQuestion[] =>
    questions
      .filter((q) => q.segmentId === segmentId)
      .map((q) => ({
        q,
        prompt: speech(q.prompt, q.lang, q.promptAudioId),
        opts: options.filter((o) => o.questionId === q.id),
      }))
      .filter(
        ({ prompt, opts }) => prompt && opts.length >= 2 && opts.every((o) => ready(o.imageId)),
      )
      .map(({ q, prompt, opts }) => ({
        id: q.id,
        prompt: prompt!,
        answer: questionAnswer(q, opts),
        options: opts.map((o) => ({
          id: o.id,
          imageUrl: imageUrl(o.imageId),
          isCorrect: o.isCorrect,
        })),
      }));

  const deckLang = new Map<string, string>();
  const deckCategory = new Map<string, DeckCategory>();
  if (deckIds.length) {
    const decks = await db
      .select({
        id: flashcardDecks.id,
        lang: flashcardDecks.lang,
        category: flashcardDecks.category,
      })
      .from(flashcardDecks)
      .where(inArray(flashcardDecks.id, deckIds));
    for (const d of decks) {
      deckLang.set(d.id, d.lang);
      deckCategory.set(d.id, d.category as DeckCategory);
    }
  }

  const states = srs ? await cardStates(db, srs.childId) : new Map<string, CardState>();
  const kidCards = (deckId: string): KidCard[] =>
    orderCards(
      cards.filter((c) => c.deckId === deckId && ready(c.imageId)),
      states,
      srs?.now ?? new Date(),
    )
      .map((c) => ({
        c,
        // Слово, записанное голосом родителя, — вместо нейроголоса (и в режиме голоса телефона).
        word:
          c.customAudioId && ready(c.customAudioId)
            ? {
                text: c.text,
                lang: (deckLang.get(deckId) ?? 'ru') as Language,
                audioUrl: mediaUrl(c.customAudioId),
              }
            : speech(c.text, deckLang.get(deckId) ?? 'ru', c.audioId),
        translation: c.translation ? speech(c.translation, 'ru', c.translationAudioId) : null,
        question: c.question
          ? speech(c.question, deckLang.get(deckId) ?? 'ru', c.questionAudioId)
          : null,
      }))
      // Карточка готова, когда озвучены слово и (если есть) перевод и свой вопрос.
      .filter(
        ({ c, word, translation, question }) =>
          word && (!c.translation || translation) && (!c.question || question),
      )
      .map(({ c, word, translation, question }) => ({
        id: c.id,
        imageUrl: imageUrl(c.imageId),
        word: word!,
        translation,
        question,
      }));

  const result: KidItem[] = [];
  for (const item of items) {
    if (item.segmentId) {
      const row = segments.find((s) => s.segment.id === item.segmentId);
      if (!row) continue; // видео недоступно — пропускаем
      result.push({
        kind: 'segment',
        id: row.segment.id,
        provider: 'youtube',
        externalId: row.source.externalId,
        startSec: row.segment.startSec,
        endSec: row.segment.endSec,
        thumbnailUrl: row.source.thumbnailUrl,
        subject: (row.segment.subject as GameCategory | null) ?? null,
        questions: kidQuestions(row.segment.id),
      });
    } else if (item.interactiveId) {
      const game = games.get(item.interactiveId);
      if (game && gameImageIds(game.spec).every(ready))
        result.push({
          kind: 'interactive',
          id: item.interactiveId,
          category: game.category,
          spec: illustrated ? illustrateSpec(game.spec) : game.spec,
        });
    } else if (item.deckId) {
      const deckCards = kidCards(item.deckId);
      if (deckCards.length)
        result.push({
          kind: 'deck',
          id: item.deckId,
          category: deckCategory.get(item.deckId) ?? 'other',
          coverUrl: deckCards[0]!.imageUrl,
          cards: deckCards,
        });
    }
  }
  return result;
}
