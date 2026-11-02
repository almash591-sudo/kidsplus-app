import { describe, expect, it } from 'vitest';
import { parseRuTubeMessage, ruTubeEmbedUrl } from './rutube-iframe';

const ID = 'c9be5e8850ddc8583c71a986284ac6ef';
const m = (type: string, data?: object) => JSON.stringify({ type, data });

describe('плеер RuTube', () => {
  it('адрес плеера', () => {
    expect(ruTubeEmbedUrl(ID, 12.7)).toBe(`https://rutube.ru/play/embed/${ID}/?t=12`);
    expect(ruTubeEmbedUrl(ID, 0, 95)).toBe(`https://rutube.ru/play/embed/${ID}/?t=0&stopTime=95`);
  });

  it('сообщения плеера', () => {
    expect(parseRuTubeMessage(m('player:ready', { videoId: ID }))).toEqual({ type: 'ready' });
    expect(parseRuTubeMessage(m('player:changeState', { state: 'playing' }))).toEqual({
      type: 'state',
      state: 'playing',
    });
    // Старые версии плеера пишут paused, новые — pause.
    expect(parseRuTubeMessage(m('player:changeState', { state: 'pause' }))).toMatchObject({
      state: 'paused',
    });
    expect(parseRuTubeMessage(m('player:changeState', { state: 'paused' }))).toMatchObject({
      state: 'paused',
    });
    expect(parseRuTubeMessage(m('player:changeState', { state: 'новое' }))).toMatchObject({
      state: 'unknown',
    });
    expect(parseRuTubeMessage(m('player:currentTime', { time: 31.5, duration: 600 }))).toEqual({
      type: 'time',
      time: 31.5,
      duration: 600,
    });
    expect(parseRuTubeMessage(m('player:currentTime', { currentTime: 4 }))).toEqual({
      type: 'time',
      time: 4,
      duration: null,
    });
    expect(parseRuTubeMessage(m('player:playComplete'))).toEqual({ type: 'complete' });
    expect(parseRuTubeMessage(m('player:error', { message: 'нет видео' }))).toEqual({
      type: 'error',
      message: 'нет видео',
    });
    // Объектом, а не строкой, — тоже понимаем.
    expect(parseRuTubeMessage({ type: 'player:playComplete' })).toEqual({ type: 'complete' });
  });

  it('чужое и битое — null', () => {
    expect(parseRuTubeMessage('не json')).toBeNull();
    expect(parseRuTubeMessage(null)).toBeNull();
    expect(parseRuTubeMessage(m('player:currentTime', {}))).toBeNull();
    expect(parseRuTubeMessage(JSON.stringify({ event: 'onReady' }))).toBeNull();
  });
});
