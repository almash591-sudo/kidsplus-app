import { readFileSync } from 'node:fs';
import { expect, test as base, type Page } from '@playwright/test';
import type { AppErrorReport } from '@kidsplus/shared/app-errors';
import { BOOK_CODES, bookAnnounce, BOOKS, chapterAnnounce } from '@kidsplus/shared/books';
import { LETTER_LESSONS } from '@kidsplus/shared/letters-lessons';
import type { TraceShape } from '@kidsplus/shared/games';
import type { BookPlayed, KidBedtime } from '@kidsplus/shared/bedtime';
import type { KidHabit, KidHabits } from '@kidsplus/shared/habits';
import type { EyeBreak } from '@kidsplus/shared/schedule';
import {
  callStatus,
  type CallEvent,
  type CallInfo,
  type MemberState,
  type Peer,
} from '@kidsplus/shared/calls';

const FAKE_YT = readFileSync(new URL('./fake-youtube.js', import.meta.url), 'utf8');
const FAKE_RUTUBE = readFileSync(new URL('./fake-rutube.html', import.meta.url), 'utf8');
// 1×1 PNG вместо превью с i.ytimg.com — тесты не ходят в интернет.
const PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

const SEGMENTS = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    provider: 'youtube',
    externalId: 'aaaaaaaaaaa',
    startSec: 30,
    endSec: 150,
    thumbnailUrl: 'https://i.ytimg.com/vi/aaaaaaaaaaa/hqdefault.jpg',
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    provider: 'youtube',
    externalId: 'bbbbbbbbbbb',
    startSec: 0,
    endSec: 90,
    thumbnailUrl: 'https://i.ytimg.com/vi/bbbbbbbbbbb/hqdefault.jpg',
  },
];

type Item = Record<string, unknown> & { kind: string; id: string };

interface Backend {
  paired: boolean;
  /** Перерыв для глаз (этап 50): что телефон просил у сервера. */
  eyeBreaks?: ('start' | 'ask')[];
  /** Уровни сложности игр (этап 34). */
  levels?: { start: number; byKind: Record<string, number> };
  /** Пол ребёнка — для фраз совёнка (этап 55). */
  gender?: 'f' | 'm';
  /** Аудиотека: треки «детям». */
  audio?: { id: string; title: string; url: string; video?: boolean }[];
  /** «Мои дела» (этап 30). */
  habits?: KidHabits;
  habitsDone?: string[];
  /** Ночной экран (этап 31). */
  bedtime?: KidBedtime;
  storiesPlayed?: string[];
  booksPlayed?: BookPlayed[];
  /** День по расписанию; по умолчанию расписание выключено. */
  today?: Record<string, unknown>;
  /** Уроки по предметам (для режима расписания). */
  lessons?: Record<string, Item[]>;
  /** Сигналы телефона: чем занят ребёнок. */
  beats?: { activity: string | null; active: boolean }[];
  /** Сервер отвечает на сигнал «время вышло». */
  stop?: boolean;
  /** PIN родителя. */
  pin?: string;
  events: {
    type: string;
    segmentId?: string;
    questionId?: string;
    deckId?: string;
    interactiveId?: string;
    payload?: Record<string, unknown>;
  }[];
  /** Плейлист ребёнка; по умолчанию — два видео без вопросов. */
  items: Item[];
  quiz: { options: number; questions: number };
  /** Что телефон сообщил о своих голосах. */
  voices?: string[];
  /** Режим погружения (иностранные карточки без перевода). */
  immersion?: boolean;
  /** Малыш (этап 16б) и колыбельные мамы. */
  baby?: boolean;
  lullabies?: { label: string; url: string }[];
  /** Серверная озвучка (нейроголос) и сколько раз приложение просило озвучить фразы. */
  serverVoice?: boolean;
  speechRequests?: number;
  /** Снимки, присланные в кабинет, и сколько уже снято сегодня. */
  captures?: { kind: string; mime: string; durationMs: string | null; bytes: number }[];
  captureUsed?: { photo: number; video: number };
  /** Звонки (этап 10): общий поддельный сервер звонков и кто этот телефон. */
  calls?: { server: FakeCallServer; me: Peer };
  /** Радионяня: включена ли с начала; сигналы шума от телефона. */
  monitorOn?: boolean;
  noise?: { db: number }[];
  /** Что телефон сообщил о заряде. */
  battery?: { level: number; charging: boolean }[];
  /** Сбои приложения, которые телефон отправил (этап 51). */
  appErrors?: AppErrorReport[];
}

const speech = (text: string) => ({ text, lang: 'ru' as const, audioUrl: null });
const PHRASES = {
  correct: [speech('Молодец!')],
  retry: [speech('Попробуй ещё.')],
  done: [speech('Отлично!')],
  slow: [speech('Не спеши.')],
};
const PHRASES_EN = {
  correct: [{ text: 'Great job!', lang: 'en', audioUrl: null }],
  retry: [{ text: 'Try again.', lang: 'en', audioUrl: null }],
  done: [{ text: 'Great work! Let us go on.', lang: 'en', audioUrl: null }],
};

/**
 * Подмена синтеза речи: в headless Chromium голосов нет. Записывает, что и на каком языке
 * произнесено, и «договаривает» фразу через 50 мс (или window.__speechMs).
 */
const FAKE_SPEECH = `
  window.__spoken = [];
  /** Договорённые фразы — по ним тесты ждут конца фразы, а не время. */
  window.__ended = [];
  // Голоса как на Samsung: часть с подчёркиванием, появляются не сразу (voiceschanged).
  const VOICES = [
    { name: 'Samsung English', lang: 'en_US', localService: true },
    { name: 'Samsung русский', lang: 'ru_RU', localService: true },
    { name: 'Google 中文', lang: 'zh-CN', localService: true },
  ];
  let loaded = false;
  const listeners = [];
  const fake = {
    speaking: false,
    speak(u) {
      window.__spoken.push({ text: u.text, lang: u.lang, rate: u.rate, voice: u.voice ? u.voice.name : null });
      setTimeout(() => {
        window.__ended.push(u.text);
        u.onend && u.onend();
      }, window.__speechMs || 50);
    },
    cancel() {},
    getVoices() { return loaded ? VOICES : []; },
    addEventListener(type, fn) { if (type === 'voiceschanged') listeners.push(fn); },
    removeEventListener() {},
  };
  setTimeout(() => { loaded = true; listeners.forEach((fn) => fn()); }, 300);
  Object.defineProperty(window, 'speechSynthesis', { value: fake, configurable: true });
  // Настоящий SpeechSynthesisUtterance принимает только настоящие голоса — подменяем и его.
  window.SpeechSynthesisUtterance = class {
    constructor(text) { this.text = text; this.lang = ''; this.rate = 1; this.voice = null; }
  };
`;

type Spoken = { text: string; lang: string; rate: number; voice: string | null };
/** Произнесённые фразы; беззвучный «прогрев» голоса на iPhone (пробел) — не фраза. */
const spoken = (page: Page) =>
  page.evaluate(() =>
    (window as unknown as { __spoken: Spoken[] }).__spoken.filter((s) => s.text.trim()),
  );

/** Сколько поддельный голос «говорит» фразу — с этой минуты. */
const slowSpeech = (page: Page, ms: number) =>
  page.evaluate((v) => ((window as unknown as { __speechMs: number }).__speechMs = v), ms);

const OFF_TODAY = {
  mode: 'off',
  closed: null,
  paused: false,
  subjects: [],
  free: { open: false, secondsLeft: 0 },
  windowSecondsLeft: null,
};

/**
 * Поддельный сервер звонков (этап 10): та же логика состояний, что на настоящем
 * (callStatus из @kidsplus/shared), события — в очередь живого канала каждого телефона.
 */
class FakeCallServer {
  calls = new Map<string, CallInfo>();
  private queues = new Map<Peer, string[]>();
  started: { to: Peer[]; video: boolean }[] = [];
  constructor(readonly names: Record<Peer, string>) {}

