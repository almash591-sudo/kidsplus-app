import type { AppErrorReport } from '@kidsplus/shared/app-errors';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { enqueue, errorText, reportError, sent, setErrorScreen } from './errors';

const e = (over: Partial<AppErrorReport> = {}): AppErrorReport => ({
  kind: 'error',
  message: 'TypeError: x is undefined',
  stack: null,
  screen: 'menu',
  build: null,
  count: 1,
  at: '2026-10-28T10:00:00.000Z',
  ...over,
});

describe('очередь сбоев', () => {
  it('та же ошибка — +1 к счётчику и последний экран; новая — в конец, не больше 10', () => {
    let q = enqueue([], e());
    q = enqueue(q, e({ screen: 'game:maze' }));
    q = enqueue(q, e({ kind: 'rejection' }));
    expect(q.map((x) => [x.kind, x.count, x.screen])).toEqual([
      ['error', 2, 'game:maze'],
      ['rejection', 1, 'menu'],
    ]);
    for (let i = 0; i < 12; i++) q = enqueue(q, e({ message: `m${i}` }));
    expect(q).toHaveLength(10);
    expect(q.at(-1)!.message).toBe('m11');
  });

  it('после отправки остаются только повторы, случившиеся во время неё', () => {
    const batch = [e({ count: 2 }), e({ message: 'other' })];
    const now = [e({ count: 5 }), e({ message: 'other' }), e({ message: 'new' })];
    expect(sent(now, batch).map((x) => [x.message, x.count])).toEqual([
      ['TypeError: x is undefined', 3],
      ['new', 1],
    ]);
  });

  it('текст из Error, строки и чего угодно', () => {
    const err = new RangeError('bad');
    expect(errorText(err)).toEqual({ message: 'RangeError: bad', stack: err.stack });
    expect(errorText('HTTP 500')).toEqual({ message: 'HTTP 500', stack: null });
    expect(errorText({ code: 7 })).toEqual({ message: '{"code":7}', stack: null });
    expect(errorText(undefined).message).toBe('undefined');
  });
});

describe('отправка', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('пачкой через 3 с, с экраном; шум не отправляется; длинное обрезано', async () => {
    vi.useFakeTimers();
    const fetch = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetch);
    setErrorScreen('game:maze');
    reportError('error', new TypeError('boom'));
    reportError('error', new TypeError('boom'));
    reportError('error', 'Script error.');
    reportError('rejection', 'x'.repeat(500));
    await vi.advanceTimersByTimeAsync(2900);
    expect(fetch).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(200);
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/kid/errors');
    const { errors } = JSON.parse(init.body as string) as { errors: AppErrorReport[] };
    expect(errors.map((x) => [x.kind, x.count, x.screen, x.message.length])).toEqual([
      ['error', 2, 'game:maze', 'TypeError: boom'.length],
      ['rejection', 1, 'game:maze', 300],
    ]);

    // Отправленное больше не уходит; без связи — копится и уходит позже.
    fetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    reportError('audio', 'Звук не загрузился', '/api/media/abc');
    await vi.advanceTimersByTimeAsync(3100);
    expect(fetch).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(3100);
    expect(fetch).toHaveBeenCalledTimes(3);
    const last = JSON.parse(
      (fetch.mock.calls[2] as unknown as [string, RequestInit])[1].body as string,
    );
    expect(last.errors).toEqual([
      expect.objectContaining({
        kind: 'audio',
        message: 'Звук не загрузился',
        stack: '/api/media/abc',
      }),
    ]);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(fetch).toHaveBeenCalledTimes(3);
  });
});
