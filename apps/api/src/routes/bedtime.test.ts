import type { BedtimeInput, KidBedtime, ParentSleep, Story } from '@kidsplus/shared/bedtime';
import type { KidToday } from '@kidsplus/shared/schedule';
import { bookAnnounce, bookOf, chapterAnnounce } from '@kidsplus/shared/books';
import { STORY_LIBRARY } from '@kidsplus/shared/stories-library';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  cookieFrom,
  createChild,
  girl,
  makeApp,
  pairDevice,
  setupParent,
  SETUP_TOKEN,
  type TestApp,
} from '../test/helpers';

let t: TestApp;
let parent: Record<string, string>;
let child: string;
let device: Record<string, string>;

const req = (method: string, url: string, cookies: Record<string, string>, payload?: object) =>
  t.app.inject({ method: method as 'GET', url, cookies, ...(payload ? { payload } : {}) });
const base = () => `/api/parent/children/${child}`;
const page = async () => (await req('GET', `${base()}/sleep`, parent)).json<ParentSleep>();
const kidNight = async () => (await req('GET', '/api/kid/bedtime', device)).json<KidBedtime>();
const today = async () => (await req('GET', '/api/kid/today', device)).json<KidToday>();
/** Время по Москве (UTC+3) в среду 2026-10-14. */
const at = (hhmm: string, day = 14) => {
  const [h, m] = hhmm.split(':').map(Number);
  t.clock.now = new Date(Date.UTC(2026, 9, day, h! - 3, m!));
};
const SETTINGS: BedtimeInput = {
  enabled: true,
  at: '20:30',
  wakeAt: '07:00',
  days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
  warnMinutes: 15,
  companion: 'story',
  trackId: null,
};
const put = (s: Partial<BedtimeInput> = {}) =>
  req('PUT', `${base()}/sleep`, parent, { ...SETTINGS, ...s });

beforeEach(async () => {
  t = await makeApp({ setupToken: SETUP_TOKEN, rateLimit: false });
  at('13:00');
  parent = await setupParent(t);
  child = await createChild(t, parent, girl({ gender: 'f' }));
  device = await pairDevice(t, parent, child);
});
afterEach(() => t.close());

describe('пора спать (этап 31)', () => {
  it('выключено по умолчанию; днём — ничего, за 15 минут — «скоро», в отбой — ночь до утра', async () => {
    expect((await page()).settings.enabled).toBe(false);
    expect((await today()).bedtime).toBeNull();
    expect((await put()).statusCode).toBe(200);

    at('20:10');
    expect((await today()).bedtime).toBeNull();
    at('20:20');
    expect((await today()).bedtime).toMatchObject({ phase: 'soon', minutesLeft: 10 });
    at('20:30');
    const night = await today();
    expect(night.bedtime).toMatchObject({ phase: 'night', night: '2026-10-14' });
    at('03:00', 15);
    expect((await today()).bedtime).toMatchObject({ phase: 'night', minutesLeft: 240 });
    at('07:00', 15);
    expect((await today()).bedtime).toBeNull();
  });

  it('только в выбранные дни: ночь пятницы есть, субботы нет', async () => {
    await put({ days: ['fri'] });
    at('21:00', 16); // пятница
    expect((await today()).bedtime?.phase).toBe('night');
    at('06:00', 17); // утро субботы — ещё ночь пятницы
    expect((await today()).bedtime?.phase).toBe('night');
    at('21:00', 17); // суббота
    expect((await today()).bedtime).toBeNull();
  });

  it('«Разбудить» снимает только эту ночь', async () => {
    await put();
    at('21:00');
    expect((await req('POST', `${base()}/control`, parent, { action: 'wake' })).statusCode).toBe(
      200,
    );
    expect((await today()).bedtime).toBeNull();
    at('21:00', 15);
    expect((await today()).bedtime?.phase).toBe('night');
  });

  it('проверка: отбой вечером, подъём утром; запись — из аудиотеки', async () => {
    expect((await put({ at: '10:00' })).statusCode).toBe(400);
    expect((await put({ wakeAt: '13:00' })).statusCode).toBe(400);
    expect((await put({ companion: 'track' })).statusCode).toBe(400);
    expect(
      (await put({ companion: 'track', trackId: '00000000-0000-4000-8000-000000000000' }))
        .statusCode,
    ).toBe(400);
  });

  it('готовая сказка — сразу у ребёнка; придуманная — только после одобрения', async () => {
    await put();
    const lib = STORY_LIBRARY[0]!;
    let p = await page();
    expect(p.library.map((s) => s.code)).toContain(lib.code);
    const added = await req('POST', `${base()}/stories/library/${lib.code}`, parent);
    expect(added.statusCode).toBe(201);
    expect((await req('POST', `${base()}/stories/library/${lib.code}`, parent)).statusCode).toBe(
      409,
    );
    p = await page();
    expect(p.library.map((s) => s.code)).not.toContain(lib.code);

    const ordered = await req('POST', `${base()}/stories`, parent, { theme: 'про облачко' });
    expect(ordered.statusCode).toBe(201);
    const draft = ordered.json<Story>();
    expect(draft.status).toBe('queued');
    // Не готова — одобрить нельзя.
    expect((await req('POST', `${base()}/stories/${draft.id}/approve`, parent)).statusCode).toBe(
      409,
    );

    const night = await kidNight();
    expect(night.companion).toBe('story');
    expect(night.story?.title.text).toBe(lib.title);
    expect(night.story?.parts.map((s) => s.text)).toEqual(lib.paragraphs);
  });

  it('сказки по очереди: дослушанная уходит в конец', async () => {
    await put();
    const [a, b] = STORY_LIBRARY;
    await req('POST', `${base()}/stories/library/${a!.code}`, parent);
    t.advance(1000);
    await req('POST', `${base()}/stories/library/${b!.code}`, parent);
    const first = (await kidNight()).story!;
    expect(first.title.text).toBe(a!.title);
    expect(
      (await req('POST', '/api/kid/bedtime/played', device, { storyId: first.id })).statusCode,
    ).toBe(204);
    expect((await kidNight()).story!.title.text).toBe(b!.title);
  });

  it('удалённая сказка пропадает; чужого ребёнка не трогает', async () => {
    await put();
    const s = (
      await req('POST', `${base()}/stories/library/${STORY_LIBRARY[0]!.code}`, parent)
    ).json<Story>();
    const other = await createChild(t, parent, girl({ nickname: 'Другая' }));
    expect(
      (await req('DELETE', `/api/parent/children/${other}/stories/${s.id}`, parent)).statusCode,
    ).toBe(404);
    expect((await req('DELETE', `${base()}/stories/${s.id}`, parent)).statusCode).toBe(204);
    expect((await kidNight()).story).toBeNull();
  });
});

