import type { KidPlaylist } from '@kidsplus/shared/api';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushOutbox, playlistMedia, sendEventQueued } from './offline';

const sp = (text: string, audioUrl: string | null) => ({ text, lang: 'ru' as const, audioUrl });
const phrases = { correct: [sp('Молодец!', '/api/media/p1')], retry: [], done: [] };

describe('файлы занятий для работы без сети', () => {
  it('картинки и озвучка карточек, вопросов, игр и похвалы; чужие адреса — нет', () => {
    const playlist = {
      items: [
        {
          kind: 'deck',
          id: 'd',
          category: 'english',
          coverUrl: '/api/media/cover',
          cards: [
            {
              id: 'c',
              imageUrl: '/api/media/cat',
              word: sp('cat', '/api/media/w'),
              translation: sp('кошка', null),
              question: null,
            },
          ],
        },
        {
          kind: 'segment',
          id: 's',
          thumbnailUrl: 'https://i.ytimg.com/x.jpg',
          questions: [
            {
              id: 'q',
              prompt: sp('Где кошка?', '/api/media/q'),
              options: [{ id: 'o', imageUrl: '/api/media/opt', isCorrect: true }],
            },
          ],
        },
        {
          kind: 'interactive',
          id: 'g',
          category: 'games',
          spec: { kind: 'memory', imageIds: ['00000000-0000-4000-8000-000000000001'] },
        },
        // Книжка без картинок (ещё рисуются) — качать нечего.
        {
          kind: 'interactive',
          id: 'b',
          category: 'books',
          spec: { kind: 'book', book: 'kotPetuh', autoTurn: false, questions: true, choices: 3 },
        },
      ],
      phrases,
      phrasesEn: { correct: [], retry: [], done: [] },
    } as unknown as KidPlaylist;
    expect(playlistMedia(playlist).sort()).toEqual(
      [
        '/api/media/cover',
        '/api/media/cat',
        '/api/media/w',
        '/api/media/q',
        '/api/media/opt',
        '/api/media/00000000-0000-4000-8000-000000000001',
        '/api/media/p1',
      ].sort(),
    );
  });
});

describe('события без сети', () => {
  const store = new Map<string, string>();
  beforeEach(() => {
    store.clear();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
      removeItem: (k: string) => store.delete(k),
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('не ушло — копится; связь появилась — уходит по порядку и очередь пустеет', async () => {
    const sent: string[] = [];
    let online = false;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        if (!online) throw new TypeError('Failed to fetch');
        sent.push(JSON.parse(init.body as string).type);
        return new Response(null, { status: 204 });
      }),
    );
    await sendEventQueued({ type: 'segment_complete', segmentId: 'a' } as never);
    await sendEventQueued({ type: 'interactive_complete', interactiveId: 'b' } as never);
    expect(JSON.parse(store.get('kidsplus.outbox')!)).toHaveLength(2);

    online = true;
    await flushOutbox();
    expect(sent).toEqual(['segment_complete', 'interactive_complete']);
    expect(store.has('kidsplus.outbox')).toBe(false);
  });

  it('ошибка сервера (5xx) — тоже в очередь; 4xx — не повторяем', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 503 })),
    );
    await sendEventQueued({ type: 'segment_complete', segmentId: 'a' } as never);
    expect(JSON.parse(store.get('kidsplus.outbox')!)).toHaveLength(1);

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 400 })),
    );
    await sendEventQueued({ type: 'segment_complete', segmentId: 'b' } as never);
    // 400 — событие отклонено сервером, повторять бессмысленно; очередь при этом разобрана.
    await flushOutbox();
    expect(store.has('kidsplus.outbox')).toBe(false);
  });
});
