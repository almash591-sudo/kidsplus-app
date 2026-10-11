import { describe, expect, it } from 'vitest';
import { formatTime, parseTime } from './time';

describe('formatTime / parseTime', () => {
  it.each([
    [0, '0:00'],
    [75, '1:15'],
    [600, '10:00'],
    [3723, '1:02:03'],
  ])('%i ↔ %s', (sec, text) => {
    expect(formatTime(sec)).toBe(text);
    expect(parseTime(text)).toBe(sec);
  });

  it('принимает просто секунды', () => {
    expect(parseTime('90')).toBe(90);
  });

  it.each(['', 'abc', '1:75', '1:2:3:4', '-5', '1.5'])('отклоняет «%s»', (text) => {
    expect(parseTime(text)).toBeNull();
  });
});