describe('книжка на ночь (этап 52)', () => {
  const BOOK = { companion: 'book', bookCode: 'gadkiyUtenok' } as const;
  const played = (chapter: number, night: string, cookies = device) =>
    req('POST', '/api/kid/bedtime/played', cookies, { book: 'gadkiyUtenok', chapter, night });
  const chapter = (c: number) => req('PUT', `${base()}/sleep/book-chapter`, parent, { chapter: c });

  it('по главе за ночь: перезапуск этой ночью — та же глава, после последней — сначала', async () => {
    expect((await put(BOOK)).statusCode).toBe(200);
    at('21:00');
    const b = bookOf('gadkiyUtenok');
    const first = (await kidNight()).book!;
    expect(first).toMatchObject({ code: 'gadkiyUtenok', chapter: 0, chapters: 2 });
    expect(first.head.map((s) => s.text)).toEqual([bookAnnounce(b), chapterAnnounce(b, 0)]);
    expect(first.pages.map((p) => p.map((s) => s.text))).toEqual(
      b.chapters[0]!.pages.map((p) => p.text),
    );
    expect((await kidNight()).story).toBeNull();

    // Чужая глава не двигает; дослушанная — двигает, но раз за ночь.
    expect((await played(1, '2026-10-14')).statusCode).toBe(204);
    expect((await page()).book).toEqual({ chapter: 0, night: null });
    expect((await played(0, '2026-10-14')).statusCode).toBe(204);
    expect((await page()).book).toEqual({ chapter: 1, night: '2026-10-14' });
    expect((await kidNight()).book!.chapter).toBe(0);
    await played(0, '2026-10-14');
    expect((await page()).book).toEqual({ chapter: 1, night: '2026-10-14' });

    // После полуночи — та же ночь; следующим вечером — вторая глава, потом снова первая.
    at('02:00', 15);
    expect((await kidNight()).book!.chapter).toBe(0);
    at('21:00', 15);
    expect((await kidNight()).book!.chapter).toBe(1);
    await played(1, '2026-10-15');
    expect((await page()).book).toEqual({ chapter: 0, night: '2026-10-15' });
    at('21:00', 16);
    expect((await kidNight()).book!.chapter).toBe(0);
  });

  it('без книжки — нельзя; глава вручную; другая книжка — с первой главы', async () => {
    expect((await put({ companion: 'book' })).statusCode).toBe(400);
    expect((await chapter(1)).statusCode).toBe(409);
    await put(BOOK);
    expect((await chapter(2)).statusCode).toBe(400);
    const res = await chapter(1);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ chapter: 1, night: null });
    at('21:00');
    expect((await kidNight()).book!.chapter).toBe(1);

    // Сохранение других настроек главу не сбрасывает; смена книжки — сбрасывает.
    await put({ ...BOOK, warnMinutes: 10 });
    expect((await page()).book.chapter).toBe(1);
    await put({ companion: 'book', bookCode: 'morozIvanovich' });
    expect((await page()).book).toEqual({ chapter: 0, night: null });
    expect((await page()).settings.bookCode).toBe('morozIvanovich');

    // Сказка вместо книжки — книжки ночью нет, а выбранная остаётся.
    await put({ companion: 'story', bookCode: 'morozIvanovich' });
    expect((await kidNight()).book).toBeNull();
  });

  it('просмотр из кабинета главу не двигает', async () => {
    await put(BOOK);
    at('21:00');
    const created = await req('POST', `${base()}/preview`, parent);
    const { code } = created.json<{ code: string }>();
    const paired = await t.app.inject({ method: 'POST', url: '/api/kid/pair', payload: { code } });
    const view = { kp_device: cookieFrom(paired, 'kp_device') };
    expect((await played(0, '2026-10-14', view)).statusCode).toBe(204);
    expect((await page()).book).toEqual({ chapter: 0, night: null });
  });
});
