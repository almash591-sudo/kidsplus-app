import { readFileSync } from 'node:fs';
import { expect, test as base, type Page } from '@playwright/test';
import type { KidBedtime } from '@kidsplus/shared/bedtime';
import type { KidHabit, KidHabits } from '@kidsplus/shared/habits';
import {
  callStatus,
  type CallEvent,
  type CallInfo,
  type MemberState,
  type Peer,
} from '@kidsplus/shared/calls';

const FAKE_YT = readFileSync(new URL('./fake-youtube.js', import.meta.url), 'utf8');
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
  /** Уровни сложности игр (этап 34). */
  levels?: { start: number; byKind: Record<string, number> };
  /** Аудиотека: треки «детям». */
  audio?: { id: string; title: string; url: string }[];
  /** «Мои дела» (этап 30). */
  habits?: KidHabits;
  habitsDone?: string[];
  /** Ночной экран (этап 31). */
  bedtime?: KidBedtime;
  storiesPlayed?: string[];
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
 * произнесено, и «договаривает» фразу через 50 мс.
 */
const FAKE_SPEECH = `
  window.__spoken = [];
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
      setTimeout(() => u.onend && u.onend(), 50);
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

/** Подменённый сервер: /api/kid/*, YouTube IFrame API и картинки. */
async function mockBackend(page: Page, backend: Backend) {
  await page.route('https://www.youtube.com/iframe_api', (r) =>
    r.fulfill({ contentType: 'text/javascript', body: FAKE_YT }),
  );
  await page.route('https://i.ytimg.com/**', (r) =>
    r.fulfill({ contentType: 'image/png', body: PIXEL }),
  );
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
          },
        });
      case '/api/kid/bedtime/played':
        (backend.storiesPlayed ??= []).push(
          (route.request().postDataJSON() as { storyId: string }).storyId,
        );
        return route.fulfill({ status: 204 });
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

    await page.clock.runFor(152_000);
    // «Спокойной ночи» после колыбельной — фраза тоже идёт по часам страницы.
    await page.clock.runFor(5_000);
    await expect(screen).toHaveAttribute('data-stage', 'asleep');
    expect(backend.storiesPlayed).toEqual(['s1']);
    await expect(screen).toHaveClass(/dark/);
    await screen.dispatchEvent('pointerdown');
    await expect(screen).not.toHaveClass(/dark/);
    await expect(page.locator('.night-hush')).toBeVisible();
    await page.clock.runFor(10_000);
    await expect(screen).toHaveClass(/dark/);
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

  test('пройденное отдыхает (этап 34): в конце, бледное, не открывается, пока есть новое', async ({
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

const center = async (locator: ReturnType<Page['locator']>) => {
  const b = (await locator.boundingBox())!;
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
};

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
    // Этап 34: ошибки уходят на сервер — по ним растёт уровень.
    expect(backend.events.find((e) => e.type === 'interactive_complete')?.payload).toMatchObject({
      kind: 'counting',
      mistakes: 2,
      level: 1,
    });
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
});

// ─── Расписание дня (этап 4) ─────────────────────────────────────────────────

const planDay = (o: Record<string, unknown> = {}) => ({
  mode: 'plan',
  closed: null,
  paused: false,
  subjects: [
    { subject: 'math', secondsLeft: 1200, done: false },
    { subject: 'nature', secondsLeft: 1200, done: false },
    { subject: 'english', secondsLeft: 0, done: true },
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
      subjects: [{ subject: 'math', secondsLeft: 0, done: true }],
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

  test('все девять разделов (с музыкой и играми) помещаются на экран без прокрутки', async ({
    page,
    backend,
  }) => {
    backend.items = [
      ...seven(),
      game(1, { kind: 'loudness', rounds: 2 }, 'music'),
      game(2, { kind: 'balloons', count: 5, target: null }),
    ];
    await gameMedia(page);
    await page.goto('/');
    await expect(page.getByTestId('category')).toHaveCount(9);
    await shot(page, 'nine-categories');
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
    backend.items = [game(1, { kind: 'memory', imageIds: [CAT] })];
    await gameMedia(page);
    await page.goto('/');
    await page.route('**/api/kid/events', (r) => r.abort('internetdisconnected'));
    await page.getByTestId('tile').first().click();
    const cards = page.getByTestId('memory-card');
    await cards.nth(0).click();
    await cards.nth(1).click();
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
    backend.items = [game(1, { kind: 'memory', imageIds: [CAT] })];
    await openGame(page);
    const cards = page.getByTestId('memory-card');
    await cards.nth(0).click();
    await cards.nth(1).click();
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
});

test.describe('урок из одних видео', () => {
  test('«Разное», где только видео, открывается плеером', async ({ page, backend }) => {
    backend.today = planDay({ subjects: [{ subject: 'other', secondsLeft: 1200, done: false }] });
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
