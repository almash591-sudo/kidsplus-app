/**
 * Запас до конца фрагмента, с которым плеер уничтожается. Заставка YouTube с рекомендациями
 * появляется сразу после остановки на `end`, поэтому убираем плеер чуть раньше.
 */
export const END_MARGIN_SEC = 0.35;

/** Интервал страховочного опроса `getCurrentTime()` (п. 5.3 ТЗ). */
export const GUARD_INTERVAL_MS = 250;

/** Пора ли завершать фрагмент: время дошло до конца (с запасом) или плеер сообщил ENDED. */
export function shouldFinish(currentTime: number, endSec: number, state: number): boolean {
  const ENDED = 0;
  if (state === ENDED) return true;
  return Number.isFinite(currentTime) && currentTime >= endSec - END_MARGIN_SEC;
}
