import { describe, expect, it } from 'vitest';
import { END_MARGIN_SEC, shouldFinish } from './guard';

const PLAYING = 1;
const ENDED = 0;

describe('shouldFinish', () => {
  it('нет — пока до конца больше запаса', () => {
    expect(shouldFinish(119, 120, PLAYING)).toBe(false);
  });

  it('да — в пределах запаса до конца', () => {
    expect(shouldFinish(120 - END_MARGIN_SEC, 120, PLAYING)).toBe(true);
  });

  it('да — если время уже за концом (перемотка, пропущенный тик)', () => {
    expect(shouldFinish(500, 120, PLAYING)).toBe(true);
  });

  it('да — по событию ENDED, даже если время не дошло', () => {
    expect(shouldFinish(30, 120, ENDED)).toBe(true);
  });

  it('нет — при некорректном времени', () => {
    expect(shouldFinish(Number.NaN, 120, PLAYING)).toBe(false);
  });
});
