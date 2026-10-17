// iPhone и iPad (этап 27): детское приложение ставится на экран «Домой» из Safari.

/** Устройство Apple с сенсорным экраном (iPadOS представляется Mac — отличаем по касаниям). */
export function isIos(): boolean {
  if (typeof navigator === 'undefined') return false;
  return (
    /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

/** Открыто с экрана «Домой», а не во вкладке Safari. */
export function isStandalone(): boolean {
  return (
    (navigator as Navigator & { standalone?: boolean }).standalone === true ||
    matchMedia('(display-mode: standalone)').matches ||
    matchMedia('(display-mode: fullscreen)').matches
  );
}

/**
 * Вкладка Safari на iPhone: у приложения с экрана «Домой» своё хранилище, поэтому привязка,
 * сделанная во вкладке, туда не попадёт — привязывать нужно уже в установленном приложении.
 */
export const iosBrowserTab = () => isIos() && !isStandalone();
