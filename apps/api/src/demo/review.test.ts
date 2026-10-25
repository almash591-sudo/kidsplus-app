import { videoAnalysis } from '@kidsplus/shared/moderation';
import { describe, expect, it } from 'vitest';
import { DEMO_REVIEWS, demoReport, emojiCode } from './review';

describe('заготовки «ИИ смотрит видео» для промо-съёмки', () => {
  it('ответы проходят ту же схему, что ответы модели', () => {
    for (const r of Object.values(DEMO_REVIEWS))
      expect(videoAnalysis.parse(r.analysis)).toBeTruthy();
  });

  it('id — как у YouTube: 11 символов', () => {
    for (const id of Object.keys(DEMO_REVIEWS)) expect(id).toMatch(/^[\w-]{11}$/);
  });

  it('отчёт: фрагменты в секундах внутри видео, у каждого варианта — картинка', async () => {
    for (const r of Object.values(DEMO_REVIEWS)) {
      const report = await demoReport(r.analysis, async (code) => `img-${code}`);
      for (const s of report.segments) {
        expect(s.endSec).toBeLessThanOrEqual(r.durationSec);
        expect(s.endSec - s.startSec).toBeGreaterThanOrEqual(60);
        for (const o of s.questions.flatMap((q) => q.options))
          expect(o.imageUrl).toBe(`/api/media/${o.imageId}`);
      }
    }
  });

  it('код эмодзи — без селектора варианта', () => {
    expect(emojiCode('🦔')).toBe('1f994');
    expect(emojiCode('🐿️')).toBe('1f43f');
  });
});
