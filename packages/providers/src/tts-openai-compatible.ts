import { withoutStress } from '@kidsplus/shared/voice';
import { TtsError, type TtsProvider, type TtsRequest, type TtsResult } from './tts';

export interface OpenAiCompatibleTtsConfig {
  apiKey: string;
  /** Например, https://api.proxyapi.ru/v1 — ProxyAPI (этап 28): ElevenLabs с оплатой в рублях. */
  baseUrl: string;
  /** Модель в формате посредника, например elevenlabs/eleven-v3. */
  model: string;
  /** Имя голоса по языкам (у ElevenLabs через ProxyAPI — matilda, jessica…). */
  voices?: Partial<Record<TtsRequest['lang'], string>>;
  /** id провайдера — входит в ключ кэша озвучки. */
  id?: string;
  fetch?: typeof fetch;
}

/** Озвучка через OpenAI-совместимый вход /audio/speech (ProxyAPI и подобные посредники). */
export class OpenAiCompatibleTtsProvider implements TtsProvider {
  readonly id: string;
  private readonly fetchFn: typeof fetch;

  constructor(private readonly config: OpenAiCompatibleTtsConfig) {
    this.id = config.id ?? 'proxyapi';
    this.fetchFn = config.fetch ?? globalThis.fetch;
  }

  voiceFor(lang: TtsRequest['lang']): string | undefined {
    return this.config.voices?.[lang];
  }

  async synthesize(r: TtsRequest): Promise<TtsResult> {
    const full = r.voice ?? this.voiceFor(r.lang);
    if (!full) throw new TtsError('озвучка: не задан голос', false);
    // «matilda@elevenlabs/eleven-v3» — голос и модель; без «@» — модель из настроек.
    const [voice, model = this.config.model] = full.split('@') as [string, string?];
    let res: Response;
    try {
      res = await this.fetchFn(`${this.config.baseUrl.replace(/\/$/, '')}/audio/speech`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify({
          model,
          // Знаки «+» — подсказки ударения для Google; ElevenLabs ставит ударения сам.
          input: withoutStress(r.text),
          voice,
          response_format: 'mp3',
          speed: Math.min(1.2, Math.max(0.7, r.speed)),
        }),
        signal: AbortSignal.timeout(60_000),
      });
    } catch (err) {
      throw new TtsError(`озвучка недоступна: ${(err as Error).message}`, true);
    }
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      // 429 и 5xx — временные (в том числе нет денег на балансе — 402 — тоже ждём пополнения).
      throw new TtsError(
        `озвучка ${res.status}: ${body?.error?.message ?? res.statusText}`,
        res.status === 429 || res.status === 402 || res.status >= 500,
      );
    }
    const audio = new Uint8Array(await res.arrayBuffer());
    if (!audio.length) throw new TtsError('озвучка: пустой ответ', true);
    return { audio, mimeType: 'audio/mpeg' };
  }
}