  private emit(peer: Peer, event: CallEvent) {
    const q = this.queues.get(peer) ?? [];
    q.push(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
    this.queues.set(peer, q);
  }

  /** Родитель включил или выключил радионяню. */
  monitor(peer: Peer, on: boolean) {
    const q = this.queues.get(peer) ?? [];
    q.push(
      `event: monitor
data: ${JSON.stringify({ type: 'monitor', state: { on, sensitivity: 'high' } })}

`,
    );
    this.queues.set(peer, q);
  }

  /** «Слушать»: звонок-прослушка, ребёнок сразу в разговоре. */
  listen(from: Peer, to: Peer) {
    const call: CallInfo = {
      id: crypto.randomUUID(),
      video: false,
      monitor: true,
      from,
      status: 'active',
      createdAt: new Date().toISOString(),
      members: [
        { id: from, name: this.names[from]!, state: 'joined' },
        { id: to, name: this.names[to]!, state: 'joined' },
      ],
    };
    this.calls.set(call.id, call);
    this.emit(to, { type: 'call', call: structuredClone(call) });
    return call;
  }

  drain(peer: Peer) {
    const q = this.queues.get(peer) ?? [];
    this.queues.set(peer, []);
    return q.join('');
  }

  private set(call: CallInfo, peer: Peer, state: MemberState, from: MemberState[]) {
    const m = call.members.find((x) => x.id === peer);
    if (m && from.includes(m.state)) m.state = state;
    call.status = callStatus(call.members);
    if (call.status === 'ended')
      for (const x of call.members)
        if (x.state === 'ringing') x.state = 'missed';
        else if (x.state === 'joined') x.state = 'left';
    for (const x of call.members) this.emit(x.id, { type: 'call', call: structuredClone(call) });
    return structuredClone(call);
  }

  /** Звонок «с сервера» — как будто позвонил кто-то другой. */
  ring(from: Peer, to: Peer, video = true) {
    const call: CallInfo = {
      id: crypto.randomUUID(),
      video,
      from,
      status: 'ringing',
      createdAt: new Date().toISOString(),
      members: [
        { id: from, name: this.names[from]!, state: 'joined' },
        { id: to, name: this.names[to]!, state: 'ringing' },
      ],
    };
    this.calls.set(call.id, call);
    this.emit(to, { type: 'call', call: structuredClone(call) });
    return call;
  }

  handle(me: Peer, method: string, path: string, body: Record<string, unknown> | null) {
    if (path === '/calls/me') return { status: 200, json: { id: me } };
    if (path === '/calls/ice') return { status: 200, json: { iceServers: [] } };
    if (path === '/calls/contacts')
      return {
        status: 200,
        json: (Object.keys(this.names) as Peer[])
          .filter((p) => p !== me)
          .map((id) => ({
            id,
            name: this.names[id],
            kind: id.startsWith('c:') ? 'child' : 'parent',
          })),
      };
    if (path === '/calls/current') {
      const call = [...this.calls.values()].find(
        (c) =>
          c.status !== 'ended' &&
          c.members.some((m) => m.id === me && ['ringing', 'joined'].includes(m.state)),
      );
      return { status: 200, json: { call: call ? structuredClone(call) : null } };
    }
    if (path === '/calls' && method === 'POST') {
      const { to, video } = body as { to: Peer[]; video: boolean };
      this.started.push({ to, video });
      const call: CallInfo = {
        id: crypto.randomUUID(),
        video,
        from: me,
        status: 'ringing',
        createdAt: new Date().toISOString(),
        members: [me, ...to].map((id) => ({
          id,
          name: this.names[id]!,
          state: id === me ? ('joined' as const) : ('ringing' as const),
        })),
      };
      this.calls.set(call.id, call);
      for (const p of to) this.emit(p, { type: 'call', call: structuredClone(call) });
      return { status: 201, json: structuredClone(call) };
    }
    const [, , id, action] = path.split('/');
    const call = this.calls.get(id!);
    if (!call) return { status: 404, json: { error: 'not_found', message: '' } };
    switch (action) {
      case 'answer':
        return { status: 200, json: this.set(call, me, 'joined', ['ringing']) };
      case 'decline':
        return { status: 200, json: this.set(call, me, 'declined', ['ringing']) };
      case 'hangup':
        this.set(call, me, 'declined', ['ringing']);
        return { status: 200, json: this.set(call, me, 'left', ['joined']) };
      case 'signal': {
        const { to, type, data } = body as {
          to: Peer;
          type: 'offer' | 'answer' | 'ice';
          data: unknown;
        };
        this.emit(to, { type: 'signal', callId: call.id, from: me, kind: type, data });
        return { status: 204 };
      }
    }
    return { status: 404, json: { error: 'not_found', message: '' } };
  }
}

/** Подменённый сервер: /api/kid/*, плееры YouTube и RuTube, картинки. */
async function mockBackend(page: Page, backend: Backend) {
  await page.route('https://www.youtube.com/iframe_api', (r) =>
    r.fulfill({ contentType: 'text/javascript', body: FAKE_YT }),
  );
  await page.route('https://rutube.ru/play/embed/**', (r) =>
    r.fulfill({ contentType: 'text/html', body: FAKE_RUTUBE }),
  );
  for (const host of ['https://i.ytimg.com/**', 'https://pic.rtbcdn.ru/**'])
    await page.route(host, (r) => r.fulfill({ contentType: 'image/png', body: PIXEL }));
  // Картинки и «озвучка»: в тестах звук не играет — плеер сразу считает его законченным.
  await page.route('**/api/media/**', (r) => r.fulfill({ contentType: 'image/png', body: PIXEL }));
  await page.route(/\/api\/(kid|calls)(\/|\?|$)/, async (route) => {
    const url = new URL(route.request().url());
    const unauthorized = () =>
      route.fulfill({ status: 401, json: { error: 'not_paired', message: '' } });
    switch (url.pathname) {
      case '/api/kid/pair': {
        const { code } = route.request().postDataJSON() as { code: string };
        if (code.replace(/[^A-Z0-9]/gi, '').toUpperCase() !== 'ABCD2345') {
          return route.fulfill({ status: 403, json: { error: 'invalid_code', message: '' } });
        }
        backend.paired = true;
        return route.fulfill({ status: 204 });
      }
      case '/api/kid/me':
        return backend.paired ? route.fulfill({ json: { paired: true } }) : unauthorized();
      case '/api/kid/playlist':
        return backend.paired
          ? route.fulfill({
              json: {
                quiz: backend.quiz,
                items: backend.items,
                phrases: PHRASES,
                immersion: backend.immersion ?? false,
                phrasesEn: PHRASES_EN,
                serverVoice: backend.serverVoice ?? false,
                baby: backend.baby ?? false,
                lullabies: backend.lullabies ?? [],
                ...(backend.levels ? { levels: backend.levels } : {}),
                ...(backend.gender ? { gender: backend.gender } : {}),
              },
            })
          : unauthorized();
      case '/api/kid/speech': {
        // Нейроголос: у каждой фразы — свой «файл».
        const { phrases } = route.request().postDataJSON() as {
          phrases: { text: string; lang: string }[];
        };
        backend.speechRequests = (backend.speechRequests ?? 0) + 1;
        return route.fulfill({
          json: phrases.map((p) => ({
            ...p,
            audioUrl: `/api/media/tts-${encodeURIComponent(p.text)}`,
          })),
        });
      }
      case '/api/kid/voices':
        backend.voices = (route.request().postDataJSON() as { langs: string[] }).langs;
        return route.fulfill({ status: 204 });
      case '/api/kid/events':
        backend.events.push(route.request().postDataJSON());
        return route.fulfill({ status: 204 });
      case '/api/kid/today':
        return route.fulfill({ json: backend.today ?? OFF_TODAY });
      case '/api/kid/eye-break': {
        // Как сервер: начать — если не идёт; «ещё» — один раз за перерыв.
        const { action } = route.request().postDataJSON() as { action: 'start' | 'ask' };
        (backend.eyeBreaks ??= []).push(action);
        const today = (backend.today ??= { ...OFF_TODAY });
        const eb = today.eyeBreak as EyeBreak | null | undefined;
        if (eb && action === 'start' && !eb.current?.secondsLeft)
          eb.current = { id: `b${backend.eyeBreaks.length}`, secondsLeft: eb.rest * 60, ask: null };
        if (eb?.current && action === 'ask' && !eb.current.ask) eb.current.ask = 'asked';
        return route.fulfill({ json: today });
      }
      case '/api/kid/audio':
        return route.fulfill({ json: backend.audio ?? [] });
      case '/api/kid/habits':
        return route.fulfill({
          json: backend.habits ?? { date: '', habits: [], stars: 0, goal: null, lastGrant: null },
        });
      case '/api/kid/bedtime':
        return route.fulfill({
          json: backend.bedtime ?? {
            now: null,
            wakeAt: '07:00',
            companion: 'none',
            story: null,
            track: null,
            book: null,
          },
        });
      case '/api/kid/bedtime/played': {
        const body = route.request().postDataJSON() as { storyId: string } | BookPlayed;
        if ('storyId' in body) (backend.storiesPlayed ??= []).push(body.storyId);
        else (backend.booksPlayed ??= []).push(body);
        return route.fulfill({ status: 204 });
      }
      case '/api/kid/heartbeat':
        (backend.beats ??= []).push(route.request().postDataJSON());
        return route.fulfill({
          json: { ...(backend.today ?? OFF_TODAY), stop: backend.stop ?? false },
        });
      case '/api/kid/captures/today': {
        const used = backend.captureUsed ?? { photo: 0, video: 0 };
        return route.fulfill({
          json: {
            photo: { used: used.photo, limit: 30 },
            video: { used: used.video, limit: 10 },
          },
        });
      }
      case '/api/kid/captures':
        (backend.captures ??= []).push({
          kind: url.searchParams.get('kind')!,
          mime: url.searchParams.get('mime')!,
          durationMs: url.searchParams.get('durationMs'),
          bytes: route.request().postDataBuffer()?.byteLength ?? 0,
        });
        return route.fulfill({ status: 201, json: { id: 'x' } });
      case '/api/kid/monitor':
        return route.fulfill({
          json: { on: backend.monitorOn ?? false, sensitivity: 'high' },
        });
      case '/api/kid/monitor/noise':
        (backend.noise ??= []).push(route.request().postDataJSON());
        return route.fulfill({ status: 204 });
      case '/api/kid/battery':
        (backend.battery ??= []).push(route.request().postDataJSON());
        return route.fulfill({ status: 204 });
      case '/api/kid/errors':
        (backend.appErrors ??= []).push(
          ...(route.request().postDataJSON() as { errors: AppErrorReport[] }).errors,
        );
        return route.fulfill({ status: 204 });
      case '/api/kid/live':
        if (!backend.calls) return route.fulfill({ status: 204 });
        // События звонков: отдаём накопившиеся и закрываем — EventSource переподключится.
        return route.fulfill({
          status: 200,
          contentType: 'text/event-stream',
          body: 'retry: 150\n\n' + backend.calls.server.drain(backend.calls.me),
        });
      case '/api/kid/unlock': {
        const { pin } = route.request().postDataJSON() as { pin: string };
        return route.fulfill({ json: { ok: pin === backend.pin } });
      }
    }
    if (url.pathname.startsWith('/api/calls') && backend.calls) {
      const r = backend.calls.server.handle(
        backend.calls.me,
        route.request().method(),
        url.pathname.slice('/api'.length),
        route.request().postDataJSON() as Record<string, unknown> | null,
      );
      return r.json === undefined
        ? route.fulfill({ status: r.status })
        : route.fulfill({ status: r.status, json: r.json });
    }
    if (url.pathname.startsWith('/api/kid/habits/')) {
      const id = url.pathname.split('/')[4]!;
      (backend.habitsDone ??= []).push(id);
      return route.fulfill({ json: { stars: (backend.habits?.stars ?? 0) + 1 } });
    }
    if (url.pathname.startsWith('/api/kid/lesson/')) {
      const subject = url.pathname.split('/').pop()!;
      return route.fulfill({ json: { items: backend.lessons?.[subject] ?? [] } });
    }
    return route.fulfill({ status: 404 });
  });
}

const test = base.extend<{ backend: Backend; iosTab: boolean }>({
  /** iPhone: по умолчанию — приложение с экрана «Домой»; true — вкладка Safari. */
  iosTab: [false, { option: true }],
  backend: async ({ page, iosTab }, use) => {
    if (!iosTab)
      await page.addInitScript(() =>
        Object.defineProperty(navigator, 'standalone', { value: true, configurable: true }),
      );
    const backend: Backend = {
      paired: true,
      events: [],
      items: SEGMENTS.map((s) => ({ ...s, kind: 'segment', questions: [] })),
      quiz: { options: 4, questions: 2 },
    };
    await page.addInitScript(FAKE_SPEECH);
    await mockBackend(page, backend);
    await use(backend);
  },
});

const yt = <T>(page: Page, fn: string) =>
  page.evaluate(`(() => window.__yt?.${fn})()`) as Promise<T>;

/** Открывает первую карточку и ждёт, пока видео заиграет. */
async function startFirst(page: Page) {
  await page.goto('/');
  await page.getByTestId('tile').first().click();
  await expect(page.getByTestId('pause')).toBeVisible();
}

test.describe('привязка устройства', () => {
  test('по QR-ссылке привязывается сам и убирает код из адреса', async ({ page, backend }) => {
    backend.paired = false;
    await page.goto('/pair?code=ABCD2345');
    await expect(page.getByTestId('home')).toBeVisible();
    expect(new URL(page.url()).pathname).toBe('/');
    expect(new URL(page.url()).search).toBe('');
  });

  test.describe('iPhone, вкладка Safari', () => {
    test.use({ iosTab: true });
    test('по QR — сначала «на экран Домой» с кодом; в Safari — по кнопке', async ({
      page,
      backend,
    }) => {
      test.skip(!/iphone/.test(test.info().project.name), 'только iPhone');
      backend.paired = false;
      await page.goto('/pair?code=ABCD2345');
      await expect(page.getByTestId('pair-install')).toBeVisible();
      await expect(page.getByTestId('pair-install-code')).toHaveText('ABCD2345');
      await page.getByRole('button', { name: 'Продолжить в Safari' }).click();
      await expect(page.getByTestId('home')).toBeVisible();
    });
  });

  test('без привязки — экран привязки; неверный код — сообщение', async ({ page, backend }) => {
    backend.paired = false;
    await page.goto('/');
    await expect(page.getByTestId('pair')).toBeVisible();
    await page.getByTestId('pair-code').fill('ZZZZ-9999');
    await page.getByRole('button', { name: 'Привязать' }).click();
    await expect(page.getByText('Код неверный или истёк')).toBeVisible();

    await page.getByTestId('pair-code').fill('abcd-2345');
    await page.getByRole('button', { name: 'Привязать' }).click();
    await expect(page.getByTestId('home')).toBeVisible();
  });
});

test.describe('пульт родителя (этап 29)', () => {
  test('экран выключен с поводом: совёнок и фраза, разделов не видно', async ({
    page,
    backend,
  }) => {
    backend.today = { ...OFF_TODAY, rest: 'walk' };
    await page.goto('/');
    await expect(page.getByTestId('rest')).toHaveAttribute('data-reason', 'walk');
    await expect(page.getByTestId('tile')).toHaveCount(0);
    await expect
      .poll(async () => (await spoken(page)).map((s) => s.text))
      .toContain('Ура, гулять! Совёнок полетел на улицу, догоняй!');
  });

  test('«Тебя зовут!» — один раз, касание убирает', async ({ page, backend }) => {
    backend.today = { ...OFF_TODAY, calledAt: new Date().toISOString() };
    await page.goto('/');
    await expect(page.getByTestId('called')).toBeVisible();
    await page.getByTestId('called').click();
    await expect(page.getByTestId('called')).toHaveCount(0);
    await page.reload();
    await expect(page.getByTestId('tile').first()).toBeVisible();
    await expect(page.getByTestId('called')).toHaveCount(0);
  });
});

test.describe('мои дела (этап 30)', () => {
  const habit = (id: string, o: Partial<KidHabit> = {}): KidHabit => ({
    id,
    preset: 'wash',
    slot: 'morning',
    remindAt: null,
    timerSec: null,
    title: speech(`дело ${id}`),
    remind: speech(`Пора! дело ${id}.`),
    done: false,
    ...o,
  });
  const habits = (list: KidHabit[], o: Partial<KidHabits> = {}): KidHabits => ({
    date: '2026-10-18',
    habits: list,
    stars: 3,
    goal: { title: speech('Мультик'), price: 5 },
    lastGrant: null,
    ...o,
  });

  test('без дел кнопки нет', async ({ page, backend: _ }) => {
    await page.goto('/');
    await expect(page.getByTestId('tile').first()).toBeVisible();
    await expect(page.getByTestId('habits-open')).toHaveCount(0);
  });

  test('отметить дело — звёздочка в копилку; всё сделано — похвала', async ({ page, backend }) => {
    await page.clock.install({ time: new Date('2026-10-18T08:00:00') });
    backend.habits = habits([habit('a'), habit('b', { preset: 'bed', done: true })]);
    await page.goto('/');
    await expect(page.getByTestId('habits-stars')).toHaveText('3');
    await shot(page, 'habits-dock');
    await page.getByTestId('habits-open').click();
    await expect(page.getByTestId('habits')).toBeVisible();
    await expect(page.getByTestId('habits-goal')).toContainText('Мультик');
    await expect(page.getByTestId('jar-stars')).toContainText('3');

    const first = page.getByTestId('habit').first();
    await first.dispatchEvent('pointerdown');
    await expect(first).toHaveAttribute('data-done', '1');
    await expect(page.getByTestId('jar-stars')).toContainText('4');
    await shot(page, 'habits');
    expect(backend.habitsDone).toEqual(['a']);
    await expect
      .poll(async () => (await spoken(page)).map((s) => s.text))
      .toContain('Все дела сделаны! Совёнок тобой гордится!');

    // Уже сделанное — звёздочку второй раз не даёт.
    await first.dispatchEvent('pointerdown');
    expect(backend.habitsDone).toEqual(['a']);
    await page.getByTestId('go-home').click();
    await expect(page.getByTestId('habits-stars')).toHaveText('4');
  });

  test('зубы — таймер с совёнком, в конце отметка', async ({ page, backend }) => {
    await page.clock.install({ time: new Date('2026-10-18T20:00:00') });
    backend.habits = habits([
      habit('t', { preset: 'teeth', slot: 'evening', timerSec: 120 }),
      habit('m', { slot: 'morning' }),
    ]);
    await page.goto('/');
    await page.getByTestId('habits-open').click();
    // Вечер — вечерние дела; утро — вкладкой.
    await expect(page.getByTestId('slot-evening')).toHaveAttribute('aria-selected', 'true');
    await page.getByTestId('habit').first().dispatchEvent('pointerdown');
    await expect(page.getByTestId('teeth-timer')).toBeVisible();
    await shot(page, 'teeth');
    await expect
      .poll(async () => (await spoken(page)).map((s) => s.text))
      .toContain('Чистим зубки вместе с совёнком! Сначала верхние.');
    await page.clock.runFor(31_000);
    await expect
      .poll(async () => (await spoken(page)).map((s) => s.text))
      .toContain('Теперь нижние зубки!');
    await page.clock.runFor(85_000);
    await expect(page.getByTestId('teeth-timer')).toBeVisible();
    await page.clock.runFor(10_000);
    await expect(page.getByTestId('habits')).toBeVisible();
    expect((await spoken(page)).map((s) => s.text)).toContain('Готово! Какие чистые зубки!');
    expect(backend.habitsDone).toEqual(['t']);
    await page.getByTestId('slot-morning').click();
    await expect(page.getByTestId('habit')).toHaveAttribute('data-done', '0');
  });

  test('напоминание в заданное время — один раз за день', async ({ page, backend }) => {
    await page.clock.install({ time: new Date('2026-10-18T20:31:00') });
    backend.habits = habits([
      habit('t', {
        preset: 'teeth',
        slot: 'evening',
        remindAt: '20:30',
        remind: speech('Пора чистить зубки!'),
      }),
      habit('x', { slot: 'evening', remindAt: '19:00' }), // час уже прошёл
    ]);
    await page.goto('/');
    await expect(page.getByTestId('habit-remind')).toContainText('Пора чистить зубки!');
    await shot(page, 'habit-remind');
    await expect
      .poll(async () => (await spoken(page)).map((s) => s.text))
      .toContain('Пора чистить зубки!');
    await page.getByTestId('habit-remind').dispatchEvent('pointerdown');
    await expect(page.getByTestId('habit-remind')).toHaveCount(0);
    await page.reload();
    await expect(page.getByTestId('tile').first()).toBeVisible();
    await expect(page.getByTestId('habit-remind')).toHaveCount(0);
  });

  test('выданная награда — праздник один раз', async ({ page, backend }) => {
    backend.habits = habits([habit('a')], {
      lastGrant: { id: 'g1', title: speech('Поход в парк') },
    });
    await page.goto('/');
    await expect(page.getByTestId('habit-grant')).toContainText('Поход в парк');
    await page.getByTestId('habit-grant').dispatchEvent('pointerdown');
    await expect(page.getByTestId('habit-grant')).toHaveCount(0);
    await page.reload();
    await expect(page.getByTestId('tile').first()).toBeVisible();
    await expect(page.getByTestId('habit-grant')).toHaveCount(0);
  });
});

test.describe('живой совёнок (этап 32)', () => {
  /** Часы вперёд шагами: сценка — цепочка таймеров (полёт, фраза, пауза). */
  const run = async (page: Page, ms: number) => {
    for (let t = 0; t < ms; t += 1000) await page.clock.runFor(1000);
  };
  const said = async (page: Page) => (await spoken(page)).map((s) => s.text);

  test.beforeEach(async ({ page }) => {
    // Без полётов (мгновенно) и без случайностей: сценки предсказуемы.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.addInitScript(() => (Math.random = () => 0.1));
    await page.clock.install({ time: new Date('2026-10-18T10:00:00') });
  });

  test('прячется за плиткой; нашли — «Ку-ку!»', async ({ page, backend: _ }) => {
    await page.goto('/');
    await expect(page.getByTestId('tile').first()).toBeVisible();
    await expect(page.getByTestId('live-owl')).toHaveAttribute('data-mode', 'away');
    await run(page, 24_000);
    await expect(page.getByTestId('live-owl')).toHaveAttribute('data-mode', 'peek');
    await shot(page, 'owl-peek');
    await page.getByTestId('live-owl').dispatchEvent('pointerdown');
    await run(page, 2_000);
    await expect.poll(() => said(page)).toContain('Ку-ку!');
  });

  test('долго ничего не нажимает — садится на урок и зовёт', async ({ page, backend: _ }) => {
    await page.goto('/');
    await expect(page.getByTestId('tile').first()).toBeVisible();
    // Прятки (никто не нашёл) — потом минута тишины — зовёт к уроку.
    await run(page, 92_000);
    await expect.poll(() => said(page)).toContain('Смотри сюда! Давай позанимаемся.');
  });

  test('все дела сделаны — в меню подлетает похвалить', async ({ page, backend }) => {
    backend.habits = {
      date: '2026-10-18',
      habits: [
        {
          id: 'a',
          preset: 'wash',
          slot: 'morning',
          remindAt: null,
          timerSec: null,
          title: speech('Умыться'),
          remind: speech('Пора умываться!'),
          done: false,
        },
      ],
      stars: 0,
      goal: null,
      lastGrant: null,
    };
    await page.goto('/');
    await page.getByTestId('habits-open').click();
    await page.getByTestId('habit').first().dispatchEvent('pointerdown');
    await page.getByTestId('go-home').click();
    await run(page, 3_000);
    await expect.poll(() => said(page)).toContain('Ты молодец!');
  });
});

test.describe('пора спать (этап 31)', () => {
  const NIGHT = { phase: 'night' as const, minutesLeft: 600, night: '2026-10-18' };
  const night = (o: Partial<KidBedtime> = {}): KidBedtime => ({
    now: NIGHT,
    wakeAt: '07:00',
    companion: 'story',
    story: {
      id: 's1',
      title: speech('Ёжик и луна'),
      parts: [speech('Жил-был ёжик.'), speech('Ёжик уснул. Спокойной ночи.')],
    },
    track: null,
    book: null,
    ...o,
  });

  test('ночь: сказка, колыбельная, потом темно; касание — «спи»', async ({ page, backend }) => {
    await page.clock.install({ time: new Date('2026-10-18T20:30:00') });
    backend.today = { ...OFF_TODAY, bedtime: NIGHT };
    backend.bedtime = night();
    await page.goto('/');
    const screen = page.getByTestId('night');
    await expect(screen).toBeVisible();
    await expect
      .poll(async () => (await spoken(page)).map((s) => s.text))
      .toEqual(
        expect.arrayContaining([
          'Пора спать! Ложись поудобнее, сейчас будет сказка.',
          'Ёжик и луна',
          'Жил-был ёжик.',
          'Ёжик уснул. Спокойной ночи.',
        ]),
      );
    await expect(screen).toHaveAttribute('data-stage', 'lullaby');
    await shot(page, 'night-lullaby');
    expect(backend.storiesPlayed).toEqual(['s1']);
    // На ночном экране нет дока и плиток.
    await expect(page.getByTestId('tile')).toHaveCount(0);

    // Колыбельная — 20 минут; в конце тихо, без «Спокойной ночи» (не будить).
    await page.clock.runFor(19 * 60_000);
    await expect(screen).toHaveAttribute('data-stage', 'lullaby');
    await page.clock.runFor(61_000);
    await expect(screen).toHaveAttribute('data-stage', 'asleep');
    expect((await spoken(page)).map((s) => s.text)).not.toContain('Спокойной ночи! Сладких снов.');
    expect(backend.storiesPlayed).toEqual(['s1']);
    await expect(screen).toHaveClass(/dark/);
    await screen.dispatchEvent('pointerdown');
    await expect(screen).not.toHaveClass(/dark/);
    await expect(page.locator('.night-hush')).toBeVisible();
    await page.clock.runFor(10_000);
    await expect(screen).toHaveClass(/dark/);
  });

  // «Книжка на ночь» (этап 52): глава голосом на тёмном экране, без картинок и вопросов.
  const UGLY = BOOKS.gadkiyUtenok;
  const bookNight = (chapter: number) =>
    night({
      companion: 'book',
      story: null,
      book: {
        code: 'gadkiyUtenok',
        chapter,
        chapters: 2,
        head: [speech(bookAnnounce(UGLY)), speech(chapterAnnounce(UGLY, chapter)!)],
        pages: UGLY.chapters[chapter]!.pages.slice(0, 3).map((p) => p.text.map(speech)),
      },
    });

  test('книжка на ночь: глава голосом, огоньки страниц, «продолжение — завтра»', async ({
    page,
    backend,
  }) => {
    await page.clock.install({ time: new Date('2026-10-18T20:30:00') });
    // Фразы длиннее — экран главы успевает показаться.
    await page.addInitScript(() => {
      (window as unknown as { __speechMs: number }).__speechMs = 700;
    });
    backend.today = { ...OFF_TODAY, bedtime: NIGHT };
    backend.bedtime = bookNight(0);
    await page.goto('/');
    const screen = page.getByTestId('night');
    const book = page.getByTestId('night-book');
    await expect(book).toBeVisible();
    await expect(book).toHaveAttribute('data-chapter', '0');
    await expect(book.locator('.night-title')).toHaveText(UGLY.title);
    await expect(book.locator('.night-chapter')).toHaveText('Глава 1 из 2');
    await expect(book.locator('.night-pages span')).toHaveCount(3);
    await expect(book).toHaveAttribute('data-page', '1', { timeout: 15_000 });
    await expect(book.locator('.night-pages span.on')).toHaveCount(2);
    await shot(page, 'night-book');
    // Ни картинок книжки, ни «Прочитай сам» — только спящий совёнок.
    await expect(screen.locator('img')).toHaveCount(1);
    await expect(screen.locator('.book-read, [data-testid="book-read"]')).toHaveCount(0);
    await page.evaluate(() => {
      (window as unknown as { __speechMs: number }).__speechMs = 50;
    });

    await expect(screen).toHaveAttribute('data-stage', 'lullaby', { timeout: 20_000 });
    const said = (await spoken(page)).map((x) => x.text);
    const pages = UGLY.chapters[0]!.pages.slice(0, 3).flatMap((p) => p.text);
    expect(said).toEqual(
      expect.arrayContaining([
        'Пора спать! Ложись поудобнее и слушай книжку.',
        bookAnnounce(UGLY),
        chapterAnnounce(UGLY, 0)!,
        ...pages,
        'Продолжение — завтра!',
      ]),
    );
    // Порядок: объявление, страницы по порядку, потом «завтра».
    const idx = [bookAnnounce(UGLY), ...pages, 'Продолжение — завтра!'].map((t) => said.indexOf(t));
    expect(idx).toEqual([...idx].sort((a, b) => a - b));
    expect(backend.booksPlayed).toEqual([
      { book: 'gadkiyUtenok', chapter: 0, night: '2026-10-18' },
    ]);
    expect(backend.storiesPlayed ?? []).toEqual([]);
  });

  test('книжка на ночь: последняя глава — «сказке конец»', async ({ page, backend }) => {
    backend.today = { ...OFF_TODAY, bedtime: NIGHT };
    backend.bedtime = bookNight(1);
    await page.goto('/');
    await expect(page.getByTestId('night')).toHaveAttribute('data-stage', 'lullaby', {
      timeout: 20_000,
    });
    const said = (await spoken(page)).map((x) => x.text);
    expect(said).toContain(chapterAnnounce(UGLY, 1)!);
    expect(said).toContain('Вот и сказке конец, а кто слушал — молодец!');
    expect(said).not.toContain('Продолжение — завтра!');
    expect(backend.booksPlayed).toEqual([
      { book: 'gadkiyUtenok', chapter: 1, night: '2026-10-18' },
    ]);
  });

  test('ночь без сказки и музыки — сразу темно', async ({ page, backend }) => {
    backend.today = { ...OFF_TODAY, bedtime: NIGHT };
    backend.bedtime = night({ companion: 'none', story: null });
    await page.goto('/');
    await expect(page.getByTestId('night')).toHaveAttribute('data-stage', 'asleep');
  });

  test('скоро спать — совёнок зовёт делать вечерние дела, раз за вечер', async ({
    page,
    backend,
  }) => {
    await page.clock.install({ time: new Date('2026-10-18T20:15:00') });
    backend.today = {
      ...OFF_TODAY,
      bedtime: { phase: 'soon', minutesLeft: 15, night: '2026-10-18' },
    };
    backend.habits = {
      date: '2026-10-18',
      habits: [
        {
          id: 'p',
          preset: 'pajama',
          slot: 'evening',
          remindAt: null,
          timerSec: null,
          title: speech('Надеть пижаму'),
          remind: speech('Пора надевать пижамку!'),
          done: false,
        },
      ],
      stars: 0,
      goal: null,
      lastGrant: null,
    };
    await page.goto('/');
    await expect(page.getByTestId('bedtime-soon')).toBeVisible();
    await shot(page, 'bedtime-soon');
    await page.getByTestId('bedtime-habits').dispatchEvent('pointerdown');
    await expect(page.getByTestId('habits')).toBeVisible();
    await expect(page.getByTestId('bedtime-soon')).toHaveCount(0);
    await page.reload();
    await expect(page.getByTestId('habits-open')).toBeVisible();
    await expect(page.getByTestId('bedtime-soon')).toHaveCount(0);
  });

  test('утром после ночи — «Доброе утро!» один раз', async ({ page, backend: _ }) => {
    await page.clock.install({ time: new Date('2026-10-19T07:30:00') });
    await page.addInitScript(() => localStorage.setItem('kp-night', '2026-10-18'));
    await page.goto('/');
    await expect(page.getByTestId('bedtime-morning')).toBeVisible();
    await expect
      .poll(async () => (await spoken(page)).map((s) => s.text))
      .toContain('Доброе утро! Новый день начинается!');
    await page.getByTestId('bedtime-morning').dispatchEvent('pointerdown');
    await page.reload();
    await expect(page.getByTestId('tile').first()).toBeVisible();
    await expect(page.getByTestId('bedtime-morning')).toHaveCount(0);
  });
});

test.describe('главный экран', () => {
  test('показывает ровно фрагменты из API, без текста и ссылок', async ({ page, backend: _ }) => {
    await page.goto('/');
    await expect(page.getByTestId('tile')).toHaveCount(SEGMENTS.length);
    await expect(page.locator('a')).toHaveCount(0);
  });
});

test.describe('плеер', () => {
  test('параметры встраивания по ТЗ: nocookie, без элементов управления, свой start/end', async ({
    page,
    backend: _,
  }) => {
    await startFirst(page);
    const opts = await yt<{ host: string; playerVars: Record<string, number> }>(page, 'opts');
    expect(opts.host).toBe('https://www.youtube-nocookie.com');
    expect(opts.playerVars).toMatchObject({
      start: 30,
      end: 150,
      controls: 0,
      disablekb: 1,
      fs: 0,
      playsinline: 1,
      rel: 0,
      iv_load_policy: 3,
      enablejsapi: 1,
    });
  });

  test('касания по видео не доходят до iframe YouTube', async ({ page, backend: _ }) => {
    await startFirst(page);
    const box = (await page.locator('iframe').boundingBox())!;

    // В любой точке видео сверху лежит наш слой, а не iframe.
    const points = [
      [0.5, 0.5],
      [0.05, 0.95],
      [0.95, 0.05],
      [0.95, 0.95],
      [0.5, 0.1],
    ] as const;
    for (const [fx, fy] of points) {
      const testId = await page.evaluate(
        ({ x, y }) =>
          (document.elementFromPoint(x, y) as HTMLElement | null)?.dataset.testid ?? null,
        { x: box.x + box.width * fx, y: box.y + box.height * fy },
      );
      expect(['touch-shield', 'pause', 'go-home']).toContain(testId);
    }

    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    expect(
      await page.evaluate(() => (window as unknown as { __iframeHits: number }).__iframeHits),
    ).toBe(0);
    expect(await yt<number>(page, 'getPlayerState()')).toBe(1); // касание не поставило паузу
  });

  test('конец фрагмента: плеер уничтожается до заставки с рекомендациями', async ({
    page,
    backend,
  }) => {
    await startFirst(page);
    await page.evaluate(() => {
      (window as unknown as { __yt: { time: number } }).__yt.time = 149.8;
    });
    // Опрос раз в 250 мс: iframe должен исчезнуть быстро, без ожидания события ENDED.
    await expect(page.locator('iframe')).toHaveCount(0, { timeout: 600 });
    expect(await yt<boolean>(page, 'destroyed')).toBe(true);
    await expect(page.getByTestId('celebrate')).toBeVisible();
    expect(backend.events.map((e) => e.type)).toEqual(['segment_start', 'segment_complete']);
    // Вопросов к видео нет — сразу следующее видео из списка.
    await expect
      .poll(() => yt<string>(page, 'opts.videoId'), { timeout: 4000 })
      .toBe('bbbbbbbbbbb');
  });

  test('событие ENDED тоже сразу уничтожает плеер', async ({ page, backend: _ }) => {
    await startFirst(page);
    await page.evaluate(() =>
      (window as unknown as { __yt: { set(s: number): void } }).__yt.set(0),
    );
    await expect(page.locator('iframe')).toHaveCount(0);
  });

  test('пауза закрывает видео своей заглушкой', async ({ page, backend: _ }) => {
    await startFirst(page);
    await page.getByTestId('pause').click();
    await expect(page.getByTestId('play')).toBeVisible();
    const box = (await page.locator('iframe').boundingBox())!;
    const topmost = await page.evaluate(
      ({ x, y }) =>
        (document.elementFromPoint(x, y) as HTMLElement | null)?.closest('.player-cover') != null,
      { x: box.x + 10, y: box.y + box.height - 10 },
    );
    expect(topmost).toBe(true);

    await page.getByTestId('play').click();
    await expect(page.getByTestId('pause')).toBeVisible();
  });

  test('сворачивание приложения ставит видео на паузу', async ({ page, backend }) => {
    await startFirst(page);
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(await yt<string[]>(page, 'calls')).toContain('pause');
    await expect(page.getByTestId('play')).toBeVisible();
    expect(backend.events.some((e) => e.type === 'app_hidden')).toBe(true);
  });

  test('если автовоспроизведение запрещено — большая кнопка «играть»', async ({
    page,
    backend: _,
  }) => {
    await page.addInitScript(() => {
      (window as unknown as { __ytBlockAutoplay: boolean }).__ytBlockAutoplay = true;
    });
    await page.goto('/');
    await page.getByTestId('tile').first().click();
    await expect(page.getByTestId('play')).toBeVisible({ timeout: 3000 });
    await page.getByTestId('play').click();
    await expect(page.getByTestId('pause')).toBeVisible();
  });

  test('iPhone: кнопка не запустила видео — открывается центр плеера, касание запускает', async ({
    page,
    backend: _,
  }) => {
    await page.addInitScript(() => {
      (window as unknown as { __ytNeedsFrameTap: boolean }).__ytNeedsFrameTap = true;
    });
    await page.goto('/');
    await page.getByTestId('tile').first().click();
    await page.getByTestId('play').click({ timeout: 4000 });
    await expect(page.getByTestId('tap-video')).toBeVisible({ timeout: 4000 });
    // Края закрыты: касание у верхнего края до YouTube не доходит, в центре — доходит.
    const box = (await page.getByTestId('player').boundingBox())!;
    await page.mouse.click(box.x + box.width / 2, box.y + 30);
    expect(
      await page.evaluate(() => (window as unknown as { __iframeHits: number }).__iframeHits),
    ).toBe(0);
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await expect(page.getByTestId('pause')).toBeVisible();
    await expect(page.getByTestId('tap-video')).toHaveCount(0);
  });

  test('видео недоступно: событие с кодом ошибки и переход к следующему', async ({
    page,
    backend,
  }) => {
    await startFirst(page);
    await page.evaluate(() =>
      (window as unknown as { __yt: { fail(c: number): void } }).__yt.fail(150),
    );
    await expect
      .poll(() => backend.events.find((e) => e.type === 'segment_error')?.payload?.code)
      .toBe(150);
    await expect.poll(() => yt<string>(page, 'opts.videoId')).toBe('bbbbbbbbbbb');
  });

  test('два видео подряд не открылись — полчаса без видео, совёнок зовёт поиграть (этап 34)', async ({
    page,
    backend,
  }) => {
    await startFirst(page);
    const fail = () =>
      page.evaluate(() =>
        (window as unknown as { __yt: { fail(c: number): void } }).__yt.fail(150),
      );
    await fail();
    await expect.poll(() => yt<string>(page, 'opts.videoId')).toBe('bbbbbbbbbbb');
    await fail();
    // В тестовом списке почти одни видео — без них меню может оказаться пустым.
    await expect(page.getByTestId('home').or(page.getByTestId('empty'))).toBeVisible();
    await expect
      .poll(async () => (await spoken(page)).map((s) => s.text))
      .toContain('Видео сейчас отдыхают. Давай поиграем в игры или посмотрим карточки!');
    // Видео пропали из меню; после перезагрузки — тоже (пауза помнится).
    const tiles = page.locator('[data-testid=tile][data-kind=segment]');
    await expect(tiles).toHaveCount(0);
    expect(backend.events.filter((e) => e.type === 'segment_error')).toHaveLength(2);
    await page.reload();
    await expect(page.getByTestId('home').or(page.getByTestId('empty'))).toBeVisible();
    await expect(tiles).toHaveCount(0);
  });

  test('пройденное отдыхает (этап 34): в конце, бледное; нечем проверить — не открывается', async ({
    page,
    backend,
  }) => {
    backend.items = backend.items.map((it, i) => (i === 0 ? { ...it, rest: 'today' } : it));
    await page.goto('/');
    const tiles = page.getByTestId('tile');
    await expect(tiles.last()).toHaveAttribute('data-rest', 'today');
    await expect(tiles.first()).not.toHaveAttribute('data-rest', /.+/);
    await shot(page, 'rest');
    await tiles.last().click();
    await expect
      .poll(async () => (await spoken(page)).map((s) => s.text))
      .toContain('Это уже пройдено сегодня! Выбери что-нибудь новое.');
    await expect(page.getByTestId('pause')).toHaveCount(0);

    // Всё пройдено — повторять можно (без тупика).
    backend.items = backend.items.map((it) => ({ ...it, rest: 'learned' }));
    await page.reload();
    await expect(tiles.first()).not.toHaveAttribute('data-rest', /.+/);
    await tiles.first().click();
    await expect(page.getByTestId('pause')).toBeVisible();
  });

  test('свободный режим (этап 38): любимое видео — в конце, редкое — вперёд', async ({
    page,
    backend,
  }) => {
    // Первое видео смотрели чаще всех — уходит в конец; остальные — в прежнем порядке.
    backend.items = backend.items.map((it, i) => ({ ...it, plays: i === 0 ? 7 : 0 }));
    await page.goto('/');
    const videos = page.locator('[data-testid=tile][data-kind=segment] img');
    await expect(videos.last()).toHaveAttribute('src', SEGMENTS[0]!.thumbnailUrl!);
    await expect(videos.first()).not.toHaveAttribute('src', SEGMENTS[0]!.thumbnailUrl!);
    await expect(page.locator('[data-rest]')).toHaveCount(0);
  });

  test('кнопка «домой» уничтожает плеер и пишет событие выхода', async ({ page, backend }) => {
    await startFirst(page);
    await page.getByTestId('go-home').click();
    await expect(page.getByTestId('tile').first()).toBeVisible();
    await expect(page.locator('iframe')).toHaveCount(0);
    expect(backend.events.at(-1)).toMatchObject({
      type: 'segment_exit',
      segmentId: SEGMENTS[0]!.id,
    });
  });
});

test('в киоске альбомная ориентация — только пока открыто видео', async ({ page, backend: _ }) => {
  await page.addInitScript(() => {
    const calls: boolean[] = [];
    (window as unknown as { __orientation: boolean[] }).__orientation = calls;
    (window as unknown as { Capacitor: unknown }).Capacitor = {
      Plugins: {
        Kiosk: {
          openSettings: async () => {},
          setOrientation: async ({ landscape }: { landscape: boolean }) => {
            calls.push(landscape);
          },
        },
      },
    };
  });
  const calls = () =>
    page.evaluate(() => (window as unknown as { __orientation: boolean[] }).__orientation);
  await startFirst(page);
  expect(await calls()).toEqual([true]);
  await page.getByTestId('go-home').click();
  await expect(page.getByTestId('tile').first()).toBeVisible();
  expect((await calls()).at(-1)).toBe(false);
});

// ─── Этап 2: квиз и карточки ─────────────────────────────────────────────────

const question = (id: string, n = 4) => ({
  id,
  prompt: { text: `Вопрос ${id}`, lang: 'ru', audioUrl: null },
  options: Array.from({ length: n }, (_, i) => ({
    id: `${id}-o${i}`,
    imageUrl: `/api/media/img-${id}-${i}`,
    isCorrect: i === 0,
  })),
  answer: [{ text: `Ответ ${id}.`, lang: 'ru', audioUrl: null }],
});

const withQuiz = (backend: Backend, options: number, questions: number) => {
  backend.quiz = { options, questions };
  backend.items = [
    {
      ...SEGMENTS[0]!,
      kind: 'segment',
      questions: [question('q1'), question('q2'), question('q3')],
    },
    { ...SEGMENTS[1]!, kind: 'segment', questions: [] },
  ];
};

/** Досматривает текущий фрагмент до конца. */
async function finishVideo(page: Page) {
  await expect(page.getByTestId('pause')).toBeVisible();
  await page.evaluate(() => (window as unknown as { __yt: { set(s: number): void } }).__yt.set(0));
}

const correct = (page: Page) => page.locator('[data-testid=quiz-option][data-correct="1"]');
const wrong = (page: Page) => page.locator('[data-testid=quiz-option][data-correct="0"]');
const answering = (page: Page) =>
  expect(page.getByTestId('quiz-round')).toHaveAttribute('data-phase', 'answering', {
    timeout: 4000,
  });

test.describe('цикл видео → квиз → видео', () => {
  test('после видео — квиз; после N верных ответов — следующее видео', async ({
    page,
    backend,
  }) => {
    withQuiz(backend, 4, 2);
    await page.goto('/');
    await page.getByTestId('tile').first().click();
    await finishVideo(page);

    await expect(page.getByTestId('quiz')).toBeVisible();
    await expect(page.getByTestId('quiz-option')).toHaveCount(4);

    for (let i = 0; i < 2; i++) {
      await answering(page);
      await correct(page).dispatchEvent('pointerdown');
      await expect(page.getByTestId('quiz-round')).toHaveAttribute('data-phase', /correct|asking/);
    }
    await expect(page.getByTestId('quiz-done')).toBeVisible();
    // Следующее видео списка.
    await expect
      .poll(() => yt<string>(page, 'opts.videoId'), { timeout: 6000 })
      .toBe('bbbbbbbbbbb');

    const answers = backend.events.filter((e) => e.type === 'quiz_answer');
    expect(answers).toHaveLength(2);
    expect(answers[0]!.payload).toMatchObject({ firstTry: true, attempts: 1 });
    expect(backend.events.some((e) => e.type === 'quiz_complete')).toBe(true);
    // Этап 39: за похвалой совёнок договаривает ответ — после каждого верного.
    const said = (await spoken(page)).map((s) => s.text);
    expect(said.filter((t) => /^Ответ q\d\.$/.test(t))).toHaveLength(2);
  });

  test('малышу — 2 крупных варианта, каждый не меньше четверти экрана', async ({
    page,
    backend,
  }) => {
    withQuiz(backend, 2, 1);
    await page.goto('/');
    await page.getByTestId('tile').first().click();
    await finishVideo(page);
    await expect(page.getByTestId('quiz-option')).toHaveCount(2);
    await expect(correct(page)).toHaveCount(1);

    const viewport = page.viewportSize()!;
    for (const box of await Promise.all(
      (await page.getByTestId('quiz-option').all()).map((o) => o.boundingBox()),
    )) {
      expect(box!.width * box!.height).toBeGreaterThan(
        ((viewport.width * viewport.height) / 4) * 0.8,
      );
    }
  });

  test('пока звучит вопрос, касания не принимаются', async ({ page, backend }) => {
    withQuiz(backend, 4, 2);
    await page.goto('/');
    await page.getByTestId('tile').first().click();
    await finishVideo(page);
    await expect(page.getByTestId('quiz-round')).toHaveAttribute('data-phase', 'asking');
    await correct(page).dispatchEvent('pointerdown');
    await expect(page.getByTestId('quiz-round')).toHaveAttribute('data-phase', 'answering');
    expect(backend.events.filter((e) => e.type === 'quiz_answer')).toHaveLength(0);
  });

  test('неверный ответ гаснет, ребёнок пробует снова; попытки считаются', async ({
    page,
    backend,
  }) => {
    withQuiz(backend, 4, 1);
    await page.goto('/');
    await page.getByTestId('tile').first().click();
    await finishVideo(page);
    await answering(page);

    await wrong(page).first().dispatchEvent('pointerdown');
    await expect(wrong(page).first()).toHaveClass(/faded/);
    // После ошибки ответы на миг закрыты (этап 30).
    await expect(page.getByTestId('quiz-round')).toHaveAttribute('data-phase', 'wrong');
    await expect(page.getByTestId('quiz-round')).toHaveAttribute('data-phase', 'answering');
    await correct(page).dispatchEvent('pointerdown');

    await expect
      .poll(() => backend.events.find((e) => e.type === 'quiz_answer')?.payload)
      .toMatchObject({
        firstTry: false,
        attempts: 2,
      });
  });

  test('два неверных подряд в спешке — «не спеши», пауза и повтор вопроса', async ({
    page,
    backend,
  }) => {
    withQuiz(backend, 4, 1);
    await page.goto('/');
    await page.getByTestId('tile').first().click();
    await finishVideo(page);
    await answering(page);

    const [w1, w2] = await wrong(page).all();
    await w1!.dispatchEvent('pointerdown');
    await expect(page.getByTestId('quiz-round')).toHaveAttribute('data-phase', 'answering');
    await w2!.dispatchEvent('pointerdown');
    await expect(page.getByTestId('quiz-round')).toHaveAttribute('data-phase', 'paused');
    await expect(page.getByTestId('quiz-think')).toBeVisible();
    // После паузы вопрос звучит снова и ответы снова принимаются.
    await expect(page.getByTestId('quiz-round')).toHaveAttribute('data-phase', 'answering', {
      timeout: 8000,
    });
  });
});

test.describe('карточки', () => {
  test('листаются стрелкой, после последней — следующий пункт раздела', async ({
    page,
    backend,
  }) => {
    backend.items = [
      {
        kind: 'deck',
        id: '33333333-3333-4333-8333-333333333333',
        category: 'chinese',
        coverUrl: '/api/media/c1',
        cards: [1, 2].map((n) => ({
          id: `card-${n}`,
          imageUrl: `/api/media/c${n}`,
          word: { text: `слово ${n}`, lang: 'zh', audioUrl: null },
          translation: { text: `перевод ${n}`, lang: 'ru', audioUrl: null },
        })),
      },
      {
        kind: 'deck',
        id: '33333333-3333-4333-8333-333333333334',
        category: 'chinese',
        coverUrl: '/api/media/d1',
        cards: [
          {
            id: 'card-d1',
            imageUrl: '/api/media/d1',
            word: { text: '狗', lang: 'zh', audioUrl: null },
            translation: null,
            question: null,
          },
        ],
      },
    ];
    await page.goto('/');
    await expect(page.locator('[data-testid=tile][data-kind=deck]')).toHaveCount(2);
    await page.getByTestId('tile').first().click();

    await expect(page.getByTestId('deck')).toBeVisible();
    await expect(page.getByTestId('deck-card').locator('img')).toHaveAttribute(
      'data-src',
      '/api/media/c1',
    );
    await page.getByTestId('deck-next').click();
    await expect(page.getByTestId('deck-card').locator('img')).toHaveAttribute(
      'data-src',
      '/api/media/c2',
    );
    await page.getByTestId('deck-next').click();

    await expect(page.getByTestId('deck-card').locator('img')).toHaveAttribute(
      'data-src',
      '/api/media/d1',
    );
    expect(backend.events.some((e) => e.type === 'deck_complete')).toBe(true);
    // После последнего пункта раздела — снова пункты раздела.
    await page.getByTestId('deck-next').click();
    await expect(page.getByTestId('home')).toBeVisible();
  });
});

test('разделы: видео, английский, математика; внутри — только пункты раздела', async ({
  page,
  backend,
}) => {
  const deck = (id: string, category: string, img: string) => ({
    kind: 'deck',
    id,
    category,
    coverUrl: `/api/media/${img}`,
    cards: [
      {
        id: `card-${img}`,
        imageUrl: `/api/media/${img}`,
        word: { text: 'два плюс один — три', lang: 'ru', audioUrl: null },
        translation: null,
        question: { text: 'Покажи пример: два плюс один', lang: 'ru', audioUrl: null },
      },
    ],
  });
  backend.items = [
    deck('88888888-8888-4888-8888-888888888881', 'math', 'm1'),
    { ...SEGMENTS[0]!, kind: 'segment', questions: [] },
    deck('88888888-8888-4888-8888-888888888882', 'english', 'e1'),
    deck('88888888-8888-4888-8888-888888888883', 'math', 'm2'),
  ];
  await page.goto('/');
  const categories = page.getByTestId('category');
  await expect(categories).toHaveCount(3);
  expect(await categories.evaluateAll((els) => els.map((e) => e.dataset.category))).toEqual([
    'video',
    'english',
    'math',
  ]);

  await page.locator('[data-category=math]').click();
  await expect(page.getByTestId('tile')).toHaveCount(2);
  await page.getByTestId('tile').nth(1).click();
  await expect(page.getByTestId('deck-card').locator('img')).toHaveAttribute(
    'data-src',
    '/api/media/m2',
  );
  // «Домой» из набора — к пунктам раздела, оттуда — к разделам.
  await page.getByTestId('go-home').click();
  await expect(page.getByTestId('tile')).toHaveCount(2);
  await page.getByTestId('to-categories').click();
  await expect(page.getByTestId('categories')).toBeVisible();
});

test.describe('озвучка голосом телефона', () => {
  test('вопрос и похвала произносятся по-русски, медленно', async ({ page, backend }) => {
    withQuiz(backend, 2, 1);
    await page.goto('/');
    await page.getByTestId('tile').first().click();
    await finishVideo(page);
    await answering(page);
    await correct(page).dispatchEvent('pointerdown');
    await expect(page.getByTestId('quiz-done')).toBeVisible();

    const said = await spoken(page);
    expect(said[0]!.lang).toBe('ru-RU');
    expect(said[0]!.rate).toBeCloseTo(0.85); // браузер хранит rate как float32
    expect(said[0]!.text).toMatch(/^Вопрос q/);
    expect(said.map((s) => s.text)).toContain('Молодец!');
    await expect.poll(async () => (await spoken(page)).map((s) => s.text)).toContain('Отлично!');
  });

  test('карточка: слово на языке набора, затем перевод по-русски', async ({ page, backend }) => {
    backend.items = [
      {
        kind: 'deck',
        id: '44444444-4444-4444-8444-444444444444',
        category: 'chinese',
        coverUrl: '/api/media/c1',
        cards: [
          {
            id: 'c1',
            imageUrl: '/api/media/c1',
            word: { text: '猫', lang: 'zh', audioUrl: null },
            translation: { text: 'кошка', lang: 'ru', audioUrl: null },
          },
        ],
      },
    ];
    await page.goto('/');
    await page.getByTestId('tile').first().click();
    await expect
      .poll(async () => (await spoken(page)).map((s) => `${s.lang}:${s.text}:${s.voice}`))
      .toEqual(['zh-CN:猫:Google 中文', 'ru-RU:кошка:Samsung русский']);
  });
});

test('английская карточка: слово английским голосом, перевод — русским', async ({
  page,
  backend,
}) => {
  backend.items = [
    {
      kind: 'deck',
      id: '55555555-5555-4555-8555-555555555555',
      category: 'english',
      coverUrl: '/api/media/c1',
      cards: [
        {
          id: 'c1',
          imageUrl: '/api/media/c1',
          word: { text: 'cat', lang: 'en', audioUrl: null },
          translation: { text: 'кошка', lang: 'ru', audioUrl: null },
        },
      ],
    },
  ];
  await page.goto('/');
  await page.getByTestId('tile').first().click();
  // Голоса появляются с задержкой — озвучка ждёт их и задаёт голос явно.
  await expect
    .poll(async () => (await spoken(page)).map((s) => `${s.text}:${s.voice}`))
    .toEqual(['cat:Samsung English', 'кошка:Samsung русский']);
});

test('телефон сообщает родителю языки своих голосов (только коды)', async ({ page, backend }) => {
  await page.goto('/');
  await expect(page.getByTestId('home')).toBeVisible();
  await expect.poll(() => backend.voices).toEqual(['en', 'ru', 'zh']);
});

test.describe('карточки: проверки и стрелки', () => {
  const deckOf = (n: number) => ({
    kind: 'deck',
    id: '66666666-6666-4666-8666-666666666666',
    category: 'english',
    coverUrl: '/api/media/k0',
    cards: Array.from({ length: n }, (_, i) => ({
      id: `k${i}`,
      imageUrl: `/api/media/k${i}`,
      word: { text: `word${i}`, lang: 'en', audioUrl: null },
      translation: null,
    })),
  });

  test('после 5 карточек — проверка «Где …?», потом карточки продолжаются', async ({
    page,
    backend,
  }) => {
    backend.items = [deckOf(6)];
    await page.goto('/');
    await page.getByTestId('tile').first().click();
    for (let i = 0; i < 5; i++) await page.getByTestId('deck-next').click();

    // Проверка: 2 вопроса по первым пяти карточкам, варианты — картинки набора.
    await expect(page.getByTestId('quiz')).toBeVisible();
    for (let i = 0; i < 2; i++) {
      await answering(page);
      const src = await correct(page).locator('img').getAttribute('data-src');
      expect(['k0', 'k1', 'k2', 'k3', 'k4'].map((k) => `/api/media/${k}`)).toContain(src);
      await correct(page).dispatchEvent('pointerdown');
      await expect(page.getByTestId('quiz-round')).toHaveAttribute('data-phase', /correct|asking/);
    }
    // Шестая карточка, затем — следующий пункт списка (хвост из 1 карточки — без проверки).
    await expect(page.getByTestId('deck-card').locator('img')).toHaveAttribute(
      'data-src',
      '/api/media/k5',
      { timeout: 6000 },
    );
    await page.getByTestId('deck-next').click();
    await expect(page.getByTestId('home')).toBeVisible();

    const answers = backend.events.filter((e) => e.type === 'quiz_answer');
    expect(answers).toHaveLength(2);
    expect(answers[0]).toMatchObject({ deckId: '66666666-6666-4666-8666-666666666666' });
    expect(answers[0]!.payload).toMatchObject({ cardId: expect.stringMatching(/^k[0-4]$/) });

    const said = (await spoken(page)).map((s) => `${s.lang}:${s.text}`);
    expect(said).toContain('ru-RU:Покажи');
  });

  test('частые касания не обрывают слово: пока звучит — карточка и стрелки ждут', async ({
    page,
    backend,
  }) => {
    // Слово звучит 2,5 с — все касания успевают попасть в него и под нагрузкой (700 мс не хватало).
    await page.addInitScript(
      () => ((window as unknown as { __speechMs: number }).__speechMs = 2500),
    );
    backend.items = [deckOf(3)];
    await page.goto('/');
    await page.getByTestId('tile').first().click();
    const deck = page.getByTestId('deck');
    await expect(deck).toHaveAttribute('data-speaking', 'true');
    // Ребёнок жмёт «дальше» и картинку без остановки — слово не прерывается, карточка та же.
    for (let i = 0; i < 4; i++) {
      await page.getByTestId('deck-next').dispatchEvent('click');
      await page.getByTestId('deck-card').dispatchEvent('click');
    }
    await expect(page.getByTestId('deck-card').locator('img')).toHaveAttribute(
      'data-src',
      '/api/media/k0',
    );
    const words = async () =>
      (await spoken(page)).filter((s) => /^word/.test(s.text)).map((s) => s.text);
    expect(await words()).toEqual(['word0']);
    // Договорил — стрелка снова работает (click ждёт, пока кнопка оживёт).
    await page.getByTestId('deck-next').click();
    await expect(page.getByTestId('deck-card').locator('img')).toHaveAttribute(
      'data-src',
      '/api/media/k1',
    );
    await expect.poll(words).toEqual(['word0', 'word1']);
  });

  test('стрелки не перекрывают картинку (портрет — внизу, альбом — по бокам)', async ({
    page,
    backend,
  }) => {
    backend.items = [deckOf(3)];
    await page.goto('/');
    await page.getByTestId('tile').first().click();
    await page.getByTestId('deck-next').click();
    const card = (await page.getByTestId('deck-card').boundingBox())!;
    for (const id of ['deck-prev', 'deck-next']) {
      const a = (await page.getByTestId(id).boundingBox())!;
      const overlaps =
        a.x < card.x + card.width &&
        a.x + a.width > card.x &&
        a.y < card.y + card.height &&
        a.y + a.height > card.y;
      expect(overlaps).toBe(false);
    }
    // Картинка занимает больше половины экрана по каждой стороне.
    const vp = page.viewportSize()!;
    expect(card.height).toBeGreaterThan(vp.height * 0.5);
    expect(card.width).toBeGreaterThan(vp.width * 0.5);
  });
});

test('погружение: без перевода, проверка и похвала — по-английски', async ({ page, backend }) => {
  backend.immersion = true;
  backend.items = [
    {
      kind: 'deck',
      id: '77777777-7777-4777-8777-777777777777',
      category: 'english',
      coverUrl: '/api/media/v0',
      cards: Array.from({ length: 5 }, (_, i) => ({
        id: `v${i}`,
        imageUrl: `/api/media/v${i}`,
        word: { text: `verb${i}`, lang: 'en', audioUrl: null },
        translation: { text: `глагол${i}`, lang: 'ru', audioUrl: null },
      })),
    },
  ];
  await page.goto('/');
  await page.getByTestId('tile').first().click();
  for (let i = 0; i < 5; i++) await page.getByTestId('deck-next').click();
  await answering(page);
  await correct(page).dispatchEvent('pointerdown');
  await expect.poll(async () => (await spoken(page)).map((s) => s.text)).toContain('Great job!');
  const said = await spoken(page);
  expect(said.some((s) => s.lang === 'ru-RU')).toBe(false);
  expect(said.map((s) => `${s.lang}:${s.text}`)).toContain('en-US:Show me');
});

// ─── Игры ────────────────────────────────────────────────────────────────────

const EMOJI: Record<string, string> = {};
/** id картинки для игры; сама картинка — SVG с эмодзи (вместо twemoji с сервера). */
const img = (n: number, emoji: string) => {
  const id = `e0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  EMOJI[id] = emoji;
  return id;
};
const CARROT = img(1, '🥕');
const BANANA = img(2, '🍌');
const RABBIT = img(3, '🐰');
const MONKEY = img(4, '🐵');
const CAT = img(5, '🐱');
const LION = img(6, '🦁');

async function gameMedia(page: Page) {
  await page.route('**/api/media/**', (r) => {
    const id = new URL(r.request().url()).pathname.split('/').pop()!;
    const e = EMOJI[id] ?? '⭐';
    return r.fulfill({
      contentType: 'image/svg+xml',
      body: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text x="50" y="55" font-size="80" text-anchor="middle" dominant-baseline="middle">${e}</text></svg>`,
    });
  });
}

const game = (id: number, spec: object, category = 'games') => ({
  kind: 'interactive',
  id: `9a000000-0000-4000-8000-${String(id).padStart(12, '0')}`,
  category,
  spec,
});

/** Скриншот для ручной проверки вида (только если задан SHOTS — папка). */
async function shot(page: Page, name: string) {
  if (!process.env.SHOTS) return;
  await page.screenshot({ path: `${process.env.SHOTS}/${name}-${test.info().project.name}.png` });
}

/** «Найди пару»: открыть все пары по порядку (карточки перемешаны — пара в data-pair). */
async function solveMemory(page: Page) {
  const cards = page.getByTestId('memory-card');
  const pairs = await cards.evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.pair));
  for (const p of new Set(pairs)) {
    const [i, j] = pairs.flatMap((x, k) => (x === p ? [k] : []));
    await cards.nth(i!).click();
    await cards.nth(j!).click();
  }
}

async function openGame(page: Page) {
  await gameMedia(page);
  await page.goto('/');
  await page.getByTestId('tile').first().click();
  await expect(page.getByTestId('game')).toBeVisible();
  // Экран появляется с анимацией — ждём, пока встанет на место (координаты для перетаскивания).
  await page.waitForTimeout(400);
}

/** Перетащить мышью из точки в точку. */
async function dragTo(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 4 });
  await page.mouse.move(to.x, to.y, { steps: 4 });
  await page.mouse.up();
}

const xy = (p: { x: number; y: number }) => [p.x, p.y] as const;

const center = async (locator: ReturnType<Page['locator']>) => {
  const b = (await locator.boundingBox())!;
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
};

/** Автопилот «Смешай краски»: где тюбики, сколько капель, капнуть и дождаться капли в баночке. */
class PaintsPilot {
  constructor(private page: Page) {}
  private get g() {
    return this.page.getByTestId('game-paints');
  }
  async read<T>(attr: string) {
    return JSON.parse((await this.g.getAttribute(attr)) ?? 'null') as T;
  }
  tubes() {
    return this.read<{ tube: string; x: number; y: number }[]>('data-tubes');
  }
  async drip(tube: string) {
    await expect(this.g).toHaveAttribute('data-flying', '0');
    const before = (await this.read<Record<string, number>>('data-drops'))[tube] ?? 0;
    const t = (await this.tubes()).find((x) => x.tube === tube)!;
    await this.page.mouse.click(t.x, t.y);
    await expect
      .poll(async () => (await this.read<Record<string, number>>('data-drops'))[tube])
      .toBe(before + 1);
  }
}

/** Автопилот «Поезда»: где зверята, вагоны и запасные вагоны (px от угла игры), отвести к вагону. */
class TrainPilot {
  constructor(private page: Page) {}
  private get g() {
    return this.page.getByTestId('game-train');
  }
  async read<T>(attr: string) {
    return JSON.parse((await this.g.getAttribute(attr)) ?? 'null') as T;
  }
  /** Поезд встал у станции: ждём фазу и что он больше не едет. */
  async stopped(phase: 'board' | 'fix') {
    await expect(this.g).toHaveAttribute('data-phase', phase, { timeout: 25_000 });
    await expect(this.g).toHaveAttribute('data-moving', '0');
  }
  private async at(p: { x: number; y: number }) {
    const b = (await this.g.boundingBox())!;
    return { x: b.x + p.x, y: b.y + p.y };
  }
  passengers() {
    return this.read<{ ticket: number; x: number; y: number; seated: boolean }[]>(
      'data-passengers',
    );
  }
  wagons() {
    return this.read<{ n: number; x: number; y: number; filled: boolean }[]>('data-wagons');
  }
  async seated(ticket: number) {
    return (await this.passengers()).find((x) => x.ticket === ticket)!.seated;
  }
  /** Отвести зверька с билетом ticket к вагону wagon (по умолчанию — к своему). */
  async seat(ticket: number, wagon = ticket) {
    const p = (await this.passengers()).find((x) => x.ticket === ticket && !x.seated)!;
    const w = (await this.wagons()).find((x) => x.n === wagon)!;
    await dragTo(this.page, await this.at(p), await this.at(w));
  }
  /** Поставить запасной вагон n в дырку. */
  async fill(n: number) {
    const spare = await this.read<{ n: number; x: number; y: number }[]>('data-spare');
    const gap = (await this.read<{ x: number; y: number; need: number }>('data-gap'))!;
    await dragTo(this.page, await this.at(spare.find((x) => x.n === n)!), await this.at(gap));
  }
}

/** Автопилот «Весов»: где чаши и гирьки на прилавке (px от угла игры), сколько на чашах. */
class ScalesPilot {
  constructor(private page: Page) {}
  private get g() {
    return this.page.getByTestId('game-scales');
  }
  async read<T>(attr: string) {
    return JSON.parse((await this.g.getAttribute(attr)) ?? 'null') as T;
  }
  /** Задание готово: грузы легли, ничего не летит, касания открыты. */
  async ready() {
    await expect(this.g).toHaveAttribute('data-phase', 'play', { timeout: 25_000 });
    await expect(this.g).toHaveAttribute('data-busy', '0', { timeout: 8000 });
    await expect(this.page.getByTestId('game')).toHaveAttribute('data-lock', 'none', {
      timeout: 8000,
    });
  }
  private async at(p: { x: number; y: number }) {
    const b = (await this.g.boundingBox())!;
    return { x: b.x + p.x, y: b.y + p.y };
  }
  pans() {
    return this.read<{ x: number; y: number; total: number }[]>('data-pans');
  }
  tray() {
    return this.read<{ v: number; x: number; y: number; used: boolean }[]>('data-tray');
  }
  async right() {
    return Number(await this.g.getAttribute('data-right'));
  }
  async puts() {
    return Number(await this.g.getAttribute('data-puts'));
  }
  async tapPan(side: 0 | 1) {
    const p = await this.at((await this.pans())[side]!);
    await this.page.mouse.click(p.x, p.y);
  }
  /**
   * Гирьку v — на пустую чашу: нажатием или перетаскиванием; wait — ждём, пока ляжет. Ждём по
   * счётчику положенного: чаша после верного ответа опустеет раньше, чем тест успеет её прочитать.
   */
  async put(v: number, drag = false, wait = true) {
    const before = await this.puts();
    const piece = (await this.tray()).find((x) => x.v === v && !x.used)!;
    const from = await this.at(piece);
    if (drag) await dragTo(this.page, from, await this.at((await this.pans())[1]!));
    else await this.page.mouse.click(from.x, from.y);
    if (wait) await expect.poll(() => this.puts()).toBe(before + 1);
  }
}

