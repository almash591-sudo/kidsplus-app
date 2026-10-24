import type { KidPlaylist } from '@kidsplus/shared/api';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  appPhrases,
  CATEGORY_DONE,
  coloringTask,
  countAnswer,
  GREETING,
  type Phrase,
  stickerAgain,
  stickerNew,
  tracePrompt,
} from './phrases';
import { STICKERS } from './stickers';
import { cachedSpeechUrl, resetSpeechCache, setServerVoice, wantSpeech } from './speechCache';

const playlist = (items: KidPlaylist['items'], immersion = false): KidPlaylist => ({
  quiz: { options: 2, questions: 3 },
  items,
  phrases: { correct: [], retry: [], done: [] },
  phrasesEn: { correct: [], retry: [], done: [] },
  immersion,
  serverVoice: true,
});

describe('фразы приложения для нейроголоса', () => {
  it('приветствие, разделы, задания игр и «Где …?» по карточкам', () => {
    const texts = appPhrases(
      playlist([
        {
          kind: 'interactive',
          category: 'games',
          id: 'g1',
          spec: { kind: 'coloring', picture: 'house', tasks: true },
        },
        {
          kind: 'interactive',
          id: 'g2',
          category: 'games',
          spec: { kind: 'tracing', shapes: ['5'] },
        },
        {
          kind: 'deck',
          id: 'd1',
          category: 'math',
          coverUrl: '/c',
          cards: [
            {
              id: 'c1',
              imageUrl: '/i',
              word: { text: 'круг', lang: 'ru', audioUrl: null },
              translation: null,
              question: null,
            },
          ],
        },
        {
          kind: 'deck',
          id: 'd2',
          category: 'english',
          coverUrl: '/c',
          cards: [
            {
              id: 'c2',
              imageUrl: '/i',
              word: { text: 'cat', lang: 'en', audioUrl: '/api/media/x' },
              translation: null,
              question: null,
            },
          ],
        },
      ]),
    ).map((p) => `${p.lang}:${p.text}`);
    expect(texts).toEqual(
      expect.arrayContaining([
        `ru:${GREETING}`,
        `ru:${CATEGORY_DONE}`,
        'ru:Игры!',
        `ru:${coloringTask('house', 0)}`,
        'ru:Нужен красный цвет.',
        `ru:${tracePrompt('5')}`,
        'ru:Где круг?',
        'ru:Покажи',
        'ru:три!',
      ]),
    );
    // Слово с готовым файлом повторно не просим.
    expect(texts).not.toContain('en:cat');
    expect(new Set(texts).size).toBe(texts.length);
  });

  it('наклейки и задания всех уровней игры — тоже заранее', () => {
    const texts = appPhrases(
      playlist([
        {
          kind: 'interactive',
          category: 'math',
          id: 'g3',
          spec: { kind: 'counting', max: 3, rounds: 2, imageIds: ['x'] },
        },
      ]),
    ).map((p) => p.text);
    const unicorn = STICKERS[0]!.name;
    expect(texts).toEqual(expect.arrayContaining([stickerNew(unicorn), stickerAgain(unicorn)]));
    // Родитель задал до трёх, а на 4-м уровне — до девяти.
    expect(texts).toContain(countAnswer(3));
    expect(texts).toContain(countAnswer(9));
  });

  it('погружение: «Show me» на языке набора', () => {
    const texts = appPhrases(
      playlist(
        [
          {
            kind: 'deck',
            id: 'd2',
            category: 'english',
            coverUrl: '/c',
            cards: [
              {
                id: 'c2',
                imageUrl: '/i',
                word: { text: 'cat', lang: 'en', audioUrl: '/api/media/x' },
                translation: null,
                question: null,
              },
            ],
          },
        ],
        true,
      ),
    ).map((p) => `${p.lang}:${p.text}`);
    expect(texts).toContain('en:Show me');
  });
});

