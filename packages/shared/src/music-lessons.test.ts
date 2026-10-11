import { describe, expect, it } from 'vitest';
import { gameSpec } from './games';
import { MUSIC_LESSONS } from './music-lessons';

describe('уроки музыки', () => {
  it('ровно 100: 40 малышам и 60 дошкольникам, номера по порядку', () => {
    expect(MUSIC_LESSONS).toHaveLength(100);
    const young = MUSIC_LESSONS.filter((l) => l.age === 'young');
    const old = MUSIC_LESSONS.filter((l) => l.age === 'old');
    expect(young).toHaveLength(40);
    expect(old).toHaveLength(60);
    expect(young.map((l) => l.n)).toEqual(Array.from({ length: 40 }, (_, i) => i + 1));
    expect(old.map((l) => l.n)).toEqual(Array.from({ length: 60 }, (_, i) => i + 1));
  });

  it('каждый урок проходит схему игры и не требует картинок', () => {
    for (const l of MUSIC_LESSONS) {
      expect(gameSpec.safeParse(l.spec).success).toBe(true);
      expect(JSON.stringify(l.spec)).not.toMatch(/imageId/);
    }
  });

  it('названия уникальны в пределах возраста и не длиннее 120 символов', () => {
    for (const age of ['young', 'old'] as const) {
      const titles = MUSIC_LESSONS.filter((l) => l.age === age).map((l) => l.title);
      expect(new Set(titles).size).toBe(titles.length);
    }
    for (const l of MUSIC_LESSONS) expect(l.title.length).toBeLessThanOrEqual(120);
  });

  it('малышам — без нотного стана, угадывания на слух и ритма с длительностями', () => {
    const young = MUSIC_LESSONS.filter((l) => l.age === 'young').map((l) => l.spec);
    expect(young.some((s) => s.kind === 'staff')).toBe(false);
    expect(young.some((s) => s.kind === 'piano' && s.mode === 'ear')).toBe(false);
    expect(young.some((s) => s.kind === 'rhythm' && s.timing)).toBe(false);
  });
});
