// Видео подряд не открываются (этап 34) — обычно нет связи с YouTube или выключен VPN. Вместо
// бесконечного «нажал — ошибка — главный экран» видео на полчаса пропадают из меню и уроков.
import type { KidItem } from '@kidsplus/shared/api';

const KEY = 'kp-videos-pause';
export const VIDEO_PAUSE_MS = 30 * 60_000;

export function pauseVideos(now = Date.now()) {
  try {
    localStorage.setItem(KEY, String(now + VIDEO_PAUSE_MS));
  } catch {
    // без памяти — пауза до перезагрузки не сохранится, не страшно
  }
}

export function videosPaused(now = Date.now()): boolean {
  try {
    return Number(localStorage.getItem(KEY) ?? 0) > now;
  } catch {
    return false;
  }
}

/** Пункты без видео, пока видео «отдыхают». */
export const withoutPausedVideos = <T extends Pick<KidItem, 'kind'>>(
  items: T[],
  now = Date.now(),
) => (videosPaused(now) ? items.filter((i) => i.kind !== 'segment') : items);
