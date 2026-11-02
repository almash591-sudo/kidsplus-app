import { describe, expect, it } from 'vitest';
import { kioskSetupPayload, kioskSetupQrText, setupQrLevel, SETUP_VPN_MAX } from './kiosk-setup';

const base = {
  apkUrl: 'https://github.com/demo/kiosk/releases/download/kiosk-1/kidsplus-kiosk.apk',
  signatureChecksum: 'A'.repeat(43),
};
const X = 'android.app.extra.';

describe('QR-код настройки Android', () => {
  it('киоск, подпись и код привязки — в ключах Android, данные киоска только строками', () => {
    const p = kioskSetupPayload({ ...base, pairCode: ' AB12-CD34 ', noVpn: true });
    expect(p[`${X}PROVISIONING_DEVICE_ADMIN_COMPONENT_NAME`]).toBe(
      'app.kidsplus.kiosk/.AdminReceiver',
    );
    expect(p[`${X}PROVISIONING_DEVICE_ADMIN_PACKAGE_DOWNLOAD_LOCATION`]).toBe(base.apkUrl);
    expect(p[`${X}PROVISIONING_DEVICE_ADMIN_SIGNATURE_CHECKSUM`]).toBe(base.signatureChecksum);
    expect(p[`${X}PROVISIONING_LEAVE_ALL_SYSTEM_APPS_ENABLED`]).toBe(true);
    const extras = p[`${X}PROVISIONING_ADMIN_EXTRAS_BUNDLE`] as Record<string, unknown>;
    expect(extras).toEqual({ 'kidsplus.pair': 'AB12-CD34', 'kidsplus.noVpn': '1' });
    for (const v of Object.values(extras)) expect(typeof v).toBe('string');
  });

  it('без Wi-Fi и VPN — ни сети, ни пароля в QR-коде', () => {
    const p = kioskSetupPayload({ ...base, wifi: { ssid: '  ', password: 'x', security: 'WPA' } });
    expect(Object.keys(p).filter((k) => k.includes('WIFI'))).toEqual([]);
    expect(p[`${X}PROVISIONING_ADMIN_EXTRAS_BUNDLE`]).toBeUndefined();
  });

  it('VPN важнее «не нужен»; открытая сеть — без пароля', () => {
    const p = kioskSetupPayload({
      ...base,
      vpn: ' https://example.test/sub ',
      noVpn: true,
      wifi: { ssid: 'Дача', password: 'secret', security: 'NONE' },
    });
    expect(p[`${X}PROVISIONING_ADMIN_EXTRAS_BUNDLE`]).toEqual({
      'kidsplus.vpn': 'https://example.test/sub',
    });
    expect(p[`${X}PROVISIONING_WIFI_SSID`]).toBe('Дача');
    expect(p[`${X}PROVISIONING_WIFI_SECURITY_TYPE`]).toBe('NONE');
    expect(p[`${X}PROVISIONING_WIFI_PASSWORD`]).toBeUndefined();
  });

  it('текст — только ASCII, русское имя сети возвращается из JSON без искажений', () => {
    const text = kioskSetupQrText({
      ...base,
      wifi: { ssid: 'Дача 5G', password: 'пароль', security: 'WPA' },
    });
    expect(/^[\x20-\x7e]*$/.test(text)).toBe(true);
    const back = JSON.parse(text) as Record<string, unknown>;
    expect(back[`${X}PROVISIONING_WIFI_SSID`]).toBe('Дача 5G');
    expect(back[`${X}PROVISIONING_WIFI_PASSWORD`]).toBe('пароль');
  });

  it('предел длины: самая длинная разрешённая ссылка VPN ещё влезает', () => {
    const vpn = 'vless://' + 'x'.repeat(SETUP_VPN_MAX - 8);
    const text = kioskSetupQrText({
      ...base,
      pairCode: 'AB12-CD34',
      vpn,
      wifi: { ssid: 'x'.repeat(32), password: 'y'.repeat(63), security: 'WPA' },
    });
    expect(setupQrLevel(text)).not.toBeNull();
    expect(setupQrLevel(kioskSetupQrText(base))).toBe('M');
    expect(setupQrLevel('x'.repeat(3000))).toBeNull();
  });
});
