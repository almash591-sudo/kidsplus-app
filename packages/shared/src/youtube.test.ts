import { describe, expect, it } from 'vitest';
import { parseYouTubeId, parseYouTubeStart, parseYouTubeTarget } from './youtube';

const ID = 'dQw4w9WgXcQ';

describe('parseYouTubeId', () => {
  it.each([
    ID,
    `https://www.youtube.com/watch?v=${ID}`,
    `https://youtube.com/watch?v=${ID}&t=42s`,
    `https://m.youtube.com/watch?v=${ID}`,
    `https://music.youtube.com/watch?v=${ID}`,
    `https://youtu.be/${ID}?si=abc`,
    `youtu.be/${ID}`,
    `https://www.youtube.com/shorts/${ID}`,
    `https://www.youtube.com/embed/${ID}`,
    `https://www.youtube-nocookie.com/embed/${ID}?start=10`,
    `https://www.youtube.com/live/${ID}`,
  ])('распознаёт %s', (input) => {
    expect(parseYouTubeId(input)).toBe(ID);
  });

  it.each([
    'https://vimeo.com/123',
    'https://www.youtube.com/@channel',
    'https://www.youtube.com/playlist?list=PL123',
    'https://evil.com/watch?v=dQw4w9WgXcQ',
    'https://youtube.com.evil.com/watch?v=dQw4w9WgXcQ',
    'не ссылка',
    '',
  ])('отклоняет %s', (input) => {
    expect(parseYouTubeId(input)).toBeNull();
  });
});

describe('parseYouTubeStart', () => {
  it.each([
    [`https://youtu.be/${ID}?t=90`, 90],
    [`https://youtube.com/watch?v=${ID}&t=1m30s`, 90],
    [`https://youtube.com/watch?v=${ID}&t=1h2m3s`, 3723],
    [`https://www.youtube.com/embed/${ID}?start=15`, 15],
    [`https://youtu.be/${ID}`, null],
  ])('%s → %s', (input, expected) => {
    expect(parseYouTubeStart(input)).toBe(expected);
  });
});

describe('parseYouTubeTarget', () => {
  it('видео, плейлист, канал', () => {
    expect(parseYouTubeTarget('https://youtu.be/aaaaaaaaaaa')).toEqual({
      kind: 'video',
      id: 'aaaaaaaaaaa',
    });
    expect(
      parseYouTubeTarget('https://www.youtube.com/watch?v=aaaaaaaaaaa&list=PL1234567890ab'),
    ).toEqual({
      kind: 'video',
      id: 'aaaaaaaaaaa',
    });
    expect(parseYouTubeTarget('https://www.youtube.com/playlist?list=PL1234567890ab')).toEqual({
      kind: 'playlist',
      id: 'PL1234567890ab',
    });
    expect(parseYouTubeTarget('https://www.youtube.com/@SuperSimpleSongs/videos')).toEqual({
      kind: 'channel',
      handle: '@SuperSimpleSongs',
    });
    expect(parseYouTubeTarget('@pinkfong')).toEqual({ kind: 'channel', handle: '@pinkfong' });
    expect(parseYouTubeTarget('https://www.youtube.com/channel/UCbCmjCuTUZos6Inko4u57UQ')).toEqual({
      kind: 'channel',
      id: 'UCbCmjCuTUZos6Inko4u57UQ',
    });
    expect(parseYouTubeTarget('https://example.com/@x')).toBeNull();
  });
});
