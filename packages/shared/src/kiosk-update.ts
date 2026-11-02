// Обновление киоска без кабеля (этап 15б): версия на сервере, телефоны ставят её сами ночью.

export interface KioskRelease {
  /** versionCode APK — растёт с каждой сборкой (ГГММДДЧЧ). */
  versionCode: number;
  sha256: string;
  bytes: number;
  /** Адрес APK (относительно сервера детского приложения). */
  url: string;
  publishedAt: string;
  /**
   * SHA-256 сертификата подписи, base64url без «=» (этап 53): по нему Android при настройке по
   * QR-коду проверяет скачанный киоск. Один на все версии — ключ подписи тот же.
   */
  signatureChecksum?: string;
  /** Копия APK на GitHub (этап 53): открывается в России без VPN, в отличие от сервера. */
  mirrorUrl?: string;
}

export const SIGNATURE_CHECKSUM_RE = /^[A-Za-z0-9_-]{43}$/;
export const MIRROR_URL_RE =
  /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/releases\/download\/[\w.-]+\/[\w.-]+\.apk$/;

/** Что нужно кабинету для QR-кода настройки Android (этап 53). */
export interface KioskSetupInfo {
  /** null — QR-код пока не построить: нет версии киоска с отпечатком подписи. */
  release: {
    versionCode: number;
    bytes: number;
    /** Откуда телефон скачает киоск: копия на GitHub, если есть, иначе сервер. */
    apkUrl: string;
    signatureChecksum: string;
    mirrored: boolean;
  } | null;
}

export const KIOSK_RELEASE_KEY = 'kiosk_release';
export const APK_MIME = 'application/vnd.android.package-archive';
/** APK киоска с sing-box — около 115 МБ. */
export const APK_MAX_BYTES = 150 * 1024 * 1024;
