import { isStandalone } from './ios';
import { inAndroidWebView } from './kiosk';

/** Keep the same fullscreen root when moving between the room and activities.
 * Browsers require a real gesture; installed apps and the Android kiosk have their own window. */
export function installTouchFullscreen() {
  if (
    isStandalone() ||
    inAndroidWebView() ||
    !document.fullscreenEnabled ||
    !document.documentElement.requestFullscreen
  )
    return;
  let pending = false;
  let denied = false;
  document.addEventListener(
    'pointerup',
    (event) => {
      if (
        event.pointerType !== 'touch' ||
        document.fullscreenElement ||
        pending ||
        denied ||
        !(event.target instanceof Element) ||
        !event.target.closest(
          '[data-testid=today], [data-testid=home], [data-testid=game], [data-testid=deck]',
        )
      )
        return;
      pending = true;
      void document.documentElement
        .requestFullscreen({ navigationUI: 'hide' })
        .catch(() => {
          // A blocked request must not interrupt the activity or prompt on every tap.
          denied = true;
        })
        .finally(() => {
          pending = false;
        });
    },
    { capture: true },
  );
}