/** Автопилот «Шестерёнок»: где гвоздики, шестерёнки в ящике, ручка и стрелки (px от угла игры). */
class GearsPilot {
  constructor(private page: Page) {}
  private get g() {
    return this.page.getByTestId('game-gears');
  }
  async read<T>(attr: string) {
    return JSON.parse((await this.g.getAttribute(attr)) ?? 'null') as T;
  }
  /** Задание готово: шестерёнки на местах, ничего не летит, касания открыты. */
  async ready() {
    await expect(this.g).toHaveAttribute('data-phase', 'play', { timeout: 25_000 });
    await expect(this.g).toHaveAttribute('data-busy', '0', { timeout: 8000 });
    await expect(this.page.getByTestId('game')).toHaveAttribute('data-lock', 'none', {
      timeout: 8000,
    });
  }
  private async at(p: { x: number; y: number }) {
    const b = (await this.g.boundingBox())!;
    return { x: b.x + p.x, y: b.y + p.y };
  }
  pegs() {
    return this.read<{ i: number; x: number; y: number; need: number; filled: boolean }[]>(
      'data-pegs',
    );
  }
  tray() {
    return this.read<{ teeth: number; x: number; y: number; used: boolean }[]>('data-tray');
  }
  async places() {
    return Number(await this.g.getAttribute('data-places'));
  }
  async turns() {
    return Number(await this.g.getAttribute('data-turns'));
  }
  /** Первый пустой гвоздик — шестерёнки летят на него по нажатию. */
  async firstPeg() {
    return (await this.pegs()).find((p) => !p.filled)!;
  }
  /** Шестерёнку teeth — на первый пустой гвоздик нажатием или на гвоздик peg перетаскиванием. */
  async put(teeth: number, drag?: { x: number; y: number }) {
    const piece = (await this.tray()).find((x) => x.teeth === teeth && !x.used)!;
    const from = await this.at(piece);
    if (drag) await dragTo(this.page, from, await this.at(drag));
    else await this.page.mouse.click(from.x, from.y);
  }
  /** Нажать на ручку, не крутя, — толчок. */
  async push() {
    const d = await this.read<{ x: number; y: number; r: number }>('data-driver');
    const p = await this.at({ x: d.x, y: d.y + d.r * 0.5 });
    await this.page.mouse.click(p.x, p.y);
  }
  /** Покрутить ручку пальцем: turns оборотов по часовой стрелке (или против). */
  async crank(turns: number, dir: 1 | -1 = 1) {
    const d = await this.read<{ x: number; y: number; r: number }>('data-driver');
    const c = await this.at(d);
    const r = d.r * 0.7;
    const steps = Math.round(turns * 28);
    await this.page.mouse.move(c.x + r, c.y);
    await this.page.mouse.down();
    for (let k = 1; k <= steps; k++) {
      const a = (dir * k * 2 * Math.PI) / 28;
      await this.page.mouse.move(c.x + Math.cos(a) * r, c.y + Math.sin(a) * r);
    }
    await this.page.mouse.up();
  }
  async tapArrow(dir: 1 | -1) {
    const b = (await this.read<{ dir: number; x: number; y: number }[]>('data-buttons')).find(
      (x) => x.dir === dir,
    )!;
    const p = await this.at(b);
    await this.page.mouse.click(p.x, p.y);
  }
}

/** Автопилот «Одень мишку»: что в шкафу и на мишке, надеть вещь, снять лишнюю. */
class DressPilot {
  constructor(private page: Page) {}
  private get g() {
    return this.page.getByTestId('game-dress');
  }
  async read<T>(attr: string) {
    return JSON.parse((await this.g.getAttribute(attr)) ?? 'null') as T;
  }
  /** Можно трогать: вещи в шкафу, ничего не летит, мишка не мотает головой. */
  async ready() {
    await expect(this.g).toHaveAttribute('data-phase', 'play', { timeout: 25_000 });
    await expect(this.g).toHaveAttribute('data-busy', '0', { timeout: 8000 });
    await expect(this.page.getByTestId('game')).toHaveAttribute('data-lock', 'none', {
      timeout: 8000,
    });
  }
  private async at(p: { x: number; y: number }) {
    const b = (await this.g.boundingBox())!;
    return { x: b.x + p.x, y: b.y + p.y };
  }
  tray() {
    return this.read<{ id: string; x: number; y: number; ready: boolean }[]>('data-tray');
  }
  worn() {
    return this.read<{ id: string; x: number; y: number }[]>('data-worn');
  }
  need() {
    return this.read<string[]>('data-need');
  }
  async count(attr: 'data-puts' | 'data-removed' | 'data-misses') {
    return Number(await this.g.getAttribute(attr));
  }
  /** Вещь из шкафа — на мишку: нажатием или перетаскиванием. */
  async take(id: string, drag = false) {
    const piece = (await this.tray()).find((x) => x.id === id && x.ready)!;
    const from = await this.at(piece);
    if (drag) await dragTo(this.page, from, await this.at(await this.read('data-bear')));
    else await this.page.mouse.click(from.x, from.y);
  }
  /** «Что не так?»: нажать на вещь на мишке. */
  async tapWorn(id: string) {
    const p = await this.at((await this.worn()).find((x) => x.id === id)!);
    await this.page.mouse.click(p.x, p.y);
  }
  /** Надеть всё, что нужно (через одну — перетаскиванием), без ошибок. */
  async dressAll() {
    let k = 0;
    for (let id = (await this.need())[0]; id; id = (await this.need())[0]) {
      const puts = await this.count('data-puts');
      await this.take(id, k++ % 2 === 1);
      await expect.poll(() => this.count('data-puts')).toBe(puts + 1);
      if ((await this.need()).length) await this.ready();
    }
  }
}

interface FigureTrayPiece {
  n: number;
  type: string;
  x: number;
  y: number;
  ready: boolean;
  taps: number;
  tx: number;
  ty: number;
}
/** Автопилот «Сложи фигуру»: что в лотке и куда, повернуть нажатием, перетащить на место. */
class FigurePilot {
  constructor(private page: Page) {}
  private get g() {
    return this.page.getByTestId('game-figure');
  }
  async read<T>(attr: string) {
    return JSON.parse((await this.g.getAttribute(attr)) ?? 'null') as T;
  }
  /** Можно трогать: детали в лотке, ничего не летит и не качается, голос не держит. */
  async ready() {
    await expect(this.g).toHaveAttribute('data-phase', 'play', { timeout: 25_000 });
    await expect(this.g).toHaveAttribute('data-busy', '0', { timeout: 8000 });
    await expect(this.page.getByTestId('game')).toHaveAttribute('data-lock', 'none', {
      timeout: 8000,
    });
  }
  private async at(p: { x: number; y: number }) {
    const b = (await this.g.boundingBox())!;
    return { x: b.x + p.x, y: b.y + p.y };
  }
  async tray() {
    return (await this.read<FigureTrayPiece[]>('data-tray')).filter((t) => t.ready);
  }
  slots() {
    return this.read<{ j: number; type: string; x: number; y: number }[]>('data-slots');
  }
  async count(attr: 'data-snaps' | 'data-turns' | 'data-almost' | 'data-misses' | 'data-lift') {
    return Number(await this.g.getAttribute(attr));
  }
  /** Нажать на деталь в лотке. */
  async tap(n: number) {
    const t = (await this.tray()).find((x) => x.n === n)!;
    const p = await this.at(t);
    await this.page.mouse.click(p.x, p.y);
  }
  /** Перетащить деталь так, чтобы её середина встала в точку (палец — чуть ниже детали). */
  async drag(n: number, to: { x: number; y: number }) {
    const t = (await this.tray()).find((x) => x.n === n)!;
    const lift = await this.count('data-lift');
    await dragTo(this.page, await this.at(t), await this.at({ x: to.x, y: to.y + lift }));
  }
  /** Деталь — на её место: повернуть сколько нужно, перетащить, дождаться щелчка. */
  async place(n: number) {
    const snaps = await this.count('data-snaps');
    const taps = (await this.tray()).find((x) => x.n === n)!.taps;
    for (let i = 0; i < taps; i++) await this.tap(n);
    if (taps)
      await expect.poll(async () => (await this.tray()).find((x) => x.n === n)!.taps).toBe(0);
    const t = (await this.tray()).find((x) => x.n === n)!;
    await this.drag(n, { x: t.tx, y: t.ty });
    await expect.poll(() => this.count('data-snaps')).toBe(snaps + 1);
  }
  /** Собрать всё, что в лотке. */
  async build() {
    for (let t = (await this.tray())[0]; t; t = (await this.tray())[0]) {
      await this.place(t.n);
      if ((await this.g.getAttribute('data-phase')) !== 'play') return;
      await this.ready();
    }
  }
}

async function expectFinished(page: Page, backend: Backend) {
  await expect(page.getByTestId('game-finished')).toBeVisible({ timeout: 6000 });
  await expect
    .poll(() => backend.events.filter((e) => e.type === 'interactive_complete').length)
    .toBe(1);
}

test.describe('игры', () => {
  test('раздел «Игры» на главном экране', async ({ page, backend }) => {
    backend.items = [
      { ...SEGMENTS[0]!, kind: 'segment', questions: [] },
      game(1, { kind: 'coloring', picture: 'house', tasks: false }),
      game(2, { kind: 'memory', imageIds: [CAT, LION] }),
      game(3, { kind: 'tracing', shapes: ['5'] }),
      game(4, { kind: 'puzzle', imageIds: [LION], cols: 2, rows: 2 }),
    ];
    await gameMedia(page);
    await page.goto('/');
    await page.locator('[data-category=games]').click();
    await expect(page.getByTestId('tile')).toHaveCount(4);
    await shot(page, 'games-home');
  });

  test('раскраска с заданиями: «раскрась … цветом», не тот цвет — подсказка', async ({
    page,
    backend,
  }) => {
    backend.items = [game(1, { kind: 'coloring', picture: 'house', tasks: true })];
    await openGame(page);
    const { PICTURES } = await import('../src/games/pictures');
    const regions = PICTURES.house.regions;
    // Не тот цвет — область не закрашивается.
    await page.locator('[data-paint=black]').click();
    await page.locator(`[data-region=${regions[0]!.id}] path`).first().dispatchEvent('pointerdown');
    await expect(page.locator(`[data-region=${regions[0]!.id}]`)).toHaveAttribute('fill', '#fff');
    await shot(page, 'coloring');
    for (const r of regions) {
      await page.locator(`[data-paint=${r.target}]`).click();
      await page.locator(`[data-region=${r.id}] path`).first().dispatchEvent('pointerdown');
    }
    await expectFinished(page, backend);
    const said = (await spoken(page)).map((s) => s.text);
    expect(said).toContain('Раскрась небо голубым.');
    expect(said).toContain('Нужен голубой цвет.');
  });

  test('разложи по местам: перетаскивание, не туда — предмет возвращается', async ({
    page,
    backend,
  }) => {
    backend.items = [
      game(1, {
        kind: 'sorting',
        prompt: 'Покорми зверей',
        bins: [
          { imageId: RABBIT, name: 'зайчик' },
          { imageId: MONKEY, name: 'обезьянка' },
        ],
        items: [
          { imageId: CARROT, bin: 0 },
          { imageId: BANANA, bin: 1 },
          { imageId: CARROT, bin: 0 },
        ],
      }),
    ];
    await openGame(page);
    await shot(page, 'sorting');
    const bins = page.getByTestId('bin');
    const items = page.getByTestId('item');
    // Морковку — обезьянке: неверно, предмет остаётся.
    const carrot = items.filter({ has: page.locator(`img[data-src$="${CARROT}"]`) }).first();
    await dragTo(page, await center(carrot), await center(bins.nth(1)));
    await expect(items).toHaveCount(3);
    await page.waitForTimeout(400); // предмет возвращается на место с анимацией
    await expect(page.getByTestId('game')).toHaveAttribute('data-lock', 'none');
    while ((await items.count()) > 0) {
      const it = items.first();
      const src = (await it.locator('img').getAttribute('data-src'))!;
      const bin = src.endsWith(CARROT) ? 0 : 1;
      const before = await items.count();
      await dragTo(page, await center(it), await center(bins.nth(bin)));
      await expect(items).toHaveCount(before - 1);
    }
    await expectFinished(page, backend);
  });

  test('найди пару: несовпавшие закрываются, совпавшие остаются', async ({ page, backend }) => {
    backend.items = [game(1, { kind: 'memory', imageIds: [CAT, LION, RABBIT] })];
    await openGame(page);
    const cards = page.getByTestId('memory-card');
    await expect(cards).toHaveCount(6);
    const pairs = await cards.evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.pair));
    await cards.nth(pairs.indexOf('0')).click();
    await cards.nth(pairs.indexOf('1')).click();
    await shot(page, 'memory');
    await expect(page.locator('.memory-card.open')).toHaveCount(0, { timeout: 3000 });
    for (const p of ['0', '1', '2']) {
      const [i, j] = pairs.flatMap((x, k) => (x === p ? [k] : []));
      await cards.nth(i!).click();
      await cards.nth(j!).click();
    }
    await expectFinished(page, backend);
  });

  test('пазл: кусочек встаёт на своё место', async ({ page, backend }) => {
    backend.items = [game(1, { kind: 'puzzle', imageIds: [LION], cols: 2, rows: 2 })];
    await openGame(page);
    await shot(page, 'puzzle');
    const slots = page.getByTestId('puzzle-slot');
    for (let k = 0; k < 4; k++) {
      const piece = page.getByTestId('puzzle-piece').first();
      const n = Number(await piece.getAttribute('data-piece'));
      await dragTo(page, await center(piece), await center(slots.nth(n)));
    }
    await expect(page.locator('.puzzle-slot.filled')).toHaveCount(4);
    await expectFinished(page, backend);
  });

  test('обведи по точкам: ведём пальцем по линии цифры', async ({ page, backend }) => {
    backend.items = [game(1, { kind: 'tracing', shapes: ['4', 'circle'] })];
    await openGame(page);
    await shot(page, 'tracing');
    const { TRACES, resample } = await import('../src/games/traceShapes');
    for (const shape of ['4', 'circle'] as const) {
      await expect(page.getByTestId('trace')).toBeVisible();
      for (const stroke of TRACES[shape].strokes) {
        const box = (await page.getByTestId('trace').boundingBox())!;
        // viewBox 100×100 вписан по центру (preserveAspectRatio meet).
        const s = Math.min(box.width, box.height) / 100;
        const ox = box.x + (box.width - 100 * s) / 2;
        const oy = box.y + (box.height - 100 * s) / 2;
        const pts = resample(stroke).map(([x, y]) => ({ x: ox + x * s, y: oy + y * s }));
        await page.mouse.move(pts[0]!.x, pts[0]!.y);
        await page.mouse.down();
        for (const p of pts) await page.mouse.move(p.x, p.y);
        await page.mouse.up();
      }
      if (shape === '4') await page.waitForTimeout(1500);
    }
    await expectFinished(page, backend);
    expect((await spoken(page)).map((s) => s.text)).toContain('Обведи цифру четыре.');
  });

  test('лопни шарики: считаем вслух', async ({ page, backend }) => {
    backend.items = [game(1, { kind: 'balloons', count: 3 })];
    await openGame(page);
    await page.waitForTimeout(1500);
    await shot(page, 'balloons');
    for (let i = 0; i < 3; i++) {
      await page.locator('.balloon:not(.popped)').first().dispatchEvent('pointerdown');
    }
    await expectFinished(page, backend);
    const said = (await spoken(page)).map((s) => s.text);
    expect(said).toEqual(expect.arrayContaining(['один!', 'два!', 'три!']));
  });

  test('лопни только красные: другой цвет не считается', async ({ page, backend }) => {
    backend.items = [game(1, { kind: 'balloons', count: 3, target: 'red' })];
    await openGame(page);
    const other = page.locator('.balloon:not([data-color=red])').first();
    if (await other.count()) {
      await other.dispatchEvent('pointerdown');
      await expect(page.locator('.balloon-score .on')).toHaveCount(0);
    }
    for (let i = 0; i < 3; i++) {
      await expect(page.locator('.balloon[data-color=red]:not(.popped)').first()).toBeAttached({
        timeout: 15000,
      });
      await page
        .locator('.balloon[data-color=red]:not(.popped)')
        .first()
        .dispatchEvent('pointerdown');
    }
    await expectFinished(page, backend);
  });

  test('посчитай: касание предметов считает вслух, цифра — ответ', async ({ page, backend }) => {
    backend.items = [game(1, { kind: 'counting', max: 5, rounds: 2, imageIds: [CARROT] })];
    await openGame(page);
    await shot(page, 'counting');
    for (let round = 0; round < 2; round++) {
      const field = page.getByTestId('game-counting');
      const answer = Number(await field.getAttribute('data-answer'));
      await page.getByTestId('count-item').first().click();
      const wrong = page
        .locator(`[data-testid=count-option]:not([data-value="${answer}"])`)
        .first();
      await wrong.click();
      await expect(wrong).toHaveClass(/off/);
      await page.locator(`[data-testid=count-option][data-value="${answer}"]`).click();
      if (round === 0)
        await expect(page.locator('.count-option.off')).toHaveCount(0, { timeout: 4000 });
    }
    await expectFinished(page, backend);
    expect((await spoken(page)).map((s) => s.text)).toContain('один');
    // Этап 39: после похвалы — ответ.
    expect((await spoken(page)).some((s) => /^Здесь \S+!$/.test(s.text))).toBe(true);
    // Этап 34: ошибки уходят на сервер — по ним растёт уровень.
    expect(backend.events.find((e) => e.type === 'interactive_complete')?.payload).toMatchObject({
      kind: 'counting',
      mistakes: 2,
      level: 1,
    });
  });

  test('открыл сам и ушёл домой — события с «сам» и секундами (этап 44)', async ({
    page,
    backend,
  }) => {
    backend.items = [game(1, { kind: 'balloons', count: 5 })];
    await openGame(page);
    await expect
      .poll(() => backend.events.find((e) => e.type === 'interactive_start')?.payload)
      .toMatchObject({ kind: 'balloons', from: 'free' });
    await page.getByTestId('go-home').click();
    await expect.poll(() => backend.events.map((e) => e.type)).toContain('interactive_exit');
    const exit = backend.events.find((e) => e.type === 'interactive_exit')!;
    expect(exit.payload).toMatchObject({ kind: 'balloons', from: 'free' });
    expect(typeof exit.payload?.seconds).toBe('number');
    // Открытие — одно, хотя StrictMode монтирует экран дважды.
    expect(backend.events.filter((e) => e.type === 'interactive_start')).toHaveLength(1);
  });

  test('уровень сложности (этап 34): игра открывается на уровне ребёнка', async ({
    page,
    backend,
  }) => {
    backend.levels = { start: 1, byKind: { counting: 3 } };
    backend.items = [game(1, { kind: 'counting', max: 5, rounds: 2, imageIds: [CARROT] })];
    await openGame(page);
    await expect(page.getByTestId('game')).toHaveAttribute('data-level', '3');
    // Уровень 3: до 9 вместо 5.
    const answer = Number(await page.getByTestId('game-counting').getAttribute('data-answer'));
    expect(answer).toBeGreaterThanOrEqual(1);
    expect(answer).toBeLessThanOrEqual(9);
  });

  test('который час (этап 34): найти часы с названным временем', async ({ page, backend }) => {
    backend.items = [game(1, { kind: 'clock', half: true, choices: 3, rounds: 2 })];
    await openGame(page);
    await shot(page, 'clock');
    for (let round = 0; round < 2; round++) {
      const g = page.getByTestId('game-clock');
      const answer = Number(await g.getAttribute('data-answer'));
      const wrong = (answer + 1) % 3;
      if (round === 0) {
        await page.getByTestId('clock-option').nth(wrong).click();
        await expect(page.getByTestId('clock-option').nth(wrong)).toHaveClass(/off/);
        await page.waitForTimeout(1000);
      }
      await page.getByTestId('clock-option').nth(answer).click();
      if (round === 0)
        await expect(g)
          .not.toHaveAttribute('data-answer', /.*/, { timeout: 100 })
          .catch(() => {});
      await page.waitForTimeout(2400);
    }
    await expectFinished(page, backend);
    expect((await spoken(page)).some((s) => /^Где (половина )?\S/.test(s.text))).toBe(true);
    // Этап 39: «Сейчас три часа. Большая стрелка наверху…»
    expect((await spoken(page)).some((s) => /^Большая стрелка (наверху|внизу)/.test(s.text))).toBe(
      true,
    );
  });

  test('магазин (этап 34): монетки на сумму ценника, перебор — заново', async ({
    page,
    backend,
  }) => {
    backend.items = [
      game(1, { kind: 'shop', imageIds: [CARROT], max: 4, coins: [1, 5], rounds: 2 }),
    ];
    await openGame(page);
    await shot(page, 'shop');
    for (let round = 0; round < 2; round++) {
      const g = page.getByTestId('game-shop');
      const price = Number(await g.getAttribute('data-price'));
      if (round === 0) {
        // Перебор: монетка «5» дороже цены (до 4) — «многовато», прилавок пустеет.
        await page.locator('[data-testid=shop-coin][data-value="5"]').click();
        await expect
          .poll(async () => (await spoken(page)).map((s) => s.text))
          .toContain('Ой, многовато! Давай ещё раз.');
        await expect(g).toHaveAttribute('data-sum', '0');
      }
      for (let i = 0; i < price; i++) await page.getByTestId('shop-coin').first().click();
      await expect(g).toHaveAttribute('data-sum', String(price));
      await page.waitForTimeout(2800);
    }
    await expectFinished(page, backend);
    expect((await spoken(page)).some((s) => /^Положили ровно /.test(s.text))).toBe(true);
  });

  test('совёнок-робот (этап 34): путь стрелками, «Поехали», камни обходит', async ({
    page,
    backend,
  }) => {
    backend.items = [game(1, { kind: 'robot', size: 4, steps: 3, rocks: true, rounds: 1 })];
    await openGame(page);
    await shot(page, 'robot');
    const g = page.getByTestId('game-robot');
    const size = Number(await g.getAttribute('data-size'));
    const start = (await g.getAttribute('data-start'))!.split(',').map(Number) as [number, number];
    const goal = (await g.getAttribute('data-goal'))!;
    const rocks = new Set((await g.getAttribute('data-rocks'))!.split(';').filter(Boolean));
    // Поиск пути в ширину — как ребёнок, только без ошибок.
    const moves = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] } as const;
    const queue: { at: [number, number]; path: string[] }[] = [{ at: start, path: [] }];
    const seen = new Set([start.join(',')]);
    let path: string[] = [];
    while (queue.length) {
      const { at, path: p } = queue.shift()!;
      if (at.join(',') === goal) {
        path = p;
        break;
      }
      for (const [d, [dx, dy]] of Object.entries(moves)) {
        const n: [number, number] = [at[0] + dx, at[1] + dy];
        const k = n.join(',');
        if (n[0] < 0 || n[1] < 0 || n[0] >= size || n[1] >= size || rocks.has(k) || seen.has(k))
          continue;
        seen.add(k);
        queue.push({ at: n, path: [...p, d] });
      }
    }
    expect(path.length).toBeGreaterThan(0);
    for (const d of path) await page.getByTestId(`robot-${d}`).click();
    await expect(page.getByTestId('robot-program').locator('.robot-step')).toHaveCount(path.length);
    await page.getByTestId('robot-go').click();
    await expectFinished(page, backend);
  });

  test('космос по порядку (этап 36): не та планета — «ещё», по порядку — облетели', async ({
    page,
    backend,
  }) => {
    backend.items = [
      game(1, { kind: 'space', order: 'numbers', count: 4, step: 2, reverse: true, rounds: 1 }),
    ];
    await openGame(page);
    const g = page.getByTestId('game-space');
    await expect(g).toHaveAttribute('data-order', '8,6,4,2');
    await shot(page, 'space');
    // Сначала «2» вместо «8» — ошибка, ничего не облетели.
    await page.locator('[data-testid=space-planet][data-value="2"]').click();
    await expect(g).toHaveAttribute('data-done', '0');
    await page.waitForTimeout(1000);
    for (const v of ['8', '6', '4', '2']) {
      await page.locator(`[data-testid=space-planet][data-value="${v}"]`).click();
      await page.waitForTimeout(300);
    }
    await expect(g).toHaveAttribute('data-done', '4');
    await expectFinished(page, backend);
    expect((await spoken(page)).map((s) => s.text)).toContain('Начни с цифры восемь!');
  });

  test('рыбалка (этап 36): крючок ведут к нужной рыбке и отпускают', async ({ page, backend }) => {
    backend.items = [
      game(1, { kind: 'fishing', mode: 'numbers', max: 5, fish: 3, speed: 'slow', rounds: 2 }),
    ];
    await openGame(page);
    await shot(page, 'fishing');
    const g = page.getByTestId('game-fishing');
    const hook = page.getByTestId('fishing-hook');
    /** Палец держит крючок на рыбке, пока он не доплывёт, и отпускает. */
    const catchFish = async (value: string) => {
      const fish = page.locator(`[data-testid=fishing-fish][data-value="${value}"]`);
      let box = (await fish.boundingBox())!;
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      for (let i = 0; i < 40; i++) {
        box = (await fish.boundingBox())!;
        const cx = box.x + box.width / 2;
        const cy = box.y + box.height / 2;
        await page.mouse.move(cx, cy);
        const h = (await hook.boundingBox())!;
        const hx = h.x + h.width / 2;
        const hy = h.y + h.height;
        if (Math.abs(hx - cx) < box.width * 0.25 && Math.abs(hy - cy) < box.height * 0.3) break;
        await page.waitForTimeout(50);
      }
      await page.mouse.up();
    };
    for (let round = 0; round < 2; round++) {
      await expect(g).toHaveAttribute('data-round', String(round));
      const target = (await g.getAttribute('data-target'))!;
      if (round === 0) {
        const values = await page
          .getByTestId('fishing-fish')
          .evaluateAll((els) => els.map((e) => e.getAttribute('data-value')!));
        await catchFish(values.find((v) => v !== target)!);
        await expect
          .poll(() => page.getByTestId('game').getAttribute('data-lock'))
          .not.toBe('none');
        await page.waitForTimeout(1200);
      }
      await catchFish(target);
      await expect(page.locator('.fishing-fish.caught')).toHaveCount(1);
      await page.waitForTimeout(2400);
    }
    await expectFinished(page, backend);
  });

  test('совёнок летит (этап 36): держим палец — вверх, ловим звёзды, считаем вслух', async ({
    page,
    backend,
  }) => {
    test.setTimeout(90_000);
    backend.items = [game(1, { kind: 'flight', stars: 5, clouds: 'few', speed: 'slow' })];
    await openGame(page);
    const g = page.getByTestId('game-flight');
    const owl = page.getByTestId('flight-owl');
    // До первого касания совёнок ждёт на месте.
    await page.waitForTimeout(800);
    await expect(page.getByTestId('flight-star')).toHaveCount(0);
    const view = page.viewportSize()!;
    await page.mouse.move(view.width / 2, view.height / 2);
    await page.mouse.down();
    await page.mouse.up();
    // Автопилот: держит палец, когда ближайшая звезда выше совёнка.
    let down = false;
    for (let i = 0; i < 900; i++) {
      if ((await g.getAttribute('data-caught')) === '5') break;
      const o = (await owl.boundingBox())!;
      const oy = o.y + o.height / 2;
      const stars = await page
        .locator('[data-testid=flight-star]:not([data-hit])')
        .evaluateAll((els) =>
          els.map((e) => {
            const b = e.getBoundingClientRect();
            return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
          }),
        );
      const next = stars.filter((s) => s.x > o.x).sort((a, b) => a.x - b.x)[0];
      const want = next ? next.y < oy - 4 : false;
      if (want !== down) {
        if (want) await page.mouse.down();
        else await page.mouse.up();
        down = want;
      }
      if (i === 60) await shot(page, 'flight');
      await page.waitForTimeout(30);
    }
    if (down) await page.mouse.up();
    await expect(g).toHaveAttribute('data-caught', '5');
    await expectFinished(page, backend);
    const said = (await spoken(page)).map((s) => s.text);
    expect(said).toContain('два');
    expect(said).toContain('четыре');
  });

  test('строитель (этап 36): не та деталь — «ещё», по образцу — башня; по памяти образец прячется', async ({
    page,
    backend,
  }) => {
    backend.items = [game(1, { kind: 'builder', height: 3, blocks: 4, hide: true, rounds: 2 })];
    await openGame(page);
    const g = page.getByTestId('game-builder');
    const model = page.getByTestId('builder-model');
    await expect(model).not.toHaveAttribute('data-hidden');
    await shot(page, 'builder');
    for (let round = 0; round < 2; round++) {
      await expect(g).toHaveAttribute('data-round', String(round));
      const tower = (await g.getAttribute('data-model'))!.split(',');
      expect(tower).toHaveLength(3);
      if (round === 0) {
        // Не та деталь: образец прячется (строим по памяти), башня не растёт.
        const wrong = ['cube', 'bar', 'roof', 'arch'].find((k) => k !== tower[0])!;
        await page.locator(`[data-testid=builder-part][data-kind=${wrong}]`).click();
        await expect(g).toHaveAttribute('data-built', '0');
        await expect(model).toHaveAttribute('data-hidden', 'true');
        await expect
          .poll(() => page.getByTestId('game').getAttribute('data-lock'))
          .not.toBe('none');
        // Подсмотреть: касание открывает образец на миг.
        await page.waitForTimeout(1000);
        await model.click();
        await expect(model).not.toHaveAttribute('data-hidden');
        await expect(model).toHaveAttribute('data-hidden', 'true');
      }
      for (const [i, b] of tower.entries()) {
        await page.locator(`[data-testid=builder-part][data-kind=${b}]`).click();
        await expect(g).toHaveAttribute('data-built', String(i + 1));
        await page.waitForTimeout(250);
      }
      await expect(page.getByTestId('builder-built').locator('img')).toHaveCount(3);
      if (round === 0) await shot(page, 'builder-done');
      await page.waitForTimeout(2900);
    }
    await expectFinished(page, backend);
    expect((await spoken(page)).map((s) => s.text)).toContain(
      'Запомни башню — сейчас она спрячется!',
    );
  });

  test('рисовалка: рисуем пальцем, ставим наклейку, «готово»', async ({ page, backend }) => {
    backend.items = [game(1, { kind: 'drawing', stickerIds: [CAT, LION] })];
    await openGame(page);
    const canvas = page.getByTestId('canvas');
    const b = (await canvas.boundingBox())!;
    await page.mouse.move(b.x + 30, b.y + 30);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width - 30, b.y + b.height - 30, { steps: 10 });
    await page.mouse.up();
    await page.getByTestId('sticker').first().click();
    await canvas.click({ position: { x: b.width / 2, y: 60 } });
    await shot(page, 'drawing');
    // Линия нарисована: в середине холста пиксель не белый.
    const painted = await canvas.evaluate((el: HTMLCanvasElement) => {
      const d = el.getContext('2d')!.getImageData(el.width / 2, el.height / 2, 1, 1).data;
      return d[0] !== 255 || d[1] !== 255 || d[2] !== 255;
    });
    expect(painted).toBe(true);
    await page.getByTestId('game-done').click();
    await expectFinished(page, backend);
  });
});

// ─── Отклик интерфейса: голос переходов, звуки, праздник ─────────────────────

/** Счётчик звуков: сколько раз интерфейс запускал генератор Web Audio. */
const COUNT_SOUNDS = `
  window.__sounds = 0;
  const orig = AudioContext.prototype.createOscillator;
  AudioContext.prototype.createOscillator = function () {
    window.__sounds++;
    return orig.call(this);
  };
`;
const sounds = (page: Page) =>
  page.evaluate(() => (window as unknown as { __sounds: number }).__sounds);

test.describe('отклик интерфейса', () => {
  test('приветствие на экране разделов, раздел называется вслух', async ({ page, backend }) => {
    backend.items = [
      { ...SEGMENTS[0]!, kind: 'segment', questions: [] },
      game(1, { kind: 'balloons', count: 3 }),
    ];
    await gameMedia(page);
    await page.goto('/');
    await expect(page.getByTestId('categories')).toBeVisible();
    await expect
      .poll(async () => (await spoken(page)).map((s) => s.text))
      .toContain('Привет! Что будем делать?');
    await page.locator('[data-category=games]').click();
    await expect.poll(async () => (await spoken(page)).map((s) => s.text)).toContain('Игры!');
  });

  test('касание кнопки и верный ответ звучат', async ({ page, backend }) => {
    await page.addInitScript(COUNT_SOUNDS);
    backend.items = [game(1, { kind: 'counting', max: 3, rounds: 1, imageIds: [CARROT] })];
    await openGame(page);
    const before = await sounds(page);
    expect(before).toBeGreaterThan(0); // касание плитки
    const answer = Number(await page.getByTestId('game-counting').getAttribute('data-answer'));
    await page.locator(`[data-testid=count-option][data-value="${answer}"]`).click();
    await expect.poll(() => sounds(page)).toBeGreaterThan(before + 3); // арпеджио успеха
    await expect(page.locator('.count-option.right')).toBeVisible();
  });

  test('в конце игры — наклейка и конфетти', async ({ page, backend }) => {
    backend.items = [game(1, { kind: 'drawing', stickerIds: [] })];
    await openGame(page);
    await page.getByTestId('game-done').click();
    await expect(page.getByTestId('game-finished')).toBeVisible();
    await expect(page.locator('.confetti span')).toHaveCount(56);
    await expect(page.getByTestId('sticker-award')).toBeVisible();
    await page.waitForTimeout(600);
    await shot(page, 'celebrate');
  });

  test('после последнего пункта раздела — похвала и снова пункты раздела', async ({
    page,
    backend,
  }) => {
    backend.items = [game(1, { kind: 'drawing', stickerIds: [] })];
    await openGame(page);
    await page.getByTestId('game-done').click();
    await expect(page.getByTestId('home')).toBeVisible({ timeout: 6000 });
    await expect
      .poll(async () => (await spoken(page)).map((s) => s.text))
      .toContain('Молодец, выбирай, что дальше.');
  });
});

test('нейроголос: фразы приложения звучат файлами с сервера, а не голосом телефона', async ({
  page,
  backend,
}) => {
  await page.addInitScript(`
    window.__played = [];
    HTMLMediaElement.prototype.play = function () {
      window.__played.push(decodeURIComponent(this.dataset.src || this.src));
      this.dispatchEvent(new Event('ended'));
      return Promise.resolve();
    };
  `);
  backend.serverVoice = true;
  backend.items = [game(1, { kind: 'balloons', count: 3 })];
  await gameMedia(page);
  await page.goto('/');
  await expect.poll(() => backend.speechRequests ?? 0).toBeGreaterThan(0);
  await page.getByTestId('tile').first().click();
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __played: string[] }).__played))
    .toContainEqual(expect.stringContaining('tts-Лопай шарики!'));
  expect((await spoken(page)).map((s) => s.text)).not.toContain('Лопай шарики!');
});

// ─── Новые игры ──────────────────────────────────────────────────────────────

/** Нажать так, как это делает палец: pointerdown (игры слушают именно его). */
const press = (l: ReturnType<Page['locator']>) => l.dispatchEvent('pointerdown');

/** Перетащить предмет на цель. */
const dragOnto = async (
  page: Page,
  from: ReturnType<Page['locator']>,
  to: ReturnType<Page['locator']>,
) => dragTo(page, await center(from), await center(to));

