import { describe, expect, it, vi } from 'vitest';
import { clockAnswer, countAnswer, gamePhrases, shopAnswer } from '../phrases';
import { afterSpeech } from './common';

describe('ответ после похвалы (этап 39)', () => {
  it('говорит ответ и почему', () => {
    expect(countAnswer(5)).toBe('Здесь пять!');
    expect(clockAnswer(3, false)).toEqual([
      'Сейчас три часа.',
      'Большая стрелка наверху, маленькая показывает три.',
    ]);
    expect(clockAnswer(3, true)[1]).toBe('Большая стрелка внизу — значит, половина.');
    expect(shopAnswer(1)).toBe('Положили ровно одну монетку!');
    expect(shopAnswer(5)).toBe('Положили ровно пять монеток!');
  });

  it('ответы заранее озвучиваются', () => {
    const counting = gamePhrases({ kind: 'counting', max: 5, rounds: 3, imageIds: ['a'] } as never);
    expect(counting).toContain('Здесь пять!');
  });

  it('следующий раунд — когда договорили, но в пределах min…max', async () => {
    vi.useFakeTimers();
    let done = false;
    const never = new Promise<void>(() => {});
    void afterSpeech(never, 1000, 5000).then(() => (done = true));
    await vi.advanceTimersByTimeAsync(4900);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(200);
    expect(done).toBe(true);

    done = false;
    void afterSpeech(Promise.resolve(), 1000).then(() => (done = true));
    await vi.advanceTimersByTimeAsync(900);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(200);
    expect(done).toBe(true);
    vi.useRealTimers();
  });
});
