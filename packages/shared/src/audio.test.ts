import { describe, expect, it } from 'vitest';
import { parseRange, sniffAudio, titleFromFile } from './audio';

const bytes = (...head: number[]) => new Uint8Array([...head, ...new Array(16).fill(0)]);

describe('sniffAudio', () => {
  it('MP3 с ID3, MP3 без тегов, M4A; остальное — нет', () => {
    expect(sniffAudio(bytes(0x49, 0x44, 0x33, 4))).toBe('audio/mpeg');
    expect(sniffAudio(bytes(0xff, 0xfb, 0x90))).toBe('audio/mpeg');
    expect(sniffAudio(bytes(0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70))).toBe('audio/mp4');
    expect(sniffAudio(bytes(0x89, 0x50, 0x4e, 0x47))).toBeNull();
    expect(sniffAudio(new Uint8Array(3))).toBeNull();
  });
});

describe('parseRange', () => {
  it('начало, отрезок, хвост; за пределами — invalid; без заголовка — null', () => {
    expect(parseRange('bytes=100-', 1000)).toEqual({ start: 100, end: 999 });
    expect(parseRange('bytes=0-499', 1000)).toEqual({ start: 0, end: 499 });
    expect(parseRange('bytes=0-5000', 1000)).toEqual({ start: 0, end: 999 });
    expect(parseRange('bytes=-200', 1000)).toEqual({ start: 800, end: 999 });
    expect(parseRange('bytes=1000-', 1000)).toBe('invalid');
    expect(parseRange(undefined, 1000)).toBeNull();
    expect(parseRange('bytes=0-1,5-6', 1000)).toBeNull();
  });
});

it('titleFromFile', () => {
  expect(titleFromFile('Колыбельная_медведицы.mp3')).toBe('Колыбельная медведицы');
  expect(titleFromFile('.mp3')).toBe('Без названия');
});