test.describe('новые игры', () => {
  test('игра про природу — в разделе «Природа»', async ({ page, backend }) => {
    backend.items = [
      game(1, { kind: 'balloons', count: 3 }),
      game(2, { kind: 'memory', imageIds: [CAT, LION] }, 'nature'),
    ];
    await gameMedia(page);
    await page.goto('/');
    await page.locator('[data-category=nature]').click();
    await expect(page.getByTestId('tile')).toHaveCount(1);
  });

  test('лабиринт: ведём героя пальцем по проходам до цели', async ({ page, backend }) => {
    backend.items = [game(1, { kind: 'maze', heroId: RABBIT, goalId: CARROT, size: 4, rounds: 1 })];
    await openGame(page);
    await shot(page, 'maze');
    const field = page.getByTestId('game-maze');
    const n = Number(await field.getAttribute('data-n'));
    const bits = async (a: string) =>
      [...((await field.getAttribute(a)) ?? '')].map((c) => c === '1');
    const { solve } = await import('../src/games/mazeGen');
    const maze = { n, right: await bits('data-right'), down: await bits('data-down') };
    const path = solve(maze, 0, n * n - 1);
    const box = (await page.getByTestId('maze').boundingBox())!;
    // viewBox (-2 -2 n·10+4 n·10+4) вписан по центру.
    const view = n * 10 + 4;
    const s = Math.min(box.width, box.height) / view;
    const ox = box.x + (box.width - view * s) / 2 + 2 * s;
    const oy = box.y + (box.height - view * s) / 2 + 2 * s;
    const at = (c: number) => ({
      x: ox + ((c % n) * 10 + 5) * s,
      y: oy + (Math.floor(c / n) * 10 + 5) * s,
    });
    await page.mouse.move(at(0).x, at(0).y);
    await page.mouse.down();
    for (const c of path) await page.mouse.move(at(c).x, at(c).y, { steps: 3 });
    await page.mouse.up();
    await expectFinished(page, backend);
  });

  test('найди тень: картинка ложится только на свою тень', async ({ page, backend }) => {
    backend.items = [game(1, { kind: 'shadows', imageIds: [CAT, LION, RABBIT], perRound: 3 })];
    await openGame(page);
    await shot(page, 'shadows');
    const item = (id: string) => page.locator(`[data-testid=shadow-item][data-image="${id}"]`);
    const slot = (id: string) => page.locator(`[data-testid=shadow-slot][data-image="${id}"]`);
    await dragOnto(page, item(CAT), slot(LION));
    await expect(page.getByTestId('shadow-item')).toHaveCount(3);
    await expect(page.getByTestId('game')).toHaveAttribute('data-lock', 'none');
    for (const id of [CAT, LION, RABBIT]) {
      await page.waitForTimeout(500);
      await dragOnto(page, item(id), slot(id));
      await expect(item(id)).toHaveCount(0);
    }
    await expectFinished(page, backend);
  });

  test('фонарик: луч находит спрятанных, имя звучит', async ({ page, backend }) => {
    backend.items = [
      game(1, {
        kind: 'flashlight',
        scene: 'forest',
        items: [{ imageId: CAT, name: 'Котик!' }, { imageId: LION }],
      }),
    ];
    await openGame(page);
    const items = page.getByTestId('flash-item');
    const vp = page.viewportSize()!;
    await page.mouse.move(vp.width / 2, vp.height / 2);
    await page.mouse.down();
    await shot(page, 'flashlight');
    for (let i = 0; i < 2; i++) {
      const c = await center(items.nth(i));
      await page.mouse.move(c.x, c.y, { steps: 6 });
    }
    await page.mouse.up();
    await expect(page.locator('[data-testid=flash-item][data-found=true]')).toHaveCount(2);
    await expectFinished(page, backend);
    expect((await spoken(page)).map((s) => s.text)).toContain('Котик!');
  });

  test('поймай зверька: ловим только названного', async ({ page, backend }) => {
    backend.items = [
      game(1, {
        kind: 'moles',
        imageIds: [RABBIT, CAT],
        target: 0,
        prompt: 'Лови только зайчиков!',
        count: 3,
        speed: 'slow',
      }),
    ];
    await openGame(page);
    const up = (who: number) =>
      page.locator(`.mole-hole:has([data-testid=mole][data-who="${who}"]:not(.hit):not(.leaving))`);
    for (let i = 0; i < 3; i++) {
      // Котик не считается.
      if (await up(1).count()) {
        await press(up(1).first());
        await expect(page.locator('.balloon-score .on')).toHaveCount(i);
      }
      await expect(up(0).first()).toBeAttached({ timeout: 15000 });
      if (i === 0) await shot(page, 'moles');
      await press(up(0).first());
      await expect(page.locator('.balloon-score .on')).toHaveCount(i + 1);
    }
    await expectFinished(page, backend);
    expect((await spoken(page)).map((s) => s.text)).toContain('Лови только зайчиков!');
  });

  test('повтори мелодию: ошибка — мелодия звучит снова, верно — мелодия растёт', async ({
    page,
    backend,
  }) => {
    backend.items = [game(1, { kind: 'melody', bells: 3, start: 1, goal: 2 })];
    await openGame(page);
    const field = page.getByTestId('game-melody');
    const tune = async () =>
      ((await page.getByTestId('melody-tune').textContent()) ?? '').split(',').map(Number);
    await expect(field).toHaveAttribute('data-phase', 'play', { timeout: 8000 });
    await shot(page, 'melody');
    // Не тот колокольчик — снова слушаем.
    const [first] = await tune();
    await press(page.locator(`[data-bell="${(first! + 1) % 3}"]`));
    await expect(field).toHaveAttribute('data-phase', 'listen');
    for (const length of [1, 2]) {
      await expect(field).toHaveAttribute('data-phase', 'play', { timeout: 8000 });
      const notes = await tune();
      expect(notes).toHaveLength(length);
      for (const n of notes) await press(page.locator(`[data-bell="${n}"]`));
    }
    await expectFinished(page, backend);
  });

  test('сортер: фигуру поворачиваем касанием и кладём в её отверстие', async ({
    page,
    backend,
  }) => {
    backend.items = [
      game(1, { kind: 'shapes', shapes: ['circle', 'square', 'triangle'], rotate: true }),
    ];
    await openGame(page);
    await shot(page, 'shapes');
    const piece = (s: string) => page.locator(`[data-testid=sorter-piece][data-shape=${s}]`);
    const hole = (s: string) => page.locator(`[data-testid=sorter-hole][data-shape=${s}]`);
    // Круг в квадратное отверстие не лезет.
    await dragOnto(page, piece('circle'), hole('square'));
    await expect(piece('circle')).toHaveCount(1);
    // Треугольник повёрнут — касаниями ставим ровно.
    for (let k = 0; k < 4; k++) {
      const rot = Number(await piece('triangle').getAttribute('data-rot'));
      if (rot % 360 === 0) break;
      await page.waitForTimeout(450);
      await piece('triangle').click();
    }
    for (const s of ['circle', 'square', 'triangle']) {
      await page.waitForTimeout(450);
      await dragOnto(page, piece(s), hole(s));
      await expect(piece(s)).toHaveCount(0);
    }
    await expectFinished(page, backend);
  });

  test('что лишнее: неверный ответ гаснет, верный — объяснение', async ({ page, backend }) => {
    backend.items = [
      game(1, {
        kind: 'odd',
        rounds: [
          { imageIds: [CAT, LION, RABBIT, CARROT], odd: 3, explain: 'Морковка — не зверь.' },
        ],
      }),
    ];
    await openGame(page);
    await shot(page, 'odd');
    const cell = (i: number) => page.locator(`[data-testid=odd-cell][data-index="${i}"]`);
    await cell(0).click();
    await expect(cell(0)).toHaveClass(/off/);
    await cell(3).click();
    await expectFinished(page, backend);
    expect((await spoken(page)).map((s) => s.text)).toContain('Морковка — не зверь.');
  });

  test('ошибки в игре: касания на миг закрыты, две подряд в спешке — «не спеши» с совёнком', async ({
    page,
    backend,
  }) => {
    backend.items = [
      game(1, { kind: 'odd', rounds: [{ imageIds: [CAT, LION, RABBIT, CARROT], odd: 3 }] }),
    ];
    await openGame(page);
    const cell = (i: number) => page.locator(`[data-testid=odd-cell][data-index="${i}"]`);
    const screen = page.getByTestId('game');
    await cell(0).click();
    await expect(screen).toHaveAttribute('data-lock', 'wait');
    await expect(screen).toHaveAttribute('data-lock', 'none');
    await cell(1).click();
    await expect(screen).toHaveAttribute('data-lock', 'think');
    await expect(page.getByTestId('game-think')).toBeVisible();
    await expect(screen).toHaveAttribute('data-lock', 'none', { timeout: 6000 });
    const said = (await spoken(page)).map((s) => s.text);
    expect(said).toContain('Попробуй ещё.');
    expect(said).toContain('Не спеши.');
    await cell(3).click();
    await expectFinished(page, backend);
  });

  test('бездействие: задание звучит снова, палец показывает верный ответ', async ({
    page,
    backend,
  }) => {
    backend.items = [
      game(1, {
        kind: 'odd',
        rounds: [{ imageIds: [CAT, LION, RABBIT, CARROT], odd: 3 }],
      }),
    ];
    await page.clock.install();
    await openGame(page);
    await expect(page.getByTestId('hint-hand')).toHaveCount(0);
    await page.clock.runFor(7_000);
    const hand = page.getByTestId('hint-hand');
    // Сам слой — точка в центре цели (палец и кольцо рисуются вокруг неё).
    await expect(hand).toBeAttached();
    await expect(hand.locator('span')).toBeVisible();
    // Палец — над лишней картинкой.
    const cell = await page.locator('[data-testid=odd-cell][data-index="3"]').boundingBox();
    const at = await hand.boundingBox();
    expect(at!.x).toBeGreaterThanOrEqual(cell!.x - 1);
    expect(at!.x).toBeLessThanOrEqual(cell!.x + cell!.width + 1);
    expect((await spoken(page)).filter((s) => s.text === 'Что здесь лишнее?').length).toBe(2);
    // Касание убирает подсказку; «ушко» повторяет задание.
    await page.getByTestId('ear').click();
    await expect(hand).toHaveCount(0);
    await expect
      .poll(async () => (await spoken(page)).filter((s) => s.text === 'Что здесь лишнее?').length)
      .toBe(3);
  });

  test('продолжи ряд: выбираем, что дальше', async ({ page, backend }) => {
    backend.items = [
      game(1, { kind: 'pattern', imageIds: [CAT, LION, RABBIT], patterns: ['ABC'], rounds: 2 }),
    ];
    await openGame(page);
    await shot(page, 'pattern');
    for (let round = 0; round < 2; round++) {
      const answer = (await page.getByTestId('game-pattern').getAttribute('data-answer'))!;
      if (round === 0) {
        const wrong = page
          .locator(`[data-testid=pattern-option]:not([data-image="${answer}"])`)
          .first();
        await wrong.click();
        await expect(wrong).toHaveClass(/off/);
      }
      await page.locator(`[data-testid=pattern-option][data-image="${answer}"]`).click();
      if (round === 0)
        await expect(page.locator('.pattern-option.off')).toHaveCount(0, { timeout: 4000 });
    }
    await expectFinished(page, backend);
  });

  test('где больше: касание группы и «… больше, чем …»', async ({ page, backend }) => {
    backend.items = [
      game(1, {
        kind: 'compare',
        mode: 'objects',
        ask: 'more',
        max: 5,
        rounds: 2,
        imageIds: [CARROT],
      }),
    ];
    await openGame(page);
    await shot(page, 'compare');
    for (let round = 0; round < 2; round++) {
      const answer = Number(await page.getByTestId('game-compare').getAttribute('data-answer'));
      await page.getByTestId('compare-side').nth(answer).click();
      if (round === 0)
        await expect(page.locator('.compare-side.picked')).toHaveCount(0, { timeout: 5000 });
    }
    await expectFinished(page, backend);
    expect((await spoken(page)).map((s) => s.text)).toContain('больше, чем');
  });

  test('сложи и вычти: предметы прилетают, потом выбираем ответ', async ({ page, backend }) => {
    backend.items = [
      game(1, {
        kind: 'arithmetic',
        ops: ['plus', 'minus'],
        max: 5,
        rounds: 2,
        imageIds: [CARROT],
      }),
    ];
    await openGame(page);
    const field = page.getByTestId('game-arithmetic');
    for (let round = 0; round < 2; round++) {
      await expect(field).toHaveAttribute('data-phase', 'ask', { timeout: 8000 });
      if (round === 0) await shot(page, 'arithmetic');
      const answer = await field.getAttribute('data-answer');
      await page.locator(`[data-testid=sum-option][data-value="${answer}"]`).click();
      if (round === 0)
        await expect(field).not.toHaveAttribute('data-phase', 'solved', { timeout: 6000 });
    }
    await expectFinished(page, backend);
    expect((await spoken(page)).map((s) => s.text)).toContain('будет');
  });

  test('по размеру: от маленького к большому', async ({ page, backend }) => {
    backend.items = [game(1, { kind: 'size', imageIds: [LION], count: 3 })];
    await openGame(page);
    await shot(page, 'size');
    const item = (k: number) => page.locator(`[data-testid=size-item][data-size="${k}"]`);
    const slots = page.getByTestId('size-slot');
    await dragOnto(page, item(0), slots.nth(2));
    await expect(item(0)).toHaveCount(1);
    await expect(page.getByTestId('game')).toHaveAttribute('data-lock', 'none');
    for (const k of [0, 1, 2]) {
      await page.waitForTimeout(450);
      await dragOnto(page, item(k), slots.nth(k));
      await expect(item(k)).toHaveCount(0);
    }
    await expectFinished(page, backend);
  });

  test('по порядку: карточки встают на свои места', async ({ page, backend }) => {
    backend.items = [
      game(1, {
        kind: 'sequence',
        rounds: [{ prompt: 'Что сначала, что потом?', imageIds: [CARROT, RABBIT, LION] }],
      }),
    ];
    await openGame(page);
    await shot(page, 'sequence');
    for (const id of [LION, CARROT, RABBIT]) {
      await dragOnto(
        page,
        page.locator(`[data-testid=seq-item][data-image="${id}"]`),
        page.locator(`[data-testid=seq-slot][data-image="${id}"]`),
      );
      await page.waitForTimeout(450);
    }
    await expect(page.locator('.seq-slot.filled')).toHaveCount(3);
    await expectFinished(page, backend);
    expect((await spoken(page)).map((s) => s.text)).toContain('Что сначала, что потом?');
  });

  test('собери слово: буквы по порядку касанием, не та буква не встаёт', async ({
    page,
    backend,
  }) => {
    backend.items = [
      game(1, { kind: 'word', lang: 'ru', words: [{ imageId: CAT, word: 'КОТ' }], extra: 1 }),
    ];
    await openGame(page);
    await shot(page, 'word');
    const tile = (l: string) => page.locator(`[data-testid=word-tile][data-letter="${l}"]`);
    await tile('О').click();
    await expect(page.locator('.word-slot.filled')).toHaveCount(0);
    for (const l of ['К', 'О', 'Т']) {
      await page.waitForTimeout(450);
      await tile(l).click();
    }
    await expect(page.locator('.word-slot.filled')).toHaveCount(3);
    await expectFinished(page, backend);
    expect((await spoken(page)).map((s) => s.text)).toContain('кот');
  });

  test('слово из слогов (этап 41): слоги по порядку касанием, не тот слог не встаёт', async ({
    page,
    backend,
  }) => {
    backend.items = [
      game(1, { kind: 'syllableWord', words: [{ imageId: CAT, word: 'КОШ-КА' }], extra: 1 }),
    ];
    await openGame(page);
    const g = page.getByTestId('game-syllableWord');
    await expect(g).toBeVisible();
    await expect(page.getByTestId('word-tile')).toHaveCount(3);
    await shot(page, 'syllable-word');
    const tile = (l: string) => page.locator(`[data-testid=word-tile][data-letter="${l}"]`);
    await tile('КА').click();
    await expect(page.locator('.word-slot.filled')).toHaveCount(0);
    for (const l of ['КОШ', 'КА']) {
      await page.waitForTimeout(450);
      await tile(l).click();
    }
    await expect(page.locator('.word-slot.filled')).toHaveCount(2);
    await expectFinished(page, backend);
    const said = (await spoken(page)).map((s) => s.text);
    expect(said).toContain('кош!');
    expect(said).toContain('кошка!');
  });

  test('загадки (этап 41): совёнок загадывает, не та картинка — «ещё», отгадка — «Это …!»', async ({
    page,
    backend,
  }) => {
    backend.items = [
      game(1, {
        kind: 'riddle',
        riddles: [
          { text: 'Говорю «мяу». Кто я?', name: 'кошка', imageId: CAT },
          { text: 'Царь зверей с гривой. Кто я?', name: 'лев', imageId: LION },
          { text: 'Ушки длинные. Кто я?', name: 'зайчик', imageId: RABBIT },
        ],
        choices: 3,
        rounds: 2,
      }),
    ];
    await openGame(page);
    const g = page.getByTestId('game-riddle');
    await expect(page.getByTestId('riddle-option')).toHaveCount(3);
    await shot(page, 'riddle');
    const answers: string[] = [];
    for (let round = 0; round < 2; round++) {
      const answer = (await g.getAttribute('data-answer'))!;
      answers.push(answer);
      if (round === 0) {
        await page
          .locator(`[data-testid=riddle-option]:not([data-id="${answer}"])`)
          .first()
          .click();
        await expect(page.locator('[data-testid=riddle-option].off')).toHaveCount(1);
        await page.waitForTimeout(1200);
      }
      await page.locator(`[data-testid=riddle-option][data-id="${answer}"]`).click();
      if (round === 0)
        await expect(g).not.toHaveAttribute('data-answer', answer, { timeout: 10_000 });
    }
    await expectFinished(page, backend);
    const said = (await spoken(page)).map((s) => s.text);
    const names = { [CAT]: 'кошка', [LION]: 'лев', [RABBIT]: 'зайчик' } as Record<string, string>;
    for (const a of answers) expect(said).toContain(`Это ${names[a]}!`);
  });

  test('судоку-малыш (этап 41): пустая клетка, картинка снизу; не та — не встаёт', async ({
    page,
    backend,
  }) => {
    backend.items = [
      game(1, { kind: 'sudoku', imageIds: [CAT, LION, RABBIT], size: 3, blanks: 3, rounds: 1 }),
    ];
    await openGame(page);
    await expect(page.getByTestId('sudoku-cell')).toHaveCount(9);
    await expect(page.locator('[data-testid=sudoku-cell][data-empty]')).toHaveCount(3);
    await shot(page, 'sudoku');
    for (let k = 0; k < 3; k++) {
      const target = page.locator('[data-testid=sudoku-cell][data-hint-target]');
      const v = Number(await target.getAttribute('data-value'));
      if (k === 0) {
        await page.locator(`[data-testid=sudoku-pick][data-value="${(v + 1) % 3}"]`).click();
        await expect(page.locator('[data-testid=sudoku-cell][data-empty]')).toHaveCount(3);
        await page.waitForTimeout(1200);
      }
      await page.locator(`[data-testid=sudoku-pick][data-value="${v}"]`).click();
      await expect(page.locator('[data-testid=sudoku-cell][data-empty]')).toHaveCount(2 - k);
      await page.waitForTimeout(300);
    }
    await shot(page, 'sudoku-done');
    await expectFinished(page, backend);
    expect((await spoken(page)).map((s) => s.text)).toContain(
      'Получилось! В каждой строчке и в каждом столбике все картинки по разу.',
    );
  });

  test('подводное плавание (этап 43): батискаф за пальцем ловит нужных рыбок, не та — «Это …»', async ({
    page,
    backend,
  }) => {
    test.setTimeout(120_000);
    backend.items = [
      game(1, { kind: 'dive', task: 'mixed', max: 4, jellies: 'none', speed: 'slow', rounds: 2 }),
    ];
    await openGame(page);
    const g = page.getByTestId('game-dive');
    await expect(g).toHaveAttribute('data-task', /^color:/);
    const view = page.viewportSize()!;
    await page.mouse.move(view.width * 0.3, view.height * 0.5);
    await page.mouse.down();
    type Fish = { x: number; y: number; good: boolean; jelly: boolean };
    const swimmers = async (): Promise<Fish[]> =>
      JSON.parse((await g.getAttribute('data-swimmers', { timeout: 1000 })) ?? '[]');
    const sub = async () =>
      ((await g.getAttribute('data-sub', { timeout: 1000 })) ?? '0,0').split(',').map(Number);
    /** Расстояние от рыбки до пути батискафа (отрезок от `a` до `b`). */
    const offPath = (p: Fish, a: { x: number; y: number }, b: { x: number; y: number }) => {
      const [dx, dy] = [b.x - a.x, b.y - a.y];
      const t = Math.max(
        0,
        Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)),
      );
      return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
    };
    const finished = () => backend.events.some((e) => e.type === 'interactive_complete');
    // Автопилот: палец ведёт батискаф к ближайшей нужной рыбке (сначала один раз — к чужой,
    // и только если по пути нет нужных: иначе раунды проходятся без ошибки).
    let wrongDone = false;
    for (let i = 0; i < 1500 && !finished(); i++) {
      // Чтение поля под нагрузкой бывает дольше секунды — пробуем снова, конец игры — по событию.
      const now = await Promise.all([sub(), swimmers()]).catch(() => null);
      if (!now) continue;
      const [[sx, sy], fish] = now;
      const at = { x: sx!, y: sy! };
      const all = fish.filter((f) => !f.jelly && f.x > 20 && f.x < view.width - 10);
      const good = all.filter((f) => f.good);
      const want = all
        .filter((f) => f.good === wrongDone)
        .map((f) => ({ ...f, x: f.x - 25 }))
        .filter((f) => wrongDone || good.every((o) => offPath(o, at, f) > 70))
        .sort((a, b) => Math.hypot(a.x - sx!, a.y - sy!) - Math.hypot(b.x - sx!, b.y - sy!))[0];
      if (want) await page.mouse.move(want.x, want.y);
      if (
        !wrongDone &&
        (await spoken(page)).some((x) => /^Это (.+ рыбка|цифра .+)\.$/.test(x.text))
      )
        wrongDone = true;
      if (i === 25) await shot(page, 'dive');
      if (i === 200) await shot(page, 'dive-2');
      await page.waitForTimeout(30);
    }
    await page.mouse.up();
    expect(wrongDone).toBe(true);
    await expectFinished(page, backend);
    const said = (await spoken(page)).map((x) => x.text);
    expect(said.some((x) => /^Поймай (две|три|четыре) .+ рыбк/.test(x))).toBe(true);
    expect(said.some((x) => /^Поймай рыбку с цифрой/.test(x))).toBe(true);
    expect(said).toContain('Ура, сундук с жемчугом!');
  });

  test('найди отличия (этап 43): промах, лупа-подсказка, все отличия на двух картинках, финиш', async ({
    page,
    backend,
  }) => {
    test.setTimeout(180_000);
    backend.items = [
      game(1, { kind: 'differences', scenes: ['sea', 'meadow'], count: 3, rounds: 2, hint: true }),
    ];
    await openGame(page);
    const g = page.getByTestId('game-differences');
    await expect(g).toHaveAttribute('data-phase', 'play', { timeout: 8000 });
    await page.waitForTimeout(1200);
    await shot(page, 'diff-start');
    const read = async <T>(attr: string) => JSON.parse((await g.getAttribute(attr)) ?? 'null') as T;
    // Промах — «Здесь одинаково», отличие не засчитано.
    const same = await read<{ x: number; y: number }>('data-same');
    await page.mouse.click(same.x, same.y);
    await expect
      .poll(async () => (await spoken(page)).some((x) => x.text === 'Здесь одинаково. Ищи ещё!'))
      .toBe(true);
    await expect(g).toHaveAttribute('data-found', '0');
    // Долго не находим — прилетает лупа.
    await expect(g).not.toHaveAttribute('data-hint', '-1', { timeout: 30_000 });
    await page.waitForTimeout(1200);
    await shot(page, 'diff-lens');
    for (let round = 0; round < 2; round++) {
      await expect(g).toHaveAttribute('data-round', String(round), { timeout: 15_000 });
      await expect(g).toHaveAttribute('data-phase', 'play', { timeout: 8000 });
      for (let k = 0; k < 3; k++) {
        await expect.poll(async () => (await read<unknown[]>('data-diffs'))?.length).toBe(3 - k);
        const [d] = await read<{ x: number; y: number }[]>('data-diffs');
        await page.mouse.click(d!.x, d!.y);
        await expect(g).toHaveAttribute('data-found', String(k + 1));
        if (round === 0 && k === 1) {
          await page.waitForTimeout(500);
          await shot(page, 'diff-found');
        }
      }
    }
    await expect(g).toHaveAttribute('data-phase', 'finish', { timeout: 10_000 });
    await expectFinished(page, backend);
    const said = (await spoken(page)).map((x) => x.text);
    expect(said).toContain('Найди отличия! Картинки почти одинаковые. Нажми, где по-другому.');
    expect(said).toContain('Посмотри сюда, где лупа!');
    expect(said).toContain('Осталось два отличия.');
    expect(said).toContain('Все отличия нашли! Вот новая картинка.');
  });

  test('смешай краски (этап 57): лишняя краска выливается, капли смешиваются, кисточка красит, финиш', async ({
    page,
    backend,
  }) => {
    test.setTimeout(180_000);
    backend.items = [
      game(1, { kind: 'paints', colors: ['orange', 'green'], tubes: 'primary', rounds: 2 }),
    ];
    await openGame(page);
    const g = page.getByTestId('game-paints');
    await expect(g).toHaveAttribute('data-phase', 'mix', { timeout: 8000 });
    const paints = new PaintsPilot(page);
    // Три тюбика на столе, ничего не нажимаем — совёнок подсказывает, что смешать.
    expect((await paints.tubes()).map((t) => t.tube)).toEqual(['red', 'yellow', 'blue']);
    await expect
      .poll(
        async () => (await spoken(page)).some((x) => /^Смешай (красную|жёлтую) и /.test(x.text)),
        {
          timeout: 20_000,
        },
      )
      .toBe(true);
    await shot(page, 'paints-start');
    for (let round = 0; round < 2; round++) {
      await expect(g).toHaveAttribute('data-round', String(round), { timeout: 15_000 });
      await expect(g).toHaveAttribute('data-phase', 'mix', { timeout: 8000 });
      const need = await paints.read<string[]>('data-need');
      if (round === 0) {
        // Нужная, потом чужая краска — другой цвет, баночка выливается и пустеет.
        await paints.drip(need[0]!);
        await page.waitForTimeout(400);
        await shot(page, 'paints-drop');
        const other = (await paints.tubes()).find((t) => !need.includes(t.tube))!;
        await paints.drip(other.tube);
        await expect(g).toHaveAttribute('data-phase', 'drain');
        await page.waitForTimeout(1700);
        await shot(page, 'paints-drain');
        await expect(g).toHaveAttribute('data-phase', 'mix', { timeout: 8000 });
        await expect
          .poll(() => paints.read('data-drops'))
          .toEqual({ red: 0, yellow: 0, blue: 0, white: 0 });
      }
      for (const c of need) await paints.drip(c);
      await expect(g).toHaveAttribute('data-phase', 'paint');
      if (round === 0) {
        await page.waitForTimeout(2300);
        await shot(page, 'paints-brush');
      }
      await expect(g).toHaveAttribute('data-phase', /alive|next|finish/, { timeout: 8000 });
      if (round === 0) await shot(page, 'paints-alive');
    }
    await expect(g).toHaveAttribute('data-phase', 'finish', { timeout: 15_000 });
    await expectFinished(page, backend);
    const done = backend.events.find((e) => e.type === 'interactive_complete')!;
    expect(done.payload).toMatchObject({ mistakes: 1 });
    const said = (await spoken(page)).map((x) => x.text);
    expect(said).toContain('Смешай краски! Нажимай на тюбики — краска капнет в баночку.');
    expect(
      said.some((x) => /^(Тыква|Морковка) оранжевая\. Сделай оранжевую краску!$/.test(x)),
    ).toBe(true);
    expect(
      said.some((x) => /^(Лягушка|Огурец) зелён(ая|ый)\. Сделай зелёную краску!$/.test(x)),
    ).toBe(true);
    expect(
      said.some((x) => /^А нужна (оранжевая|зелёная)\. Выльем и попробуем ещё!$/.test(x)),
    ).toBe(true);
    expect(said).toContain('Получилась оранжевая!');
    expect(said).toContain('Получилась зелёная!');
  });

  test('смешай краски (этап 57): «что получится?», коричневый из трёх красок и розовый с белой', async ({
    page,
    backend,
  }) => {
    test.setTimeout(150_000);
    backend.items = [
      game(1, { kind: 'paints', colors: ['brown', 'pink'], tubes: 'all', guess: true, rounds: 2 }),
    ];
    await openGame(page);
    const g = page.getByTestId('game-paints');
    const paints = new PaintsPilot(page);
    for (let round = 0; round < 2; round++) {
      await expect(g).toHaveAttribute('data-round', String(round), { timeout: 15_000 });
      await expect(g).toHaveAttribute('data-phase', 'guess', { timeout: 8000 });
      const target = await g.getAttribute('data-target');
      const choices = g.locator('.paints-choice');
      await expect(choices).toHaveCount(3);
      if (round === 0) {
        await page.waitForTimeout(600);
        await shot(page, 'paints-guess');
        // Не тот цвет — не засчитано, ещё раз.
        await g
          .locator(`.paints-choice:not([data-testid=paints-choice-${target}])`)
          .first()
          .click();
        await expect(g).toHaveAttribute('data-phase', 'guess');
        await page.waitForTimeout(1500);
      }
      await g.getByTestId(`paints-choice-${target}`).click();
      await expect(g).toHaveAttribute('data-phase', 'mix');
      expect((await paints.tubes()).map((t) => t.tube)).toEqual(['red', 'yellow', 'blue', 'white']);
      for (const c of await paints.read<string[]>('data-need')) await paints.drip(c);
      await expect(g).toHaveAttribute('data-phase', 'paint');
    }
    await expect(g).toHaveAttribute('data-phase', 'finish', { timeout: 15_000 });
    await expectFinished(page, backend);
    const said = (await spoken(page)).map((x) => x.text);
    expect(said).toContain('Что получится, если смешать красную, жёлтую и синюю?');
    expect(said).toContain('Что получится, если смешать красную и белую?');
    expect(said).toContain('Правильно, коричневая! Проверим — капай краски.');
    expect(said).toContain('Получилась розовая!');
  });

  test('поезд (этап 57): зверята по билетам с точками, не тот вагон — «Это вагон …», две станции', async ({
    page,
    backend,
  }) => {
    test.setTimeout(180_000);
    backend.items = [
      game(1, { kind: 'train', task: 'tickets', look: 'dots', max: 3, wagons: 3, rounds: 2 }),
    ];
    await openGame(page);
    const g = page.getByTestId('game-train');
    const train = new TrainPilot(page);
    await page.waitForTimeout(1200);
    await shot(page, 'train-ride');
    const names = ['', 'один', 'два', 'три'];
    for (let round = 0; round < 2; round++) {
      await expect(g).toHaveAttribute('data-round', String(round), { timeout: 25_000 });
      await train.stopped('board');
      const wagons = (await train.wagons()).map((w) => w.n);
      expect(wagons).toEqual([1, 2, 3]);
      const tickets = (await train.passengers()).map((p) => p.ticket);
      expect([...tickets].sort()).toEqual([1, 2, 3]);
      if (round === 0) {
        await page.waitForTimeout(600);
        await shot(page, 'train-board');
        // Не в тот вагон — зверёк возвращается на платформу, совёнок подсказывает номер.
        const t = tickets[0]!;
        await train.seat(
          t,
          wagons.find((n) => n !== t)!,
        );
        await expect
          .poll(
            async () => (await spoken(page)).some((x) => x.text === `Найди вагон ${names[t]}!`),
            {
              timeout: 12_000,
            },
          )
          .toBe(true);
        expect(await train.seated(t)).toBe(false);
        // После ошибки касания на миг закрыты.
        await expect(page.getByTestId('game')).toHaveAttribute('data-lock', 'none');
      }
      for (const [k, t] of tickets.entries()) {
        await train.seat(t);
        await expect.poll(() => train.seated(t)).toBe(true);
        if (round === 0 && k === 0) {
          await page.waitForTimeout(700);
          await shot(page, 'train-seated');
        }
      }
      if (round === 0) {
        await expect(g).toHaveAttribute('data-phase', 'ride', { timeout: 12_000 });
        await page.waitForTimeout(900);
        await shot(page, 'train-tunnel');
      }
    }
    await expect(g).toHaveAttribute('data-phase', 'finish', { timeout: 15_000 });
    await page.waitForTimeout(800);
    await shot(page, 'train-finish');
    await expectFinished(page, backend);
    const done = backend.events.find((e) => e.type === 'interactive_complete')!;
    expect(done.payload).toMatchObject({ mistakes: 1 });
    const said = (await spoken(page)).map((x) => x.text);
    expect(said).toContain(
      'Поезд приехал! Посади зверят в вагоны: у вагона такой же номер, как на билете.',
    );
    expect(said).toContain('Новая станция! Кто поедет дальше?');
    expect(said).toContain('Ту-ту! Поехали!');
    expect(said).toContain('Приехали! Все зверята довольны.');
    expect(said.some((x) => /^Это вагон (один|два|три)\.$/.test(x))).toBe(true);
  });

  test('поезд (этап 57): посчитай точки — найди цифру, потом «вагон потерялся» на запасном пути', async ({
    page,
    backend,
  }) => {
    test.setTimeout(180_000);
    backend.items = [
      game(1, { kind: 'train', task: 'mixed', look: 'count', max: 10, wagons: 4, rounds: 2 }),
    ];
    await openGame(page);
    const g = page.getByTestId('game-train');
    const train = new TrainPilot(page);
    await train.stopped('board');
    await expect(g).toHaveAttribute('data-kind', 'tickets');
    await page.waitForTimeout(600);
    await shot(page, 'train-count');
    for (const p of await train.passengers()) {
      await train.seat(p.ticket);
      await expect.poll(() => train.seated(p.ticket)).toBe(true);
    }
    await expect(g).toHaveAttribute('data-round', '1', { timeout: 25_000 });
    await train.stopped('fix');
    await expect(g).toHaveAttribute('data-kind', 'missing');
    const gap = (await train.read<{ need: number }>('data-gap'))!;
    const spare = (await train.read<{ n: number }[]>('data-spare')).map((x) => x.n);
    expect(spare).toHaveLength(3);
    expect(spare).toContain(gap.need);
    await page.waitForTimeout(600);
    await shot(page, 'train-lost');
    // Не тот вагон — уезжает обратно на запасной путь.
    await train.fill(spare.find((n) => n !== gap.need)!);
    await expect
      .poll(async () => (await spoken(page)).some((x) => x.text === 'А какой вагон дальше?'), {
        timeout: 12_000,
      })
      .toBe(true);
    await expect(page.getByTestId('game')).toHaveAttribute('data-lock', 'none');
    await train.fill(gap.need);
    await expect.poll(async () => (await train.wagons()).every((w) => w.filled)).toBe(true);
    await expect(g).toHaveAttribute('data-phase', 'finish', { timeout: 15_000 });
    await expectFinished(page, backend);
    const done = backend.events.find((e) => e.type === 'interactive_complete')!;
    expect(done.payload).toMatchObject({ mistakes: 1 });
    const said = (await spoken(page)).map((x) => x.text);
    expect(said).toContain('Ой, один вагон потерялся! Найди его на запасном пути.');
  });

  test('весы (этап 57): какая чаша тяжелее — не та «Посчитай», подставки опускаются, два задания', async ({
    page,
    backend,
  }) => {
    test.setTimeout(150_000);
    backend.items = [
      game(1, { kind: 'scales', tasks: ['compare'], look: 'cubes', max: 5, rounds: 2 }),
    ];
    await openGame(page);
    const g = page.getByTestId('game-scales');
    const scales = new ScalesPilot(page);
    const names = ['', 'один', 'два', 'три', 'четыре', 'пять'];
    for (let round = 0; round < 2; round++) {
      await expect(g).toHaveAttribute('data-round', String(round), { timeout: 25_000 });
      await scales.ready();
      await expect(g).toHaveAttribute('data-kind', 'compare');
      const [l, r] = (await scales.pans()).map((p) => p.total) as [number, number];
      expect(l).not.toBe(r);
      expect(Math.max(l, r)).toBeLessThanOrEqual(5);
      const heavy = l > r ? 0 : 1;
      if (round === 0) {
        await page.waitForTimeout(500);
        await shot(page, 'scales-compare');
        // Не та чаша — весы вздрагивают на подставках, совёнок: «Посчитай…».
        await scales.tapPan(heavy ? 0 : 1);
        await expect
          .poll(
            async () =>
              (await spoken(page)).some(
                (x) => x.text === 'Посчитай: где больше — та чаша и тяжелее.',
              ),
            {
              timeout: 12_000,
            },
          )
          .toBe(true);
        await scales.ready();
      }
      await scales.tapPan(heavy);
      await expect(g).toHaveAttribute('data-phase', /done|finish/);
      if (round === 0) {
        // Подставки ушли — тяжёлая чаша опустилась.
        await page.waitForTimeout(1200);
        await shot(page, 'scales-compare-done');
      }
      const big = Math.max(l, r);
      await expect
        .poll(async () => (await spoken(page)).some((x) => x.text === names[big]), {
          timeout: 12_000,
        })
        .toBe(true);
    }
    await expect(g).toHaveAttribute('data-phase', 'finish', { timeout: 15_000 });
    // Снимок большой и под нагрузкой долгий, а «Готово» висит недолго — ждём его параллельно.
    await Promise.all([shot(page, 'scales-finish'), expectFinished(page, backend)]);
    const done = backend.events.find((e) => e.type === 'interactive_complete')!;
    expect(done.payload).toMatchObject({ mistakes: 1 });
    const said = (await spoken(page)).map((x) => x.text);
    expect(said).toContain('Какая чаша тяжелее? Нажми на неё — и весы покажут!');
    expect(said).toContain('А здесь какая чаша тяжелее?');
    expect(said).toContain('больше, чем');
    expect(said).toContain('Всё взвесили! Спасибо, помощник!');
  });

  test('весы (этап 57): уравновесь гирьками с цифрами — перевес возвращается, потом «сложи»', async ({
    page,
    backend,
  }) => {
    test.setTimeout(180_000);
    backend.items = [
      game(1, { kind: 'scales', tasks: ['balance', 'sum'], look: 'digits', max: 6, rounds: 2 }),
    ];
    await openGame(page);
    const g = page.getByTestId('game-scales');
    const scales = new ScalesPilot(page);
    await scales.ready();
    await expect(g).toHaveAttribute('data-kind', 'balance');
    const target = Number(await g.getAttribute('data-left'));
    expect(target >= 3 && target <= 6).toBe(true);
    expect((await scales.tray()).map((p) => p.v)).toEqual([1, 2, 3]);
    await page.waitForTimeout(400);
    await shot(page, 'scales-balance');
    // Сначала — с перевесом: лишняя гирька сама уезжает на прилавок.
    while (target - (await scales.right()) > 2) {
      await scales.put(2);
      await scales.ready();
    }
    const over = target - (await scales.right()) + 1;
    await scales.put(over, true, false);
    await page.waitForTimeout(500);
    await shot(page, 'scales-over');
    await expect
      .poll(
        async () => (await spoken(page)).some((x) => x.text === 'Ой, перевесило! Уберём лишнее.'),
        {
          timeout: 12_000,
        },
      )
      .toBe(true);
    await expect.poll(() => scales.right(), { timeout: 8000 }).toBeLessThan(target);
    await scales.ready();
    for (
      let rem = target - (await scales.right());
      rem > 0;
      rem = target - (await scales.right())
    ) {
      await scales.put(Math.min(3, rem));
      if (rem > 3) await scales.ready();
    }
    await page.waitForTimeout(700);
    await shot(page, 'scales-even');
    // «Сложи»: не та гиря — весы показывают перевес, гиря возвращается.
    await expect(g).toHaveAttribute('data-round', '1', { timeout: 25_000 });
    await scales.ready();
    await expect(g).toHaveAttribute('data-kind', 'sum');
    const need = Number(await g.getAttribute('data-left'));
    const choices = (await scales.tray()).map((p) => p.v);
    expect(choices).toHaveLength(3);
    expect(choices).toContain(need);
    await page.waitForTimeout(400);
    await shot(page, 'scales-sum');
    const wrong = choices.find((v) => v !== need)!;
    await scales.put(wrong);
    await expect
      .poll(
        async () =>
          (await spoken(page)).some(
            (x) =>
              x.text ===
              (wrong < need ? 'Легковато! Нужно тяжелее.' : 'Тяжеловато! Нужно полегче.'),
          ),
        { timeout: 12_000 },
      )
      .toBe(true);
    await expect.poll(() => scales.right(), { timeout: 8000 }).toBe(0);
    await scales.ready();
    await scales.put(need, true);
    await expect(g).toHaveAttribute('data-phase', 'finish', { timeout: 15_000 });
    await expectFinished(page, backend);
    const done = backend.events.find((e) => e.type === 'interactive_complete')!;
    expect(done.payload).toMatchObject({ mistakes: 2 });
    const said = (await spoken(page)).map((x) => x.text);
    expect(said).toContain(
      'Уравновесь весы! Клади гирьки на пустую чашу, пока стрелка не встанет посередине.',
    );
    expect(said).toContain('Поровну!');
    expect(said).toContain('Поставь на пустую чашу одну гирю — чтобы стало поровну!');
    expect(said).toContain('плюс');
    expect(said).toContain('будет');
  });

  test('весы (этап 57): «сложи» башенками из кубиков', async ({ page, backend }) => {
    test.setTimeout(120_000);
    backend.items = [game(1, { kind: 'scales', tasks: ['sum'], look: 'cubes', max: 8, rounds: 2 })];
    await openGame(page);
    const g = page.getByTestId('game-scales');
    const scales = new ScalesPilot(page);
    for (let round = 0; round < 2; round++) {
      await expect(g).toHaveAttribute('data-round', String(round), { timeout: 25_000 });
      await scales.ready();
      const need = Number(await g.getAttribute('data-left'));
      if (round === 0) {
        await page.waitForTimeout(400);
        await shot(page, 'scales-towers');
      }
      await scales.put(need);
      if (round === 0) {
        await page.waitForTimeout(900);
        await shot(page, 'scales-towers-done');
      }
    }
    await expect(g).toHaveAttribute('data-phase', 'finish', { timeout: 15_000 });
    await expectFinished(page, backend);
    const said = (await spoken(page)).map((x) => x.text);
    expect(said).toContain('Поставь на пустую чашу одну башенку — чтобы стало поровну!');
    expect(said).toContain('Какую башенку поставим?');
  });

  test('шестерёнки (этап 57): собрать цепочку нажатием и перетаскиванием, покрутить ручку', async ({
    page,
    backend,
  }) => {
    test.setTimeout(150_000);
    backend.items = [
      game(1, { kind: 'gears', tasks: ['build'], gaps: 2, sizes: false, rounds: 2 }),
    ];
    await openGame(page);
    const g = page.getByTestId('game-gears');
    const gears = new GearsPilot(page);
    await gears.ready();
    await expect(g).toHaveAttribute('data-kind', 'build');
    expect((await gears.pegs()).map((p) => p.need)).toEqual([12, 12]);
    expect((await gears.tray()).map((p) => p.teeth)).toEqual([12, 12]);
    await page.waitForTimeout(500);
    await shot(page, 'gears-build');
    // Ручка не дотягивается до машины — совёнок подсказывает.
    await gears.push();
    await expect
      .poll(async () =>
        (await spoken(page)).some(
          (x) => x.text === 'Не дотягивается! Поставь шестерёнку на пустое место.',
        ),
      )
      .toBe(true);
    await expect(g).toHaveAttribute('data-ready', '0');
    // Первую — нажатием (летит на первый пустой гвоздик), вторую — перетаскиванием.
    await gears.put(12);
    await expect.poll(() => gears.places()).toBe(1);
    await gears.ready();
    await gears.put(12, await gears.firstPeg());
    await expect.poll(() => gears.places()).toBe(2);
    await expect(g).toHaveAttribute('data-ready', '1');
    await expect
      .poll(async () => (await spoken(page)).some((x) => x.text === 'Готово! Покрути ручку!'))
      .toBe(true);
    await gears.ready();
    await page.waitForTimeout(300);
    await shot(page, 'gears-ready');
    // Нажали на ручку — толчок, цепочка проворачивается, машина заработала.
    await gears.push();
    await expect.poll(() => gears.turns(), { timeout: 10_000 }).toBe(1);
    await expect(g).toHaveAttribute('data-phase', /done|finish/);
    await page.waitForTimeout(900);
    await shot(page, 'gears-works');
    // Вторая машина — крутим ручку пальцем.
    await expect(g).toHaveAttribute('data-round', '1', { timeout: 25_000 });
    await gears.ready();
    for (let k = 0; k < 2; k++) {
      await gears.put(12);
      await expect.poll(() => gears.places()).toBe(3 + k);
      await gears.ready();
    }
    await expect(g).toHaveAttribute('data-ready', '1');
    await page.waitForTimeout(300);
    await shot(page, 'gears-ready-2');
    await gears.crank(1.3);
    await expect.poll(() => gears.turns(), { timeout: 10_000 }).toBe(2);
    await expect(g).toHaveAttribute('data-phase', 'finish', { timeout: 20_000 });
    await page.waitForTimeout(600);
    await shot(page, 'gears-finish');
    await expectFinished(page, backend);
    const done = backend.events.find((e) => e.type === 'interactive_complete')!;
    expect(done.payload).toMatchObject({ mistakes: 0 });
    const said = (await spoken(page)).map((x) => x.text);
    expect(
      said.some((x) => x.endsWith('Поставь шестерёнки на пустые места — чтобы зубчики сцепились.')),
    ).toBe(true);
    expect(said.some((x) => x.endsWith('Поставь шестерёнки!'))).toBe(true);
    expect(said).toContain('Все машины работают! Ты настоящий механик!');
  });

  test('шестерёнки (этап 57): разного размера — не та не встаёт, потом «в какую сторону»', async ({
    page,
    backend,
  }) => {
    test.setTimeout(150_000);
    backend.items = [
      game(1, { kind: 'gears', tasks: ['build', 'direction'], gaps: 3, sizes: true, rounds: 2 }),
    ];
    await openGame(page);
    const g = page.getByTestId('game-gears');
    const gears = new GearsPilot(page);
    await gears.ready();
    await expect(g).toHaveAttribute('data-kind', 'build');
    const pegs = await gears.pegs();
    const tray = (await gears.tray()).map((p) => p.teeth);
    // В ящике — нужные и лишние: всех трёх размеров.
    expect(new Set(tray)).toEqual(new Set([8, 12, 16]));
    expect(tray.length).toBeGreaterThan(pegs.length);
    await page.waitForTimeout(500);
    await shot(page, 'gears-sizes');
    // Не тот размер — шестерёнка трясётся на гвоздике и возвращается в ящик.
    const need = pegs[0]!.need;
    const wrong = tray.find((t) => t !== need)!;
    await gears.put(wrong);
    await page.waitForTimeout(450);
    await shot(page, 'gears-wrong');
    const why = wrong > need ? 'Великовата! Не помещается.' : 'Маловата! Не достаёт до соседок.';
    await expect.poll(async () => (await spoken(page)).some((x) => x.text === why)).toBe(true);
    await gears.ready();
    expect(await gears.places()).toBe(0);
    expect((await gears.tray()).every((p) => !p.used)).toBe(true);
    for (let k = 0; k < pegs.length; k++) {
      await gears.put((await gears.firstPeg()).need);
      await expect.poll(() => gears.places()).toBe(k + 1);
      await gears.ready();
    }
    await expect(g).toHaveAttribute('data-ready', '1');
    await gears.crank(1.3, -1);
    await expect.poll(() => gears.turns(), { timeout: 10_000 }).toBe(1);
    // «В какую сторону»: ручку крутят по стрелке; сначала не та стрелка — цепочка показывает.
    await expect(g).toHaveAttribute('data-round', '1', { timeout: 25_000 });
    await gears.ready();
    await expect(g).toHaveAttribute('data-kind', 'direction');
    const dir = Number(await g.getAttribute('data-dir')) as 1 | -1;
    await page.waitForTimeout(500);
    await shot(page, 'gears-direction');
    await gears.tapArrow(-dir as 1 | -1);
    await expect
      .poll(async () =>
        (await spoken(page)).some(
          (x) => x.text === 'Посмотри: каждая шестерёнка крутит соседку в обратную сторону!',
        ),
      )
      .toBe(true);
    await page.waitForTimeout(2200);
    await shot(page, 'gears-direction-shown');
    await gears.ready();
    await gears.tapArrow(dir);
    await expect(g).toHaveAttribute('data-phase', /done|finish/);
    await expect(g).toHaveAttribute('data-phase', 'finish', { timeout: 20_000 });
    await expectFinished(page, backend);
    const done = backend.events.find((e) => e.type === 'interactive_complete')!;
    expect(done.payload).toMatchObject({ mistakes: 2 });
    const said = (await spoken(page)).map((x) => x.text);
    expect(said).toContain(dir > 0 ? 'По часовой стрелке!' : 'Против часовой стрелки!');
    expect(said).toContain('Соседние шестерёнки крутятся в разные стороны.');
  });

  test('одень мишку (этап 58): одна вещь, не та — мишка мотает головой, перетаскиванием', async ({
    page,
    backend,
  }) => {
    test.setTimeout(150_000);
    backend.items = [
      game(1, { kind: 'dress', weathers: ['rain', 'snow'], items: 1, tasks: ['dress'], rounds: 2 }),
    ];
    await openGame(page);
    const g = page.getByTestId('game-dress');
    const dress = new DressPilot(page);
    await dress.ready();
    await expect(g).toHaveAttribute('data-task', 'dress');
    const first = (await g.getAttribute('data-weather')) as 'rain' | 'snow';
    const main = { rain: 'umbrella', snow: 'hat' }[first];
    expect(await dress.need()).toEqual([main]);
    const tray = (await dress.tray()).map((x) => x.id);
    // В шкафу — нужная вещь и одна неподходящая.
    expect(tray).toHaveLength(2);
    expect(tray).toContain(main);
    await page.waitForTimeout(900);
    await shot(page, 'dress-start');
    // Не та — мишка мотает головой, голос говорит почему, вещь возвращается в шкаф.
    const bad = tray.find((id) => id !== main)!;
    await dress.take(bad);
    await expect.poll(() => dress.count('data-misses')).toBe(1);
    await page.waitForTimeout(180);
    await shot(page, 'dress-shake');
    await dress.ready();
    expect((await dress.tray()).find((x) => x.id === bad)!.ready).toBe(true);
    expect(await dress.worn()).toEqual([]);
    await dress.take(main);
    await expect(g).toHaveAttribute('data-phase', /done|finish/, { timeout: 8000 });
    expect((await dress.worn()).map((x) => x.id)).toEqual([main]);
    await page.waitForTimeout(700);
    await shot(page, 'dress-done');
    // Вторая погода — перетаскиванием.
    await expect(g).toHaveAttribute('data-round', '1', { timeout: 25_000 });
    await dress.ready();
    const second = (await g.getAttribute('data-weather')) as 'rain' | 'snow';
    expect(second).not.toBe(first);
    await page.waitForTimeout(900);
    await shot(page, 'dress-second');
    await dress.take((await dress.need())[0]!, true);
    await expect(g).toHaveAttribute('data-phase', 'finish', { timeout: 20_000 });
    await page.waitForTimeout(600);
    await shot(page, 'dress-finish');
    await expectFinished(page, backend);
    const done = backend.events.find((e) => e.type === 'interactive_complete')!;
    expect(done.payload).toMatchObject({ mistakes: 1 });
    const said = (await spoken(page)).map((x) => x.text);
    expect(said).toContain('На улице дождик! Что нужно мишке на прогулку?');
    expect(said).toContain('На улице снег! Что нужно мишке на прогулку?');
    expect(said).toContain('Зонтик — от дождя!');
    expect(said).toContain('Шапка — чтобы ушки не замёрзли!');
    expect(said).toContain('Мишка оделся и идёт гулять! Спасибо за помощь!');
  });

  test('одень мишку (этап 58): весь наряд, потом «что не так?» — снять лишнее', async ({
    page,
    backend,
  }) => {
    test.setTimeout(180_000);
    backend.items = [
      game(1, { kind: 'dress', weathers: ['sun'], items: 4, tasks: ['dress', 'odd'], rounds: 2 }),
    ];
    await openGame(page);
    const g = page.getByTestId('game-dress');
    const dress = new DressPilot(page);
    await dress.ready();
    await expect(g).toHaveAttribute('data-weather', 'sun');
    expect([...(await dress.need())].sort()).toEqual(['glasses', 'panama', 'sandals', 'tshirt']);
    // Шкаф полный: четыре нужные и четыре лишние.
    expect(await dress.tray()).toHaveLength(8);
    await page.waitForTimeout(900);
    await shot(page, 'dress-full');
    await dress.dressAll();
    await expect(g).toHaveAttribute('data-phase', /done|finish/, { timeout: 8000 });
    expect(await dress.worn()).toHaveLength(4);
    await page.waitForTimeout(700);
    await shot(page, 'dress-full-done');
    // «Что не так?»: мишка оделся сам, одна вещь — для холода.
    await expect(g).toHaveAttribute('data-round', '1', { timeout: 25_000 });
    await dress.ready();
    await expect(g).toHaveAttribute('data-task', 'odd');
    await expect(g).toHaveAttribute('data-step', 'see');
    const wrong = (await g.getAttribute('data-wrong'))!;
    const worn = (await dress.worn()).map((x) => x.id);
    expect(worn).toHaveLength(4);
    expect(worn).toContain(wrong);
    expect((await dress.tray()).every((x) => !x.ready)).toBe(true);
    await page.waitForTimeout(1500);
    await shot(page, 'dress-odd');
    // Подходящая вещь — «это подходит», не снимается.
    const fine = worn.find((id) => id !== wrong && id !== 'glasses')!;
    await dress.tapWorn(fine);
    await expect.poll(() => dress.count('data-misses')).toBe(1);
    await dress.ready();
    expect(await dress.count('data-removed')).toBe(0);
    await dress.tapWorn(wrong);
    await expect.poll(() => dress.count('data-removed')).toBe(1);
    await expect(g).toHaveAttribute('data-step', 'fix');
    await dress.ready();
    expect((await dress.worn()).map((x) => x.id)).not.toContain(wrong);
    const need = await dress.need();
    expect(need).toHaveLength(1);
    await page.waitForTimeout(500);
    await shot(page, 'dress-fix');
    await dress.take(need[0]!, true);
    await expect(g).toHaveAttribute('data-phase', 'finish', { timeout: 20_000 });
    expect((await dress.worn()).map((x) => x.id).sort()).toEqual([
      'glasses',
      'panama',
      'sandals',
      'tshirt',
    ]);
    await page.waitForTimeout(600);
    await shot(page, 'dress-odd-finish');
    await expectFinished(page, backend);
    const said = (await spoken(page)).map((x) => x.text);
    expect(said).toContain('На улице солнышко и жара! Одень мишку на прогулку! Нужны четыре вещи.');
    expect(said).toContain('На улице солнышко и жара! Мишка оделся сам. Что не так?');
    expect(said).toContain('Это подходит! Найди, что не так.');
    expect(said).toContain('Что надеть вместо?');
    expect(said).toContain('Теперь мишке не жарко!');
  });

  test('сложи фигуру (этап 58): две детали с контурами — мимо, на место; фигура оживает', async ({
    page,
    backend,
  }) => {
    test.setTimeout(150_000);
    backend.items = [
      game(1, { kind: 'figure', figures: ['fish', 'house'], pieces: 2, outlines: true, rounds: 2 }),
    ];
    await openGame(page);
    const g = page.getByTestId('game-figure');
    const fig = new FigurePilot(page);
    await fig.ready();
    const first = (await g.getAttribute('data-figure')) as 'fish' | 'house';
    expect(['fish', 'house']).toContain(first);
    await expect(g).toHaveAttribute('data-turn', '0');
    // В лотке — две разные детали, у фигуры — два пустых места.
    const tray = await fig.tray();
    expect(tray).toHaveLength(2);
    expect(tray[0]!.type).not.toBe(tray[1]!.type);
    expect(tray.every((t) => t.taps === 0)).toBe(true);
    expect(await fig.slots()).toHaveLength(2);
    await page.waitForTimeout(900);
    await shot(page, 'figure-start');
    // Нажали — без поворотов деталь только качается и показывает своё место.
    await fig.tap(tray[0]!.n);
    await page.waitForTimeout(500);
    await shot(page, 'figure-peek');
    expect(await fig.count('data-turns')).toBe(0);
    // Мимо фигуры — деталь тихо возвращается в лоток, это не ошибка.
    await fig.ready();
    await fig.drag(tray[0]!.n, tray[1]!);
    await fig.ready();
    expect(await fig.tray()).toHaveLength(2);
    expect(await fig.count('data-misses')).toBe(0);
    expect(await fig.count('data-snaps')).toBe(0);
    await fig.place(tray[0]!.n);
    expect(await fig.slots()).toHaveLength(1);
    await fig.ready();
    await shot(page, 'figure-one');
    await fig.place(tray[1]!.n);
    await expect(g).toHaveAttribute('data-phase', /done|finish/, { timeout: 8000 });
    await page.waitForTimeout(1300);
    await shot(page, 'figure-alive');
    // Вторая фигура.
    await expect(g).toHaveAttribute('data-round', '1', { timeout: 25_000 });
    await fig.ready();
    const second = await g.getAttribute('data-figure');
    expect(second).not.toBe(first);
    await page.waitForTimeout(900);
    await shot(page, 'figure-second');
    await fig.build();
    await expect(g).toHaveAttribute('data-phase', /done|finish/, { timeout: 8000 });
    await page.waitForTimeout(1300);
    await shot(page, 'figure-second-alive');
    await expect(g).toHaveAttribute('data-phase', 'finish', { timeout: 20_000 });
    await expectFinished(page, backend);
    const done = backend.events.find((e) => e.type === 'interactive_complete')!;
    expect(done.payload).toMatchObject({ mistakes: 0 });
    const said = (await spoken(page)).map((x) => x.text);
    expect(said).toContain('Собери рыбку! Перетащи детальки на свои места.');
    expect(said).toContain('Собери домик! Перетащи детальки на свои места.');
    expect(said).toContain('Получилась рыбка! Плыви, рыбка!');
    expect(said).toContain('Получился домик! В окошке зажёгся свет.');
    expect(said).toContain('Все фигуры собраны! Ты настоящий мастер!');
  });

  test('сложи фигуру (этап 58): все семь повёрнутыми по силуэту — «поверни», «не отсюда»', async ({
    page,
    backend,
  }) => {
    test.setTimeout(240_000);
    backend.items = [
      game(1, {
        kind: 'figure',
        figures: ['boat', 'cat'],
        pieces: 7,
        outlines: false,
        turn: true,
        rounds: 2,
      }),
    ];
    await openGame(page);
    const g = page.getByTestId('game-figure');
    const fig = new FigurePilot(page);
    await fig.ready();
    const first = (await g.getAttribute('data-figure')) as 'boat' | 'cat';
    await expect(g).toHaveAttribute('data-turn', '1');
    const tray = await fig.tray();
    expect(tray).toHaveLength(7);
    // Все детали, кроме квадрата, лежат не так — без поворота ни на одно своё место не встают.
    expect(tray.filter((t) => t.type !== 'square').every((t) => t.taps > 0)).toBe(true);
    await page.waitForTimeout(900);
    await shot(page, 'figure-seven');
    // Не повернули — над своим местом деталь качается: «Почти! Поверни».
    const crooked = tray.find((t) => t.type !== 'square')!;
    await fig.drag(crooked.n, { x: crooked.tx, y: crooked.ty });
    await expect.poll(() => fig.count('data-almost')).toBe(1);
    await page.waitForTimeout(250);
    await shot(page, 'figure-almost');
    await fig.ready();
    expect(await fig.count('data-snaps')).toBe(0);
    // На чужое место — «не отсюда»: деталь и место другого вида, своё место далеко.
    const slots = await fig.slots();
    const unit = Number(await g.getAttribute('data-unit'));
    const far = (t: FigureTrayPiece, s: { type: string; x: number; y: number }) =>
      s.type !== t.type &&
      slots
        .filter((o) => o.type === t.type)
        .every((o) => Math.hypot(o.x - s.x, o.y - s.y) > 1.2 * unit);
    const t = tray.find((x) => slots.some((s) => far(x, s)))!;
    await fig.drag(
      t.n,
      slots.find((s) => far(t, s))!,
    );
    await expect.poll(() => fig.count('data-misses')).toBe(1);
    await fig.ready();
    expect(await fig.count('data-snaps')).toBe(0);
    // Повернуть нажатием и собрать всё.
    await fig.build();
    expect(await fig.count('data-turns')).toBeGreaterThan(0);
    await expect(g).toHaveAttribute('data-phase', /done|finish/, { timeout: 8000 });
    await page.waitForTimeout(1300);
    await shot(page, 'figure-seven-alive');
    await expect(g).toHaveAttribute('data-round', '1', { timeout: 25_000 });
    await fig.ready();
    expect(await g.getAttribute('data-figure')).not.toBe(first);
    await page.waitForTimeout(900);
    await shot(page, 'figure-seven-second');
    await fig.build();
    await expect(g).toHaveAttribute('data-phase', 'finish', { timeout: 20_000 });
    await page.waitForTimeout(1000);
    await shot(page, 'figure-seven-finish');
    await expectFinished(page, backend);
    const done = backend.events.find((e) => e.type === 'interactive_complete')!;
    // «Поверни» — не ошибка, «не отсюда» — ошибка.
    expect(done.payload).toMatchObject({ mistakes: 1 });
    const said = (await spoken(page)).map((x) => x.text);
    expect(said).toContain(
      'Собери кораблик! Перетащи детальки на свои места. Нажми на детальку — она повернётся.',
    );
    expect(said).toContain('Почти! Поверни детальку: нажми на неё.');
    expect(said).toContain('Эта деталька не отсюда. Найди, где её место!');
    expect(said).toContain('Получился кораблик! Счастливого плавания!');
    expect(said).toContain('Получилась кошка! Мяу!');
  });

  test('стих (этап 45): послушать, повторять за голосом, «Договори словечко», вопросы — часть выучена', async ({
    page,
    backend,
  }) => {
    test.setTimeout(120_000);
    // Голос «говорит» по 700 мс — успеваем увидеть каждый шаг занятия.
    await page.addInitScript(
      () => ((window as unknown as { __speechMs: number }).__speechMs = 700),
    );
    backend.items = [
      game(
        1,
        { kind: 'poem', poem: 'petushok', repeat: true, blanks: true, questions: true, choices: 3 },
        'poems',
      ),
      game(2, { kind: 'balloons', count: 5, target: null }),
    ];
    await gameMedia(page);
    await page.goto('/');
    // Свой раздел; плитка стиха — обложка из первой картинки.
    await page.locator('[data-category=poems]').click();
    await expect(page.locator('.poem-tile > img')).toHaveAttribute('src', '/poems/rooster-1.webp');
    await shot(page, 'poem-tile');
    // Пока проверяем «Дальше» — фраза длится 4 с: сама часть не сменится.
    await slowSpeech(page, 4000);
    await page.getByTestId('tile').first().click();
    const g = page.getByTestId('game-poem');
    await expect(g).toHaveAttribute('data-step', 'listen');
    await expect(g).toHaveAttribute('data-learned', '0');
    await expect(g.locator('.poem-pic')).toHaveAttribute('data-picture', 'rooster-1');
    await expect(g.getByTestId('poem-text')).toContainText('Золотой гребешок');
    await page.waitForTimeout(600);
    await shot(page, 'poem-listen');
    // «Дальше» листает, не дожидаясь голоса.
    await g.getByTestId('poem-next').click();
    await expect(g.locator('.poem-pic')).toHaveAttribute('data-picture', 'rooster-2', {
      timeout: 2500,
    });
    await slowSpeech(page, 700);
    // Учим первую часть: голос — строчку, совёнок слушает ребёнка.
    await expect(g).toHaveAttribute('data-step', 'repeat', { timeout: 15_000 });
    await expect(g.getByTestId('poem-turn')).toBeVisible({ timeout: 10_000 });
    await shot(page, 'poem-repeat');
    // «Договори»: только из выученной части — гребешок; сначала не то слово.
    await expect(g).toHaveAttribute('data-step', 'blanks', { timeout: 20_000 });
    await expect(g.getByTestId('poem-option')).toHaveCount(3);
    await expect(g.getByTestId('poem-gap')).not.toHaveClass(/filled/);
    await page.waitForTimeout(600);
    await shot(page, 'poem-blanks');
    await g.locator('[data-testid=poem-option]:not([data-hint])').first().click();
    await expect(g.locator('.poem-option.off')).toHaveCount(1);
    await g.locator('[data-testid=poem-option][data-hint]').click();
    await expect(g.getByTestId('poem-gap')).toHaveText('гребешок');
    // Вопросы — ответ картинкой.
    await expect(g).toHaveAttribute('data-step', 'questions', { timeout: 15_000 });
    await page.waitForTimeout(600);
    await shot(page, 'poem-questions');
    for (let k = 0; k < 2; k++) {
      const question = await g.getByTestId('poem-text').textContent();
      await g.locator('[data-testid=poem-option][data-hint]').click();
      if (k === 0)
        await expect(g.getByTestId('poem-text')).not.toHaveText(question!, { timeout: 15_000 });
    }
    await expectFinished(page, backend);
    const done = backend.events.find((e) => e.type === 'interactive_complete')!;
    expect(done.payload).toMatchObject({
      kind: 'poem',
      poem: 'petushok',
      part: 1,
      parts: 3,
      learned: false,
      recall: false,
      mistakes: 1,
    });
    // Телефон помнит: в следующий раз — вторая часть.
    expect(await page.evaluate(() => localStorage.getItem('kidsplus.poems'))).toBe(
      '{"petushok":1}',
    );
    const said = (await spoken(page)).map((x) => x.text);
    expect(said).toContain('Стихи и сказки!');
    expect(said).toContain('Потешка «Петушок, петушок».');
    expect(said).toContain('Повторяй за мной!');
    expect(said).toContain('Теперь ты!');
    expect(said).toContain('А теперь всё вместе!');
    expect(said).toContain('Молодец! Эту часть выучили.');
    expect(said).toContain('Договори словечко!');
    expect(said).toContain('Петушок, петушок, золотой…');
    expect(said).toContain('А теперь вопросы!');
  });

  test('стих выучен (этап 45): «Расскажи вместе со мной» — голос начинает строку, ребёнок продолжает', async ({
    page,
    backend,
  }) => {
    test.setTimeout(120_000);
    await page.addInitScript(() => localStorage.setItem('kidsplus.poems', '{"petushok":3}'));
    // Голос «говорит» долго с самого начала: части листаем сами (при 700 мс под нагрузкой первая
    // часть успевала смениться сама до замедления — и стрелка перескакивала через одну).
    await page.addInitScript(
      () => ((window as unknown as { __speechMs: number }).__speechMs = 4000),
    );
    backend.items = [
      game(
        1,
        {
          kind: 'poem',
          poem: 'petushok',
          repeat: true,
          blanks: false,
          questions: false,
          choices: 3,
        },
        'poems',
      ),
    ];
    await openGame(page);
    const g = page.getByTestId('game-poem');
    await expect(g).toHaveAttribute('data-learned', '3');
    for (const picture of ['rooster-2', 'rooster-3']) {
      await g.getByTestId('poem-next').click();
      await expect(g.locator('.poem-pic')).toHaveAttribute('data-picture', picture, {
        timeout: 2500,
      });
    }
    await slowSpeech(page, 700);
    await expect(g).toHaveAttribute('data-step', 'recall', { timeout: 15_000 });
    // Под картинкой — только начало строки: дальше ребёнок сам.
    await expect(g.getByTestId('poem-text')).toContainText('…', { timeout: 10_000 });
    await shot(page, 'poem-recall');
    await expectFinished(page, backend);
    expect(backend.events.find((e) => e.type === 'interactive_complete')!.payload).toMatchObject({
      part: 3,
      learned: true,
      recall: true,
    });
    const said = (await spoken(page)).map((x) => x.text);
    expect(said).toContain('Расскажи вместе со мной! Я начну, а ты продолжай.');
    expect(said.some((x) => ['Петушок…', 'Масляна…', 'Что ты…'].includes(x))).toBe(true);
    expect(said).not.toContain('Повторяй за мной!');
  });

  // Самые длинные части: семь строк басни (этап 45) и длинная проза сказки Толстого (этап 46).
  for (const c of [
    { poem: 'strekoza', picture: 'fable', part: 5, text: 'голову вскружило', shot: 'poem-long' },
    { poem: 'medvedi', picture: 'bears', part: 6, text: 'как раз впору', shot: 'poem-long-prose' },
  ] as const)
    test(`длинная часть «${c.poem}» (этапы 45–46): сцена и подпись на экране, не под «Дальше»`, async ({
      page,
      backend,
    }) => {
      backend.items = [
        game(
          1,
          { kind: 'poem', poem: c.poem, repeat: true, blanks: true, questions: true, choices: 3 },
          'poems',
        ),
        game(2, { kind: 'balloons', count: 5, target: null }),
      ];
      await gameMedia(page);
      await page.goto('/');
      await page.locator('[data-category=poems]').click();
      // Голос «говорит» долго — части листаем сами, до самой длинной.
      await slowSpeech(page, 8000);
      await page.getByTestId('tile').first().click();
      const g = page.getByTestId('game-poem');
      for (let i = 2; i <= c.part; i++) {
        await g.getByTestId('poem-next').click();
        await expect(g.locator('.poem-pic')).toHaveAttribute('data-picture', `${c.picture}-${i}`);
      }
      await expect(g.getByTestId('poem-text')).toContainText(c.text);
      await page.waitForTimeout(600);
      const box = await page.evaluate(() => {
        const r = (q: string) => document.querySelector(q)!.getBoundingClientRect();
        const [pic, text, next] = [r('.poem-pic'), r('[data-testid=poem-text]'), r('.poem-next')];
        return {
          pic,
          text,
          next,
          h: innerHeight,
          font: parseFloat(
            getComputedStyle(document.querySelector('[data-testid=poem-text]')!).fontSize,
          ),
          scrolled: document.querySelector('.game-screen')!.scrollTop,
        };
      });
      expect(box.scrolled).toBe(0);
      expect(box.pic.top).toBeGreaterThanOrEqual(0);
      expect(box.pic.height).toBeGreaterThan(box.h * 0.2);
      expect(box.text.bottom).toBeLessThanOrEqual(box.h);
      expect(box.font).toBeGreaterThanOrEqual(13);
      // Подпись не заходит под «Дальше» (лёжа кнопка — справа от неё).
      const under = box.text.right > box.next.left && box.text.left < box.next.right;
      if (under) expect(box.text.bottom).toBeLessThanOrEqual(box.next.top);
      await shot(page, c.shot);
    });

  test('тёмный режим телефона: подписи стиха и книжки и ответы — тёмным по светлому', async ({
    page,
    backend,
  }) => {
    test.setTimeout(90_000);
    await page.emulateMedia({ colorScheme: 'dark' });
    backend.items = [
      game(
        1,
        { kind: 'poem', poem: 'petushok', repeat: true, blanks: true, questions: true, choices: 3 },
        'poems',
      ),
      game(
        2,
        { kind: 'book', book: 'kotPetuh', autoTurn: false, questions: true, choices: 3 },
        'books',
      ),
    ];
    await gameMedia(page);
    await page.goto('/');
    expect(
      await page.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue('--ink').trim(),
      ),
    ).toBe('#f3f1ff');
    // Контраст текста и фона самого элемента (WCAG): белым по белому — около 1.
    const contrast = (testid: string) =>
      page
        .getByTestId(testid)
        .first()
        .evaluate((el) => {
          const lum = (c: string) => {
            const [r, g, b] = c
              .match(/[\d.]+/g)!
              .slice(0, 3)
              .map((v) => {
                const x = Number(v) / 255;
                return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
              });
            return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
          };
          const s = getComputedStyle(el);
          const [a, b] = [lum(s.color), lum(s.backgroundColor)];
          return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
        });

    await page.locator('[data-category=poems]').click();
    await slowSpeech(page, 4000);
    await page.getByTestId('tile').first().click();
    await expect(page.getByTestId('poem-text')).toContainText('Золотой гребешок');
    expect(await contrast('poem-text')).toBeGreaterThan(7);
    await shot(page, 'poem-dark');

    await page.goto('/');
    await page.locator('[data-category=books]').click();
    await page.getByTestId('tile').first().click();
    const g = page.getByTestId('game-book');
    await expect(g.getByTestId('book-cover')).toContainText('Кот, петух и лиса');
    expect(await contrast('book-cover')).toBeGreaterThan(7);
    await expect(g).toHaveAttribute('data-step', 'page', { timeout: 10_000 });
    expect(await contrast('book-text')).toBeGreaterThan(7);
    await shot(page, 'book-dark');
    // Листаем до вопросов: ответы — карточки с подписью.
    const total = Number((await g.locator('.book-pageno').textContent())!.split('/')[1]);
    for (let k = 1; k <= total; k++) await g.getByTestId('book-next').click();
    await expect(g).toHaveAttribute('data-step', 'questions', { timeout: 10_000 });
    await expect(g.getByTestId('poem-option').first()).toBeVisible();
    expect(await contrast('poem-option')).toBeGreaterThan(7);
    expect(await contrast('poem-text')).toBeGreaterThan(7);
  });

  test('сказка (этап 46): пока голос читает, подсказка «ушка» не начинает часть заново', async ({
    page,
    backend,
  }) => {
    backend.items = [
      game(
        1,
        { kind: 'poem', poem: 'medvedi', repeat: true, blanks: true, questions: true, choices: 2 },
        'poems',
      ),
      game(2, { kind: 'balloons', count: 5, target: null }),
    ];
    await gameMedia(page);
    await page.clock.install();
    await page.goto('/');
    await page.locator('[data-category=poems]').click();
    // Объявление и первая часть — по 4 с: вместе дольше, чем ждёт подсказка (6 с).
    await slowSpeech(page, 4000);
    await page.getByTestId('tile').first().click();
    const g = page.getByTestId('game-poem');
    await expect(g).toHaveAttribute('data-step', 'listen');
    await page.clock.runFor(20_000);
    const said = (await spoken(page)).map((s) => s.text);
    expect(said.filter((t) => t.includes('Три медведя')).length).toBe(1);
    expect(said.filter((t) => t.includes('Одна девочка ушла из дома')).length).toBe(1);
  });

  test('незнакомый стих (сервер новее телефона) не ломает список: остальное на месте', async ({
    page,
    backend,
  }) => {
    backend.items = [
      game(
        1,
        { kind: 'poem', poem: 'from-the-future', repeat: true, blanks: true, questions: true },
        'poems',
      ),
      game(
        2,
        { kind: 'poem', poem: 'ladushki', repeat: true, blanks: true, questions: true },
        'poems',
      ),
      game(3, { kind: 'balloons', count: 5, target: null }),
    ];
    await gameMedia(page);
    await page.goto('/');
    await page.locator('[data-category=poems]').click();
    await expect(page.getByTestId('tile')).toHaveCount(1);
  });

  test('книжка (этап 52): полка, обложка, страницы под голос с подсветкой, стрелки, вопросы, закладка', async ({
    page,
    backend,
  }) => {
    test.setTimeout(180_000);
    // Голос «говорит» по 1,5 с — успеваем увидеть подсветку предложения и под нагрузкой, когда
    // страница с картинкой рисуется дольше.
    await page.addInitScript(
      () => ((window as unknown as { __speechMs: number }).__speechMs = 1500),
    );
    backend.items = [
      game(
        1,
        { kind: 'book', book: 'kotPetuh', autoTurn: false, questions: true, choices: 3 },
        'books',
      ),
      game(2, { kind: 'balloons', count: 5, target: null }),
    ];
    await gameMedia(page);
    await page.goto('/');
    // Свой раздел; на полке — обложка и «новая».
    await page.locator('[data-category=books]').click();
    const tile = page.locator('.book-tile');
    await expect(tile).toHaveAttribute('data-shelf', 'new');
    await expect(tile.locator('.book-new')).toBeVisible();
    await expect(tile.locator('[data-picture]')).toHaveAttribute('data-picture', 'kot-happy');
    // Обложка — во всю плитку, а не по размеру содержимого (иначе «новая» обрезана).
    // Размеры без transform: плитка ещё выезжает.
    const [w, h, buttonW, buttonH] = await tile.evaluate((el) => {
      const b = el.closest('button')!;
      return [
        (el as HTMLElement).offsetWidth,
        (el as HTMLElement).offsetHeight,
        b.clientWidth,
        b.clientHeight,
      ];
    });
    expect(w).toBe(buttonW);
    expect(h).toBe(buttonH);
    // Нарисованная обложка загрузилась и закрывает плитку целиком, а не как значок игры.
    const cover = tile.locator('.poem-pic-img');
    await expect
      .poll(() => cover.evaluate((el) => (el as HTMLImageElement).naturalWidth))
      .toBeGreaterThan(0);
    expect(
      await cover.evaluate((el) => [
        (el as HTMLElement).offsetWidth,
        (el as HTMLElement).offsetHeight,
        getComputedStyle(el).objectFit,
      ]),
    ).toEqual([w, h, 'cover']);
    await shot(page, 'book-shelf');
    await page.getByTestId('tile').first().click();
    const g = page.getByTestId('game-book');
    await expect(g).toHaveAttribute('data-step', 'cover');
    await expect(g.getByTestId('book-cover')).toContainText('Кот, петух и лиса');
    await shot(page, 'book-cover');
    // Обложку объявили — первая страница сама; звучит первое предложение, оно подсвечено.
    await expect(g).toHaveAttribute('data-step', 'page', { timeout: 10_000 });
    await expect(g).toHaveAttribute('data-page', '0');
    await expect(g.getByTestId('book-line-now')).toContainText('Жил-был старик');
    // Сцена нарисована: картинка загрузилась, отдаётся как webp — иначе не попадёт в кэш книжек.
    const pic = g.locator('[data-picture=kot-home] .poem-pic-img');
    await expect(pic).toHaveAttribute('src', '/books/kot-home.webp');
    await expect
      .poll(() => pic.evaluate((el) => (el as HTMLImageElement).naturalWidth))
      .toBeGreaterThan(0);
    expect((await page.request.get('/books/kot-home.webp')).headers()['content-type']).toBe(
      'image/webp',
    );
    await shot(page, 'book-page');
    // Дочитали — стрелка зовёт листать.
    await expect(g.getByTestId('book-next')).toHaveClass(/ready/, { timeout: 15_000 });
    await expect(g.getByTestId('book-line-now')).toHaveCount(0);
    await g.getByTestId('book-next').click();
    await expect(g).toHaveAttribute('data-page', '1');
    // Назад — на первую страницу; на ней стрелки «назад» нет.
    await g.getByTestId('book-prev').click();
    await expect(g).toHaveAttribute('data-page', '0');
    await expect(g.getByTestId('book-prev')).toHaveCount(0);
    // Листаем, не дожидаясь голоса; закладка — на каждой странице.
    const total = Number((await g.locator('.book-pageno').textContent())!.split('/')[1]);
    for (let k = 1; k < total; k++) {
      await g.getByTestId('book-next').click();
      await expect(g).toHaveAttribute('data-page', String(k));
      if (k === 3)
        expect(await page.evaluate(() => localStorage.getItem('kidsplus.books'))).toBe(
          '{"kotPetuh":{"chapter":0,"page":3}}',
        );
    }
    await g.getByTestId('book-next').click();
    // Вопросы — два, ответ картинкой.
    await expect(g).toHaveAttribute('data-step', 'questions', { timeout: 10_000 });
    await page.waitForTimeout(600);
    await shot(page, 'book-questions');
    for (let k = 0; k < 2; k++) {
      const question = await g.getByTestId('poem-text').textContent();
      await g.locator('[data-testid=poem-option][data-hint]').click();
      if (k === 0)
        await expect(g.getByTestId('poem-text')).not.toHaveText(question!, { timeout: 15_000 });
    }
    await expectFinished(page, backend);
    expect(backend.events.find((e) => e.type === 'interactive_complete')!.payload).toMatchObject({
      kind: 'book',
      book: 'kotPetuh',
      chapter: 1,
      chapters: 1,
    });
    // Прочитана — в закладке день: на полке больше не «новая».
    const mark = JSON.parse((await page.evaluate(() => localStorage.getItem('kidsplus.books')))!);
    expect(mark.kotPetuh).toMatchObject({ chapter: 0, page: 0 });
    expect(mark.kotPetuh.day).toMatch(/^\d{4}-\d\d-\d\d$/);
    const said = (await spoken(page)).map((x) => x.text);
    expect(said).toContain('Книжки!');
    expect(said).toContain('Русская народная сказка «Кот, петух и лиса».');
    expect(said).toContain('А теперь вопросы!');
    expect(said).toContain('Вот и сказке конец, а кто слушал — молодец!');
  });

  test('книжка листается сама и продолжает с закладки (этап 52)', async ({ page, backend }) => {
    test.setTimeout(120_000);
    await page.addInitScript(() => {
      localStorage.setItem('kidsplus.books', '{"kotPetuh":{"chapter":0,"page":15}}');
      (window as unknown as { __speechMs: number }).__speechMs = 300;
    });
    backend.items = [
      game(
        1,
        { kind: 'book', book: 'kotPetuh', autoTurn: true, questions: false, choices: 3 },
        'books',
      ),
      game(2, { kind: 'balloons', count: 5, target: null }),
    ];
    await gameMedia(page);
    await page.goto('/');
    await page.locator('[data-category=books]').click();
    // Читаем — на обложке закладка.
    await expect(page.locator('.book-tile')).toHaveAttribute('data-shelf', 'reading');
    await expect(page.getByTestId('book-mark')).toBeVisible();
    await page.getByTestId('tile').first().click();
    const g = page.getByTestId('game-book');
    await expect(g).toHaveAttribute('data-page', '15');
    await expect(g).toHaveAttribute('data-step', 'page', { timeout: 10_000 });
    // Дочитала страницу — перевернула сама; в конце — без вопросов.
    await expect(g).toHaveAttribute('data-page', '16', { timeout: 15_000 });
    await expectFinished(page, backend);
    const said = (await spoken(page)).map((x) => x.text);
    expect(said).toContain('Продолжаем с закладки!');
    expect(said).not.toContain('А теперь вопросы!');
  });

  test('«Прочитай сам» (этап 52): слово по слогам, нажал — голос говорит его, потом страница со словом', async ({
    page,
    backend,
  }) => {
    test.setTimeout(180_000);
    await page.addInitScript(
      () => ((window as unknown as { __speechMs: number }).__speechMs = 300),
    );
    const spec = { kind: 'book', book: 'filipok', autoTurn: false, questions: true, choices: 3 };
    backend.items = [
      game(1, { ...spec, readSelf: true }, 'books'),
      game(2, { kind: 'balloons', count: 5, target: null }),
    ];
    await gameMedia(page);
    await page.goto('/');
    await page.locator('[data-category=books]').click();
    await page.getByTestId('tile').first().click();
    const g = page.getByTestId('game-book');
    await expect(g).toHaveAttribute('data-step', 'page', { timeout: 10_000 });
    // Сначала слово страницы — крупно, по слогам; текста ещё нет, рука зовёт нажать.
    const word = g.getByTestId('book-read');
    await expect(word).toHaveAttribute('data-word', 'школу');
    await expect(word.getByTestId('book-syl')).toHaveText(['ШКО', 'ЛУ']);
    await expect(word).toHaveAttribute('data-hint', '');
    await expect(g.getByTestId('book-text')).toHaveCount(0);
    await page.waitForTimeout(600);
    await shot(page, 'book-read');
    // Прочитал, нажал — слоги слились, голос сказал слово; потом звучит страница, слово выделено.
    await word.click();
    await expect(word).toHaveClass(/heard/);
    await expect(g.getByTestId('book-word')).toHaveText('школу', { timeout: 10_000 });
    await expect(g.getByTestId('book-next')).toHaveClass(/ready/, { timeout: 15_000 });
    await shot(page, 'book-read-page');
    let said = (await spoken(page)).map((x) => x.text);
    const at = (t: string) => said.indexOf(t);
    expect(at('Прочитай слово сам — и нажми на него!')).toBeGreaterThanOrEqual(0);
    expect(at('школу')).toBeGreaterThan(at('Прочитай слово сам — и нажми на него!'));
    expect(at('Был мальчик, звали его Филипп.')).toBeGreaterThan(at('школу'));
    // Не стал читать — листает дальше; следующее слово прочитал.
    await g.getByTestId('book-next').click();
    await expect(g).toHaveAttribute('data-page', '1');
    await expect(word).toHaveAttribute('data-word', 'мал');
    await g.getByTestId('book-next').click();
    await expect(g).toHaveAttribute('data-page', '2');
    await expect(word).toHaveAttribute('data-word', 'бабушка');
    await word.click();
    await expect(g.getByTestId('book-word')).toHaveText('бабушка', { timeout: 10_000 });
    const total = Number((await g.locator('.book-pageno').textContent())!.split('/')[1]);
    for (let k = 3; k < total; k++) {
      await g.getByTestId('book-next').click();
      await expect(g).toHaveAttribute('data-page', String(k));
    }
    await g.getByTestId('book-next').click();
    await expect(g).toHaveAttribute('data-step', 'questions', { timeout: 10_000 });
    for (let k = 0; k < 2; k++) {
      const question = await g.getByTestId('poem-text').textContent();
      await g.locator('[data-testid=poem-option][data-hint]').click();
      if (k === 0)
        await expect(g.getByTestId('poem-text')).not.toHaveText(question!, { timeout: 15_000 });
    }
    await expectFinished(page, backend);
    // В журнал — сколько слов прочитал сам; «Прочитай слово сам» — только на первом слове.
    expect(backend.events.find((e) => e.type === 'interactive_complete')!.payload).toMatchObject({
      kind: 'book',
      book: 'filipok',
      chapter: 1,
      chapters: 1,
      read: 2,
    });
    said = (await spoken(page)).map((x) => x.text);
    expect(said.filter((t) => t === 'Прочитай слово сам — и нажми на него!')).toHaveLength(1);
    expect(said).toContain('Лев Толстой. «Филипок».');
  });

  test('«Прочитай сам», страницы листаются сами: слово ждёт ребёнка (этап 52)', async ({
    page,
    backend,
  }) => {
    test.setTimeout(120_000);
    await page.addInitScript(() => {
      localStorage.setItem('kidsplus.books', '{"filipok":{"chapter":0,"page":17}}');
      (window as unknown as { __speechMs: number }).__speechMs = 300;
    });
    backend.items = [
      game(
        1,
        {
          kind: 'book',
          book: 'filipok',
          autoTurn: true,
          questions: false,
          choices: 3,
          readSelf: true,
        },
        'books',
      ),
      game(2, { kind: 'balloons', count: 5, target: null }),
    ];
    await gameMedia(page);
    await page.goto('/');
    await page.locator('[data-category=books]').click();
    await page.getByTestId('tile').first().click();
    const g = page.getByTestId('game-book');
    await expect(g).toHaveAttribute('data-step', 'page', { timeout: 10_000 });
    await expect(g).toHaveAttribute('data-page', '17');
    const word = g.getByTestId('book-read');
    await expect(word.getByTestId('book-syl')).toHaveText(['РЕ', 'БЯ', 'ТА', 'МИ']);
    // Самое длинное слово книжек — на экране и не под стрелками, буквы крупные.
    await page.waitForTimeout(600);
    const box = await page.evaluate(() => {
      const r = (q: string) => document.querySelector(q)?.getBoundingClientRect() ?? null;
      return {
        word: r('[data-testid=book-read]')!,
        arrows: [r('.book-next'), r('.book-prev')],
        h: innerHeight,
        w: innerWidth,
        font: parseFloat(getComputedStyle(document.querySelector('.book-syl')!).fontSize),
      };
    });
    expect(box.word.left).toBeGreaterThanOrEqual(0);
    expect(box.word.right).toBeLessThanOrEqual(box.w);
    expect(box.word.bottom).toBeLessThanOrEqual(box.h);
    expect(box.font).toBeGreaterThanOrEqual(28);
    for (const b of box.arrows)
      if (b && box.word.right > b.left && box.word.left < b.right)
        expect(box.word.bottom).toBeLessThanOrEqual(b.top);
    // Сама не листается, а подсказка-рука может звать нажать.
    await page.waitForTimeout(3000);
    await expect(g).toHaveAttribute('data-step', 'page');
    expect(await g.getAttribute('data-no-idle')).toBeNull();
    await word.click();
    // Нажал — голос сказал слово, прочитал страницу и закрыл книжку сам.
    await expectFinished(page, backend);
    expect(backend.events.find((e) => e.type === 'interactive_complete')!.payload).toMatchObject({
      book: 'filipok',
      read: 1,
    });
  });

  // Самые длинные страницы каждой книжки (во всех главах): сцена и подпись на экране, подпись не под
  // стрелками. Страницу открываем с закладки — длинные книжки не листаем по порядку.
  for (const code of BOOK_CODES)
    test(`книжка «${code}» (этап 52): длинные страницы — на экране, подпись не под стрелками`, async ({
      page,
      backend,
    }) => {
      test.setTimeout(120_000);
      const longest = BOOKS[code].chapters
        .flatMap((c, chapter) =>
          c.pages.map((p, at) => ({ chapter, at, chars: p.text.join(' ').length })),
        )
        .sort((a, b) => b.chars - a.chars)
        .slice(0, 4);
      backend.items = [
        game(
          1,
          { kind: 'book', book: code, autoTurn: false, questions: true, choices: 4 },
          'books',
        ),
        game(2, { kind: 'balloons', count: 5, target: null }),
      ];
      await gameMedia(page);
      await page.goto('/');
      for (const { chapter, at } of longest) {
        await page.evaluate(
          (mark) => localStorage.setItem('kidsplus.books', mark),
          JSON.stringify({ [code]: { chapter, page: at } }),
        );
        await page.reload();
        await page.locator('[data-category=books]').click();
        // Голос «говорит» долго — страница стоит, пока меряем.
        await slowSpeech(page, 8000);
        await page.getByTestId('tile').first().click();
        const g = page.getByTestId('game-book');
        await g.getByTestId('book-next').click();
        await expect(g).toHaveAttribute('data-step', 'page');
        await expect(g).toHaveAttribute('data-page', String(at));
        // Подпись появляется с увеличением (0,4 с) — меряем, когда встала на место.
        await page.waitForTimeout(600);
        const box = await page.evaluate(() => {
          const r = (q: string) => document.querySelector(q)!.getBoundingClientRect();
          const text = document.querySelector('[data-testid=book-text]')!;
          return {
            pic: r('.book-pic'),
            text: r('[data-testid=book-text]'),
            next: r('.book-next'),
            prev: document.querySelector('.book-prev')?.getBoundingClientRect() ?? null,
            h: innerHeight,
            w: innerWidth,
            font: parseFloat(getComputedStyle(text).fontSize),
            scrolled: document.querySelector('.game-screen')!.scrollTop,
          };
        });
        const where = `глава ${chapter + 1}, страница ${at + 1}`;
        expect(box.scrolled, where).toBe(0);
        expect(box.pic.top, where).toBeGreaterThanOrEqual(0);
        expect(box.pic.height, where).toBeGreaterThan(box.h * 0.2);
        expect(box.text.bottom, where).toBeLessThanOrEqual(box.h);
        expect(box.text.right, where).toBeLessThanOrEqual(box.w);
        expect(box.font, where).toBeGreaterThanOrEqual(13);
        // Подпись не заходит под стрелки.
        for (const b of [box.next, box.prev])
          if (b && box.text.right > b.left && box.text.left < b.right)
            expect(box.text.bottom, where).toBeLessThanOrEqual(b.top);
        // Самая длинная страница книжки для старших — на скриншот.
        if (code === 'hrabryZayac' && at === longest[0]!.at) await shot(page, 'book-long');
      }
    });

  test('гонки (этап 43): светофор, ворота с ответом (сначала не те), обгон и финиш', async ({
    page,
    backend,
  }) => {
    test.setTimeout(240_000);
    backend.items = [
      game(1, {
        kind: 'race',
        quiz: 'numbers',
        max: 5,
        gates: 3,
        rivals: true,
        cones: 'none',
        speed: 'slow',
      }),
    ];
    await openGame(page);
    const g = page.getByTestId('game-race');
    await expect(g).toHaveAttribute('data-phase', 'ready');
    await page.waitForTimeout(1800);
    await shot(page, 'race-ready');
    await expect(g).toHaveAttribute('data-phase', 'race', { timeout: 8000 });
    const view = page.viewportSize()!;
    /** Повести машинку пальцем туда, где x. */
    const steerTo = async (x: number) => {
      const car = Number(await g.getAttribute('data-car')) || view.width / 2;
      await page.mouse.move(car, view.height * 0.85);
      await page.mouse.down();
      await page.mouse.move(x, view.height * 0.85, { steps: 6 });
      await page.mouse.up();
    };
    for (let gate = 0; gate < 3; gate++) {
      await expect(g).toHaveAttribute('data-gate', String(gate), { timeout: 60_000 });
      await expect.poll(async () => (await g.getAttribute('data-target')) ?? '').not.toBe('');
      // У первых ворот — нарочно в не те: задание повторится у следующих.
      const attr = gate === 0 ? 'data-wrong-target' : 'data-target';
      await steerTo(Number(await g.getAttribute(attr)));
      await expect(page.getByTestId('race-task')).toHaveText(/^\d+$/);
      if (gate === 1) {
        await page.waitForTimeout(5200);
        await shot(page, 'race-drive');
      }
      if (gate === 0) {
        await expect
          .poll(async () => (await spoken(page)).some((x) => /^Это цифра .+\.$/.test(x.text)), {
            timeout: 60_000,
          })
          .toBe(true);
      }
    }
    await expect(g).toHaveAttribute('data-phase', 'finish', { timeout: 60_000 });
    await page.waitForTimeout(700);
    await shot(page, 'race-finish');
    await expectFinished(page, backend);
    const said = (await spoken(page)).map((x) => x.text);
    expect(said).toContain('На старт! Внимание! Марш!');
    expect(said.some((x) => /^Проезжай в ворота с цифрой .+!$/.test(x))).toBe(true);
    expect(said).toContain('Финиш! Мы первые!');
  });

  test('ракета (этап 43): сборка по чертежу, отсчёт, полёт к планете с ответом и посадка', async ({
    page,
    backend,
  }) => {
    test.setTimeout(240_000);
    backend.items = [
      game(1, {
        kind: 'rocket',
        parts: 4,
        memory: false,
        quiz: 'sums',
        max: 5,
        asteroids: 'none',
        rounds: 2,
      }),
    ];
    await openGame(page);
    const g = page.getByTestId('game-rocket');
    await expect(g).toHaveAttribute('data-phase', 'build');
    type Part = { x: number; y: number; part: string; good: boolean };
    const tray = async (): Promise<Part[]> => {
      await expect.poll(async () => (await g.getAttribute('data-tray')) !== null).toBe(true);
      return JSON.parse((await g.getAttribute('data-tray'))!);
    };
    const drop = async () =>
      (await g.getAttribute('data-drop'))!.split(',').map(Number) as [number, number];
    const drag = async (p: Part) => {
      const [dx, dy] = await drop();
      await page.mouse.move(p.x, p.y);
      await page.mouse.down();
      await page.mouse.move((p.x + dx) / 2, (p.y + dy) / 2, { steps: 4 });
      await page.mouse.move(dx, dy, { steps: 4 });
      await page.mouse.up();
      await page.waitForTimeout(450);
    };
    await page.waitForTimeout(1500);
    await shot(page, 'rocket-build');
    // Не того цвета — не встаёт: «Нужен …» / «Нужны …».
    await drag((await tray()).find((p) => !p.good)!);
    // Фраза — после «Попробуй ещё.», поэтому ждём подольше.
    await expect
      .poll(async () => (await spoken(page)).some((x) => /^Нуж(ны|ен) /.test(x.text)), {
        timeout: 12_000,
      })
      .toBe(true);
    await page.waitForTimeout(1200);
    for (let i = 0; i < 8; i++) {
      const good = (await tray()).filter((p) => p.good);
      if (!good.length) break;
      await drag(good[0]!);
    }
    // Отсчёт → старт → гиперпрыжок идут сами, по времени; под нагрузкой фазу можно и проскочить.
    await expect(g).toHaveAttribute('data-phase', 'countdown', { timeout: 8000 });
    await page.waitForTimeout(1500);
    await shot(page, 'rocket-countdown');
    const phaseShot = async (phase: string, name: string, after: number) => {
      const seen = await expect(g)
        .toHaveAttribute('data-phase', phase, { timeout: 5000 })
        .then(() => true)
        .catch(() => false);
      if (!seen) return;
      await page.waitForTimeout(after);
      await shot(page, name);
    };
    await phaseShot('launch', 'rocket-launch', 1200);
    await phaseShot('warp', 'rocket-warp', 700);
    const view = page.viewportSize()!;
    for (let round = 0; round < 2; round++) {
      await expect(g).toHaveAttribute('data-round', String(round), { timeout: 20_000 });
      await expect(g).toHaveAttribute('data-phase', /^(fly|land)$/, { timeout: 10_000 });
      await expect(page.getByTestId('rocket-task')).toHaveText(/^\d+ \+ \d+ = \?$/);
      // Ждём планеты и ведём ракету под планету с ответом (ракета посередине могла сесть сама).
      let planets: { x: number; good: boolean }[] = [];
      await expect
        .poll(
          async () => {
            if ((await g.getAttribute('data-phase')) === 'land') return 3;
            planets = JSON.parse((await g.getAttribute('data-planets')) ?? '[]');
            return planets.length;
          },
          { timeout: 15_000 },
        )
        .toBe(3);
      if (round === 0 && planets.length) await shot(page, 'rocket-fly');
      // Подруливаем под планету с ответом, пока не сядем: под нагрузкой WebKit даёт мало кадров,
      // ракета может не успеть — тогда не та планета отлетит и вернётся.
      await expect
        .poll(
          async () => {
            const phase = await g.getAttribute('data-phase');
            if (phase === 'land') return phase;
            const now = JSON.parse(
              (await g.getAttribute('data-planets')) ?? '[]',
            ) as typeof planets;
            const target = now.find((p) => p.good);
            if (phase === 'fly' && target) {
              const [rx] = ((await g.getAttribute('data-rocket')) ?? '').split(',').map(Number);
              await page.mouse.move(rx || view.width / 2, view.height * 0.8);
              await page.mouse.down();
              await page.mouse.move(target.x, view.height * 0.8, { steps: 6 });
              await page.mouse.up();
            }
            return phase;
          },
          { timeout: 60_000, intervals: [1000] },
        )
        .toBe('land');
      if (round === 0) {
        await page.waitForTimeout(700);
        await shot(page, 'rocket-land');
      }
    }
    await expectFinished(page, backend);
    const said = (await spoken(page)).map((x) => x.text);
    expect(said).toContain('Три! Два! Один! Пуск!');
    expect(
      said.some((x) => /^Сколько будет .+ плюс .+\? Лети на планету с ответом!$/.test(x)),
    ).toBe(true);
    expect(said).toContain('Посадка! Мы на планете!');
  });

  test('соедини точки (этап 42): по порядку — линия, не та точка — ошибка, в конце «Это …!»', async ({
    page,
    backend,
  }) => {
    backend.items = [game(1, { kind: 'dots', pictures: ['house'], hint: true })];
    await openGame(page);
    const dots = page.getByTestId('dot');
    await expect(dots).toHaveCount(9);
    await expect(page.locator('[data-testid=dot].next')).toHaveAttribute('data-n', '1');
    // Сначала — не та точка: ничего не соединилось.
    await page.mouse.click(...xy(await center(dots.nth(4).locator('circle').nth(1))));
    await expect(page.locator('[data-testid=dot].on')).toHaveCount(0);
    await page.waitForTimeout(1200);
    for (let i = 0; i < 9; i++) {
      await page.mouse.click(...xy(await center(dots.nth(i).locator('circle').nth(1))));
      if (i === 4) await shot(page, 'dots');
    }
    await expect(page.locator('.dots-fill')).toBeVisible();
    await shot(page, 'dots-done');
    await expectFinished(page, backend);
    expect((await spoken(page)).map((s) => s.text)).toContain('Это домик!');
  });

  test('танграм-малыш (этап 42): детали — в силуэт, не та деталь — не встаёт', async ({
    page,
    backend,
  }) => {
    backend.items = [game(1, { kind: 'tangram', figures: ['house'], outline: true })];
    await openGame(page);
    await expect(page.getByTestId('tangram-piece')).toHaveCount(3);
    await shot(page, 'tangram');
    const slot = (kind: string) => page.locator(`[data-testid=tangram-slot][data-kind="${kind}"]`);
    const piece = (kind: string) =>
      page.locator(`[data-testid=tangram-piece][data-kind="${kind}"]`);
    // Крыша на место двери — мимо.
    await dragTo(page, await center(piece('tri:76x34')), await center(slot('rect:16x26')));
    await expect(page.getByTestId('tangram-piece')).toHaveCount(3);
    await page.waitForTimeout(1200);
    for (const kind of ['tri:76x34', 'rect:60x40', 'rect:16x26']) {
      await dragTo(page, await center(piece(kind)), await center(slot(kind)));
      await expect(piece(kind)).toHaveCount(0);
    }
    await shot(page, 'tangram-done');
    await expectFinished(page, backend);
    expect((await spoken(page)).map((s) => s.text)).toContain('Это домик!');
  });

  test('раскраска по цифрам (этап 42): краска с цифрой — на свою область', async ({
    page,
    backend,
  }) => {
    backend.items = [game(1, { kind: 'colorNumbers', pictures: ['sun'], hint: true })];
    await openGame(page);
    const spots = page.getByTestId('number-spot');
    await expect(spots).toHaveCount(3);
    await expect(page.locator('.paint.numbered')).toHaveCount(3);
    await shot(page, 'color-numbers');
    // Краска 1 (небо) — на солнышко (3): не закрашивается, совёнок подсказывает.
    await page.locator('.paint.numbered[data-n="1"]').click();
    await page.mouse.click(...xy(await center(spots.nth(2).locator('circle'))));
    await expect(spots).toHaveCount(3);
    await page.waitForTimeout(1200);
    for (const n of [1, 2, 3]) {
      await page.locator(`.paint.numbered[data-n="${n}"]`).click();
      await page.mouse.click(...xy(await center(spots.first().locator('circle'))));
      await expect(spots).toHaveCount(3 - n);
    }
    await shot(page, 'color-numbers-done');
    await expectFinished(page, backend);
    const said = (await spoken(page)).map((s) => s.text);
    expect(said).toContain('Здесь цифра три. Возьми краску с цифрой три!');
    expect(said).toContain('Какая красивая картинка получилась!');
  });
});

