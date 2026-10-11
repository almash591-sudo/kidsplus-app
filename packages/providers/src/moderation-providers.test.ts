import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { GeminiLlmProvider, type GeminiModels } from './llm-gemini';
import { jsonSchemaFor, LlmError, llmJson, type LlmProvider } from './llm';
import { sanitizeSvg } from './svg-sanitize';
import { parseIsoDuration, YouTubeDataApi } from './youtube-data';

describe('sanitizeSvg', () => {
  it('оставляет фигуры и оформление', () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><circle cx="100" cy="100" r="50" fill="#f00"/></svg>';
    expect(sanitizeSvg(svg)).toBe(svg);
  });

  it('убирает скрипты, обработчики, ссылки, тексты, стили и вставки', () => {
    const out = sanitizeSvg(
      `<?xml version="1.0"?><svg viewBox="0 0 10 10" onload="alert(1)">
        <script>alert(1)</script>
        <style>*{}</style>
        <a href="https://evil"><rect width="5" height="5"/></a>
        <foreignObject><div>x</div></foreignObject>
        <image href="data:image/png;base64,AAA"/>
        <rect width="1" height="1" fill="url(https://evil/x)" stroke="url(#g)"/>
        <text>привет</text>
        <path d="M0 0 L5 5" style="fill:red"/>
      </svg>`,
    )!;
    expect(out).not.toMatch(/script|alert|style|evil|foreignObject|image|href|onload|text|привет/i);
    expect(out).toContain('<path d="M0 0 L5 5"/>');
    expect(out).toContain('stroke="url(#g)"');
    expect(out.startsWith('<svg viewBox="0 0 10 10" xmlns="http://www.w3.org/2000/svg">')).toBe(
      true,
    );
  });

  it('без корневого <svg> с viewBox — null', () => {
    expect(sanitizeSvg('<g><circle r="1"/></g>')).toBeNull();
    expect(sanitizeSvg('<svg><circle r="1"/></svg>')).toBeNull();
    expect(sanitizeSvg('просто текст')).toBeNull();
  });
});

describe('llmJson', () => {
  const schema = z.object({ n: z.number().int().max(10) });
  const provider = (...texts: string[]): LlmProvider & { calls: string[] } => {
    const calls: string[] = [];
    let i = 0;
    return {
      id: 'fake',
      calls,
      completeJson: async (r) => {
        calls.push(r.prompt);
        return { text: texts[i++]!, usage: { model: 'm', inputTokens: 10, outputTokens: 5 } };
      },
    };
  };

  it('проверяет ответ по схеме и повторяет с описанием ошибки; каждый вызов учитывается', async () => {
    const p = provider('не json', '{"n": 50}', '{"n": 5}');
    const usage = vi.fn();
    await expect(llmJson(p, { prompt: 'Q', schema }, { onUsage: usage })).resolves.toEqual({
      n: 5,
    });
    expect(usage).toHaveBeenCalledTimes(3);
    expect(p.calls[1]).toContain('не был корректным JSON');
    expect(p.calls[2]).toContain('не прошёл проверку схемы');
  });

  it('после всех повторов — LlmError', async () => {
    const p = provider('{"n": 50}', '{"n": 50}', '{"n": 50}');
    await expect(llmJson(p, { prompt: 'Q', schema }, { onUsage: () => {} })).rejects.toBeInstanceOf(
      LlmError,
    );
  });

  it('JSON Schema без неподдерживаемых ключей', () => {
    const js = jsonSchemaFor(
      z.object({
        s: z.string().min(2).max(5).regex(/a/),
        n: z.number().int().min(1).max(5),
        list: z.array(z.string()).min(1).max(3),
      }),
    );
    // Границы Gemini не принимает (400) — их проверяет Zod после ответа.
    expect(JSON.stringify(js)).not.toMatch(
      /minLength|maxLength|pattern|\$schema|minItems|maxItems|minimum|maximum/,
    );
    expect(js).toMatchObject({ type: 'object', required: ['s', 'n', 'list'] });
  });
});

describe('GeminiLlmProvider', () => {
  it('передаёт ссылку на видео, схему ответа и считает токены (с мыслями)', async () => {
    const generateContent = vi.fn(async () => ({
      text: '{"ok":true}',
      usageMetadata: { promptTokenCount: 1000, candidatesTokenCount: 200, thoughtsTokenCount: 50 },
    }));
    const p = new GeminiLlmProvider({
      apiKey: 'k',
      model: 'gemini-3.8-flash',
      models: { generateContent } as unknown as GeminiModels,
    });
    const r = await p.completeJson({
      prompt: 'Проверь видео',
      jsonSchema: { type: 'object' },
      videoUrl: 'https://www.youtube.com/watch?v=aaaaaaaaaaa',
    });
    expect(r).toEqual({
      text: '{"ok":true}',
      usage: { model: 'gemini-3.8-flash', inputTokens: 1000, outputTokens: 250 },
    });
    const req = (
      generateContent.mock.calls[0] as unknown as [
        { model: string; contents: { parts: unknown[] }[]; config: unknown },
      ]
    )[0];
    expect(req.model).toBe('gemini-3.8-flash');
    expect(req.contents[0]!.parts).toEqual([
      { fileData: { fileUri: 'https://www.youtube.com/watch?v=aaaaaaaaaaa' } },
      { text: 'Проверь видео' },
    ]);
    expect(req.config).toMatchObject({
      responseMimeType: 'application/json',
      responseJsonSchema: { type: 'object' },
    });
  });
});

describe('YouTubeDataApi', () => {
  it('длительность ISO 8601', () => {
    expect(parseIsoDuration('PT3M20S')).toBe(200);
    expect(parseIsoDuration('PT1H')).toBe(3600);
    expect(parseIsoDuration('P1DT1S')).toBe(86401);
    expect(parseIsoDuration('xx')).toBe(0);
  });

  it('метаданные: встраивание, «для детей», региональные ограничения', async () => {
    const fetch = vi.fn(async () =>
      Response.json({
        items: [
          {
            id: 'aaaaaaaaaaa',
            snippet: {
              title: 'Цвета',
              channelTitle: 'Канал',
              thumbnails: { high: { url: 'h.jpg' } },
            },
            contentDetails: { duration: 'PT4M', regionRestriction: { blocked: ['RU'] } },
            status: { embeddable: true, privacyStatus: 'public', madeForKids: true },
          },
        ],
      }),
    );
    const api = new YouTubeDataApi({ apiKey: 'k', region: 'ru', fetch });
    const [v] = await api.videos(['aaaaaaaaaaa']);
    expect(v).toMatchObject({
      title: 'Цвета',
      durationSec: 240,
      embeddable: true,
      madeForKids: true,
      regionBlocked: true,
      thumbnailUrl: 'h.jpg',
    });
    const url = new URL(String((fetch.mock.calls[0] as unknown as [URL])[0]));
    expect(url.pathname).toBe('/youtube/v3/videos');
    expect(url.searchParams.get('key')).toBe('k');
  });
});
