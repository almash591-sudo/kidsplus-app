// «Мамин голос» (этап 15в): родитель записывает похвалу и слова карточек своим голосом.
import { z } from 'zod';
import type { MediaRef } from './api';

export const FAMILY_PHRASE_KINDS = ['correct', 'retry', 'done'] as const;
export type FamilyPhraseKind = (typeof FAMILY_PHRASE_KINDS)[number];

export const FAMILY_PHRASE_TITLES: Record<FamilyPhraseKind, string> = {
  correct: 'Похвала за верный ответ',
  retry: 'Если ошибся',
  done: 'В конце урока',
};
/** Что можно сказать — подсказка в кабинете. */
export const FAMILY_PHRASE_HINTS: Record<FamilyPhraseKind, string> = {
  correct: 'Умница! Молодец, моя хорошая! Правильно!',
  retry: 'Попробуй ещё разок! Почти получилось!',
  done: 'Ты всё сделала! Я тобой горжусь!',
};

export const familyPhraseInput = z.object({
  kind: z.enum(FAMILY_PHRASE_KINDS),
  audioId: z.uuid(),
  label: z.string().trim().min(1, 'напишите, что сказано').max(120),
});
export type FamilyPhraseInput = z.infer<typeof familyPhraseInput>;

export interface FamilyPhrase {
  id: string;
  kind: FamilyPhraseKind;
  label: string;
  audio: MediaRef;
}

/** Своя запись слова карточки; null — снова нейроголос. */
export const cardVoiceInput = z.object({ audioId: z.uuid().nullable() });

/** Запись голоса — до 10 секунд, это меньше 1,5 МБ в любом формате браузера. */
export const AUDIO_MAX_BYTES = 1_500_000;
export const RECORD_MAX_SEC = 8;