// ─── Расписание дня (этап 4) ─────────────────────────────────────────────────

const planDay = (o: Record<string, unknown> = {}) => ({
  mode: 'plan',
  closed: null,
  paused: false,
  subjects: [
    { subject: 'math', secondsLeft: 1200, done: false, progress: 0 },
    { subject: 'nature', secondsLeft: 1200, done: false, progress: 0 },
    { subject: 'english', secondsLeft: 0, done: true, progress: 1 },
  ],
  free: { open: false, secondsLeft: 1200 },
  windowSecondsLeft: 30000,
  ...o,
});

test.describe('расписание дня', () => {
  test('«Сегодня»: предметы дня, пройденный — со звёздочкой', async ({ page, backend }) => {
    backend.today = planDay();
    await page.goto('/');
    await expect(page.getByTestId('today')).toBeVisible();
    await expect(page.getByTestId('subject')).toHaveCount(3);
    await expect(page.locator('[data-subject=english]')).toHaveAttribute('data-done', 'true');
    await expect(page.locator('[data-subject=english]')).toBeDisabled();
    await expect(page.getByTestId('free')).toHaveCount(0);
    await page.waitForTimeout(800);
    await shot(page, 'today');
    await expect
      .poll(async () => (await spoken(page)).map((s) => s.text))
      .toContain('Привет! Вот твои занятия на сегодня.');
  });

  test('«Сегодня»: кольцо — по доле с сервера; подписи не обрезаются и лёжа (этап 44)', async ({
    page,
    backend,
  }) => {
    // Пять предметов с самыми длинными подписями — самый тесный случай.
    backend.today = planDay({
      subjects: [
        { subject: 'math', secondsLeft: 300, done: false, progress: 0.5 },
        { subject: 'english', secondsLeft: 600, done: false, progress: 0 },
        { subject: 'geography', secondsLeft: 600, done: false, progress: 0 },
        { subject: 'chinese', secondsLeft: 600, done: false, progress: 0 },
        { subject: 'nature', secondsLeft: 0, done: true, progress: 1 },
      ],
    });
    await page.goto('/');
    await expect(page.getByTestId('subject')).toHaveCount(5);
    await expect(page.locator('[data-subject=math]')).toHaveAttribute('data-progress', '0.5');
    await expect(page.locator('[data-subject=english]')).toHaveAttribute('data-progress', '0');
    await page.waitForTimeout(800);
    const clipped = await page.getByTestId('subject').evaluateAll((tiles) =>
      tiles.flatMap((tile) => {
        const label = tile.querySelector('.tile-label')!;
        const range = document.createRange();
        range.selectNodeContents(label);
        const text = range.getBoundingClientRect();
        const box = tile.getBoundingClientRect();
        return text.left < box.left || text.right > box.right ? [label.textContent] : [];
      }),
    );
    expect(clipped).toEqual([]);
    await shot(page, 'today-five');
  });

  test('урок по предмету: время идёт на сервере, вышло — похвала и снова «Сегодня»', async ({
    page,
    backend,
  }) => {
    backend.today = planDay();
    backend.lessons = { math: [game(1, { kind: 'balloons', count: 3 }, 'math')] };
    await gameMedia(page);
    await page.goto('/');
    await page.locator('[data-subject=math]').click();
    await expect(page.getByTestId('game')).toBeVisible();
    // Телефон сообщает, что ребёнок на уроке математики.
    await expect
      .poll(() => (backend.beats ?? []).some((b) => b.activity === 'math' && b.active))
      .toBe(true);
    // Сервер: время урока вышло — игра доигрывается, потом возврат.
    backend.stop = true;
    for (let i = 0; i < 3; i++)
      await page.locator('.balloon:not(.popped)').first().dispatchEvent('pointerdown');
    await expect(page.getByTestId('today')).toBeVisible({ timeout: 8000 });
    await expect
      .poll(async () => (await spoken(page)).map((s) => s.text))
      .toContain('Молодец, на сегодня этот урок закончен.');
  });

  test('игра в уроке — открытие с пометкой «урок» (этап 44)', async ({ page, backend }) => {
    backend.today = planDay();
    backend.lessons = { math: [game(1, { kind: 'balloons', count: 3 }, 'math')] };
    await gameMedia(page);
    await page.goto('/');
    await page.locator('[data-subject=math]').click();
    await expect(page.getByTestId('game')).toBeVisible();
    await expect
      .poll(() => backend.events.find((e) => e.type === 'interactive_start')?.payload)
      .toMatchObject({ kind: 'balloons', from: 'lesson' });
  });

  test('урок идёт по кругу, пока время не вышло', async ({ page, backend }) => {
    backend.today = planDay();
    backend.lessons = { math: [game(1, { kind: 'balloons', count: 3 }, 'math')] };
    await gameMedia(page);
    await page.goto('/');
    await page.locator('[data-subject=math]').click();
    for (let round = 0; round < 2; round++) {
      for (let i = 0; i < 3; i++) {
        await expect(page.locator('.balloon:not(.popped)').first()).toBeAttached();
        await page.locator('.balloon:not(.popped)').first().dispatchEvent('pointerdown');
      }
      await expect(page.getByTestId('game-finished')).toBeVisible({ timeout: 6000 });
      await expect(page.getByTestId('game-balloons')).toBeVisible({ timeout: 6000 });
    }
    await expect(page.getByTestId('today')).toHaveCount(0);
  });

  test('после всех предметов — свободное время с разделами', async ({ page, backend }) => {
    backend.today = planDay({
      subjects: [{ subject: 'math', secondsLeft: 0, done: true, progress: 1 }],
      free: { open: true, secondsLeft: 1200 },
    });
    backend.items = [
      { ...SEGMENTS[0]!, kind: 'segment', questions: [] },
      game(1, { kind: 'balloons', count: 3 }),
    ];
    await gameMedia(page);
    await page.goto('/');
    await page.getByTestId('free').click();
    await expect(page.getByTestId('categories')).toBeVisible();
    await expect.poll(() => (backend.beats ?? []).some((b) => b.activity === 'free')).toBe(true);
    await page.getByTestId('to-today').click();
    await expect(page.getByTestId('today')).toBeVisible();
  });

  test('«на сегодня всё» и пауза от родителя', async ({ page, backend }) => {
    backend.today = planDay({ closed: 'limit' });
    await page.goto('/');
    await expect(page.getByTestId('day-over')).toBeVisible();
    await shot(page, 'day-over');
    await expect
      .poll(async () => (await spoken(page)).map((s) => s.text))
      .toContain('На сегодня всё! Ты молодец. До завтра!');
    backend.today = planDay({ paused: true });
    await page.reload();
    await expect(page.getByTestId('paused')).toBeVisible();
  });

  test('выход в меню родителя — удержание угла 3 секунды и PIN', async ({ page, backend }) => {
    backend.today = planDay();
    backend.pin = '2580';
    await page.goto('/');
    const corner = page.getByTestId('parent-corner');
    // Короткое касание ничего не открывает.
    await corner.dispatchEvent('pointerdown');
    await page.waitForTimeout(500);
    await corner.dispatchEvent('pointerup');
    await page.waitForTimeout(3000);
    await expect(page.getByTestId('pin-pad')).toHaveCount(0);
    await corner.dispatchEvent('pointerdown');
    await expect(page.getByTestId('pin-pad')).toBeVisible({ timeout: 5000 });
    const key = (k: string) => page.locator(`.pin-key[data-key="${k}"]`).click();
    for (const k of '1111') await key(k);
    await key('OK');
    await expect(page.locator('.pin-dots.wrong')).toBeVisible();
    for (const k of '2580') await key(k);
    await key('OK');
    await expect(page.getByTestId('parent-menu')).toBeVisible();
  });
});

