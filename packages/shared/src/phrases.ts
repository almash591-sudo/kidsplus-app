// Фразы, которые ребёнок слышит в квизе (п. 5.4 ТЗ): спокойно, без наказывающих звуков.
// Род берётся из профиля ребёнка; озвучка генерируется один раз и кэшируется.

export type PhraseKind = 'correct' | 'retry' | 'done';

const COMMON_CORRECT = ['Молодец!', 'Правильно!', 'Умница!', 'Верно! Здорово!'];

export const PHRASES: Record<'f' | 'm', Record<PhraseKind, string[]>> = {
  f: {
    correct: [...COMMON_CORRECT, 'Ты справилась!'],
    retry: ['Попробуй ещё.', 'Давай ещё разок.'],
    done: ['Отлично! Ты всё правильно ответила! Смотрим дальше.'],
  },
  m: {
    correct: [...COMMON_CORRECT, 'Ты справился!'],
    retry: ['Попробуй ещё.', 'Давай ещё разок.'],
    done: ['Отлично! Ты всё правильно ответил! Смотрим дальше.'],
  },
};

/** Фразы на английском — для проверок по английским карточкам в режиме погружения. */
export const PHRASES_EN: Record<PhraseKind, string[]> = {
  correct: ['Great job!', 'Well done!', 'Excellent!', 'Yes, that is right!', 'Super!'],
  retry: ['Try again.', 'Oops! One more time.'],
  done: ['Great work! Let us go on.'],
};
