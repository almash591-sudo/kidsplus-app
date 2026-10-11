import { describe, expect, it } from 'vitest';
import { noiseDetector, rmsDb } from './monitor';

describe('радионяня: шум', () => {
  it('громко 3 с подряд — сигнал; короткий хлопок — нет', () => {
    const d = noiseDetector('medium');
    expect(d(0, -10)).toBe(false); // хлопок
    expect(d(500, -60)).toBe(false);
    const hits = [1000, 2000, 3000, 4000, 4100].map((t) => d(t, -20));
    expect(hits).toEqual([false, false, false, true, false]);
  });

  it('не чаще раза в минуту; чувствительность', () => {
    const d = noiseDetector('high');
    expect(d(0, -40)).toBe(false);
    expect(d(3000, -40)).toBe(true);
    expect(d(30_000, -40)).toBe(false);
    expect(d(64_000, -40)).toBe(true);
    expect(noiseDetector('low')(0, -40)).toBe(false);
  });

  it('громкость кадра', () => {
    expect(rmsDb(new Float32Array(10).fill(1))).toBeCloseTo(0);
    expect(rmsDb(new Float32Array(10).fill(0.01))).toBeCloseTo(-40);
    expect(rmsDb(new Float32Array(10))).toBe(-120);
  });
});