// ─── Этап 8: заряд батареи ───────────────────────────────────────────────────

/** Киоск с батареей: window.__setBattery(level, charging) — «системное» изменение заряда. */
const KIOSK_BATTERY = `
  (() => {
    let state = { level: 64, charging: false };
    const listeners = [];
    window.__setBattery = (level, charging) => {
      state = { level, charging };
      listeners.forEach((cb) => cb(state));
    };
    window.Capacitor = { Plugins: { Kiosk: {
      openSettings: async () => {},
      setOrientation: async () => {},
      battery: async () => state,
      // Как настоящий Capacitor при server.url: подписка сразу, не обещанием.
      addListener: (event, cb) => {
        if (event === 'battery') listeners.push(cb);
        return { remove: () => {} };
      },
    } } };
  })();
`;
const setBattery = (page: Page, level: number, charging = false) =>
  page.evaluate(
    ([l, c]) =>
      (window as unknown as { __setBattery(l: number, c: boolean): void }).__setBattery(
        l as number,
        c as boolean,
      ),
    [level, charging] as const,
  );

test.describe('заряд батареи', () => {
  test('значок с процентом и цветом; заряд уходит на сервер при изменении', async ({
    page,
    backend,
  }) => {
    await page.addInitScript(KIOSK_BATTERY);
    await page.goto('/');
    const badge = page.getByTestId('battery');
    await expect(badge).toHaveAttribute('data-level', '64');
    await expect(badge).toHaveClass(/battery-ok/);
    await setBattery(page, 9);
    await expect(badge).toHaveAttribute('data-level', '9');
    await expect(badge).toHaveClass(/battery-critical/);
    await setBattery(page, 9, true);
    await expect(badge).toHaveAttribute('data-charging', '1');
    await expect
      .poll(() => backend.battery)
      .toEqual([
        { level: 64, charging: false },
        { level: 9, charging: false },
        { level: 9, charging: true },
      ]);
  });

  test('напоминание звучит один раз и не посреди видео', async ({ page, backend: _ }) => {
    await page.addInitScript(KIOSK_BATTERY);
    await startFirst(page);
    await setBattery(page, 20);
    await page.waitForTimeout(2500);
    const sayings = async () =>
      (await spoken(page)).map((s) => s.text).filter((t) => t.includes('Батарейка'));
    // Идёт видео — молчим.
    expect(await sayings()).toEqual([]);
    await page.getByTestId('go-home').click();
    await expect
      .poll(sayings, { timeout: 5000 })
      .toEqual(['Батарейка садится. Скоро нужно поставить телефон на зарядку.']);
    await setBattery(page, 19);
    await page.waitForTimeout(2500);
    expect(await sayings()).toHaveLength(1);
  });

  test('подключили зарядку — «Телефон заряжается»', async ({ page, backend: _ }) => {
    await page.addInitScript(KIOSK_BATTERY);
    await page.goto('/');
    await expect(page.getByTestId('battery')).toBeVisible();
    await setBattery(page, 30, true);
    await expect
      .poll(async () => (await spoken(page)).map((s) => s.text), { timeout: 5000 })
      .toContain('Телефон заряжается. Молодец!');
  });
});

/** Политика безопасности детского приложения — из настроек веб-сервера. */
const KID_CSP = readFileSync(
  new URL('../../../deploy/web/Caddyfile', import.meta.url),
  'utf8',
).match(/\(csp-kid\)\s*\{\s*header Content-Security-Policy "([^"]+)"/)![1]!;

// ─── Этап 9: камера ──────────────────────────────────────────────────────────

test.describe('камера', () => {
  test('фото: один снимок на касание, пауза 2 с; галерея; копия — в кабинет', async ({
    page,
    backend,
  }) => {
    // Та же политика безопасности, что отдаёт сервер (deploy/web/Caddyfile): фото из галереи
    // не должны ею блокироваться.
    await page.route('http://127.0.0.1:4173/', async (route) => {
      const res = await route.fetch();
      await route.fulfill({
        response: res,
        headers: { ...res.headers(), 'content-security-policy': KID_CSP },
      });
    });
    await page.goto('/');
    await page.getByTestId('camera-open').click();
    const shutter = page.getByTestId('camera-shutter');
    await expect(shutter).toHaveAttribute('data-ready', '1');
    // Ждём, пока поддельная камера даст кадр.
    await page.waitForFunction(
      () => (document.querySelector('.camera-preview') as HTMLVideoElement)?.videoWidth > 0,
    );
    await shutter.click();
    // Серийной съёмки нет: сразу после снимка кнопка не работает.
    await expect(shutter).toHaveAttribute('data-ready', '0');
    await shutter.click({ force: true });
    await expect(shutter).toHaveAttribute('data-ready', '1', { timeout: 4000 });

    await page.getByTestId('camera-gallery').click();
    await expect(page.getByTestId('gallery-item')).toHaveCount(1);
    // Фото в сетке действительно загрузилось (а не значок сломанной картинки).
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (document.querySelector('.gallery-tile img') as HTMLImageElement | null)
              ?.naturalWidth ?? 0,
        ),
      )
      .toBeGreaterThan(0);
    await page.getByTestId('gallery-item').click();
    await expect(page.getByTestId('gallery-viewer').locator('img')).toBeVisible();
    await expect.poll(() => backend.captures?.length ?? 0).toBe(1);
    expect(backend.captures![0]).toMatchObject({ kind: 'photo', mime: 'image/jpeg' });
    expect(backend.captures![0]!.bytes).toBeGreaterThan(1000);
  });

  test('видео останавливается само на 30 секундах', async ({ page, backend }) => {
    await page.clock.install();
    await page.goto('/');
    await page.getByTestId('camera-open').click();
    await page.getByTestId('camera-mode-video').click();
    await expect(page.getByTestId('camera-shutter')).toHaveAttribute('data-ready', '1');
    await page.getByTestId('camera-shutter').click();
    await expect(page.getByTestId('camera-progress')).toBeVisible();
    await page.clock.runFor(29_000);
    await expect(page.getByTestId('camera-progress')).toBeVisible();
    await page.clock.runFor(2_000);
    await expect(page.getByTestId('camera-progress')).toHaveCount(0);
    await expect.poll(() => backend.captures?.length ?? 0, { timeout: 8000 }).toBe(1);
    expect(backend.captures![0]!.kind).toBe('video');
    expect(Number(backend.captures![0]!.durationMs)).toBeLessThanOrEqual(30_000);
  });

  test('лимит на сегодня: кнопка не снимает, звучит «хватит»', async ({ page, backend }) => {
    backend.captureUsed = { photo: 30, video: 0 };
    await page.goto('/');
    await page.getByTestId('camera-open').click();
    await expect(page.getByTestId('camera-limit')).toBeVisible();
    await expect(page.getByTestId('camera-shutter')).toBeDisabled();
    // Видео ещё можно.
    await page.getByTestId('camera-mode-video').click();
    await expect(page.getByTestId('camera-shutter')).toBeEnabled();
  });
});

// ─── Этап 10: звонки ─────────────────────────────────────────────────────────

const ZAIKA: Peer = 'c:00000000-0000-4000-8000-0000000000a1';
const SUN: Peer = 'c:00000000-0000-4000-8000-0000000000a2';
const MAMA: Peer = 'p:00000000-0000-4000-8000-0000000000b1';
const family = () => new FakeCallServer({ [ZAIKA]: 'Зайка', [SUN]: 'Солнышко', [MAMA]: 'Мама' });

