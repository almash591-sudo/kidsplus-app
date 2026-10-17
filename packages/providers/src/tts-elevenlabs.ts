import { withoutStress } from '@kidsplus/shared/voice';
import { TtsError, type TtsProvider, type TtsRequest, type TtsResult } from './tts';

export interface ElevenLabsTtsConfig {
  apiKey: string;
  /** id голоса по языкам; голоса многоязычные — обычно один id на все языки. */
  voices?: Partial<Record<TtsRequest['lang'], string>>;
  /** eleven_multilingual_v2 — самый естественный русский; eleven_v3 — эмоциональнее. */
  model?: string;
  endpoint?: string;
  fetch?: typeof fetch;
}

const LANG_CODES = { ru: 'ru', en: 'en', zh: 'zh' } as const;

/** ElevenLabs Text-to-Speech (этап 26): MP3 44,1 кГц. Ключ — заголовок xi-api-key. */
export class ElevenLabsTtsProvider implements TtsProvider {
  readonly id = 'elevenlabs';
  private readonly endpoint: string;
  private readonly fetchFn: typeof fetch;
  private readonly model: string;

  constructor(private readonly config: ElevenLabsTtsConfig) {
    this.endpoint = config.endpoint ?? 'https://api.elevenlabs.io/v1/text-to-speech';
    this.fetchFn = config.fetch ?? globalThis.fetch;
    this.model = config.model ?? 'eleven_multilingual_v2';
  }

  voiceFor(lang: TtsRequest['lang']): string | undefined {
    return this.config.voices?.[lang];
  }

  async synthesize(r: TtsRequest): Promise<TtsResult> {
    const voice = r.voice ?? this.voiceFor(r.lang);
    if (!voice) throw new TtsError('ElevenLabs: не задан голос', false);
    let res: Response;
    try {
      res = await this.fetchFn(`${this.endpoint}/${voice}?output_format=mp3_44100_128`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'audio/mpeg',
          'xi-api-key': this.config.apiKey,
        },
        body: JSON.stringify({
          // Знаки «+» — подсказки ударения для Google; ElevenLabs ставит ударения сам.
          text: withoutStress(r.text),
          model_id: this.model,
          ...(this.model === 'eleven_multilingual_v2' ? {} : { language_code: LANG_CODES[r.lang] }),
          voice_settings: {
            stability: 0.45,
            similarity_boost: 0.8,
            style: 0.35,
            use_speaker_boost: true,
            speed: Math.min(1.2, Math.max(0.7, r.speed)),
          },
        }),
        signal: AbortSignal.timeout(30_000),
      });
    } catch (err) {
      throw new TtsError(`ElevenLabs недоступен: ${(err as Error).message}`, true);
    }
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as {
        detail?: { message?: string } | string;
      } | null;
      const detail = typeof body?.detail === 'string' ? body.detail : body?.detail?.message;
      // 429 и 5xx — временные; 401 — неверный ключ, 400/422 — неверный запрос.
      throw new TtsError(
        `ElevenLabs ${res.status}: ${detail ?? res.statusText}`,
        res.status === 429 || res.status >= 500,
      );
    }
    const audio = new Uint8Array(await res.arrayBuffer());
    if (!audio.length) throw new TtsError('ElevenLabs вернул пустой ответ', true);
    return { audio, mimeType: 'audio/mpeg' };
  }
}
