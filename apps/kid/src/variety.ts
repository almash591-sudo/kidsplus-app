// Разнообразие похвалы (этап 30): фраза не повторяет недавние, а несколько верных подряд —
// отдельная похвала «за серию». Общая для квизов и игр.
import type { KidPhrases, Speech } from '@kidsplus/shared/api';

type Rng = () => number;

/** Недавно сказанные фразы по видам — чтобы не повторяться. */
const recent = new Map<string, string[]>();

/**
 * Фраза из списка, которой не было среди последних (помнится половина списка, но не больше 6):
 * из 20 вариантов подряд прозвучат минимум 7 разных.
 */
export function vary<T extends { text: string }>(
  kind: string,
  items: readonly T[],
  rng: Rng = Math.random,
): T | undefined {
  if (!items.length) return undefined;
  const last = recent.get(kind) ?? [];
  const fresh = items.filter((i) => !last.includes(i.text));
  const pool = fresh.length ? fresh : items;
  const chosen = pool[Math.floor(rng() * pool.length)]!;
  const keep = Math.min(6, Math.floor(items.length / 2));
  recent.set(kind, [...last.filter((t) => t !== chosen.text), chosen.text].slice(-keep));
  return chosen;
}

/** Каждый STREAK_EVERY-й верный ответ подряд хвалят «за серию». */
export const STREAK_EVERY = 3;

let run = 0;
/** Счёт верных подряд — сбрасывается ошибкой. */
export const streak = {
  hit: () => ++run,
  miss: () => {
    run = 0;
  },
  get: () => run,
};

/** Похвала за верный ответ: обычная или, на каждом третьем подряд, «за серию». */
export function praisePhrase(phrases: KidPhrases, rng: Rng = Math.random): Speech | undefined {
  const n = streak.hit();
  if (n % STREAK_EVERY === 0 && phrases.streak?.length) return vary('streak', phrases.streak, rng);
  return vary('correct', phrases.correct, rng);
}

/** Подсказка после ошибки. */
export function retryPhrase(phrases: KidPhrases, rng: Rng = Math.random): Speech | undefined {
  streak.miss();
  return vary('retry', phrases.retry, rng);
}

/** «Не спеши» — когда ребёнок жмёт наугад; без своих фраз — обычная подсказка. */
export function slowPhrase(phrases: KidPhrases, rng: Rng = Math.random): Speech | undefined {
  streak.miss();
  return phrases.slow?.length ? vary('slow', phrases.slow, rng) : vary('retry', phrases.retry, rng);
}

/** Для тестов. */
export function resetVariety() {
  recent.clear();
  run = 0;
}