test.describe('звонки', () => {
  test('входящий: на весь экран, «ответить» — разговор, «положить трубку» — назад', async ({
    page,
    backend,
  }) => {
    const server = family();
    backend.calls = { server, me: ZAIKA };
    await page.goto('/');
    await expect(page.getByTestId('calls-open')).toBeVisible();
    const call = server.ring(MAMA, ZAIKA);
    await expect(page.getByTestId('call-incoming')).toBeVisible();
    await expect(page.getByTestId('call-incoming')).toContainText('Мама');
    await page.getByTestId('call-accept').click();
    await expect(page.getByTestId('call-active')).toBeVisible();
    expect(server.calls.get(call.id)!.members.find((m) => m.id === ZAIKA)!.state).toBe('joined');
    await page.getByTestId('call-hangup').click();
    await expect(page.getByTestId('call-active')).toHaveCount(0);
    await expect(page.getByTestId('home')).toBeVisible();
  });

  test('отклонить входящий', async ({ page, backend }) => {
    const server = family();
    backend.calls = { server, me: ZAIKA };
    await page.goto('/');
    await expect(page.getByTestId('calls-open')).toBeVisible();
    const call = server.ring(MAMA, ZAIKA, false);
    await page.getByTestId('call-decline').click();
    await expect(page.getByTestId('call-incoming')).toHaveCount(0);
    expect(server.calls.get(call.id)!.status).toBe('ended');
  });

  test('кому позвонить: семья без себя; голосом и всей семьёй', async ({ page, backend }) => {
    const server = family();
    backend.calls = { server, me: ZAIKA };
    await page.goto('/');
    await page.getByTestId('calls-open').click();
    await expect(page.getByTestId('call-contact')).toHaveCount(2);
    await page
      .locator(`[data-peer="${SUN}"]`)
      .locator('xpath=..')
      .getByTestId('call-voice')
      .click();
    await expect(page.getByTestId('call-waiting')).toBeVisible();
    expect(server.started).toEqual([{ to: [SUN], video: false }]);
    await page.getByTestId('call-hangup').click();
    await page.getByTestId('call-family').click();
    await expect(page.getByTestId('call-waiting')).toBeVisible();
    expect(server.started.at(-1)!.to.sort()).toEqual([MAMA, SUN].sort());
  });

  test('два телефона соединяются по WebRTC и видят друг друга', async ({
    page,
    backend,
    browser,
  }) => {
    test.slow();
    const server = family();
    backend.calls = { server, me: ZAIKA };
    const ctx2 = await browser.newContext({
      permissions: ['camera', 'microphone'],
      viewport: page.viewportSize()!,
    });
    const page2 = await ctx2.newPage();
    const backend2: Backend = {
      paired: true,
      events: [],
      items: [],
      quiz: { options: 4, questions: 2 },
      calls: { server, me: SUN },
    };
    await page2.addInitScript(FAKE_SPEECH);
    await mockBackend(page2, backend2);

    await page.goto('/');
    await page2.goto('/');
    await expect(page2.getByTestId('calls-open')).toBeVisible();
    await page.getByTestId('calls-open').click();
    await page.locator(`[data-testid=call-contact][data-peer="${SUN}"]`).click();
    await expect(page2.getByTestId('call-incoming')).toBeVisible();
    await page2.getByTestId('call-accept').click();
    for (const p of [page, page2]) {
      await expect(p.getByTestId('call-remote')).toHaveAttribute('data-state', 'connected', {
        timeout: 20_000,
      });
      // Видео собеседника действительно идёт.
      await expect
        .poll(
          () =>
            p.evaluate(
              () =>
                (document.querySelector('.call-remote video') as HTMLVideoElement | null)
                  ?.videoWidth ?? 0,
            ),
          { timeout: 15_000 },
        )
        .toBeGreaterThan(0);
    }
    await page2.getByTestId('call-hangup').click();
    await expect(page.getByTestId('call-active')).toHaveCount(0);
    await ctx2.close();
  });
});

// ─── Этап 11: радионяня ──────────────────────────────────────────────────────

/** Громкий «микрофон»: getUserMedia только со звуком отдаёт непрерывный тон. */
const LOUD_MIC = `
  (() => {
    const real = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async (c) => {
      if (c && c.audio && !c.video) {
        const ctx = new AudioContext();
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        g.gain.value = 0.8;
        const dest = ctx.createMediaStreamDestination();
        o.connect(g).connect(dest);
        o.start();
        return dest.stream;
      }
      return real(c);
    };
  })();
`;

test.describe('радионяня', () => {
  test('родитель включил — ночной экран, экран не гаснет; выключил — обычный экран', async ({
    page,
    backend,
  }) => {
    const server = family();
    backend.calls = { server, me: ZAIKA };
    await page.addInitScript(() => {
      const calls: boolean[] = [];
      (window as unknown as { __night: boolean[] }).__night = calls;
      (window as unknown as { Capacitor: unknown }).Capacitor = {
        Plugins: {
          Kiosk: {
            openSettings: async () => {},
            setOrientation: async () => {},
            setNightMode: async ({ on }: { on: boolean }) => {
              calls.push(on);
            },
          },
        },
      };
    });
    await page.goto('/');
    await expect(page.getByTestId('home')).toBeVisible();
    server.monitor(ZAIKA, true);
    await expect(page.getByTestId('monitor')).toBeVisible();
    await expect(page.getByTestId('monitor')).toHaveAttribute('data-listening', '0');
    expect(
      await page.evaluate(() => (window as unknown as { __night: boolean[] }).__night),
    ).toEqual([true]);

    // «Слушать»: экрана звонка нет, только значок микрофона ярче.
    server.listen(MAMA, ZAIKA);
    await expect(page.getByTestId('monitor')).toHaveAttribute('data-listening', '1');
    await expect(page.getByTestId('call-incoming')).toHaveCount(0);
    await expect(page.getByTestId('call-active')).toHaveCount(0);

    server.monitor(ZAIKA, false);
    await expect(page.getByTestId('monitor')).toHaveCount(0);
    await expect
      .poll(() => page.evaluate(() => (window as unknown as { __night: boolean[] }).__night.at(-1)))
      .toBe(false);
  });

  test('громко дольше 3 секунд — сигнал «шумно» (без звука)', async ({ page, backend }) => {
    backend.monitorOn = true;
    await page.addInitScript(LOUD_MIC);
    await page.goto('/');
    await expect(page.getByTestId('monitor')).toBeVisible();
    await expect.poll(() => backend.noise?.length ?? 0, { timeout: 8000 }).toBe(1);
    expect(backend.noise![0]!.db).toBeGreaterThan(-20);
  });
});

// ─── Этап 12в: разделы без прокрутки, яркость ─────────────────────────────────

test.describe('главный экран', () => {
  const deck = (id: string, category: string) => ({
    kind: 'deck',
    id,
    category,
    coverUrl: '/api/media/c1',
    cards: [
      {
        id: 'x' + id,
        imageUrl: '/api/media/c1',
        word: { text: 'a', lang: 'ru', audioUrl: null },
        translation: null,
      },
    ],
  });
  const seven = () => [
    { ...SEGMENTS[0]!, kind: 'segment', questions: [] },
    ...['english', 'math', 'chinese', 'geography', 'nature', 'other'].map((c, i) =>
      deck(`33333333-3333-4333-8333-33333333333${i}`, c),
    ),
  ];

  test('все десять разделов (с музыкой, играми и стихами) помещаются на экран без прокрутки', async ({
    page,
    backend,
  }) => {
    backend.items = [
      ...seven(),
      game(1, { kind: 'loudness', rounds: 2 }, 'music'),
      game(2, { kind: 'balloons', count: 5, target: null }),
      game(
        3,
        { kind: 'poem', poem: 'osen', repeat: true, blanks: true, questions: true, choices: 3 },
        'poems',
      ),
    ];
    await gameMedia(page);
    await page.goto('/');
    await expect(page.getByTestId('category')).toHaveCount(10);
    await page.waitForTimeout(800);
    await shot(page, 'ten-categories');
    const fits = await page.evaluate(() => {
      const last = [...document.querySelectorAll('[data-testid=category]')].at(-1)!;
      const dock = document.querySelector('.dock');
      const bottom = last.getBoundingClientRect().bottom;
      return bottom <= (dock ? dock.getBoundingClientRect().top : window.innerHeight);
    });
    // Альбомная ориентация — разделы в ряд, проверяем только книжную.
    if (page.viewportSize()!.height > page.viewportSize()!.width) expect(fits).toBe(true);
  });

  test('яркость: три солнца, выбор уходит в киоск; вне киоска кнопки нет', async ({
    page,
    backend,
  }) => {
    backend.items = seven();
    await page.goto('/');
    await expect(page.getByTestId('brightness-open')).toHaveCount(0);
    await page.addInitScript(() => {
      const levels: number[] = [];
      (window as unknown as { __levels: number[] }).__levels = levels;
      (window as unknown as { Capacitor: unknown }).Capacitor = {
        Plugins: {
          Kiosk: {
            openSettings: async () => {},
            setOrientation: async () => {},
            setBrightness: async ({ level }: { level: number }) => {
              levels.push(level);
            },
          },
        },
      };
    });
    await page.goto('/');
    await page.getByTestId('brightness-open').click();
    await expect(page.getByTestId('brightness-level')).toHaveCount(3);
    await page.getByTestId('brightness-level').first().click();
    await expect(page.getByTestId('brightness')).toHaveCount(0);
    expect(
      await page.evaluate(() => (window as unknown as { __levels: number[] }).__levels),
    ).toEqual([0.15]);
  });
});

test.describe('музыка', () => {
  test('высоко — низко: показ, потом вопрос; верная картинка — следующий раунд', async ({
    page,
    backend,
  }) => {
    backend.items = [game(1, { kind: 'pitch', gap: 24, rounds: 2 }, 'music')];
    await openGame(page);
    const field = page.getByTestId('game-music-choice');
    for (let round = 0; round < 2; round++) {
      await expect(field).toHaveAttribute('data-phase', 'answer', { timeout: 15_000 });
      await shot(page, 'music-pitch');
      const answer = (await field.getAttribute('data-answer'))!;
      if (round === 0) {
        const wrong = answer === 'a' ? 'b' : 'a';
        await page.locator(`[data-testid=music-side][data-side="${wrong}"]`).click();
      }
      await page.locator(`[data-testid=music-side][data-side="${answer}"]`).click();
      if (round === 0) await expect(field).toHaveAttribute('data-phase', 'solved');
    }
    await expectFinished(page, backend);
    const said = (await spoken(page)).map((s) => s.text);
    expect(said).toContain('Птичка поёт высоко.');
    expect(said).toContain('Кто поёт — птичка или мишка?');
  });

  test('сколько звуков: выбрать число ударов', async ({ page, backend }) => {
    backend.items = [game(1, { kind: 'beats', max: 3, rounds: 2 }, 'music')];
    await openGame(page);
    const field = page.getByTestId('game-beats');
    for (let round = 0; round < 2; round++) {
      const answer = (await field.getAttribute('data-answer'))!;
      const option = page.locator(`[data-testid=beats-option][data-value="${answer}"]`);
      await expect(option).toHaveAttribute('data-hint', '', { timeout: 10_000 });
      await option.click();
      if (round === 0) {
        await expect(option).toHaveClass(/picked/);
        // Следующий раунд — когда отметка «верно» снята.
        await expect(page.locator('.music-number.picked')).toHaveCount(0, { timeout: 5000 });
      }
    }
    await expectFinished(page, backend);
  });

  test('повтори ритм: после образца — столько же ударов по барабану', async ({ page, backend }) => {
    backend.items = [game(1, { kind: 'rhythm', beats: 3, timing: false, rounds: 2 }, 'music')];
    await openGame(page);
    const field = page.getByTestId('game-rhythm');
    for (let round = 0; round < 2; round++) {
      await expect(field).toHaveAttribute('data-phase', 'play', { timeout: 10_000 });
      await shot(page, 'music-rhythm');
      for (let i = 0; i < 3; i++) await page.getByTestId('rhythm-drum').click();
      if (round === 0) await expect(field).toHaveAttribute('data-phase', 'listen');
    }
    await expectFinished(page, backend);
  });

  test('пианино: «найди ноту» — неверная называется, верная засчитывается', async ({
    page,
    backend,
  }) => {
    backend.items = [game(1, { kind: 'piano', mode: 'find', keys: 5, rounds: 2 }, 'music')];
    await openGame(page);
    const field = page.getByTestId('game-piano');
    for (let round = 0; round < 2; round++) {
      await expect(field).toHaveAttribute('data-ready', 'true', { timeout: 15_000 });
      await shot(page, 'music-piano');
      const answer = Number(await field.getAttribute('data-answer'));
      if (round === 0) {
        await page.locator(`[data-testid=piano-key][data-key="${(answer + 1) % 5}"]`).click();
      }
      await page.locator(`[data-testid=piano-key][data-key="${answer}"]`).click();
      if (round === 0) await expect(field).toHaveAttribute('data-ready', 'false');
    }
    await expectFinished(page, backend);
    expect((await spoken(page)).some((s) => s.text.startsWith('Найди ноту '))).toBe(true);
  });

  test('нотный стан: выбрать название ноты', async ({ page, backend }) => {
    backend.items = [game(1, { kind: 'staff', keys: 5, rounds: 2 }, 'music')];
    await openGame(page);
    const field = page.getByTestId('game-staff');
    for (let round = 0; round < 2; round++) {
      await shot(page, 'music-staff');
      const answer = (await field.getAttribute('data-answer'))!;
      const option = page.locator(`[data-testid=staff-option][data-name="${answer}"]`);
      await option.click();
      await expect(option).toHaveClass(/picked/);
      // Следующая нота — другая.
      if (round === 0)
        await expect(field).not.toHaveAttribute('data-answer', answer, { timeout: 4000 });
    }
    await expectFinished(page, backend);
  });

  test('колокольчики: застрял — медленнее, потом светится нужный, потом эта мелодия последняя', async ({
    page,
    backend,
  }) => {
    backend.items = [game(1, { kind: 'melody', bells: 3, start: 2, goal: 5 }, 'music')];
    await openGame(page);
    const field = page.getByTestId('game-melody');
    const tune = async () =>
      ((await page.getByTestId('melody-tune').textContent()) ?? '').split(',').map(Number);
    const miss = async () => {
      await expect(field).toHaveAttribute('data-phase', 'play', { timeout: 10_000 });
      const [first] = await tune();
      await press(page.locator(`[data-bell="${(first! + 1) % 3}"]`));
      await expect(field).toHaveAttribute('data-phase', 'listen');
    };
    await miss();
    await expect(page.locator('.bell.guide')).toHaveCount(0);
    await miss();
    // Две ошибки — нужный колокольчик светится.
    await expect(field).toHaveAttribute('data-phase', 'play', { timeout: 10_000 });
    const [first] = await tune();
    await expect(page.locator(`.bell.guide[data-bell="${first}"]`)).toHaveCount(1);
    await shot(page, 'melody-guide');
    await miss();
    // Три ошибки — доиграть эту мелодию, и урок пройден.
    await expect(field).toHaveAttribute('data-phase', 'play', { timeout: 10_000 });
    await expect(page.locator('.melody-progress span')).toHaveCount(2);
    for (const n of await tune()) await press(page.locator(`[data-bell="${n}"]`));
    await expectFinished(page, backend);
    expect((await spoken(page)).map((s) => s.text)).toContain(
      'Нажимай на колокольчик, который светится!',
    );
  });

  test('ритм «та» и «ти-ти»: после двух промахов засчитывается верное число ударов', async ({
    page,
    backend,
  }) => {
    test.slow(); // шесть раз слушаем образец
    backend.items = [game(1, { kind: 'rhythm', beats: 3, timing: true, rounds: 2 }, 'music')];
    await openGame(page);
    const field = page.getByTestId('game-rhythm');
    const drum = page.getByTestId('rhythm-drum');
    for (let round = 0; round < 2; round++) {
      // Образец — «ти-ти-та» (ровно); стучим неровно — ритм не тот; после второго раза — засчитано.
      for (let attempt = 0; attempt < 3; attempt++) {
        await expect(field).toHaveAttribute('data-phase', 'play', { timeout: 15_000 });
        await press(drum);
        await page.waitForTimeout(40);
        await press(drum);
        await page.waitForTimeout(500);
        await press(drum);
        if (attempt < 2) await expect(field).toHaveAttribute('data-phase', 'listen');
        else if (round === 0) await expect(field).toHaveAttribute('data-phase', 'done');
      }
    }
    await expectFinished(page, backend);
    expect((await spoken(page)).map((s) => s.text)).toContain(
      'Стучи столько раз, сколько огоньков!',
    );
  });

  test('сыграй песенку: светится нужная клавиша, ошибка не мешает, в конце — вся песенка', async ({
    page,
    backend,
  }) => {
    backend.items = [game(1, { kind: 'song', songs: ['vorobey'] }, 'music')];
    await openGame(page);
    const field = page.getByTestId('game-song');
    await expect(field).toHaveAttribute('data-phase', 'play', { timeout: 10_000 });
    await shot(page, 'music-song');
    const key = (n: string | number) => page.locator(`[data-testid=song-key][data-key="${n}"]`);
    // Не та клавиша — просто звучит, светится всё та же.
    const first = (await field.getAttribute('data-answer'))!;
    await press(key((Number(first) + 1) % 5));
    await expect(field).toHaveAttribute('data-answer', first);
    await expect(key(first)).toHaveClass(/guide/);
    while ((await field.getAttribute('data-phase')) === 'play') {
      await press(key((await field.getAttribute('data-answer'))!));
    }
    await expect(field).toHaveAttribute('data-phase', 'replay');
    // Песенка звучит целиком — несколько секунд.
    await expect(page.getByTestId('game-finished')).toBeVisible({ timeout: 15_000 });
    await expectFinished(page, backend);
    expect((await spoken(page)).map((s) => s.text)).toContain('Сыграем песенку «Андрей-воробей»!');
  });

  test('«Замри!»: музыка стихла — замираем; пошевелился — напоминание', async ({
    page,
    backend,
  }) => {
    backend.items = [game(1, { kind: 'freeze', rounds: 2 }, 'music')];
    await openGame(page);
    const field = page.getByTestId('game-freeze');
    await expect(field).toHaveAttribute('data-phase', 'dance');
    await shot(page, 'music-freeze');
    await press(page.getByTestId('dancer').first());
    await expect(field).toHaveAttribute('data-phase', 'freeze', { timeout: 10_000 });
    await press(page.getByTestId('dancer').first());
    await expect(field).toHaveAttribute('data-round', '1', { timeout: 6000 });
    await expect(field).toHaveAttribute('data-phase', 'freeze', { timeout: 10_000 });
    await expect(page.getByTestId('game-finished')).toBeVisible({ timeout: 10_000 });
    const said = (await spoken(page)).map((s) => s.text);
    expect(said).toContain('Замри!');
    expect(said).toContain('Ой, кто-то пошевелился! Замри!');
  });

  test('звериный оркестр: играем на том, кто светится', async ({ page, backend }) => {
    backend.items = [game(1, { kind: 'orchestra', players: 3, rounds: 2 }, 'music')];
    await openGame(page);
    const field = page.getByTestId('game-orchestra');
    for (let round = 0; round < 2; round++) {
      await expect(field).not.toHaveAttribute('data-solo', '', { timeout: 10_000 });
      if (round === 0) await shot(page, 'music-orchestra');
      const solo = (await field.getAttribute('data-solo'))!;
      // Другой зверёк звучит, но не засчитывается.
      await press(page.locator(`[data-player="${(Number(solo) + 1) % 3}"]`));
      await expect(page.locator('.orchestra-notes .on')).toHaveCount(0);
      for (let i = 0; i < 4; i++) await press(page.locator(`[data-player="${solo}"]`));
      await expect(field).toHaveAttribute('data-solo', '');
    }
    await expectFinished(page, backend);
  });

  test('дорожка: из трудного урока дважды ушёл — светится следующий', async ({ page, backend }) => {
    backend.items = [
      game(1, { kind: 'melody', bells: 3, start: 2, goal: 4 }, 'music'),
      game(2, { kind: 'loudness', rounds: 2 }, 'music'),
    ];
    await gameMedia(page);
    await page.goto('/');
    const steps = page.getByTestId('lesson-path').getByTestId('tile');
    for (let i = 0; i < 2; i++) {
      await expect(steps.nth(0)).toHaveAttribute('data-hint', '', { timeout: 8000 });
      await steps.nth(0).click();
      await expect(page.getByTestId('game-melody')).toBeVisible();
      await page.getByTestId('go-home').click();
    }
    await expect(steps.nth(1)).toHaveAttribute('data-hint', '', { timeout: 8000 });
    await expect(steps.nth(0)).not.toHaveAttribute('data-hint', '');
  });

  test('раздел «Музыка» — дорожка уроков: пройденный со звёздочкой, следующий светится', async ({
    page,
    backend,
  }) => {
    backend.items = [
      game(1, { kind: 'staff', keys: 3, rounds: 2 }, 'music'),
      game(2, { kind: 'loudness', rounds: 2 }, 'music'),
    ];
    await gameMedia(page);
    await page.goto('/');
    const path = page.getByTestId('lesson-path');
    await expect(path).toBeVisible();
    await shot(page, 'music-path');
    const steps = path.getByTestId('tile');
    await expect(steps.nth(0)).toHaveAttribute('data-hint', '');
    await steps.nth(0).click();
    const field = page.getByTestId('game-staff');
    for (let round = 0; round < 2; round++) {
      const answer = (await field.getAttribute('data-answer'))!;
      const option = page.locator(`[data-testid=staff-option][data-name="${answer}"]`);
      await option.click();
      await expect(option).toHaveClass(/picked/);
      if (round === 0)
        await expect(page.locator('.staff-option.picked')).toHaveCount(0, { timeout: 5000 });
    }
    // После урока — снова дорожка: первый со звёздочкой, второй светится.
    await expect(path).toBeVisible({ timeout: 8000 });
    await expect(steps.nth(0)).toHaveAttribute('data-done', 'true');
    await expect(steps.nth(1)).toHaveAttribute('data-hint', '');
  });
});

test.describe('буквы', () => {
  test('найди букву и прочитай слово: верный ответ — следующий раунд, раздел — дорожка', async ({
    page,
    backend,
  }) => {
    backend.items = [
      game(1, { kind: 'letter', letters: ['А', 'О', 'У'], choices: 3, rounds: 2 }, 'letters'),
      game(
        2,
        {
          kind: 'readWord',
          words: [
            { emoji: '🐱', word: 'КОТ' },
            { emoji: '🏠', word: 'ДОМ' },
            { emoji: '🐳', word: 'КИТ' },
          ],
          choices: 3,
          rounds: 2,
        },
        'letters',
      ),
    ];
    await page.goto('/');
    await expect(page.getByTestId('lesson-path')).toBeVisible();
    const field = page.getByTestId('game-letters');
    const play = async () => {
      for (let round = 0; round < 2; round++) {
        const answer = (await field.getAttribute('data-answer'))!;
        const option = page.locator(`[data-testid=letters-option][data-value="${answer}"]`);
        await option.click();
        await expect(option).toHaveClass(/picked/);
        if (round === 0)
          await expect(page.locator('.letters-option.picked')).toHaveCount(0, { timeout: 5000 });
      }
    };
    await page.getByTestId('tile').nth(0).click();
    await shot(page, 'letters-letter');
    await play();
    await expect(page.getByTestId('lesson-path')).toBeVisible({ timeout: 8000 });
    await page.getByTestId('tile').nth(1).click();
    await expect(page.locator('.letters-word')).toBeVisible();
    await shot(page, 'letters-read');
    await play();
    const said = (await spoken(page)).map((s) => s.text);
    expect(said.some((t) => t.startsWith('Найди букву '))).toBe(true);
    expect(said).toContain('Прочитай слово и найди картинку.');
  });

  test('звуки и чтение: слоги, место звука, схема, слово и фраза — всё в экране', async ({
    page,
    backend,
  }) => {
    test.setTimeout(90_000);
    backend.items = [
      game(
        1,
        {
          kind: 'syllableCount',
          words: [
            { emoji: '🐱', word: 'КОТ' },
            { emoji: '🌙', word: 'ЛУНА' },
            { emoji: '🚀', word: 'РАКЕТА' },
          ],
          choices: 4,
          rounds: 2,
        },
        'letters',
      ),
      game(
        2,
        {
          kind: 'soundPlace',
          sound: 'С',
          words: [
            { emoji: '🧃', word: 'СОК' },
            { emoji: '🦊', word: 'ЛИСА' },
            { emoji: '👃', word: 'НОС' },
          ],
          rounds: 2,
        },
        'letters',
      ),
      game(
        3,
        {
          kind: 'wordScheme',
          words: [
            { emoji: '👒', word: 'ПАНАМА' },
            { emoji: '🦆', word: 'УТКА' },
          ],
          choices: 4,
          rounds: 2,
        },
        'letters',
      ),
      game(
        4,
        {
          kind: 'pickWord',
          items: [
            { emoji: '🐱', word: 'КОТ', similar: ['КИТ', 'РОТ', 'КРОТ'] },
            { emoji: '🧃', word: 'СОК', similar: ['СОН', 'СОМ', 'СУК'] },
          ],
          choices: 4,
          rounds: 2,
        },
        'letters',
      ),
      game(
        5,
        {
          kind: 'readPhrase',
          items: [
            { text: 'ДВА ГРИБА', emoji: '🍄🍄', similar: ['🍄🍄🍄', '🍄', '🍄🍄🍄🍄'] },
            { text: 'КОТ СПИТ НА ДИВАНЕ', emoji: '🐱🛋️', similar: ['🐶🛋️', '🐱🛏️', '🐱⚽'] },
          ],
          choices: 4,
          rounds: 2,
        },
        'letters',
      ),
    ];
    await page.goto('/');
    await expect(page.getByTestId('lesson-path')).toBeVisible();
    const field = page.getByTestId('game-letters');
    const { width, height } = page.viewportSize()!;
    for (const [i, name] of ['count', 'sound', 'scheme', 'pick', 'phrase'].entries()) {
      await page.getByTestId('tile').nth(i).click();
      await expect(field).toBeVisible();
      for (let round = 0; round < 2; round++) {
        // Варианты целиком в экране: ни схема, ни фраза не уезжают за край.
        const options = page.getByTestId('letters-option');
        await expect(options.first()).toBeVisible();
        for (const box of await options.evaluateAll((els) =>
          els.map((el) => el.getBoundingClientRect().toJSON() as DOMRect),
        )) {
          expect(box.left).toBeGreaterThanOrEqual(0);
          expect(box.right).toBeLessThanOrEqual(width);
          expect(box.bottom).toBeLessThanOrEqual(height);
        }
        if (round === 0) await shot(page, `letters-${name}`);
        const answer = (await field.getAttribute('data-answer'))!;
        const option = page.locator(`[data-testid=letters-option][data-value="${answer}"]`);
        await option.click();
        await expect(option).toHaveClass(/picked/);
        if (round === 0)
          await expect(page.locator('.letters-option.picked')).toHaveCount(0, { timeout: 5000 });
      }
      await expect(page.getByTestId('lesson-path')).toBeVisible({ timeout: 8000 });
    }
    const said = (await spoken(page)).map((s) => s.text);
    expect(said).toContain('Хлопай на каждый слог и найди, сколько раз хлопнул.');
    expect(said.some((t) => /^Где звук ссс в слове (сок|лиса|нос)\?$/.test(t))).toBe(true);
    expect(said).toContain('Найди слово к картинке.');
    expect(said).toContain('Прочитай и найди картинку.');
  });
});

test.describe('буквы О, А, У (этап 56)', () => {
  /** Провести пальцем по штрихам фигуры (координаты поля 100×100 → экран). */
  async function traceStrokes(page: Page, shape: TraceShape) {
    const { TRACES, resample } = await import('../src/games/traceShapes');
    for (const stroke of TRACES[shape].strokes) {
      const pts = await fieldPoints(page, resample(stroke));
      await page.mouse.move(pts[0]!.x, pts[0]!.y);
      await page.mouse.down();
      for (const p of pts) await page.mouse.move(p.x, p.y);
      await page.mouse.up();
    }
  }
  async function fieldPoints(page: Page, pts: readonly (readonly [number, number])[]) {
    const box = (await page.getByTestId('trace').boundingBox())!;
    const s = Math.min(box.width, box.height) / 100;
    const ox = box.x + (box.width - 100 * s) / 2;
    const oy = box.y + (box.height - 100 * s) / 2;
    return pts.map(([x, y]) => ({ x: ox + x * s, y: oy + y * s }));
  }

  test('обведи букву: по точкам со стрелкой и номерами, потом сама по образцу; промахи — подсказка', async ({
    page,
    backend,
  }) => {
    backend.items = [game(1, { kind: 'tracing', shapes: ['А'], guides: ['dots', 'start'] })];
    await openGame(page);
    const field = page.getByTestId('game-tracing');
    await expect(field).toHaveAttribute('data-guide', 'dots');
    await expect(page.getByTestId('trace-arrow')).toBeVisible();
    await expect(page.locator('.trace-number')).toHaveCount(3);
    await expect(page.locator('.trace-rule')).toHaveCount(3);
    await shot(page, 'tracing-letter');
    await traceStrokes(page, 'А');
    // Вторая ступень — без пунктира: образец в углу, только точка начала.
    await expect(field).toHaveAttribute('data-guide', 'start', { timeout: 5000 });
    await expect(page.getByTestId('trace-sample')).toBeVisible();
    await expect(page.locator('.trace-dash')).toHaveCount(0);
    await expect(page.locator('.trace-end')).toHaveCount(0);
    // Касание мимо начала штриха — промах; после второго — линия-подсказка.
    const [miss] = await fieldPoints(page, [[92, 92]]);
    for (let i = 0; i < 2; i++) {
      await page.mouse.move(miss!.x, miss!.y);
      await page.mouse.down();
      await page.mouse.up();
    }
    await expect(page.getByTestId('trace-hint')).toBeVisible();
    await shot(page, 'tracing-letter-self');
    await traceStrokes(page, 'А');
    await expectFinished(page, backend);
    const said = (await spoken(page)).map((s) => s.text);
    expect(said).toContain('Обведи большую букву А.');
    expect(said).toContain('Напиши большую букву А по образцу. Начни с зелёной точки.');
    expect(said).toContain('Подскажу: веди вот так.');
  });

  test('весь алфавит: Б по номерам штрихов, точки Ё — касанием, мягкий знак', async ({
    page,
    backend,
  }) => {
    test.setTimeout(60_000);
    backend.items = [game(1, { kind: 'tracing', shapes: ['Б', 'Ё', 'ь'] })];
    await openGame(page);
    await expect(page.locator('.trace-number')).toHaveCount(3);
    await shot(page, 'tracing-alphabet');
    await traceStrokes(page, 'Б');
    // У Ё номера только у четырёх палочек — точки ставят касанием.
    await expect(page.locator('.trace-number')).toHaveCount(4, { timeout: 5000 });
    await traceStrokes(page, 'Ё');
    await expect(page.locator('.trace-number')).toHaveCount(2, { timeout: 5000 });
    await traceStrokes(page, 'ь');
    await expectFinished(page, backend);
    const said = (await spoken(page)).map((s) => s.text);
    expect(said).toContain('Обведи большую букву Б.');
    expect(said).toContain('Обведи большую букву Ё.');
    expect(said).toContain('Обведи маленький мягкий знак.');
  });

  test('шарики с буквой О: другая буква не считается и совёнок подсказывает', async ({
    page,
    backend,
  }) => {
    test.setTimeout(60_000);
    backend.items = [
      game(1, {
        kind: 'balloons',
        count: 3,
        letters: { find: 'О', others: ['А', 'У'], lower: false },
      }),
    ];
    await openGame(page);
    const wrong = page.locator('.balloon[data-letter]:not([data-letter="О"]):not(.popped)');
    await expect(wrong.first()).toBeAttached({ timeout: 15000 });
    const letter = (await wrong.first().getAttribute('data-letter'))!;
    // Для снимка — дать шарикам подняться.
    if (process.env.SHOTS) await page.waitForTimeout(3000);
    await shot(page, 'balloons-letter');
    await wrong.first().dispatchEvent('pointerdown');
    await expect(page.locator('.balloon-score .on')).toHaveCount(0);
    for (let i = 0; i < 3; i++) {
      const right = page.locator('.balloon[data-letter="О"]:not(.popped)').first();
      await expect(right).toBeAttached({ timeout: 15000 });
      await right.dispatchEvent('pointerdown');
    }
    await expectFinished(page, backend);
    const said = (await spoken(page)).map((s) => s.text);
    expect(said).toContain('Лопни шарики с буквой О!');
    expect(said).toContain(`Это буква ${letter}. Ищи букву О!`);
  });

  test('найди букву среди маленьких; «Где звук?» для О — ударение не мешает', async ({
    page,
    backend,
  }) => {
    backend.items = [
      game(
        1,
        { kind: 'letter', letters: ['А', 'О', 'У'], choices: 3, rounds: 2, letterCase: 'lower' },
        'letters',
      ),
      game(
        2,
        {
          kind: 'soundPlace',
          sound: 'О',
          words: [
            { emoji: '⛵', word: 'ЛО\u0301ДКА' },
            { emoji: '🚇', word: 'МЕТРО\u0301' },
            { emoji: '🐱', word: 'КОТ' },
          ],
          rounds: 2,
        },
        'letters',
      ),
    ];
    await page.goto('/');
    await expect(page.getByTestId('lesson-path')).toBeVisible();
    const field = page.getByTestId('game-letters');
    const play = async (check?: () => Promise<void>) => {
      for (let round = 0; round < 2; round++) {
        await check?.();
        const answer = (await field.getAttribute('data-answer'))!;
        const option = page.locator(`[data-testid=letters-option][data-value="${answer}"]`);
        await option.click();
        await expect(option).toHaveClass(/picked/);
        if (round === 0)
          await expect(page.locator('.letters-option.picked')).toHaveCount(0, { timeout: 5000 });
      }
      await expect(page.getByTestId('lesson-path')).toBeVisible({ timeout: 8000 });
    };
    await page.getByTestId('tile').nth(0).click();
    await play(async () => {
      const labels = await page.getByTestId('letters-option').allInnerTexts();
      expect(labels.join('')).toMatch(/^[аоу]{3}$/u);
    });
    await page.getByTestId('tile').nth(1).click();
    await play();
    const said = (await spoken(page)).map((s) => s.text);
    expect(said.some((t) => /^Найди букву [АОУ]\.$/u.test(t))).toBe(true);
    expect(said.some((t) => /^Где звук ооо в слове (лодка|метро|кот)\?$/u.test(t))).toBe(true);
    expect(said.join(' ')).not.toContain('\u0301');
  });

  test('«Повторяем О, А, У»: «С какой буквы?» — на кнопках только А, О, У; «Прочитай АУ»', async ({
    page,
    backend,
  }) => {
    const lesson = (topic: string) => {
      const l = LETTER_LESSONS.find((x) => x.title.endsWith(topic))!;
      return { ...l.spec, rounds: 2 } as typeof l.spec;
    };
    backend.items = [
      game(1, lesson('с какой буквы?'), 'letters'),
      game(2, lesson('прочитай АУ и УА'), 'letters'),
    ];
    await page.goto('/');
    await expect(page.getByTestId('lesson-path')).toBeVisible();
    const field = page.getByTestId('game-letters');
    const play = async (check?: () => Promise<void>) => {
      for (let round = 0; round < 2; round++) {
        await check?.();
        const answer = (await field.getAttribute('data-answer'))!;
        const option = page.locator(`[data-testid=letters-option][data-value="${answer}"]`);
        await option.click();
        await expect(option).toHaveClass(/picked/);
        if (round === 0)
          await expect(page.locator('.letters-option.picked')).toHaveCount(0, { timeout: 5000 });
      }
      await expect(page.getByTestId('lesson-path')).toBeVisible({ timeout: 8000 });
    };
    await page.getByTestId('tile').nth(0).click();
    await play(async () => {
      const labels = await page.getByTestId('letters-option').allInnerTexts();
      expect([...labels].sort().join('')).toBe('АОУ');
    });
    await shot(page, 'oau-path');
    await page.getByTestId('tile').nth(1).click();
    await play();
    const said = (await spoken(page)).map((s) => s.text);
    expect(said.some((t) => /^С какой буквы /u.test(t))).toBe(true);
  });
});

test.describe('счёт к школе', () => {
  test('«Математика»: «Счёт» — дорожкой сверху, другие игры — под ней; четыре игры до конца', async ({
    page,
    backend,
  }) => {
    test.setTimeout(90_000);
    backend.items = [
      game(1, { kind: 'clock', half: false, choices: 3, rounds: 2 }, 'math'),
      game(2, { kind: 'numberHouse', numbers: [5, 6], dots: true, choices: 3, rounds: 2 }, 'math'),
      game(
        3,
        {
          kind: 'numberNeighbors',
          from: 10,
          to: 20,
          modes: ['gap', 'before', 'after'],
          choices: 4,
          rounds: 2,
        },
        'math',
      ),
      game(4, { kind: 'compareSign', max: 10, equal: true, dots: true, rounds: 2 }, 'math'),
      game(
        5,
        {
          kind: 'wordProblem',
          problems: [
            {
              emoji: '🍎',
              a: 3,
              op: 'plus',
              b: 2,
              text: 'У ёжика три яблока. Ему дали ещё два. Сколько стало?',
            },
            {
              emoji: '🎈',
              a: 5,
              op: 'minus',
              b: 2,
              text: 'Было пять шариков. Два улетели. Сколько осталось?',
            },
          ],
          scene: true,
          choices: 4,
          rounds: 2,
        },
        'math',
      ),
    ];
    await page.goto('/');
    const path = page.getByTestId('lesson-path');
    await expect(path).toBeVisible();
    await expect(path.getByTestId('tile')).toHaveCount(4);
    // Часы — плиткой под дорожкой.
    await expect(page.getByTestId('tile')).toHaveCount(5);
    await shot(page, 'count-path');
    const field = page.getByTestId('game-count');
    const { width, height } = page.viewportSize()!;
    const boards = ['count-house', 'count-row', 'count-compare', 'count-problem'];
    for (const [i, board] of boards.entries()) {
      await path.getByTestId('tile').nth(i).click();
      await expect(field).toBeVisible();
      await expect(page.getByTestId(board)).toBeVisible();
      for (let round = 0; round < 2; round++) {
        // Доска и варианты целиком в экране — и лёжа, и на маленьком iPhone.
        const options = page.getByTestId('count-choice');
        await expect(options.first()).toBeVisible();
        for (const el of [page.getByTestId(board), ...(await options.all())]) {
          const box = (await el.boundingBox())!;
          expect(box.x).toBeGreaterThanOrEqual(0);
          expect(box.x + box.width).toBeLessThanOrEqual(width + 1);
          expect(box.y + box.height).toBeLessThanOrEqual(height + 1);
        }
        if (round === 0) await shot(page, board);
        const answer = (await field.getAttribute('data-answer'))!;
        const option = page.locator(`[data-testid=count-choice][data-value="${answer}"]`);
        await option.click();
        await expect(option).toHaveClass(/picked/);
        if (round === 0)
          await expect(page.locator('.cnt-option.picked')).toHaveCount(0, { timeout: 6000 });
      }
      await expect(path).toBeVisible({ timeout: 8000 });
      await expect(path.getByTestId('tile').nth(i)).toHaveAttribute('data-done', 'true');
    }
    const said = (await spoken(page)).map((s) => s.text);
    expect(said).toContain('В домике два окошка. Вместе они — как число на крыше.');
    expect(said).toContain('Сколько в пустом окошке?');
    expect(said).toContain('Какой знак поставим?');
    expect(
      said.some((t) => t.startsWith('У ёжика три яблока') || t.startsWith('Было пять шариков')),
    ).toBe(true);
  });

  test('ошибка — вариант гаснет, совёнок повторяет вопрос', async ({ page, backend }) => {
    backend.items = [
      game(1, { kind: 'compareSign', max: 10, equal: false, dots: false, rounds: 2 }, 'math'),
    ];
    await page.goto('/');
    await page.getByTestId('tile').first().click();
    const field = page.getByTestId('game-count');
    await expect(field).toBeVisible();
    const answer = (await field.getAttribute('data-answer'))!;
    const wrong = page.locator(
      `[data-testid=count-choice][data-value="${answer === '<' ? '>' : '<'}"]`,
    );
    const before = (await spoken(page)).filter((s) => s.text === 'Какой знак поставим?').length;
    await wrong.click();
    await expect(wrong).toHaveClass(/off/);
    await expect
      .poll(
        async () => (await spoken(page)).filter((s) => s.text === 'Какой знак поставим?').length,
      )
      .toBeGreaterThan(before);
    await expect(field).toHaveAttribute('data-answer', answer);
  });
});

