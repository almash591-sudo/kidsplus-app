import { beforeEach, describe, expect, it } from 'vitest';
import { PHRASES } from '@kidsplus/shared/phrases';
import { praisePhrase, resetVariety, retryPhrase, slowPhrase, streak, vary } from './variety';

const sp = (text: string) => ({ text, lang: 'ru' as const, audioUrl: null });
const phrases = {
  correct: PHRASES.f.correct.map(sp),
  retry: PHRASES.f.retry.map(sp),
  done: PHRASES.f.done.map(sp),
  streak: PHRASES.f.streak.map(sp),
  slow: PHRASES.f.slow.map(sp),
};

describe('разнообразие похвалы', () => {
  beforeEach(resetVariety);

  it('фраза не повторяет недавние', () => {
    const said = Array.from({ length: 60 }, () => vary('correct', phrases.correct)!.text);
    for (let i = 1; i < said.length; i++) {
      const window = said.slice(Math.max(0, i - 6), i);
      expect(window).not.toContain(said[i]);
    }
    expect(new Set(said).size).toBeGreaterThan(12);
  });

  it('из двух фраз — по очереди', () => {
    const two = [sp('а'), sp('б')];
    const said = Array.from({ length: 6 }, () => vary('two', two)!.text);
    expect(said.join('')).toMatch(/^(аб)+$|^(ба)+$/);
  });

  it('каждый третий верный подряд — похвала за серию, ошибка сбрасывает счёт', () => {
    const streakTexts = new Set(phrases.streak.map((p) => p.text));
    const kinds = () => (streakTexts.has(praisePhrase(phrases)!.text) ? 'S' : 'c');
    expect([kinds(), kinds(), kinds(), kinds(), kinds(), kinds()].join('')).toBe('ccSccS');
    retryPhrase(phrases);
    expect(streak.get()).toBe(0);
    expect([kinds(), kinds(), kinds()].join('')).toBe('ccS');
  });

  it('без фраз «не спеши» — обычная подсказка; без серии — обычная похвала', () => {
    const old = { correct: phrases.correct, retry: phrases.retry, done: phrases.done };
    expect(phrases.retry.map((p) => p.text)).toContain(slowPhrase(old)!.text);
    praisePhrase(old);
    praisePhrase(old);
    expect(phrases.correct.map((p) => p.text)).toContain(praisePhrase(old)!.text);
  });

  it('у обоих родов много разных фраз', () => {
    for (const g of ['f', 'm'] as const) {
      expect(PHRASES[g].correct.length).toBeGreaterThanOrEqual(20);
      expect(PHRASES[g].retry.length).toBeGreaterThanOrEqual(10);
      expect(PHRASES[g].streak.length).toBeGreaterThanOrEqual(5);
      expect(new Set(PHRASES[g].correct).size).toBe(PHRASES[g].correct.length);
    }
  });
});
