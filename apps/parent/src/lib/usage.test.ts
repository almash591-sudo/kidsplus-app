import { describe, expect, it } from 'vitest';
import { usageLine, usagePercent } from './usage';

describe('расход проверки видео', () => {
  it('доля лимита по-человечески', () => {
    expect(usagePercent(0, 2_000_000)).toBe('0 %');
    expect(usagePercent(5_000, 2_000_000)).toBe('меньше 1 %');
    expect(usagePercent(500_000, 2_000_000)).toBe('25 %');
    expect(usagePercent(3_000_000, 2_000_000)).toBe('100 %');
  });

  it('строка — доля и короткие числа', () => {
    expect(usageLine(5_000, 2_000_000).replace(/\s/g, ' ')).toBe(
      'Проверка видео сегодня: меньше 1 % дневного лимита (5 тыс. из 2 млн токенов)',
    );
  });
});
