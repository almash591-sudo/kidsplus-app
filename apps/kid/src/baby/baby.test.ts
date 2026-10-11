import type { KidItem } from '@kidsplus/shared/api';
import { describe, expect, it } from 'vitest';
import { babyVideos } from './BabyScreen';

const seg = (id: string, subject: string | null) =>
  ({ kind: 'segment', id, subject, questions: [] }) as unknown as KidItem;

describe('видео малыша', () => {
  it('песенки — «Музыка», логопед — «Разное»', () => {
    const items = [seg('a', 'music'), seg('b', 'other'), seg('c', 'nature')];
    expect(babyVideos(items, 'songs').map((s) => s.id)).toEqual(['a']);
    expect(babyVideos(items, 'speech').map((s) => s.id)).toEqual(['b']);
  });

  it('тем нет — песенками считаются все видео, кроме логопеда', () => {
    const items = [seg('a', null), seg('b', 'other'), seg('c', null)];
    expect(babyVideos(items, 'songs').map((s) => s.id)).toEqual(['a', 'c']);
  });
});
