import { createHash } from 'node:crypto';

/** Языки интерфейса и озвучки. */
export type TtsLanguage = 'ru' | 'en' | 'zh';

export interface TtsRequest {
  text: string;
  lang: TtsLanguage;
  /** Имя голоса провайдера; если не задано — голос по умолчанию для языка. */
  voice?: string;
  /** 1.0 — обычная скорость; для малышей меньше. */
  speed: number;
}

export interface TtsResult {
  audio: Uint8Array;
  mimeType: string;
}

export interface TtsProvider {
  readonly id: string;
  synthesize(request: TtsRequest): Promise<TtsResult>;
}

export class TtsError extends Error {
  constructor(
    message: string,
    /** false — повтор не поможет (неверный ключ, недопустимый текст). */
    readonly retryable: boolean,
  ) {
    super(message);
  }
}

/**
 * Ключ кэша озвучки (п. 7.3 ТЗ): хэш текста, языка, голоса, скорости и провайдера.
 * Одинаковая фраза генерируется ровно один раз.
 */
export function ttsCacheKey(providerId: string, r: TtsRequest): string {
  const normalized = r.text.trim().replace(/\s+/g, ' ');
  return createHash('sha256')
    .update(JSON.stringify([providerId, normalized, r.lang, r.voice ?? '', r.speed.toFixed(2)]))
    .digest('hex');
}
