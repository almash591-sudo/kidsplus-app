import type { EyeBreak } from '@kidsplus/shared/schedule';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addScreen, finish, MAX_TICK_MS, screenTime, syncBreak, type ScreenTime } from './eyeBreak';
import { quizDue, QUIZ_DUE_MS, type QuizSegment } from './quizDue';

const START: ScreenTime = { used: 0, at: 0, brk: null, ended: null };
const T0 = 1_000_000_000_000;
const server = (current: EyeBreak['current']): EyeBreak => ({ every: 15, rest: 15, current });

describe('время экрана', () => {
  it('копится отсчётами; сон телефона (большой промежуток) не считается', () => {
    let s = addScreen(START, T0, 15);
    for (let i = 1; i <= 12; i++) s = addScreen(s, T0 + i * 5000, 15);
    expect(s.used).toBe(60);
    s = addScreen(s, T0 + 60_000 + MAX_TICK_MS + 1, 15);
    expect(s.used).toBe(60);
  });

  it('долго без экрана (столько, сколько отдых) — глаза отдохнули, счёт с нуля', () => {
    const s = addScreen({ ...START, used: 800, at: T0 }, T0 + 15 * 60_000, 15);
    expect(s.used).toBe(0);
    expect(addScreen({ ...START, used: 800, at: T0 }, T0 + 5000, 15).used).toBe(805);
  });
});

describe('сверка перерыва с сервером', () => {
  const mine: ScreenTime = { ...START, brk: { id: 'b1', until: T0, ask: 'asked' } };

  it('свой перерыв: продлевается по серверу; отказ родителя — сказать один раз', () => {
    const r = syncBreak(mine, server({ id: 'b1', secondsLeft: 300, ask: 'no' }), T0);
    expect(r).toEqual({
      next: { ...mine, brk: { id: 'b1', until: T0 + 300_000, ask: 'no' } },
      news: 'no',
    });
    expect(
      syncBreak(r.next, server({ id: 'b1', secondsLeft: 290, ask: 'no' }), T0).news,
    ).toBeNull();
  });

  it('разрешили или время вышло — конец, счёт с нуля, второй раз не показывается', () => {
    const yes = syncBreak(mine, server({ id: 'b1', secondsLeft: 0, ask: 'yes' }), T0);
    expect(yes.news).toBe('yes');
    expect(yes.next).toEqual({ used: 0, at: T0, brk: null, ended: 'b1' });
    expect(syncBreak(mine, server({ id: 'b1', secondsLeft: 0, ask: null }), T0).news).toBe('end');
    // Часы телефона кончили отдых раньше сервера — тот же перерыв не возвращается.
    const done = finish(mine, T0);
    expect(
      syncBreak(done, server({ id: 'b1', secondsLeft: 3, ask: null }), T0).next.brk,
    ).toBeNull();
  });

  it('после перезапуска идущий перерыв подхватывается; без связи — свой, по часам', () => {
    const r = syncBreak(START, server({ id: 'b2', secondsLeft: 600, ask: null }), T0);
    expect(r.next.brk).toEqual({ id: 'b2', until: T0 + 600_000, ask: null });
    const offline: ScreenTime = {
      ...START,
      brk: { id: 'local-1', until: T0 + 900_000, ask: null },
    };
    expect(syncBreak(offline, server(null), T0).next).toEqual(offline);
    expect(syncBreak(offline, server({ id: 'b0', secondsLeft: 0, ask: 'yes' }), T0).next).toEqual(
      offline,
    );
  });

  it('родитель выключил перерыв — экран отдыха снимается', () => {
    expect(syncBreak(mine, null, T0).next.brk).toBeNull();
  });
});

describe('память телефона', () => {
  const store = new Map<string, string>();
  beforeEach(() => {
    store.clear();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
      removeItem: (k: string) => store.delete(k),
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('счёт и перерыв переживают перезапуск; испорченная запись — с нуля', () => {
    const s: ScreenTime = {
      used: 120,
      at: T0,
      brk: { id: 'b1', until: T0 + 1, ask: null },
      ended: null,
    };
    screenTime.set(s);
    expect(screenTime.get()).toEqual(s);
    store.set('kp-eye-break', '{oops');
    expect(screenTime.get()).toEqual(START);
  });

  it('вопросы после видео: помнятся до ответа, давние — нет', () => {
    const item = { kind: 'segment', id: 's1', questions: [{ id: 'q1' }] } as unknown as QuizSegment;
    quizDue.set(item, 'nature', T0);
    expect(quizDue.get(T0 + 60_000)).toEqual({ item, lesson: 'nature', at: T0 });
    expect(quizDue.get(T0 + QUIZ_DUE_MS)).toBeNull();
    quizDue.clear();
    expect(quizDue.get(T0 + 1)).toBeNull();
    // Видео без вопросов не возвращаем.
    quizDue.set({ ...item, questions: [] }, null, T0);
    expect(quizDue.get(T0 + 1)).toBeNull();
  });
});
