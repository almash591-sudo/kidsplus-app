import { describe, expect, it } from 'vitest';
import { ageText, plural } from './child';

describe('ageText', () => {
  const now = new Date('2026-10-07');
  it.each([
    [{ birthYear: 2026, birthMonth: 5 }, '5 месяцев'],
    [{ birthYear: 2024, birthMonth: 10 }, '2 года'],
    [{ birthYear: 2021, birthMonth: 3 }, '5 лет 7 мес.'],
    [{ birthYear: 2025, birthMonth: 10 }, '1 год'],
  ])('%o → %s', (child, text) => {
    expect(ageText(child, now)).toBe(text);
  });
});

describe('plural', () => {
  it.each([
    [1, 'год'],
    [2, 'года'],
    [5, 'лет'],
    [11, 'лет'],
    [21, 'год'],
    [22, 'года'],
  ])('%i %s', (n, word) => {
    expect(plural(n, 'год', 'года', 'лет')).toBe(word);
  });
});
