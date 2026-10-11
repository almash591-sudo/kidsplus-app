import { ApiError, GoogleGenAI, MediaResolution, type Part } from '@google/genai';
import { LlmError, type LlmJsonRequest, type LlmProvider, type LlmUsageInfo } from './llm';

/** Минимальная часть SDK, которая нужна провайдеру (подменяется в тестах). */
export interface GeminiModels {
  generateContent: GoogleGenAI['models']['generateContent'];
}

export interface GeminiConfig {
  apiKey: string;
  model: string;
  /** Для тестов — подмена SDK. */
  models?: GeminiModels;
}

/**
 * Gemini API: строгий JSON по схеме; видео YouTube модель смотрит сама по публичной ссылке
 * (картинка и звук, низкое разрешение кадров — дешевле, для модерации достаточно).
 */
export class GeminiLlmProvider implements LlmProvider {
  readonly id = 'gemini';
  private readonly models: GeminiModels;

  constructor(private readonly config: GeminiConfig) {
    this.models = config.models ?? new GoogleGenAI({ apiKey: config.apiKey }).models;
  }

  async completeJson(r: LlmJsonRequest): Promise<{ text: string; usage: LlmUsageInfo }> {
    const parts: Part[] = [];
    if (r.videoUrl) parts.push({ fileData: { fileUri: r.videoUrl } });
    parts.push({ text: r.prompt });
    let res: Awaited<ReturnType<GeminiModels['generateContent']>>;
    try {
      res = await this.models.generateContent({
        model: this.config.model,
        contents: [{ role: 'user', parts }],
        config: {
          responseMimeType: 'application/json',
          responseJsonSchema: r.jsonSchema,
          ...(r.videoUrl ? { mediaResolution: MediaResolution.MEDIA_RESOLUTION_LOW } : {}),
        },
      });
    } catch (err) {
      if (err instanceof ApiError) {
        const retryable = err.status === 429 || err.status >= 500;
        throw new LlmError(`Gemini ${err.status}: ${err.message.slice(0, 300)}`, retryable);
      }
      throw new LlmError(`Gemini недоступен: ${(err as Error).message}`, true);
    }
    const u = res.usageMetadata;
    const usage: LlmUsageInfo = {
      model: this.config.model,
      inputTokens: u?.promptTokenCount ?? 0,
      // Мысли модели оплачиваются как выходные токены.
      outputTokens: (u?.candidatesTokenCount ?? 0) + (u?.thoughtsTokenCount ?? 0),
    };
    const text = res.text;
    if (!text) {
      const reason = res.candidates?.[0]?.finishReason ?? res.promptFeedback?.blockReason;
      throw new LlmError(`Gemini не вернул ответ (${reason ?? 'причина неизвестна'})`, false);
    }
    return { text, usage };
  }
}
