// Регистрация service worker с автообновлением PWA.
// Без этого установленное приложение на Android продолжает показывать старую версию из кэша:
// новая скачивается в фоне, но открытая страница её не подхватывает.

const CHECK_INTERVAL_MS = 30 * 60 * 1000;
const RETRY_RELOAD_MS = 5000;

/**
 * @param canReloadNow — можно ли перезагрузить прямо сейчас (детское приложение не прерывает
 *   видео и квиз: перезагрузка откладывается до возврата на главный экран).
 */
export function registerServiceWorker(canReloadNow: () => boolean = () => true): void {
  if (!('serviceWorker' in navigator)) return;

  // Первая установка: страница уже новая, перезагрузка не нужна.
  const hadController = Boolean(navigator.serviceWorker.controller);
  let reloading = false;

  const reloadWhenPossible = () => {
    if (reloading) return;
    if (canReloadNow()) {
      reloading = true;
      window.location.reload();
    } else {
      setTimeout(reloadWhenPossible, RETRY_RELOAD_MS);
    }
  };

  // Новый service worker взял управление (skipWaiting + clientsClaim) — показываем новую версию.
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController) reloadWhenPossible();
  });

  navigator.serviceWorker
    .register('/sw.js', { scope: '/' })
    .then((reg) => {
      const check = () => void reg.update().catch(() => {});
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check();
      });
      setInterval(check, CHECK_INTERVAL_MS);
    })
    // Без service worker приложение работает, просто без офлайн-кэша.
    .catch(() => {});
}
