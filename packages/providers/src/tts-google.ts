import {
  TtsError,
  type TtsLanguage,
  type TtsProvider,
  type TtsRequest,
  type TtsResult,
} from './tts';
import { withAcuteStress } from '@kidsplus/shared/voice';

/** Коды языков Google для наших языков. */
const LANGUAGE_CODES: Record<TtsLanguage, string> = {
  ru: 'ru-RU',
  en: 'en-US',
  zh: 'cmn-CN',
};

export interface GoogleTtsConfig {
  apiKey: string;
  /** Голоса по языкам; без явного голоса Google выбирает женский голос по умолчанию. */
  voices?: Partial<Record<TtsLanguage, string>>;
  endpoint?: string;
  fetch?: typeof fetch;
}

/** Google Cloud Text-to-Speech через REST и API-ключ (ключ ограничен этим API). */
export class GoogleTtsProvider implements TtsProvider {
  readonly id = 'google';
  private readonly endpoint: string;
  private readonly fetchFn: typeof fetch;

  constructor(private readonly config: GoogleTtsConfig) {
    this.endpoint = config.endpoint ?? 'https://texttospeech.googleapis.com/v1/text:synthesize';
    this.fetchFn = config.fetch ?? globalThis.fetch;
  }

  /** Голос, который реально будет использован, — входит в ключ кэша. */
  voiceFor(lang: TtsLanguage): string | undefined {
    return this.config.voices?.[lang];
  }

  async synthesize(r: TtsRequest): Promise<TtsResult> {
    const voice = r.voice ?? this.voiceFor(r.lang);
    let res = await this.request(r, voice, true);
    let error = res.ok ? null : await errorText(res);
    // Не все голоса (например, Chirp 3 HD) принимают скорость речи — тогда без неё.
    if (res.status === 400 && /rate|speed|pace/i.test(error ?? '')) {
      res = await this.request(r, voice, false);
      error = res.ok ? null : await errorText(res);
    }

    if (!res.ok) {
      const message = `Google TTS ${res.status}: ${error}`;
      // 429 и 5xx — временные; 400/401/403 — неверный запрос или ключ.
      throw new TtsError(message, res.status === 429 || res.status >= 500, res.status === 429);
    }

    const { audioContent } = (await res.json()) as { audioContent?: string };
    if (!audioContent) throw new TtsError('Google TTS вернул пустой ответ', true);
    return { audio: new Uint8Array(Buffer.from(audioContent, 'base64')), mimeType: 'audio/mpeg' };
  }

  private async request(r: TtsRequest, voice: string | undefined, withRate: boolean) {
    try {
      return await this.fetchFn(this.endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': this.config.apiKey },
        body: JSON.stringify({
          // «здор+ово» → знак ударения над гласной: подсказка голосу, где ударение.
          input: { text: withAcuteStress(r.text) },
          voice: {
            languageCode: LANGUAGE_CODES[r.lang],
            ...(voice ? { name: voice } : { ssmlGender: 'FEMALE' }),
          },
          audioConfig: { audioEncoding: 'MP3', ...(withRate ? { speakingRate: r.speed } : {}) },
        }),
        signal: AbortSignal.timeout(20_000),
      });
    } catch (err) {
      throw new TtsError(`Google TTS недоступен: ${(err as Error).message}`, true);
    }
  }
}

async function errorText(res: Response): Promise<string> {
  const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
  return body?.error?.message ?? res.statusText;
}
