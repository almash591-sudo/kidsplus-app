import { describe, expect, it } from 'vitest';
import { TtsError } from './tts';
import { ElevenLabsTtsProvider } from './tts-elevenlabs';

describe('ElevenLabs TTS', () => {
  it('шлёт текст без знаков ударения голосу языка и возвращает MP3', async () => {
    let call: { url: string; init: RequestInit } | null = null;
    const p = new ElevenLabsTtsProvider({
      apiKey: 'test-key-123456',
      voices: { ru: 'voice-ru' },
      fetch: (async (url: string, init: RequestInit) => {
        call = { url, init };
        return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
      }) as typeof fetch,
    });
    const r = await p.synthesize({ text: 'Здор+ово!', lang: 'ru', speed: 0.85 });
    expect(r).toEqual({ audio: new Uint8Array([1, 2, 3]), mimeType: 'audio/mpeg' });
    expect(call!.url).toBe(
      'https://api.elevenlabs.io/v1/text-to-speech/voice-ru?output_format=mp3_44100_128',
    );
    expect((call!.init.headers as Record<string, string>)['xi-api-key']).toBe('test-key-123456');
    const body = JSON.parse(String(call!.init.body)) as { text: string; model_id: string };
    expect(body.text).toBe('Здорово!');
    expect(body.model_id).toBe('eleven_multilingual_v2');
  });

  it('429 — временная ошибка, 401 — нет', async () => {
    const make = (status: number) =>
      new ElevenLabsTtsProvider({
        apiKey: 'test-key-123456',
        voices: { ru: 'v' },
        fetch: (async () =>
          new Response(JSON.stringify({ detail: { message: 'нет' } }), {
            status,
          })) as typeof fetch,
      });
    const err = (status: number) =>
      make(status)
        .synthesize({ text: 'a', lang: 'ru', speed: 1 })
        .then(
          () => null,
          (e: unknown) => e as TtsError,
        );
    expect((await err(429))?.retryable).toBe(true);
    expect((await err(401))?.retryable).toBe(false);
  });
});
