/**
 * Запас до конца фрагмента, с которым плеер уничтожается. Заставка с рекомендациями (YouTube,
 * RuTube) появляется сразу после остановки на `end`, поэтому убираем плеер чуть раньше.
 */
export const END_MARGIN_SEC = 0.35;

/** Интервал страховочного опроса текущего времени (п. 5.3 ТЗ). */
export const GUARD_INTERVAL_MS = 250;

/** Пора ли завершать фрагмент: время дошло до конца (с запасом) или плеер сообщил о конце. */
export function shouldFinish(
  currentTime: number | undefined,
  endSec: number,
  ended: boolean,
): boolean {
  if (ended) return true;
  return (
    currentTime !== undefined &&
    Number.isFinite(currentTime) &&
    currentTime >= endSec - END_MARGIN_SEC
  );
}
