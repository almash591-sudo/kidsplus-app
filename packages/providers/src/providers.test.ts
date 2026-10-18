import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { assertStorageKey } from './storage';
import { FsStorage } from './storage-fs';
import { ttsCacheKey, TtsError } from './tts';
import { GoogleTtsProvider } from './tts-google';

describe('ключи хранилища', () => {
  it.each([
    'tts/ab/abcdef.mp3',
    'images/x_1-2.png',
    'a',
    'generated/math/g-color-circle-красный.svg',
  ])('принимает %s', (k) => {
    expect(() => assertStorageKey(k)).not.toThrow();
  });
  it.each(['../etc/passwd', 'a/../b', '/abs', 'a//b', 'a/./b', 'пробел ключ', ''])(
    'отклоняет %s',
    (k) => {
      expect(() => assertStorageKey(k)).toThrow();
    },
  );
});

describe('FsStorage', () => {
  const dirs: string[] = [];
  afterAll(async () => {
    for (const d of dirs) await rm(d, { recursive: true, force: true });
  });

  it('сохраняет, читает, удаляет', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'kp-storage-'));
    dirs.push(dir);
    const s = new FsStorage(dir);
    expect(await s.get('tts/a.mp3')).toBeNull();
    await s.put('tts/a.mp3', new Uint8Array([1, 2, 3]), 'audio/mpeg');
    expect(await s.exists('tts/a.mp3')).toBe(true);
    expect([...(await s.get('tts/a.mp3'))!]).toEqual([1, 2, 3]);
    await s.delete('tts/a.mp3');
    expect(await s.exists('tts/a.mp3')).toBe(false);
  });
});

describe('ttsCacheKey', () => {
  const base = { text: 'Где кошка?', lang: 'ru' as const, speed: 0.85 };

  it('одинаков для одинаковой фразы (с точностью до пробелов)', () => {
    expect(ttsCacheKey('google', base)).toBe(
      ttsCacheKey('google', { ...base, text: '  Где   кошка? ' }),
    );
  });

  it('меняется от языка, скорости, голоса и провайдера', () => {
    const k = ttsCacheKey('google', base);
    expect(ttsCacheKey('google', { ...base, lang: 'en' })).not.toBe(k);
    expect(ttsCacheKey('google', { ...base, speed: 1 })).not.toBe(k);
    expect(ttsCacheKey('google', { ...base, voice: 'ru-RU-Wavenet-A' })).not.toBe(k);
    expect(ttsCacheKey('yandex', base)).not.toBe(k);
  });
});

describe('GoogleTtsProvider', () => {
  const okFetch = () =>
    vi.fn(async () => Response.json({ audioContent: Buffer.from('ID3fake').toString('base64') }));

  it('отправляет язык, скорость и ключ; возвращает MP3', async () => {
    const fetch = okFetch();
    const p = new GoogleTtsProvider({ apiKey: 'k', fetch });
    const r = await p.synthesize({ text: '你好', lang: 'zh', speed: 0.8 });

    expect(Buffer.from(r.audio).toString()).toBe('ID3fake');
    expect(r.mimeType).toBe('audio/mpeg');
    const [, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('k');
    expect(JSON.parse(init.body as string)).toEqual({
      input: { text: '你好' },
      voice: { languageCode: 'cmn-CN', ssmlGender: 'FEMALE' },
      audioConfig: { audioEncoding: 'MP3', speakingRate: 0.8 },
    });
  });

  it('«+» перед гласной уходит знаком ударения', async () => {
    const fetch = okFetch();
    await new GoogleTtsProvider({ apiKey: 'k', fetch }).synthesize({
      text: 'Молодец, здор+ово!',
      lang: 'ru',
      speed: 1,
    });
    const [, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string).input.text).toBe('Молодец, здоро́во!');
  });

  it('использует голос из настроек', async () => {
    const fetch = okFetch();
    await new GoogleTtsProvider({
      apiKey: 'k',
      fetch,
      voices: { ru: 'ru-RU-Wavenet-A' },
    }).synthesize({
      text: 'Привет',
      lang: 'ru',
      speed: 1,
    });
    const body = JSON.parse(
      (fetch.mock.calls[0] as unknown as [string, RequestInit])[1].body as string,
    );
    expect(body.voice).toEqual({ languageCode: 'ru-RU', name: 'ru-RU-Wavenet-A' });
  });

  it('голос не принимает скорость речи — повтор без неё', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json(
          { error: { message: 'speaking_rate is not supported for this voice' } },
          { status: 400 },
        ),
      )
      .mockResolvedValueOnce(
        Response.json({ audioContent: Buffer.from('ID3').toString('base64') }),
      );
    const r = await new GoogleTtsProvider({ apiKey: 'k', fetch }).synthesize({
      text: 'Привет',
      lang: 'ru',
      speed: 0.85,
      voice: 'ru-RU-Chirp3-HD-Aoede',
    });
    expect(Buffer.from(r.audio).toString()).toBe('ID3');
    const second = JSON.parse((fetch.mock.calls[1] as [string, RequestInit])[1].body as string);
    expect(second.audioConfig).toEqual({ audioEncoding: 'MP3' });
  });

  it('403 — неповторяемая ошибка; 503 — повторяемая', async () => {
    const reply = (status: number) =>
      new GoogleTtsProvider({
        apiKey: 'k',
        fetch: vi.fn(async () => Response.json({ error: { message: 'nope' } }, { status })),
      }).synthesize({ text: 'x', lang: 'ru', speed: 1 });

    await expect(reply(403)).rejects.toMatchObject({ retryable: false, message: /403: nope/ });
    await expect(reply(503)).rejects.toMatchObject({ retryable: true });
    await expect(reply(503)).rejects.toBeInstanceOf(TtsError);
  });
});
