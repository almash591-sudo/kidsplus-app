// Связь с киоском (Android-оболочка, этап 6): если детское приложение открыто внутри неё,
// Capacitor даёт плагин Kiosk — настройки телефона (VPN, Wi-Fi, выход из детского режима).

interface KioskPlugin {
  openSettings(): Promise<void>;
  /** Есть с версии киоска с поворотом экрана; в старой — нет. */
  setOrientation?(options: { landscape: boolean }): Promise<void>;
  /** Яркость экрана 0…1 — системная (этап 12в). */
  setBrightness?(options: { level: number }): Promise<void>;
  /** Радионяня (этап 11): экран не гаснет, яркость минимальная. */
  setNightMode?(options: { on: boolean }): Promise<void>;
  /** Есть с версии киоска с зарядом (этап 8). */
  battery?(): Promise<{ level: number; charging: boolean }>;
  /**
   * Подписка на событие. Внимание: когда страница загружена с сервера (server.url), Capacitor
   * возвращает подписку сразу, а не обещанием — поэтому результат всегда через Promise.resolve.
   */
  addListener?(
    event: 'battery',
    cb: (b: { level: number; charging: boolean }) => void,
  ): Promise<ListenerHandle> | ListenerHandle;
  addListener?(
    event: 'voice',
    cb: (e: { command: string }) => void,
  ): Promise<ListenerHandle> | ListenerHandle;
  /** Голосовое управление экраном малыша (этап 16в); available — модель есть в APK. */
  setVoiceControl?(options: { on: boolean }): Promise<{ available: boolean }>;
  /** Экран не гаснет (видео у малыша). */
  setKeepAwake?(options: { on: boolean }): Promise<void>;
}

type ListenerHandle = { remove(): Promise<void> | void };

/** Вызов киоска: ответ — обещание или сразу значение; ошибки не роняют детское приложение. */
function call<T>(fn: () => Promise<T> | T | undefined): Promise<T | undefined> {
  try {
    return Promise.resolve(fn()).catch(() => undefined);
  } catch {
    return Promise.resolve(undefined);
  }
}

const plugin = (): KioskPlugin | null => {
  const cap = (window as unknown as { Capacitor?: { Plugins?: { Kiosk?: KioskPlugin } } })
    .Capacitor;
  return cap?.Plugins?.Kiosk ?? null;
};

/** Приложение открыто в киоске на телефоне ребёнка. */
export const inKiosk = () => plugin() !== null;

export const openPhoneSettings = () => plugin()?.openSettings();

/** Киоск умеет менять яркость (версия с этапа 12в). */
export const brightnessSupported = () => Boolean(plugin()?.setBrightness);

export function setBrightness(level: number) {
  void call(() => plugin()?.setBrightness?.({ level }));
}

/** Ночной экран радионяни: в киоске — экран не гаснет и почти не светит. */
export function setNightMode(on: boolean) {
  void call(() => plugin()?.setNightMode?.({ on }));
}

/**
 * Заряд от оболочки киоска: сразу текущий и дальше при каждом изменении.
 * null — не в киоске или киоск старой версии (тогда — Battery Status API браузера).
 */
export function kioskBattery(
  onChange: (b: { level: number; charging: boolean }) => void,
): (() => void) | null {
  const kiosk = plugin();
  if (!kiosk?.battery || !kiosk.addListener) return null;
  let handle: ListenerHandle | undefined;
  let stopped = false;
  void call(() => kiosk.battery!()).then((b) => b && onChange(b));
  void call(() => kiosk.addListener!('battery', onChange)).then((h) => {
    if (stopped) void call(() => h?.remove());
    else handle = h;
  });
  return () => {
    stopped = true;
    void call(() => handle?.remove());
  };
}

/**
 * Альбомная ориентация — только в видео: карточки, квизы и игры свёрстаны под книжную.
 * В киоске поворотом управляет оболочка; в установленном PWA — Screen Orientation API.
 */
export function allowLandscape(on: boolean) {
  const kiosk = plugin();
  if (kiosk) {
    void call(() => kiosk.setOrientation?.({ landscape: on }));
    return;
  }
  const orientation = screen.orientation as ScreenOrientation & {
    lock?: (type: 'any' | 'portrait') => Promise<void>;
  };
  // В обычной вкладке браузера блокировка не работает (нужен установленный PWA) — не страшно.
  void call(() => orientation?.lock?.(on ? 'any' : 'portrait'));
}

/** Открыто внутри Android WebView (киоск), а не в Chrome: у WebView в user agent есть «; wv)». */
export const inAndroidWebView = () => /; wv\)/.test(navigator.userAgent);

/** Снять service worker и, если страница была из его кэша, загрузить её заново — уже через киоск. */
export async function dropServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  const regs = await navigator.serviceWorker.getRegistrations();
  await Promise.all(regs.map((r) => r.unregister()));
  if (navigator.serviceWorker.controller && regs.length) window.location.reload();
}

/** Экран не гаснет, пока малыш смотрит видео (этап 16б). */
export function setKeepAwake(on: boolean) {
  const kiosk = plugin();
  if (kiosk) {
    void call(() => kiosk.setKeepAwake?.({ on }));
    return;
  }
  // Вне киоска (iPhone, Chrome) — Screen Wake Lock; телефон снимает его, когда страница скрыта.
  wantAwake = on;
  if (!on) {
    void wakeLock?.release().catch(() => {});
    wakeLock = null;
  } else void requestWakeLock();
}

let wantAwake = false;
let wakeLock: WakeLockSentinel | null = null;
async function requestWakeLock() {
  if (wakeLock || !('wakeLock' in navigator)) return;
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    wakeLock.addEventListener('release', () => (wakeLock = null));
  } catch {
    // нет разрешения (энергосбережение) — экран погаснет как обычно
  }
}
if (typeof document !== 'undefined')
  document.addEventListener('visibilitychange', () => {
    if (wantAwake && document.visibilityState === 'visible') void requestWakeLock();
  });

/**
 * Голосовое управление экраном малыша (этап 16в): киоск слушает «Малыш, …» офлайн и присылает
 * команду. Возвращает «выключить». Вне киоска (или в старом киоске) — ничего не делает.
 */
export function voiceControl(onCommand: (command: string) => void): () => void {
  const kiosk = plugin();
  if (!kiosk?.setVoiceControl || !kiosk.addListener) return () => {};
  let handle: ListenerHandle | undefined;
  let stopped = false;
  void call(() => kiosk.addListener!('voice', (e) => onCommand(e.command))).then((h) => {
    if (stopped) void call(() => h?.remove());
    else handle = h;
  });
  void call(() => kiosk.setVoiceControl!({ on: true }));
  return () => {
    stopped = true;
    void call(() => kiosk.setVoiceControl!({ on: false }));
    void call(() => handle?.remove());
  };
}