describe('кэш нейроголоса', () => {
  afterEach(() => {
    resetSpeechCache();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('просит сервер пачкой, готовые ссылки берёт, неготовые переспрашивает', async () => {
    vi.useFakeTimers();
    setServerVoice(true);
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json([
          { text: 'Привет', lang: 'ru', audioUrl: '/api/media/a' },
          { text: 'Пока', lang: 'ru', audioUrl: null },
        ]),
      )
      .mockResolvedValueOnce(
        Response.json([{ text: 'Пока', lang: 'ru', audioUrl: '/api/media/b' }]),
      );
    vi.stubGlobal('fetch', fetch);

    wantSpeech([
      { text: 'Привет', lang: 'ru' },
      { text: 'Пока', lang: 'ru' },
    ]);
    expect(cachedSpeechUrl({ text: 'Привет', lang: 'ru', audioUrl: null })).toBeNull();
    await vi.advanceTimersByTimeAsync(400);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(cachedSpeechUrl({ text: 'Привет', lang: 'ru', audioUrl: null })).toBe('/api/media/a');
    expect(cachedSpeechUrl({ text: 'Пока', lang: 'ru', audioUrl: null })).toBeNull();

    await vi.advanceTimersByTimeAsync(8100);
    expect(fetch).toHaveBeenCalledTimes(2);
    const body = JSON.parse((fetch.mock.calls[1] as [string, RequestInit])[1].body as string);
    expect(body.phrases).toEqual([{ text: 'Пока', lang: 'ru' }]);
    expect(cachedSpeechUrl({ text: 'Пока', lang: 'ru', audioUrl: null })).toBe('/api/media/b');
  });

  it('сменился голос сервера — прежние ссылки забыты, фразы просятся заново', async () => {
    vi.useFakeTimers();
    setServerVoice(true, 'proxyapi|lily@elevenlabs/eleven-v3|0.85');
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(Response.json([{ text: 'Поймай рыбку', lang: 'ru', audioUrl: '/v3' }]))
      .mockResolvedValueOnce(
        Response.json([{ text: 'Поймай рыбку', lang: 'ru', audioUrl: '/v4' }]),
      );
    vi.stubGlobal('fetch', fetch);
    const task = { text: 'Поймай рыбку', lang: 'ru' as const, audioUrl: null };
    wantSpeech([task]);
    await vi.advanceTimersByTimeAsync(400);
    expect(cachedSpeechUrl(task)).toBe('/v3');

    // Тот же голос при следующей загрузке — ссылка остаётся, сервер не спрашиваем.
    setServerVoice(true, 'proxyapi|lily@elevenlabs/eleven-v3|0.85');
    wantSpeech([task]);
    await vi.advanceTimersByTimeAsync(400);
    expect(fetch).toHaveBeenCalledTimes(1);

    setServerVoice(true, 'proxyapi|lily@elevenlabs/eleven-v4|0.85');
    expect(cachedSpeechUrl(task)).toBeNull();
    wantSpeech([task]);
    await vi.advanceTimersByTimeAsync(400);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(cachedSpeechUrl(task)).toBe('/v4');
  });

  it('много фраз — пачками по 300 с паузой; сервер занят — повтор позже', async () => {
    vi.useFakeTimers();
    setServerVoice(true);
    const ready = (_url: string, init: RequestInit) =>
      Promise.resolve(
        Response.json(
          (JSON.parse(init.body as string) as { phrases: Phrase[] }).phrases.map((p) => ({
            ...p,
            audioUrl: `/a/${p.text}`,
          })),
        ),
      );
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 429 }))
      .mockImplementation(ready);
    vi.stubGlobal('fetch', fetch);
    const phrases = Array.from({ length: 650 }, (_, i) => ({
      text: `Фраза ${i}`,
      lang: 'ru' as const,
    }));
    wantSpeech(phrases);
    const sent = (call: number) =>
      (
        JSON.parse((fetch.mock.calls[call] as [string, RequestInit])[1].body as string) as {
          phrases: Phrase[];
        }
      ).phrases.length;

    await vi.advanceTimersByTimeAsync(400);
    expect(fetch).toHaveBeenCalledTimes(1); // 429 — ничего не сохранено
    expect(cachedSpeechUrl({ ...phrases[0]!, audioUrl: null })).toBeNull();
    await vi.advanceTimersByTimeAsync(8000);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(sent(1)).toBe(300);
    await vi.advanceTimersByTimeAsync(2500);
    await vi.advanceTimersByTimeAsync(2500);
    expect(fetch).toHaveBeenCalledTimes(4);
    expect([sent(2), sent(3)]).toEqual([300, 50]);
    expect(cachedSpeechUrl({ ...phrases[649]!, audioUrl: null })).toBe('/a/Фраза 649');
    await vi.advanceTimersByTimeAsync(20_000);
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  it('без серверной озвучки ничего не запрашивает', async () => {
    vi.useFakeTimers();
    setServerVoice(false);
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    wantSpeech([{ text: 'Привет', lang: 'ru' }]);
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetch).not.toHaveBeenCalled();
  });
});
