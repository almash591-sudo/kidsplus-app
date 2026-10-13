// Языковая модель (п. 7.4 ТЗ): строгий JSON по схеме, повтор при невалидном ответе, учёт токенов.
// Провайдер — Gemini (решение владельца 2026-10-09); интерфейс не зависит от провайдера.
import { z } from 'zod';

export interface LlmUsageInfo {
  model: string;
  inputTokens: number;
  outputTokens: number;
}

export interface LlmJsonRequest {
  /** Готовый текст запроса (шаблон из `prompts/` с подстановками). */
  prompt: string;
  /** JSON Schema ответа (подмножество, которое понимает провайдер). */
  jsonSchema: Record<string, unknown>;
  /** Видео, которое модель смотрит сама (публичная ссылка YouTube). Видео не скачивается. */
  videoUrl?: string;
}

export interface LlmProvider {
  readonly id: string;
  completeJson(request: LlmJsonRequest): Promise<{ text: string; usage: LlmUsageInfo }>;
}

export class LlmError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
    /** Закончились деньги на счёте модели: очередь ждёт пополнения, видео не «ломаются». */
    readonly billing = false,
  ) {
    super(message);
  }
}

/**
 * Ключи JSON Schema, которые понимает Gemini; остальные (pattern, minLength…) убираются.
 * Границы (minItems, maxItems, minimum, maximum) Gemini 3.8 отвергает целиком запросом 400
 * (проверено на проде 2026-10-12) — они остаются только в Zod-проверке ответа.
 */
const SCHEMA_KEYS = new Set([
  'type',
  'format',
  'title',
  'description',
  'enum',
  'items',
  'prefixItems',
  'anyOf',
  'oneOf',
  'properties',
  'additionalProperties',
  'required',
]);

function stripSchema(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(stripSchema);
  if (!node || typeof node !== 'object') return node;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(node)) {
    if (!SCHEMA_KEYS.has(k)) continue;
    if (k === 'properties' && v && typeof v === 'object') {
      out[k] = Object.fromEntries(Object.entries(v).map(([p, s]) => [p, stripSchema(s)]));
    } else out[k] = stripSchema(v);
  }
  return out;
}

/** JSON Schema для провайдера из Zod-схемы (входная форма, без неподдерживаемых ключей). */
export function jsonSchemaFor(schema: z.ZodType): Record<string, unknown> {
  return stripSchema(z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' })) as Record<
    string,
    unknown
  >;
}

/**
 * Запрос к модели с проверкой ответа по Zod. Невалидный JSON или нарушение схемы —
 * повтор с описанием ошибки (до `retries` раз). Каждый вызов учитывается через onUsage.
 */
export async function llmJson<T extends z.ZodType>(
  provider: LlmProvider,
  request: { prompt: string; schema: T; videoUrl?: string },
  options: { retries?: number; onUsage: (u: LlmUsageInfo) => Promise<void> | void },
): Promise<z.output<T>> {
  const jsonSchema = jsonSchemaFor(request.schema);
  const retries = options.retries ?? 2;
  let prompt = request.prompt;
  let lastError = '';
  for (let attempt = 0; attempt <= retries; attempt++) {
    const { text, usage } = await provider.completeJson({
      prompt,
      jsonSchema,
      ...(request.videoUrl ? { videoUrl: request.videoUrl } : {}),
    });
    await options.onUsage(usage);
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      lastError = 'ответ — не JSON';
      prompt = `${request.prompt}\n\nПредыдущий ответ не был корректным JSON. Верни только JSON по схеме.`;
      continue;
    }
    const parsed = request.schema.safeParse(raw);
    if (parsed.success) return parsed.data;
    lastError = z.prettifyError(parsed.error).slice(0, 1500);
    prompt = `${request.prompt}\n\nПредыдущий ответ не прошёл проверку схемы:\n${lastError}\nИсправь и верни JSON заново.`;
  }
  throw new LlmError(`ответ модели не прошёл проверку: ${lastError}`, false);
}
