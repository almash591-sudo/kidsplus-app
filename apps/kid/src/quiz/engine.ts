import type { KidCard, KidQuestion, Language, Speech } from '@kidsplus/shared/api';

/**
 * Вопрос квиза для экрана: и вопросы родителя к видео, и проверки по карточкам.
 * prompt — последовательность фраз («Где» по-русски + слово на языке набора).
 */
export interface QuizItem {
  id: string;
  prompt: Speech[];
  options: { id: string; imageUrl: string; isCorrect: boolean }[];
  /** Для проверки по карточкам — какую карточку спрашивали (аналитика). */
  cardId?: string;
}

/** Вопрос родителя к видео → вопрос экрана квиза. */
export const fromKidQuestion = (q: KidQuestion): QuizItem => ({
  id: q.id,
  prompt: [q.prompt],
  options: q.options,
});

export type Rng = () => number;

/** Касания не принимаются, пока звучит вопрос, и минимум столько после показа (п. 5.4 ТЗ). */
export const MIN_LOCK_MS = 1000;
/** «Тыканье наугад»: столько неверных касаний подряд… */
export const RAPID_WRONG_COUNT = 2;
/** …каждое быстрее этого интервала после предыдущего. */
export const RAPID_WRONG_MS = 2500;
/** Пауза перед повтором вопроса, если ребёнок тыкает наугад. */
export const RAPID_PAUSE_MS = 3000;
/** После неверного ответа варианты закрыты на этот миг — подумать, а не жать дальше. */
export const WRONG_LOCK_MS = 900;

export function shuffle<T>(items: readonly T[], rng: Rng = Math.random): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/**
 * Очередь вопросов на `count` верных ответов. Если вопросов меньше — они повторяются
 * (перемешанными), но один и тот же вопрос не идёт два раза подряд, когда есть выбор.
 */
export function pickQuestions(
  pool: readonly QuizItem[],
  count: number,
  rng: Rng = Math.random,
): QuizItem[] {
  if (!pool.length || count <= 0) return [];
  const result: QuizItem[] = [];
  while (result.length < count) {
    let round = shuffle(pool, rng);
    if (round.length > 1 && round[0]!.id === result.at(-1)?.id)
      round = [...round.slice(1), round[0]!];
    result.push(...round);
  }
  return result.slice(0, count);
}

/** Варианты на экране: верный и случайные неверные до `count`, в случайном порядке. */
export function optionsFor(q: QuizItem, count: number, rng: Rng = Math.random) {
  const correct = q.options.find((o) => o.isCorrect);
  const wrong = shuffle(
    q.options.filter((o) => !o.isCorrect),
    rng,
  );
  const chosen = [...(correct ? [correct] : []), ...wrong].slice(0, Math.max(2, count));
  return shuffle(chosen, rng);
}

/** Ребёнок тыкает наугад: последние RAPID_WRONG_COUNT неверных касаний шли подряд и быстро. */
export function isRapidGuessing(wrongTapTimes: readonly number[]): boolean {
  if (wrongTapTimes.length < RAPID_WRONG_COUNT) return false;
  const last = wrongTapTimes.slice(-RAPID_WRONG_COUNT);
  return last.every((t, i) => i === 0 || t - last[i - 1]! < RAPID_WRONG_MS);
}

/** Случайный элемент (для фраз похвалы). */
export const pick = <T>(items: readonly T[], rng: Rng = Math.random): T | undefined =>
  items.length ? items[Math.floor(rng() * items.length)] : undefined;

// ─── Проверки по карточкам ───────────────────────────────────────────────────

/** Проверка — после каждых CHECK_EVERY карточек… */
export const CHECK_EVERY = 5;
/** …и в конце набора, если после последней проверки было хотя бы столько новых карточек. */
export const CHECK_MIN_TAIL = 3;
/** Вопросов в одной проверке. */
export const CHECK_QUESTIONS = 2;

/**
 * Индексы карточек, после которых идёт проверка: 15 карточек → [4, 9, 14], 8 → [4, 7],
 * 12 → [4, 9] (хвост из 2 карточек — без отдельной проверки), 3 → [2]. Меньше 3 — без проверок.
 */
export function checkpointIndexes(cardCount: number): number[] {
  if (cardCount < CHECK_MIN_TAIL) return [];
  const result: number[] = [];
  for (let i = CHECK_EVERY - 1; i < cardCount; i += CHECK_EVERY) result.push(i);
  const last = result.at(-1) ?? -1;
  if (cardCount - 1 - last >= CHECK_MIN_TAIL) result.push(cardCount - 1);
  return result;
}

/**
 * Вопросы проверки: «Где <слово>?» по недавно показанным карточкам (focus);
 * неверные варианты — другие картинки того же набора.
 */
/** «Покажи…» на языке набора — для режима погружения. */
const SHOW_ME: Partial<Record<Language, string>> = { en: 'Show me', zh: '指给我看' };

/** Вопрос проверки: русский набор — «Где кошка?»; иностранный — «Покажи» + слово
 *  (в режиме погружения — «Show me» + слово, целиком на языке набора). */
export function checkPrompt(word: Speech, immersion: boolean): Speech[] {
  if (word.lang === 'ru') return [{ ...word, text: `Где ${word.text}?`, audioUrl: null }];
  const showMe = immersion ? SHOW_ME[word.lang] : undefined;
  return [
    showMe
      ? { text: showMe, lang: word.lang, audioUrl: null }
      : { text: 'Покажи', lang: 'ru', audioUrl: null },
    word,
  ];
}

export function deckCheckQuestions(
  deck: readonly KidCard[],
  focus: readonly KidCard[],
  count: number,
  rng: Rng = Math.random,
  immersion = false,
): QuizItem[] {
  const targets = shuffle(focus, rng).slice(0, count);
  return targets.flatMap((target) => {
    const others = shuffle(
      deck.filter((c) => c.id !== target.id && c.imageUrl !== target.imageUrl),
      rng,
    ).filter((c, i, all) => all.findIndex((x) => x.imageUrl === c.imageUrl) === i);
    if (!others.length) return [];
    // Свой вопрос карточки («Покажи пример: два плюс один») важнее общего «Где <слово>?».
    const prompt = target.question ? [target.question] : checkPrompt(target.word, immersion);
    return [
      {
        id: `check-${target.id}`,
        cardId: target.id,
        prompt,
        options: [
          { id: target.id, imageUrl: target.imageUrl, isCorrect: true },
          ...others.slice(0, 3).map((o) => ({ id: o.id, imageUrl: o.imageUrl, isCorrect: false })),
        ],
      },
    ];
  });
}
