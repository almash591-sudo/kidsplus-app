// Настройка Android по QR-коду без компьютера (этап 53): что зашито в QR-код.
// Его строит кабинет в браузере — пароль Wi-Fi и VPN на сервер не уходят.

const EXTRA = 'android.app.extra.';

export const KIOSK_ADMIN_COMPONENT = 'app.kidsplus.kiosk/.AdminReceiver';

export type WifiSecurity = 'WPA' | 'WEP' | 'NONE';

export interface KioskSetupInput {
  /** Откуда Android скачает киоск. */
  apkUrl: string;
  /** SHA-256 сертификата подписи, base64url без «=». */
  signatureChecksum: string;
  /** Код привязки к ребёнку — детское приложение откроет его само. */
  pairCode?: string;
  /** Без Wi-Fi телефон попросит выбрать сеть сам — пароль тогда в QR-код не попадает. */
  wifi?: { ssid: string; password?: string; security: WifiSecurity };
  /** Ссылки vless://… или адрес подписки. */
  vpn?: string;
  /** Семья не в России: VPN не нужен. */
  noVpn?: boolean;
}

/** Текст VPN в QR-коде: подписка — это короткая ссылка, ссылок vless:// влезает несколько. */
export const SETUP_VPN_MAX = 1500;
/** Самый большой QR-код (версия 40) с уровнем коррекции L вмещает 2953 байта. */
const QR_MAX_BYTES = { M: 2331, L: 2953 } as const;

/** Данные QR-кода по правилам Android (DevicePolicyManager.EXTRA_PROVISIONING_*). */
export function kioskSetupPayload(input: KioskSetupInput): Record<string, unknown> {
  const extras: Record<string, string> = {};
  const pair = input.pairCode?.trim();
  if (pair) extras['kidsplus.pair'] = pair;
  const vpn = input.vpn?.trim();
  if (vpn) extras['kidsplus.vpn'] = vpn;
  else if (input.noVpn) extras['kidsplus.noVpn'] = '1';

  const payload: Record<string, unknown> = {
    [`${EXTRA}PROVISIONING_DEVICE_ADMIN_COMPONENT_NAME`]: KIOSK_ADMIN_COMPONENT,
    [`${EXTRA}PROVISIONING_DEVICE_ADMIN_PACKAGE_DOWNLOAD_LOCATION`]: input.apkUrl,
    [`${EXTRA}PROVISIONING_DEVICE_ADMIN_SIGNATURE_CHECKSUM`]: input.signatureChecksum,
    // Камера, звонилка и прочие системные приложения нужны киоску — их прячет он сам.
    [`${EXTRA}PROVISIONING_LEAVE_ALL_SYSTEM_APPS_ENABLED`]: true,
    [`${EXTRA}PROVISIONING_SKIP_EDUCATION_SCREENS`]: true,
  };
  const ssid = input.wifi?.ssid.trim();
  if (input.wifi && ssid) {
    payload[`${EXTRA}PROVISIONING_WIFI_SSID`] = ssid;
    payload[`${EXTRA}PROVISIONING_WIFI_SECURITY_TYPE`] = input.wifi.security;
    if (input.wifi.security !== 'NONE' && input.wifi.password)
      payload[`${EXTRA}PROVISIONING_WIFI_PASSWORD`] = input.wifi.password;
  }
  if (Object.keys(extras).length) payload[`${EXTRA}PROVISIONING_ADMIN_EXTRAS_BUNDLE`] = extras;
  return payload;
}

/**
 * Текст QR-кода. Всё не-ASCII — экранами \uXXXX: сканер Android не всегда угадывает кодировку,
 * а так русское имя сети дойдёт без искажений.
 */
export function kioskSetupQrText(input: KioskSetupInput): string {
  return JSON.stringify(kioskSetupPayload(input)).replace(
    /[\u007f-￿]/g,
    (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`,
  );
}

/** Уровень коррекции, при котором текст влезает в QR-код; null — не влезает. */
export function setupQrLevel(text: string): 'M' | 'L' | null {
  if (text.length <= QR_MAX_BYTES.M) return 'M';
  if (text.length <= QR_MAX_BYTES.L) return 'L';
  return null;
}
