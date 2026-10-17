import { describe, expect, it } from 'vitest';
import { TtsError } from './tts';
import { OpenAiCompatibleTtsProvider } from './tts-openai-compatible';

describe('озвучка через ProxyAPI (OpenAI-совместимый вход)', () => {
  it('голос и модель — из «имя@модель», текст без знаков ударения', async () => {
    let call: { url: string; init: RequestInit } | null = null;
    const p = new OpenAiCompatibleTtsProvider({
      apiKey: 'test-key-123456',
      baseUrl: 'https://api.proxyapi.ru/v1/',
      model: 'elevenlabs/eleven-v3',
      voices: { ru: 'lily@elevenlabs/eleven-multilingual-v2' },
      fetch: (async (url: string, init: RequestInit) => {
        call = { url, init };
        return new Response(new Uint8Array([7, 8]), { status: 200 });
      }) as typeof fetch,
    });
    const r = await p.synthesize({ text: 'Здор+ово!', lang: 'ru', speed: 0.85 });
    expect(r).toEqual({ audio: new Uint8Array([7, 8]), mimeType: 'audio/mpeg' });
    expect(call!.url).toBe('https://api.proxyapi.ru/v1/audio/speech');
    expect((call!.init.headers as Record<string, string>).authorization).toBe(
      'Bearer test-key-123456',
    );
    expect(JSON.parse(String(call!.init.body))).toMatchObject({
      model: 'elevenlabs/eleven-multilingual-v2',
      voice: 'lily',
      input: 'Здорово!',
      speed: 0.85,
    });
  });

  it('модель без скорости (eleven_v4) — повтор без неё', async () => {
    const bodies: Record<string, unknown>[] = [];
    const p = new OpenAiCompatibleTtsProvider({
      apiKey: 'test-key-123456',
      baseUrl: 'https://x/v1',
      model: 'elevenlabs/eleven-v4',
      voices: { ru: 'lily' },
      fetch: (async (_: string, init: RequestInit) => {
        const body = JSON.parse(String(init.body)) as Record<string, unknown>;
        bodies.push(body);
        return 'speed' in body
          ? new Response(JSON.stringify({ error: { message: 'speed is not supported' } }), {
              status: 400,
            })
          : new Response(new Uint8Array([1]), { status: 200 });
      }) as typeof fetch,
    });
    await p.synthesize({ text: 'а', lang: 'ru', speed: 0.85 });
    expect(bodies.map((b) => 'speed' in b)).toEqual([true, false]);
  });

  it('нет денег на балансе (402) и 429 — подождать; неверный голос (400) — нет', async () => {
    const err = (status: number) =>
      new OpenAiCompatibleTtsProvider({
        apiKey: 'test-key-123456',
        baseUrl: 'https://x/v1',
        model: 'm',
        voices: { ru: 'v' },
        fetch: (async () =>
          new Response(JSON.stringify({ error: { message: 'нет' } }), { status })) as typeof fetch,
      })
        .synthesize({ text: 'a', lang: 'ru', speed: 1 })
        .then(
          () => null,
          (e: unknown) => e as TtsError,
        );
    expect((await err(402))?.retryable).toBe(true);
    expect((await err(429))?.retryable).toBe(true);
    expect((await err(400))?.retryable).toBe(false);
  });
});
