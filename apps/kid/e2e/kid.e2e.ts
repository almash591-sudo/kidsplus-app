import { readFileSync } from 'node:fs';
import { expect, test as base, type Page } from '@playwright/test';
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

const speech = (text: string) => ({ text, lang: 'ru', audioUrl: null });
const PHRASES = {
  correct: [speech('Молодец!')],
  retry: [speech('Попробуй ещё.')],
  done: [speech('Отлично!')],
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
const spoken = (page: Page) =>
  page.evaluate(() => (window as unknown as { __spoken: Spoken[] }).__spoken);

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
    if (url.pathname.startsWith('/api/kid/lesson/')) {
      const subject = url.pathname.split('/').pop()!;
      return route.fulfill({ json: { items: backend.lessons?.[subject] ?? [] } });
    }
    return route.fulfill({ status: 404 });
  });
}

const test = base.extend<{ backend: Backend }>({
  backend: async ({ page }, use) => {
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
    await correct(page).dispatchEvent('pointerdown');

    await expect
      .poll(() => backend.events.find((e) => e.type === 'quiz_answer')?.payload)
      .toMatchObject({
        firstTry: false,
        attempts: 2,
      });
  });

  test('три быстрых неверных касания — пауза и повтор вопроса', async ({ page, backend }) => {
    withQuiz(backend, 4, 1);
    await page.goto('/');
    await page.getByTestId('tile').first().click();
    await finishVideo(page);
    await answering(page);

    const w = await wrong(page).all();
    for (const o of w) await o.dispatchEvent('pointerdown');
    await expect(page.getByTestId('quiz-round')).toHaveAttribute('data-phase', 'paused');
    // После паузы вопрос звучит снова и ответы снова принимаются.
    await expect(page.getByTestId('quiz-round')).toHaveAttribute('data-phase', 'answering', {
      timeout: 6000,
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
      'src',
      '/api/media/c1',
    );
    await page.getByTestId('deck-next').click();
    await expect(page.getByTestId('deck-card').locator('img')).toHaveAttribute(
      'src',
      '/api/media/c2',
    );
    await page.getByTestId('deck-next').click();

    await expect(page.getByTestId('deck-card').locator('img')).toHaveAttribute(
      'src',
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
    'src',
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
      const src = await correct(page).locator('img').getAttribute('src');
      expect(['k0', 'k1', 'k2', 'k3', 'k4'].map((k) => `/api/media/${k}`)).toContain(src);
      await correct(page).dispatchEvent('pointerdown');
      await expect(page.getByTestId('quiz-round')).toHaveAttribute('data-phase', /correct|asking/);
    }
    // Шестая карточка, затем — следующий пункт списка (хвост из 1 карточки — без проверки).
    await expect(page.getByTestId('deck-card').locator('img')).toHaveAttribute(
      'src',
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
    const carrot = items.filter({ has: page.locator(`img[src$="${CARROT}"]`) }).first();
    await dragTo(page, await center(carrot), await center(bins.nth(1)));
    await expect(items).toHaveCount(3);
    await page.waitForTimeout(400); // предмет возвращается на место с анимацией
    while ((await items.count()) > 0) {
      const it = items.first();
      const src = (await it.locator('img').getAttribute('src'))!;
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

  test('в конце игры — звезда и конфетти', async ({ page, backend }) => {
    backend.items = [game(1, { kind: 'drawing', stickerIds: [] })];
    await openGame(page);
    await page.getByTestId('game-done').click();
    await expect(page.getByTestId('game-finished')).toBeVisible();
    await expect(page.locator('.confetti span')).toHaveCount(36);
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
      window.__played.push(decodeURIComponent(this.src));
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
