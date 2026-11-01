import { describe, expect, it } from 'vitest';
import { parseRuTubeId, parseRuTubeStart } from './rutube';
import { parseVideoUrl, videoPageUrl } from './video-url';

const ID = 'c9be5e8850ddc8583c71a986284ac6ef';

describe('parseRuTubeId', () => {
  it.each([
    ID,
    ID.toUpperCase(),
    `https://rutube.ru/video/${ID}/`,
    `https://rutube.ru/video/${ID}/?t=42&r=plwd`,
    `https://www.rutube.ru/video/${ID}`,
    `https://m.rutube.ru/video/${ID}/`,
    `rutube.ru/video/${ID}/`,
    `https://rutube.ru/shorts/${ID}/`,
    `https://rutube.ru/play/embed/${ID}`,
    `https://rutube.ru/play/embed/${ID}/?t=10&stopTime=60`,
  ])('распознаёт %s', (input) => {
    expect(parseRuTubeId(input)).toBe(ID);
  });

  it.each([
    `https://rutube.ru/video/private/${ID}/?p=secret`,
    'https://rutube.ru/channel/23501281/',
    'https://rutube.ru/plst/12345/',
    `https://rutube.ru.evil.com/video/${ID}/`,
    `https://evil.com/video/${ID}/`,
    `https://rutube.ru/video/${ID.slice(1)}/`,
    'не ссылка',
    '',
  ])('отклоняет %s', (input) => {
    expect(parseRuTubeId(input)).toBeNull();
  });
});

describe('parseRuTubeStart', () => {
  it('секунды из ?t=', () => {
    expect(parseRuTubeStart(`https://rutube.ru/video/${ID}/?t=95`)).toBe(95);
    expect(parseRuTubeStart(`https://rutube.ru/video/${ID}/`)).toBeNull();
    expect(parseRuTubeStart(`https://rutube.ru/video/${ID}/?t=1m`)).toBeNull();
  });
});

describe('parseVideoUrl', () => {
  it('YouTube и RuTube', () => {
    expect(parseVideoUrl('https://youtu.be/dQw4w9WgXcQ?t=30')).toEqual({
      provider: 'youtube',
      externalId: 'dQw4w9WgXcQ',
      startSec: 30,
    });
    expect(parseVideoUrl(`https://rutube.ru/video/${ID}/?t=12`)).toEqual({
      provider: 'rutube',
      externalId: ID,
      startSec: 12,
    });
    expect(parseVideoUrl('https://vimeo.com/123')).toBeNull();
  });

  it('страница видео для родителя', () => {
    expect(videoPageUrl({ provider: 'rutube', externalId: ID })).toBe(
      `https://rutube.ru/video/${ID}/`,
    );
    expect(videoPageUrl({ provider: 'youtube', externalId: 'dQw4w9WgXcQ' })).toBe(
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    );
  });
});
