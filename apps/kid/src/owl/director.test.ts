import { describe, expect, it } from 'vitest';
import {
  IDLE_KNOCK_MS,
  IDLE_LESSON_MS,
  IDLE_PEEK_MS,
  pickScene,
  SCENE_GAP_MS,
  type OwlContext,
} from './director';

const NOW = 10_000_000;
const ctx = (over: Partial<OwlContext> = {}): OwlContext => ({
  now: NOW,
  touchedAt: NOW,
  lastSceneAt: 0,
  returned: false,
  hasLesson: true,
  habitsDue: false,
  evening: false,
  random: () => 0.1,
  ...over,
});
const idle = (ms: number) => ({ touchedAt: NOW - ms });

describe('режиссёр совёнка', () => {
  it('ребёнок занят — совёнок не мешает', () => {
    expect(pickScene(ctx())).toBeNull();
    expect(pickScene(ctx(idle(IDLE_PEEK_MS - 1)))).toBeNull();
  });

  it('вернулся после перерыва — стук по стеклу, даже сразу после сценки', () => {
    expect(pickScene(ctx({ returned: true, lastSceneAt: NOW - 1000 }))).toEqual({
      kind: 'knock',
    });
  });

  it('сценки — не чаще раза в минуту', () => {
    const recent = { ...idle(IDLE_KNOCK_MS), lastSceneAt: NOW - SCENE_GAP_MS + 1 };
    expect(pickScene(ctx(recent))).toBeNull();
    expect(pickScene(ctx({ ...recent, lastSceneAt: NOW - SCENE_GAP_MS }))).toEqual({
      kind: 'knock',
    });
  });

  it('долго ничего не нажимает — зовёт: сначала к делам, потом к уроку', () => {
    expect(pickScene(ctx({ ...idle(IDLE_LESSON_MS), habitsDue: true }))).toEqual({
      kind: 'perch',
      target: 'habits',
    });
    expect(pickScene(ctx(idle(IDLE_LESSON_MS)))).toEqual({ kind: 'perch', target: 'lesson' });
    expect(pickScene(ctx({ ...idle(IDLE_KNOCK_MS) }))).toEqual({ kind: 'knock' });
  });

  it('спокойно смотрит на меню — прятки; вечером иногда зевает', () => {
    expect(pickScene(ctx({ ...idle(IDLE_PEEK_MS), hasLesson: false }))).toEqual({
      kind: 'peek',
    });
    expect(pickScene(ctx({ ...idle(IDLE_PEEK_MS), evening: true }))).toEqual({ kind: 'yawn' });
    expect(pickScene(ctx({ ...idle(IDLE_PEEK_MS), random: () => 0.9 }))).toBeNull();
  });

  it('без урока на экране к уроку не зовёт', () => {
    expect(pickScene(ctx({ ...idle(IDLE_LESSON_MS), hasLesson: false }))).toEqual({
      kind: 'peek',
    });
  });
});