test.describe('без интернета', () => {
  test('картинки занятий скачиваются заранее и показываются без сети', async ({
    page,
    backend,
  }) => {
    backend.items = [game(1, { kind: 'memory', imageIds: [CAT, LION, RABBIT] })];
    await gameMedia(page);
    await page.goto('/');
    // Файлы занятий легли в кэш.
    await expect
      .poll(() =>
        page.evaluate(async () => (await (await caches.open('kidsplus-media')).keys()).length),
      )
      .toBeGreaterThanOrEqual(3);
    // Сети для файлов больше нет — картинки всё равно из кэша.
    await page.unroute('**/api/media/**');
    await page.route('**/api/media/**', (r) => r.abort('internetdisconnected'));
    await page.getByTestId('tile').first().click();
    await page.getByTestId('memory-card').first().click();
    const img = page.getByTestId('memory-card').first().locator('img');
    await expect(img).toHaveAttribute('src', /^blob:/);
    expect(await img.evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  });

  test('событие без сети копится и уходит, когда связь вернулась', async ({ page, backend }) => {
    backend.items = [game(1, { kind: 'memory', imageIds: [CAT, LION] })];
    await gameMedia(page);
    await page.goto('/');
    await page.route('**/api/kid/events', (r) => r.abort('internetdisconnected'));
    await page.getByTestId('tile').first().click();
    await expect(page.getByTestId('memory-card')).toHaveCount(4);
    await solveMemory(page);
    await expect(page.getByTestId('game-finished')).toBeVisible({ timeout: 6000 });
    expect(backend.events.filter((e) => e.type === 'interactive_complete')).toHaveLength(0);
    expect(await page.evaluate(() => localStorage.getItem('kidsplus.outbox'))).toContain(
      'interactive_complete',
    );

    await page.unroute('**/api/kid/events');
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await expect
      .poll(() => backend.events.filter((e) => e.type === 'interactive_complete').length)
      .toBe(1);
  });
});

test.describe('малыш', () => {
  test('четыре большие кнопки; песенки играют сами; шум и мама; режим запоминается', async ({
    page,
    backend,
  }) => {
    backend.baby = true;
    backend.items = [
      { ...SEGMENTS[0]!, kind: 'segment', questions: [], subject: 'music' },
      { ...SEGMENTS[1]!, kind: 'segment', questions: [], subject: 'other' },
    ];
    backend.lullabies = [{ label: 'Спи, моя радость', url: '/api/media/lull1' }];
    await page.goto('/');
    await expect(page.getByTestId('baby-tile')).toHaveCount(4);
    await shot(page, 'baby-menu');

    await page.locator('[data-testid=baby-tile][data-mode=songs]').click();
    await expect(page.getByTestId('baby-video')).toHaveAttribute('data-mode', 'songs');
    await expect(page.getByTestId('player')).toBeVisible();

    // Голосом (этап 16в): «Малыш, шум».
    await page.evaluate(() =>
      window.dispatchEvent(new CustomEvent('kidsplus-voice', { detail: 'noise' })),
    );
    await expect(page.getByTestId('baby-noise')).toBeVisible();
    await page.getByRole('button', { name: /Сердце/ }).click();
    await expect(page.getByTestId('baby-noise')).toHaveAttribute('data-noise', 'heart');
    await shot(page, 'baby-noise');

    // После перезапуска — тот же режим.
    await page.reload();
    await expect(page.getByTestId('baby-noise')).toHaveAttribute('data-noise', 'heart');

    await page.getByTestId('baby-back').click();
    await page.locator('[data-testid=baby-tile][data-mode=mama]').click();
    await expect(page.getByTestId('baby-mama')).toContainText('Спи, моя радость');
  });

  test('голос в киоске: «Малыш, шум» — шум; голос включён, пока открыт экран малыша', async ({
    page,
    backend,
  }) => {
    await page.addInitScript(() => {
      const w = window as unknown as {
        Capacitor: unknown;
        __voice: boolean[];
        __say: (c: string) => void;
      };
      w.__voice = [];
      let listener: ((e: { command: string }) => void) | null = null;
      w.__say = (c) => listener?.({ command: c });
      w.Capacitor = {
        Plugins: {
          Kiosk: {
            openSettings: async () => {},
            setVoiceControl: async ({ on }: { on: boolean }) => {
              w.__voice.push(on);
              return { available: true };
            },
            setKeepAwake: async () => {},
            setNightMode: async () => {},
            // Как в настоящем киоске при server.url — подписка возвращается сразу.
            addListener: (event: string, cb: (e: { command: string }) => void) => {
              if (event === 'voice') listener = cb;
              return { remove: () => {} };
            },
          },
        },
      };
    });
    backend.baby = true;
    backend.items = [{ ...SEGMENTS[0]!, kind: 'segment', questions: [], subject: 'music' }];
    await page.goto('/');
    await expect(page.getByTestId('baby-menu')).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => (window as unknown as { __voice: boolean[] }).__voice))
      .toEqual([true]);
    await page.evaluate(() => (window as unknown as { __say: (c: string) => void }).__say('noise'));
    await expect(page.getByTestId('baby-noise')).toBeVisible();
    await page.evaluate(() => (window as unknown as { __say: (c: string) => void }).__say('songs'));
    await expect(page.getByTestId('baby-video')).toHaveAttribute('data-mode', 'songs');
    // Громкость меняет сам киоск — экран не переключается.
    await page.evaluate(() =>
      (window as unknown as { __say: (c: string) => void }).__say('louder'),
    );
    await expect(page.getByTestId('baby-video')).toBeVisible();
  });
});

test.describe('наклейки', () => {
  test('за пройденную игру — новая наклейка; она в альбоме, касание называет её', async ({
    page,
    backend,
  }) => {
    backend.items = [game(1, { kind: 'memory', imageIds: [CAT, LION] })];
    await openGame(page);
    await solveMemory(page);
    const award = page.getByTestId('sticker-award');
    await expect(award).toBeVisible({ timeout: 6000 });
    const emoji = (await award.getAttribute('data-sticker'))!;
    await shot(page, 'sticker-award');
    await expect
      .poll(async () => (await spoken(page)).map((s) => s.text).join('|'))
      .toMatch(/Новая наклейка — /);

    await expect(page.getByTestId('album-open')).toBeVisible({ timeout: 8000 });
    await page.getByTestId('album-open').click();
    await expect(page.getByTestId('album')).toContainText('1 из 60');
    const got = page.locator('[data-testid=album-cell][data-got=true]');
    await expect(got).toHaveCount(1);
    await expect(got).toContainText(emoji);
    await shot(page, 'album');
    await got.click();
    await page.getByTestId('album-close').click();
    await expect(page.getByTestId('album')).toHaveCount(0);
  });
});

test.describe('озвучка не обрывается', () => {
  test('праздник ждёт, пока договорено имя наклейки', async ({ page, backend }) => {
    backend.items = [game(1, { kind: 'drawing', stickerIds: [] })];
    await openGame(page);
    await slowSpeech(page, 4000);
    await page.getByTestId('game-done').click();
    await expect(page.getByTestId('game-finished')).toBeVisible();
    await expect
      .poll(async () => (await spoken(page)).map((s) => s.text).join('|'))
      .toMatch(/Новая наклейка — /);
    // Раньше экран уходил через 1,8 с — на полуслове.
    await page.waitForTimeout(2000);
    await expect(page.getByTestId('game-finished')).toBeVisible();
    await expect(page.getByTestId('home')).toBeVisible({ timeout: 8000 });
  });

  test('альбом: касания подряд не перезапускают имя наклейки', async ({ page, backend }) => {
    backend.items = [game(1, { kind: 'drawing', stickerIds: [] })];
    await page.addInitScript(() =>
      localStorage.setItem('kidsplus.stickers', JSON.stringify({ '🐱': 1 })),
    );
    await page.goto('/');
    await page.getByTestId('album-open').click();
    await slowSpeech(page, 4000);
    const got = page.locator('[data-testid=album-cell][data-got=true]');
    await expect(got).toHaveCount(1);
    // Как палец малыша: шесть касаний подряд, без пауз.
    for (let i = 0; i < 6; i++) await got.dispatchEvent('click');
    const named = async () => (await spoken(page)).filter((s) => s.text === 'котёнок!').length;
    await expect.poll(named).toBe(1);
    // Договорил — следующее касание снова называет.
    await expect
      .poll(() => page.evaluate(() => (window as unknown as { __ended: string[] }).__ended), {
        timeout: 8000,
      })
      .toContain('котёнок!');
    await got.dispatchEvent('click');
    await expect.poll(named).toBe(2);
  });
});

test.describe('аудиотека', () => {
  test('кнопки нет, пока нечего слушать; с треками — плеер: нажал — играет, ещё раз — пауза', async ({
    page,
    backend,
  }) => {
    await page.goto('/');
    await expect(page.getByTestId('home')).toBeVisible();
    await expect(page.getByTestId('album-open')).toBeVisible();
    await expect(page.getByTestId('audio-open')).toHaveCount(0);

    backend.audio = [
      { id: 'a1', title: 'Колыбельная', url: '/api/audio/a1/file' },
      { id: 'a2', title: 'Сказка про репку', url: '/api/audio/a2/file' },
    ];
    // Файлы — тишина: проверяем, что плеер их запрашивает и переключает плитки.
    const asked: string[] = [];
    await page.route('**/api/audio/**', (r) => {
      asked.push(new URL(r.request().url()).pathname);
      return r.fulfill({ status: 200, contentType: 'audio/mpeg', body: Buffer.alloc(0) });
    });
    await page.reload();
    await page.getByTestId('audio-open').click();
    const tiles = page.getByTestId('audio-tile');
    await expect(tiles).toHaveCount(2);
    await expect(tiles.nth(1)).toContainText('Сказка про репку');
    await shot(page, 'audio-library');
    await tiles.nth(1).click();
    await expect(tiles.nth(1)).toContainClass('on');
    await expect.poll(() => asked).toContain('/api/audio/a2/file');
    await page.getByTestId('audio-close').click();
    await expect(page.getByTestId('audio-library')).toHaveCount(0);
    await expect(page.getByTestId('home')).toBeVisible();
  });

  test('видео семьи (этап 42): плитка 🎬 открывает плеер на весь экран, ✕ — назад', async ({
    page,
    backend,
  }) => {
    backend.audio = [
      { id: 'a1', title: 'Колыбельная', url: '/api/audio/a1/file', video: false },
      { id: 'v1', title: 'Осень', url: '/api/audio/v1/file', video: true },
    ];
    const asked: string[] = [];
    await page.route('**/api/audio/**', (r) => {
      asked.push(new URL(r.request().url()).pathname);
      return r.fulfill({ status: 200, contentType: 'video/mp4', body: Buffer.alloc(0) });
    });
    await page.goto('/');
    await page.getByTestId('audio-open').click();
    const tiles = page.getByTestId('audio-tile');
    await expect(tiles.nth(1)).toContainText('🎬');
    await tiles.nth(1).click();
    await expect(page.getByTestId('kid-video')).toBeVisible();
    await expect.poll(() => asked).toContain('/api/audio/v1/file');
    await shot(page, 'kid-video');
    await page.getByTestId('kid-video-close').click();
    await expect(page.getByTestId('kid-video')).toHaveCount(0);
    await expect(page.getByTestId('audio-library')).toBeVisible();
  });
});

test.describe('урок из одних видео', () => {
  test('«Разное», где только видео, открывается плеером', async ({ page, backend }) => {
    backend.today = planDay({
      subjects: [{ subject: 'other', secondsLeft: 1200, done: false, progress: 0 }],
    });
    backend.lessons = {
      other: [{ ...SEGMENTS[0]!, kind: 'segment', subject: 'other', questions: [] } as Item],
    };
    await page.goto('/');
    await page.locator('[data-subject=other]').click();
    await expect(page.getByTestId('player')).toBeVisible();
  });
});

test.describe('картинки не растягиваются (этап 35)', () => {
  const ID = (n: number) => `9a000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  const P = [CARROT, BANANA, RABBIT, MONKEY, CAT, LION];
  const specs: object[] = [
    {
      kind: 'sorting',
      prompt: 'x',
      bins: [
        { imageId: CARROT, name: 'a' },
        { imageId: BANANA, name: 'b' },
      ],
      items: [
        { imageId: RABBIT, bin: 0 },
        { imageId: CAT, bin: 1 },
      ],
    },
    { kind: 'memory', imageIds: P.slice(0, 4) },
    { kind: 'counting', max: 5, rounds: 2, imageIds: [CARROT] },
    { kind: 'shadows', imageIds: P, perRound: 3 },
    { kind: 'moles', imageIds: [RABBIT], target: null, prompt: null, count: 5, speed: 'slow' },
    { kind: 'odd', rounds: [{ imageIds: [CARROT, BANANA, CAT], odd: 2, explain: null }] },
    { kind: 'pattern', imageIds: [CAT, LION], patterns: ['AB'], rounds: 2 },
    { kind: 'compare', mode: 'objects', ask: 'more', max: 5, rounds: 2, imageIds: [CARROT] },
    { kind: 'arithmetic', ops: ['plus'], max: 5, rounds: 2, imageIds: [BANANA] },
    { kind: 'size', imageIds: [MONKEY], count: 3 },
    { kind: 'sequence', rounds: [{ prompt: 'x', imageIds: [CARROT, BANANA, CAT] }] },
    { kind: 'word', lang: 'ru', words: [{ imageId: CAT, word: 'КОТ' }], extra: 0 },
    { kind: 'flashlight', scene: 'forest', items: [{ imageId: RABBIT, name: null }] },
    { kind: 'maze', heroId: RABBIT, goalId: CARROT, size: 4, rounds: 1 },
    { kind: 'shop', imageIds: [CARROT], max: 5, coins: [1], rounds: 2 },
    { kind: 'syllableWord', words: [{ imageId: CAT, word: 'КОШ-КА' }], extra: 0 },
    {
      kind: 'riddle',
      riddles: [
        { text: 'x', name: 'a', imageId: CARROT },
        { text: 'y', name: 'b', imageId: BANANA },
      ],
      choices: 2,
      rounds: 1,
    },
    { kind: 'sudoku', imageIds: [CAT, LION, RABBIT], size: 3, blanks: 2, rounds: 1 },
  ];
  test('картинки 3:2 нигде не растянуты: игры, плитка и экран карточек', async ({
    page,
    backend,
  }) => {
    test.setTimeout(300_000);
    const bad: string[] = [];
    const check = async (where: string) => {
      const found = await page.evaluate(() =>
        [...document.querySelectorAll('img')].flatMap((img) => {
          const r = img.getBoundingClientRect();
          if (r.width < 8 || r.height < 8 || !img.naturalWidth) return [];
          const fit = getComputedStyle(img).objectFit;
          const box = r.width / r.height;
          const nat = img.naturalWidth / img.naturalHeight;
          return fit === 'fill' && Math.abs(box / nat - 1) > 0.06
            ? [
                `${img.className || img.parentElement?.className} ${Math.round(r.width)}x${Math.round(r.height)}`,
              ]
            : [];
        }),
      );
      for (const f of found) bad.push(`${where}: ${f}`);
    };
    await gameMedia(page);
    // Картинки 3:2 — так видна любая ячейка, которая растягивает картинку под себя.
    await page.route('**/api/media/**', (r) =>
      r.fulfill({
        contentType: 'image/svg+xml',
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="150" height="100" viewBox="0 0 150 100"><rect width="150" height="100" fill="#f90"/><circle cx="75" cy="50" r="40" fill="#09f"/></svg>',
      }),
    );
    for (const [i, spec] of specs.entries()) {
      backend.items = [game(i + 1, spec)];
      await page.goto('/');
      await page.getByTestId('tile').first().click();
      await page.waitForTimeout(900);
      await check((spec as { kind: string }).kind);
    }
    backend.items = [
      {
        kind: 'deck',
        id: ID(99),
        category: 'english',
        coverUrl: `/api/media/${CAT}`,
        cards: [
          {
            id: 'c1',
            imageUrl: `/api/media/${CAT}`,
            word: { text: 'cat', lang: 'en', audioUrl: null },
            translation: null,
          },
          {
            id: 'c2',
            imageUrl: `/api/media/${LION}`,
            word: { text: 'lion', lang: 'en', audioUrl: null },
            translation: null,
          },
        ],
      },
    ];
    await page.goto('/');
    await check('home-deck');
    await page.getByTestId('tile').first().click();
    await page.waitForTimeout(900);
    await check('deck');
    expect(bad).toEqual([]);
  });
});

// ─── Этап 50: вопросы после видео обязательны, перерыв для глаз ──────────────

test.describe('вопросы после видео обязательны (этап 50)', () => {
  test('после видео «Домой» нет; ушёл после половины — сначала вопросы, и после перезапуска', async ({
    page,
    backend,
  }) => {
    withQuiz(backend, 4, 1);
    await startFirst(page);
    // Фрагмент 30–150 с: досмотрел до 100-й — больше половины.
    await page.evaluate(() => ((window as unknown as { __yt: { time: number } }).__yt.time = 100));
    await page.getByTestId('go-home').click();
    await expect(page.getByTestId('quiz')).toBeVisible();
    await expect(page.getByTestId('go-home')).toHaveCount(0);
    await answering(page);
    expect((await spoken(page)).map((s) => s.text)).toContain(
      'Сначала ответим на вопросы про мультик!',
    );

    // Закрыли приложение посреди вопросов — при открытии снова они, «Домой» нет.
    await page.reload();
    await expect(page.getByTestId('quiz')).toBeVisible();
    await expect(page.getByTestId('go-home')).toHaveCount(0);
    await answering(page);
    await correct(page).dispatchEvent('pointerdown');
    await expect(page.getByTestId('quiz-done')).toBeVisible();
    // Ответил — в меню, а не к следующему видео.
    await expect(page.getByTestId('tile').first()).toBeVisible({ timeout: 6000 });
    await page.reload();
    await expect(page.getByTestId('tile').first()).toBeVisible();
    await expect(page.getByTestId('quiz')).toHaveCount(0);
  });

  test('ушёл в начале видео — домой без вопросов', async ({ page, backend }) => {
    withQuiz(backend, 4, 1);
    await startFirst(page);
    await page.evaluate(() => ((window as unknown as { __yt: { time: number } }).__yt.time = 50));
    await page.getByTestId('go-home').click();
    await expect(page.getByTestId('tile').first()).toBeVisible();
    await expect(page.getByTestId('quiz')).toHaveCount(0);
  });
});

test.describe('перерыв для глаз (этап 50)', () => {
  const eyeToday = (backend: Backend) => {
    const eyeBreak: EyeBreak = { every: 15, rest: 15, current: null };
    backend.today = { ...OFF_TODAY, eyeBreak };
    return eyeBreak;
  };
  const said = async (page: Page) => (await spoken(page)).map((s) => s.text);
  /** Сколько секунд у экрана уже набралось (минуты отсчёта прогонять долго; сам счёт — в юнит-тестах). */
  const seedScreen = (page: Page, used: number) =>
    page.addInitScript((u) => {
      if (!localStorage.getItem('kp-eye-break'))
        localStorage.setItem(
          'kp-eye-break',
          JSON.stringify({ used: u, at: Date.now(), brk: null, ended: null }),
        );
    }, used);

  test('15 минут у экрана — совёнок объявляет отдых; попросил ещё — родитель разрешил', async ({
    page,
    backend,
  }) => {
    await page.clock.install({ time: new Date('2026-10-18T10:00:00') });
    const eb = eyeToday(backend);
    await seedScreen(page, 880);
    await page.goto('/');
    await expect(page.getByTestId('tile').first()).toBeVisible();
    await page.clock.runFor(10_000);
    await expect(page.getByTestId('eye-break')).toHaveCount(0);
    await page.clock.runFor(15_000);
    await expect(page.getByTestId('eye-break')).toBeVisible();
    expect(backend.eyeBreaks).toEqual(['start']);
    await expect
      .poll(() => said(page))
      .toContain('Очень хочется ещё? Нажми на кнопку — я спрошу у мамы и папы.');

    await page.getByTestId('eye-break-ask').click();
    await expect(page.getByTestId('eye-break-asked')).toHaveAttribute('data-ask', 'asked');
    expect(backend.eyeBreaks).toEqual(['start', 'ask']);
    await expect.poll(() => said(page)).toContain('Я спросил у мамы и папы. Подождём, что скажут!');

    // Родитель разрешил в «Пульте» — телефон узнаёт и без живого канала.
    eb.current = { ...eb.current!, secondsLeft: 0, ask: 'yes' };
    await page.clock.runFor(21_000);
    await expect(page.getByTestId('eye-break')).toHaveCount(0);
    await expect(page.getByTestId('tile').first()).toBeVisible();
    await expect.poll(() => said(page)).toContain('Разрешили! Можно ещё немножко.');
    // Разрешили — снова 15 минут, перерыв не возвращается сразу.
    await page.clock.runFor(60_000);
    await expect(page.getByTestId('eye-break')).toHaveCount(0);
  });

  test('в мультике — отдых после него, не посреди; отказ родителя; время вышло — играть дальше', async ({
    page,
    backend,
  }) => {
    await page.clock.install({ time: new Date('2026-10-18T10:00:00') });
    const eb = eyeToday(backend);
    await seedScreen(page, 880);
    await startFirst(page);
    await page.clock.runFor(60_000);
    // Посреди мультика не прерываем.
    await expect(page.getByTestId('pause')).toBeVisible();
    await expect(page.getByTestId('eye-break')).toHaveCount(0);
    await page.evaluate(() =>
      (window as unknown as { __yt: { set(s: number): void } }).__yt.set(0),
    );
    await page.clock.runFor(5_000);
    await expect(page.getByTestId('eye-break')).toBeVisible();
    // Следующее видео не началось.
    await expect(page.locator('iframe')).toHaveCount(0);

    await page.getByTestId('eye-break-ask').click();
    await expect(page.getByTestId('eye-break-asked')).toHaveAttribute('data-ask', 'asked');
    eb.current = { ...eb.current!, ask: 'no' };
    await page.clock.runFor(21_000);
    await expect(page.getByTestId('eye-break-asked')).toHaveAttribute('data-ask', 'no');
    await expect.poll(() => said(page)).toContain('Сказали: пусть глазки отдохнут. Отдыхаем!');

    // Перезапуск посреди отдыха — перерыв на месте.
    await page.reload();
    await expect(page.getByTestId('eye-break')).toBeVisible();
    await expect(page.getByTestId('eye-break-ask')).toHaveCount(0);

    eb.current = { ...eb.current!, secondsLeft: 0 };
    await page.clock.runFor(21_000);
    await expect(page.getByTestId('eye-break')).toHaveCount(0);
    await expect.poll(() => said(page)).toContain('Глазки отдохнули! Можно играть дальше.');
    expect(backend.eyeBreaks).toEqual(['start', 'ask']);
  });

  test('выключен — перерыва нет, сколько ни смотри', async ({ page, backend }) => {
    await page.clock.install({ time: new Date('2026-10-18T10:00:00') });
    backend.today = { ...OFF_TODAY, eyeBreak: null };
    await seedScreen(page, 5000);
    await page.goto('/');
    await expect(page.getByTestId('tile').first()).toBeVisible();
    await page.clock.runFor(30_000);
    await expect(page.getByTestId('eye-break')).toHaveCount(0);
    expect(backend.eyeBreaks).toBeUndefined();
  });
});

test.describe('сбои — родителю (этап 51)', () => {
  test('необработанная ошибка уходит на сервер с экраном; без связи — позже', async ({
    page,
    backend,
  }) => {
    await page.goto('/');
    await expect(page.getByTestId('tile').first()).toBeVisible();
    await page.evaluate(() =>
      setTimeout(() => {
        throw new TypeError('Проверка сбоя');
      }),
    );
    await expect.poll(() => backend.appErrors?.length, { timeout: 10_000 }).toBe(1);
    expect(backend.appErrors![0]).toMatchObject({
      kind: 'error',
      message: 'TypeError: Проверка сбоя',
      screen: 'home',
      count: 1,
    });

    // Отказ промиса без связи — копится и уходит, когда связь вернулась.
    await page.context().setOffline(true);
    await page.evaluate(() => void Promise.reject(new Error('Без связи')));
    await page.waitForTimeout(4000);
    expect(backend.appErrors).toHaveLength(1);
    await page.context().setOffline(false);
    await expect.poll(() => backend.appErrors?.length, { timeout: 10_000 }).toBe(2);
    expect(backend.appErrors![1]).toMatchObject({ kind: 'rejection', message: 'Error: Без связи' });
  });
});

test.describe('плеер RuTube (этап 54)', () => {
  const RT1 = 'c9be5e8850ddc8583c71a986284ac6ef';
  const RT2 = '0123456789abcdef0123456789abcdef';
  const rutube = (id: string, n: number) => ({
    id: `${n}${n}${n}${n}${n}${n}${n}${n}-${n}${n}${n}${n}-4${n}${n}${n}-8${n}${n}${n}-${String(n).repeat(12)}`,
    kind: 'segment',
    provider: 'rutube',
    externalId: id,
    startSec: 10,
    endSec: 90,
    thumbnailUrl: `https://pic.rtbcdn.ru/video/${id}.jpg`,
    questions: [],
  });
  const frame = (page: Page) => page.frameLocator('iframe[src^="https://rutube.ru/"]');
  /** Вызов в поддельном плеере RuTube (он с origin rutube.ru, как настоящий). */
  const rt = async <T>(page: Page, fn: string): Promise<T> => {
    const f = page.frames().find((x) => x.url().startsWith('https://rutube.ru/play/embed/'));
    if (!f) throw new Error('нет плеера RuTube');
    return (await f.evaluate(`(() => window.__rt.${fn})()`)) as T;
  };
  const playerSrc = (page: Page) =>
    page.locator('iframe[src^="https://rutube.ru/"]').getAttribute('src');

  test.beforeEach(({ backend }) => {
    backend.items = [rutube(RT1, 3), rutube(RT2, 4)];
  });

  test('видео играет в плеере rutube.ru: свой старт и конец, касания не доходят, пауза закрыта', async ({
    page,
    backend,
  }) => {
    await startFirst(page);
    expect(await playerSrc(page)).toBe(`https://rutube.ru/play/embed/${RT1}/?t=10&stopTime=90`);
    await expect(frame(page).locator('body')).toBeAttached();
    expect(await rt<string[]>(page, 'calls')).toContain('player:play');
    expect(backend.events.map((e) => e.type)).toEqual(['segment_start']);

    // Поверх iframe — наш слой: касание в центр до RuTube не доходит и паузу не ставит.
    const box = (await page.locator('iframe').boundingBox())!;
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    expect(await rt<number>(page, 'hits')).toBe(0);
    expect(await rt<string>(page, 'state')).toBe('playing');

    await page.getByTestId('pause').click();
    await expect(page.getByTestId('play')).toBeVisible();
    expect(await rt<string>(page, 'state')).toBe('pause');
    await page.getByTestId('play').click();
    await expect(page.getByTestId('pause')).toBeVisible();
  });

  test('конец фрагмента по времени: плеер уничтожается до рекомендаций, дальше — следующее', async ({
    page,
    backend,
  }) => {
    await startFirst(page);
    await rt(page, 'at(89.8)');
    await expect(page.locator('iframe')).toHaveCount(0, { timeout: 600 });
    await expect(page.getByTestId('celebrate')).toBeVisible();
    expect(backend.events.map((e) => e.type)).toEqual(['segment_start', 'segment_complete']);
    await expect.poll(() => playerSrc(page), { timeout: 4000 }).toContain(RT2);
  });

  test('время между сообщениями плеера досчитывается — конец не проскакивает', async ({ page }) => {
    await startFirst(page);
    // Последнее сообщение — за секунду до конца; дальше RuTube молчит, а видео идёт.
    await rt(page, 'at(89)');
    await expect(page.locator('iframe')).toHaveCount(0, { timeout: 2000 });
    await expect(page.getByTestId('celebrate')).toBeVisible();
  });

  test('«видео закончилось» от RuTube тоже сразу убирает плеер', async ({ page }) => {
    await startFirst(page);
    await rt(page, 'complete()');
    await expect(page.locator('iframe')).toHaveCount(0);
  });

  test('iPhone: кнопка не запустила RuTube — открывается центр плеера, касание запускает', async ({
    page,
  }) => {
    await page.route('https://rutube.ru/play/embed/**', (r) =>
      r.fulfill({
        contentType: 'text/html',
        body: FAKE_RUTUBE.replace('const needsFrameTap = false;', 'const needsFrameTap = true;'),
      }),
    );
    await page.goto('/');
    await page.getByTestId('tile').first().click();
    await page.getByTestId('play').click({ timeout: 4000 });
    await expect(page.getByTestId('tap-video')).toBeVisible({ timeout: 4000 });
    const box = (await page.getByTestId('player').boundingBox())!;
    await page.mouse.click(box.x + box.width / 2, box.y + 30);
    expect(await rt<number>(page, 'hits')).toBe(0);
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await expect(page.getByTestId('pause')).toBeVisible();
    await expect(page.getByTestId('tap-video')).toHaveCount(0);
  });

  test('ошибка RuTube: событие без кода YouTube и переход к следующему', async ({
    page,
    backend,
  }) => {
    await startFirst(page);
    await rt(page, "fail('Видео недоступно в вашей стране')");
    await expect
      .poll(() => backend.events.find((e) => e.type === 'segment_error')?.payload?.code)
      .toBe('rutube');
    await expect.poll(() => playerSrc(page), { timeout: 4000 }).toContain(RT2);
  });
});

test.describe('повтор пройденного (этап 55)', () => {
  const stars = (page: Page) => page.locator('.quiz-progress .star.on');

  test('видео: пять заданий, ошибка гаснет — и видео открыто до конца дня', async ({
    page,
    backend,
  }) => {
    backend.gender = 'f';
    backend.quiz = { options: 2, questions: 1 };
    backend.items = [
      {
        ...SEGMENTS[0]!,
        kind: 'segment',
        questions: [question('q1', 2), question('q2', 2)],
        rest: 'today',
      },
      { ...SEGMENTS[1]!, kind: 'segment', questions: [] },
    ];
    await page.goto('/');
    const rested = page.locator('[data-testid=tile][data-rest]');
    await expect(rested).toHaveCount(1);
    await rested.click();
    await expect(page.getByTestId('review')).toHaveAttribute('data-review', 'quiz');
    await expect
      .poll(async () => (await spoken(page)).map((s) => s.text))
      .toContain('Ты это уже прошла! Если интересно ещё раз — выполни пять заданий.');
    await expect(page.locator('.quiz-progress .star')).toHaveCount(5);
    await shot(page, 'review-quiz');
    for (let i = 0; i < 5; i++) {
      await answering(page);
      if (i === 0) {
        // Ошибся — вариант гаснет, можно снова.
        await wrong(page).dispatchEvent('pointerdown');
        await expect(page.locator('.quiz-option.faded')).toHaveCount(1);
        await answering(page);
      }
      await correct(page).dispatchEvent('pointerdown');
      await expect(stars(page)).toHaveCount(i + 1, { timeout: 6000 });
    }
    await expect(page.getByTestId('quiz-done')).toBeVisible();
    await expect
      .poll(async () => (await spoken(page)).map((s) => s.text))
      .toContain('Все пять заданий! Открываю ещё раз.');
    // Открыто — то же видео с начала.
    await expect(page.getByTestId('pause')).toBeVisible({ timeout: 8000 });
    expect(await yt<string>(page, 'opts.videoId')).toBe('aaaaaaaaaaa');
    const pass = backend.events.find((e) => e.type === 'review_pass')!;
    expect(pass).toMatchObject({ segmentId: SEGMENTS[0]!.id, payload: { tasks: 5, mistakes: 1 } });
    // Проверка — не ответы на вопросы видео: в аналитику не идёт.
    expect(backend.events.some((e) => e.type.startsWith('quiz_'))).toBe(false);

    // До конца дня — не бледное, открывается сразу.
    await page.getByTestId('go-home').click();
    await expect(page.getByTestId('home')).toBeVisible();
    await expect(page.locator('[data-rest]')).toHaveCount(0);
    await page.reload();
    await expect(page.getByTestId('tile')).toHaveCount(2);
    await expect(page.locator('[data-rest]')).toHaveCount(0);
  });

  test('«Домой» посреди проверки — пункт по-прежнему отдыхает', async ({ page, backend }) => {
    backend.items = [
      { ...SEGMENTS[0]!, kind: 'segment', questions: [question('q1', 2)], rest: 'learned' },
      { ...SEGMENTS[1]!, kind: 'segment', questions: [] },
    ];
    await page.goto('/');
    await page.locator('[data-testid=tile][data-rest]').click();
    await expect(page.getByTestId('review')).toBeVisible();
    await expect
      .poll(async () => (await spoken(page)).map((s) => s.text))
      .toContain('Ты это уже прошёл! Если интересно ещё раз — выполни пять заданий.');
    await page.getByTestId('go-home').click();
    await expect(page.locator('[data-testid=tile][data-rest]')).toHaveAttribute(
      'data-rest',
      'learned',
    );
    expect(backend.events.some((e) => e.type === 'review_pass')).toBe(false);
  });

  test('игра без темы — сразу, на уровень сложнее; уровень ребёнка не двигает', async ({
    page,
    backend,
  }) => {
    backend.levels = { start: 1, byKind: { maze: 2 } };
    backend.items = [
      {
        ...game(1, { kind: 'maze', heroId: RABBIT, goalId: CARROT, size: 4, rounds: 1 }),
        rest: 'today',
      },
      game(2, { kind: 'balloons', count: 5, target: null }),
    ];
    await gameMedia(page);
    await page.goto('/');
    await page.locator('[data-testid=tile][data-rest]').click();
    await expect(page.getByTestId('game')).toHaveAttribute('data-level', '3');
    await expect
      .poll(async () => (await spoken(page)).map((s) => s.text))
      .toContain('Ты уже это прошёл — давай посложнее!');
    await expect
      .poll(() => backend.events.find((e) => e.type === 'interactive_start')?.payload)
      .toMatchObject({ kind: 'maze', level: 3, review: true });
    // Игра «посложнее» не запоминается: дома плитка снова бледная.
    await page.getByTestId('go-home').click();
    await expect(page.locator('[data-testid=tile][data-rest]')).toHaveCount(1);
  });

  test('стих: «Договори» и вопросы, потом — сам стих', async ({ page, backend }) => {
    test.setTimeout(120_000);
    backend.gender = 'f';
    backend.items = [
      {
        ...game(
          1,
          {
            kind: 'poem',
            poem: 'petushok',
            repeat: true,
            blanks: true,
            questions: true,
            choices: 3,
          },
          'poems',
        ),
        rest: 'learned',
      },
      game(
        2,
        { kind: 'poem', poem: 'osen', repeat: false, blanks: true, questions: true, choices: 3 },
        'poems',
      ),
    ];
    await gameMedia(page);
    await page.goto('/');
    // Фраза совёнка длится 3 с — успеваем увидеть, что он говорит.
    await slowSpeech(page, 3000);
    await page.locator('[data-testid=tile][data-rest]').click();
    const r = page.getByTestId('review');
    await expect(r).toHaveAttribute('data-review', 'poem');
    await expect(r.getByTestId('poem-text')).toContainText('Ты это уже прошла!');
    await shot(page, 'review-intro');
    await slowSpeech(page, 50);
    await expect(r).toHaveAttribute('data-step', 'blanks', { timeout: 15_000 });
    await shot(page, 'review-poem');
    for (let i = 0; i < 5; i++) {
      await expect(r.locator('.poem-option.answer')).toHaveCount(0, { timeout: 15_000 });
      if (i === 0) {
        await r.locator('[data-testid=poem-option]:not([data-hint])').first().click();
        await expect(r.locator('.poem-option.off')).toHaveCount(1);
      }
      await r.locator('[data-testid=poem-option][data-hint]').click();
      await expect(stars(page)).toHaveCount(i + 1);
    }
    await expect(page.getByTestId('review-done')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('game-poem')).toHaveAttribute('data-step', 'listen', {
      timeout: 15_000,
    });
    const pass = backend.events.find((e) => e.type === 'review_pass')!;
    expect(pass).toMatchObject({
      interactiveId: game(1, {}).id,
      payload: { tasks: 5, mistakes: 1 },
    });
  });
});
