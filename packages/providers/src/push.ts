// Web Push (п. 6.2 ТЗ): уведомления на телефон родителя. Содержимое шифруется для браузера
// подписчика (aes128gcm) — сервис доставки (FCM) его не видит.
import webpush from 'web-push';

export interface PushTarget {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export interface VapidKeys {
  publicKey: string;
  privateKey: string;
  /** Контакт отправителя для сервиса доставки: mailto: или https-адрес. */
  subject: string;
}

/** ok — доставлено; gone — подписка больше не действует (удалить). */
export type PushResult = 'ok' | 'gone';

export interface PushSender {
  send(target: PushTarget, payload: object): Promise<PushResult>;
}

export class WebPushSender implements PushSender {
  constructor(private readonly vapid: VapidKeys) {}

  async send(target: PushTarget, payload: object): Promise<PushResult> {
    try {
      await webpush.sendNotification(target, JSON.stringify(payload), {
        vapidDetails: this.vapid,
        TTL: 24 * 3600,
        urgency: 'normal',
      });
      return 'ok';
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) return 'gone';
      throw err;
    }
  }
}

/** Пара ключей VAPID — для первой настройки (скрипт). */
export const generateVapidKeys = () => webpush.generateVAPIDKeys();
