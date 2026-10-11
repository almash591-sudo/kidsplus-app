// Обновление киоска без кабеля (этап 15б): версия на сервере, телефоны ставят её сами ночью.

export interface KioskRelease {
  /** versionCode APK — растёт с каждой сборкой (ГГММДДЧЧ). */
  versionCode: number;
  sha256: string;
  bytes: number;
  /** Адрес APK (относительно сервера детского приложения). */
  url: string;
  publishedAt: string;
}

export const KIOSK_RELEASE_KEY = 'kiosk_release';
export const APK_MIME = 'application/vnd.android.package-archive';
/** APK киоска с sing-box — около 60 МБ. */
export const APK_MAX_BYTES = 150 * 1024 * 1024;
