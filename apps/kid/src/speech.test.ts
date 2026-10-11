import type { KidPlaylist } from '@kidsplus/shared/api';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { appPhrases, CATEGORY_DONE, coloringTask, GREETING, tracePrompt } from './phrases';
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
