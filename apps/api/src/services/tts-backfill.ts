import { schema, type Db } from '@kidsplus/db';
import type { TtsLanguage } from '@kidsplus/providers';
import { eq } from 'drizzle-orm';
import { ensureTts, type TtsSettings } from './media';

const { flashcardDecks, flashcards, quizQuestions } = schema;

/**
 * Ставит в очередь озвучку всего, что создано до включения серверной озвучки (или до смены
 * голоса): слова и переводы карточек, свои вопросы карточек, вопросы к видео. Уже озвученное
 * не трогает — ключ кэша тот же. Возвращает, сколько записей обновлено.
 */
export async function backfillTts(db: Db, tts: TtsSettings): Promise<number> {
  if (tts.providerId === 'browser') return 0;
  let updated = 0;

  const cards = await db
    .select({ card: flashcards, lang: flashcardDecks.lang })
    .from(flashcards)
    .innerJoin(flashcardDecks, eq(flashcardDecks.id, flashcards.deckId));
  for (const { card: c, lang } of cards) {
    const audioId = await ensureTts(db, tts, c.text, lang as TtsLanguage);
    const translationAudioId = c.translation ? await ensureTts(db, tts, c.translation, 'ru') : null;
    const questionAudioId = c.question
      ? await ensureTts(db, tts, c.question, lang as TtsLanguage)
      : null;
    if (
      audioId !== c.audioId ||
      translationAudioId !== c.translationAudioId ||
      questionAudioId !== c.questionAudioId
    ) {
      await db
        .update(flashcards)
        .set({ audioId, translationAudioId, questionAudioId })
        .where(eq(flashcards.id, c.id));
      updated++;
    }
  }

  const questions = await db.select().from(quizQuestions);
  for (const q of questions) {
    const promptAudioId = await ensureTts(db, tts, q.prompt, q.lang as TtsLanguage);
    if (promptAudioId !== q.promptAudioId) {
      await db.update(quizQuestions).set({ promptAudioId }).where(eq(quizQuestions.id, q.id));
      updated++;
    }
  }
  return updated;
}
