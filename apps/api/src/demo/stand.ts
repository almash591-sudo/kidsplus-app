// Демо-стенд (этап 24): настоящий api на встроенной PGlite с демо-семьёй и собранные PWA кабинета
// и детского приложения на localhost. Для проверки вёрстки (iPhone/WebKit) и скриншотов лендинга.
// Внешних сервисов не трогает: YouTube — заглушка oEmbed, озвучка — голос браузера, push выключен.
//
//   pnpm --filter @kidsplus/parent build && pnpm --filter @kidsplus/kid build
//   pnpm --filter @kidsplus/api demo        # кабинет :4800, детское :4801, вход demo@example.com
import { readFileSync, existsSync, statSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { extname, join, resolve } from 'node:path';
import { schema } from '@kidsplus/db';
import { eq } from 'drizzle-orm';
import { createTestDb } from '@kidsplus/db/testing';
import { MemoryStorage } from '@kidsplus/providers';
import { buildApp } from '../app';
import { DEMO_REVIEWS, demoReport } from './review';

const API_PORT = Number(process.env.DEMO_API_PORT ?? 3999);
const PARENT_PORT = Number(process.env.DEMO_PARENT_PORT ?? 4800);
const KID_PORT = Number(process.env.DEMO_KID_PORT ?? 4801);
export const DEMO_EMAIL = 'demo@example.com';
export const DEMO_PASSWORD = 'demo-password-123';
const SETUP = 'demo-setup-token-0123456789';
const root = resolve(import.meta.dirname, '../../../..');

/** oEmbed без сети: название из списка, иначе — «Видео …». */
const TITLES: Record<string, string> = {
  demofox0001: 'Кто живёт в лесу',
  democolor01: 'Colors song for kids',
  demonum0001: 'Считаем до пяти',
  demoafrica1: 'Животные Африки',
  demomusic01: 'Музыкальные инструменты',
  ...Object.fromEntries(Object.entries(DEMO_REVIEWS).map(([id, r]) => [id, r.title])),
};
const fakeFetch = (async (input: string | URL | Request) => {
  const url = new URL(String(input instanceof Request ? input.url : input));
  const id = new URL(url.searchParams.get('url') ?? 'https://x/?v=x').searchParams.get('v') ?? 'x';
  return Response.json({ title: TITLES[id] ?? `Видео ${id}`, author_name: 'Детский канал' });
}) as typeof fetch;

/** DEMO_NOW=2026-10-16T10:30:00+05:00 — часы стенда сдвинуты к этому моменту (и идут дальше). */
let shift = process.env.DEMO_NOW ? Date.parse(process.env.DEMO_NOW) - Date.now() : 0;
const now = () => new Date(Date.now() + shift);

async function main() {
  const { db } = await createTestDb();
  const storage = new MemoryStorage();
  const app = await buildApp({
    db,
    storage,
    config: {
      setupToken: SETUP,
      kidAppUrl: `http://localhost:${KID_PORT}`,
      trustProxyHops: 0,
      tts: { providerId: 'browser', speed: 0.9, voices: {} },
    },
    pingDb: async () => {},
    fetch: fakeFetch,
    youtube: null,
    rateLimit: false,
    now,
  });

  // ── Демо-данные ──
  const req = async <T>(method: string, url: string, payload?: unknown, cookies?: object) => {
    const res = await app.inject({
      method: method as 'GET',
      url,
      ...(payload !== undefined ? { payload: payload as object } : {}),
      ...(cookies ? { cookies: cookies as Record<string, string> } : {}),
    });
    if (res.statusCode >= 400) throw new Error(`${method} ${url}: ${res.statusCode} ${res.body}`);
    return { body: (res.body ? res.json() : null) as T, res };
  };
  const setup = await req('POST', '/api/parent/setup', {
    token: SETUP,
    email: DEMO_EMAIL,
    password: DEMO_PASSWORD,
  });
  const session = setup.res.cookies.find((c) => c.name === 'kp_session')!.value;
  const P = { kp_session: session };
  const as = <T>(method: string, url: string, payload?: unknown) => req<T>(method, url, payload, P);
  await as('PUT', '/api/parent/me/name', { displayName: 'Мама' });

  type Id = { id: string };
  const zaika = (
    await as<Id>('POST', '/api/parent/children', {
      nickname: 'Зайка',
      birthYear: 2023,
      birthMonth: 2,
      gender: 'f',
      languages: ['ru', 'en'],
    })
  ).body.id;
  const mishka = (
    await as<Id>('POST', '/api/parent/children', {
      nickname: 'Мишутка',
      birthYear: 2022,
      birthMonth: 9,
      gender: 'm',
      languages: ['ru', 'en', 'zh'],
    })
  ).body.id;
  const kids = [zaika, mishka];

  const emoji = async (code: string) =>
    (await as<Id>('POST', '/api/parent/media/emoji', { code })).body.id;

  const deck = async (
    title: string,
    lang: string,
    category: string,
    cards: [string, string, string | null][],
  ) => {
    const d = (await as<Id>('POST', '/api/parent/decks', { title, lang, category, childIds: kids }))
      .body;
    for (const [code, text, translation] of cards)
      await as('POST', `/api/parent/decks/${d.id}/cards`, {
        imageId: await emoji(code),
        text,
        translation,
      });
    return d.id;
  };
  const fruits = await deck('Фрукты', 'en', 'english', [
    ['1f34e', 'apple', 'яблоко'],
    ['1f34c', 'banana', 'банан'],
    ['1f347', 'grapes', 'виноград'],
    ['1f353', 'strawberry', 'клубника'],
    ['1f34a', 'orange', 'апельсин'],
    ['1f349', 'watermelon', 'арбуз'],
  ]);
  const animals = await deck('Животные', 'ru', 'nature', [
    ['1f98a', 'лиса', null],
    ['1f43b', 'медведь', null],
    ['1f430', 'заяц', null],
    ['1f994', 'ёжик', null],
    ['1f989', 'сова', null],
  ]);
  const colors = await deck('Цвета', 'zh', 'chinese', [
    ['1f534', '红色', 'красный'],
    ['1f7e2', '绿色', 'зелёный'],
    ['1f535', '蓝色', 'синий'],
    ['1f7e1', '黄色', 'жёлтый'],
  ]);

  const balloons = await as<Id>('POST', '/api/parent/games', {
    title: 'Лопни шарики',
    category: 'games',
    spec: { kind: 'balloons', count: 8, target: null },
    childIds: kids,
  });
  const counting = await as<Id>('POST', '/api/parent/games', {
    title: 'Посчитай ягодки',
    category: 'math',
    spec: { kind: 'counting', max: 5, rounds: 4, imageIds: [await emoji('1f353')] },
    childIds: kids,
  });
  await as('POST', '/api/parent/games', {
    title: 'Найди пару',
    category: 'games',
    spec: {
      kind: 'memory',
      imageIds: [await emoji('1f436'), await emoji('1f431'), await emoji('1f42d')],
    },
    childIds: kids,
  });

  const segments: Record<string, string> = {};
  for (const [id, subject, end] of [
    ['demofox0001', 'nature', 180],
    ['democolor01', 'english', 150],
    ['demonum0001', 'math', 200],
    ['demoafrica1', 'nature', 240],
    ['demomusic01', 'music', 170],
  ] as const)
    segments[id] = (
      await as<Id>('POST', '/api/parent/segments', {
        url: `https://www.youtube.com/watch?v=${id}`,
        title: TITLES[id],
        startSec: 0,
        endSec: end,
        subject,
        childIds: kids,
      })
    ).body.id;

  // Расписание с окнами на каждый день — «Сегодня» у ребёнка не пустое.
  const day = { from: '07:00', to: '21:00' };
  for (const id of kids)
    await as('PUT', `/api/parent/children/${id}/schedule`, {
      enabled: true,
      subjectsPerDay: 3,
      minutesPerSubject: 10,
      freeMinutes: 15,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      windows: Object.fromEntries(
        ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => [d, day]),
      ),
    }).catch((e: Error) => console.warn('расписание:', e.message));

  // План на 4 недели с темами и материалами — раздел «План» и уроки ребёнка.
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const localDate = (d: Date) => d.toLocaleDateString('sv-SE', { timeZone: tz });
  const monday = new Date(now());
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const item = (kind: string, refId: string) => ({ kind, refId });
  for (const id of kids)
    await as('POST', `/api/parent/children/${id}/curricula`, {
      title: 'Осень: мир вокруг',
      startsOn: localDate(monday),
      weeks: 4,
      subjects: ['english', 'chinese', 'math', 'nature', 'music'],
      topics: [
        {
          subject: 'english',
          week: 1,
          title: 'Фрукты и цвета',
          items: [item('deck', fruits), item('segment', segments.democolor01!)],
        },
        { subject: 'chinese', week: 1, title: 'Цвета по-китайски', items: [item('deck', colors)] },
        {
          subject: 'math',
          week: 1,
          title: 'Считаем до пяти',
          items: [item('segment', segments.demonum0001!), item('interactive', counting.body.id)],
        },
        {
          subject: 'nature',
          week: 1,
          title: 'Лесные жители',
          items: [item('deck', animals), item('segment', segments.demofox0001!)],
        },
        {
          subject: 'music',
          week: 1,
          title: 'Инструменты',
          items: [item('segment', segments.demomusic01!), item('interactive', balloons.body.id)],
        },
        {
          subject: 'nature',
          week: 2,
          title: 'Животные Африки',
          items: [item('segment', segments.demoafrica1!)],
        },
      ],
    }).catch((e: Error) => console.warn('план:', e.message));

  // История за 14 дней: время по предметам и ответы — для «Прогресса» и «Главной».
  const subjects = ['english', 'chinese', 'math', 'nature', 'music'] as const;
  const quizRefs: [string, { segmentId?: string; deckId?: string }][] = [
    ['english', { deckId: fruits }],
    ['chinese', { deckId: colors }],
    ['nature', { deckId: animals }],
    ['math', { segmentId: segments.demonum0001! }],
    ['nature', { segmentId: segments.demofox0001! }],
    ['english', { segmentId: segments.democolor01! }],
  ];
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (const [k, childId] of kids.entries()) {
    for (let back = 13; back >= 0; back--) {
      const at = new Date(now().getTime() - back * 86_400_000 - (back ? 0 : 3_600_000));
      if (back > 7 && rnd() < 0.15) continue; // выходной
      // День — без сдвига на час: сразу после полуночи «сегодня минус час» — уже вчера.
      const date = localDate(new Date(now().getTime() - back * 86_400_000));
      // Сегодня: китайский пройден, математика — наполовину. DEMO_FREE=1 (промо-съёмка): уроки
      // уже пройдены, открыто свободное время.
      if (back === 0 && process.env.DEMO_FREE) {
        await db
          .insert(schema.dayUsage)
          .values(subjects.map((activity) => ({ childId, date, activity, seconds: 600 })));
        continue;
      }
      if (back === 0) {
        await db.insert(schema.dayUsage).values([
          { childId, date, activity: 'chinese', seconds: 600 },
          { childId, date, activity: 'math', seconds: 290 + k * 120 },
        ]);
        continue;
      }
      for (const subject of subjects) {
        if (rnd() < 0.3) continue;
        await db.insert(schema.dayUsage).values({
          childId,
          date,
          activity: subject,
          seconds: Math.round((240 + rnd() * 420) * (k ? 1.1 : 1)),
        });
      }
      await db
        .insert(schema.dayUsage)
        .values({ childId, date, activity: 'free', seconds: Math.round(300 + rnd() * 600) });
      const ev = (type: string, extra: Partial<typeof schema.events.$inferInsert> = {}) => ({
        childId,
        type,
        createdAt: new Date(at.getTime() + rnd() * 3_600_000),
        ...extra,
      });
      const rows: (typeof schema.events.$inferInsert)[] = [];
      for (const [subject, ref] of quizRefs) {
        if (rnd() < 0.4) continue;
        // Китайский даётся труднее: в «Прогрессе» его карточки — в «Повторить».
        const firstTry = rnd() < (subject === 'chinese' ? 0.4 : 0.78 + (13 - back) * 0.012);
        rows.push(
          ev('quiz_answer', {
            segmentId: ref.segmentId ?? null,
            payload: {
              firstTry,
              timeMs: Math.round(1800 + rnd() * 4000),
              ...(ref.deckId ? { deckId: ref.deckId } : {}),
            },
          }),
        );
      }
      // Этап 44, «Что нравится»: шарики выбирает сам и проходит, ягодки в уроке бросает,
      // «Найди пару» не открывает.
      const fox = segments.demofox0001!;
      const game = (id: string, kind: string) => ({ interactiveId: id, kind });
      rows.push(
        ev('segment_start', { segmentId: fox, payload: { from: 'lesson' } }),
        ev('segment_complete', { segmentId: fox, payload: { from: 'lesson' } }),
        ev('deck_start', { payload: { deckId: fruits, cards: 6, from: 'lesson' } }),
        ev('deck_complete', { payload: { deckId: fruits, cards: 6, seconds: 110 } }),
        ev('quiz_complete'),
      );
      if (rnd() < 0.8)
        rows.push(
          ev('interactive_start', {
            payload: { ...game(balloons.body.id, 'balloons'), from: 'free' },
          }),
          ev('interactive_complete', {
            payload: { ...game(balloons.body.id, 'balloons'), seconds: 70 },
          }),
        );
      if (back <= 7)
        rows.push(
          ev('interactive_start', {
            payload: { ...game(counting.body.id, 'counting'), from: 'lesson' },
          }),
          back % 4 === 0
            ? ev('interactive_complete', { payload: { ...game(counting.body.id, 'counting') } })
            : ev('interactive_exit', {
                payload: {
                  ...game(counting.body.id, 'counting'),
                  seconds: Math.round(25 + rnd() * 50),
                },
              }),
        );
      await db.insert(schema.events).values(rows);
    }
  }

  // Материалы назначены «три недели назад» — иначе «Не открывает» их ещё не считает.
  for (const childId of kids)
    await db
      .update(schema.childItems)
      .set({ createdAt: new Date(now().getTime() - 21 * 86_400_000) })
      .where(eq(schema.childItems.childId, childId));

  // Промо-ролики (этап 48): DEMO_CLAY=<папка с <код эмодзи>.webp> — объёмные картинки вместо
  // эмодзи, как у детей на проде с включёнными illustrations (этап 25).
  if (process.env.DEMO_CLAY) {
    const emojis = await db
      .select()
      .from(schema.mediaAssets)
      .where(eq(schema.mediaAssets.source, 'twemoji'));
    for (const e of emojis) {
      const file = join(process.env.DEMO_CLAY, `${e.sourceRef}.webp`);
      if (!existsSync(file)) continue;
      const key = `images/clay/${e.sourceRef}.webp`;
      const data = new Uint8Array(readFileSync(file));
      await storage.put(key, data, 'image/webp');
      const [clay] = await db
        .insert(schema.mediaAssets)
        .values({
          kind: 'image',
          source: 'generated',
          sourceRef: `clay/${e.sourceRef}`,
          storageKey: key,
          mimeType: 'image/webp',
          bytes: data.byteLength,
        })
        .returning();
      await db
        .update(schema.mediaAssets)
        .set({ illustrationId: clay!.id })
        .where(eq(schema.mediaAssets.id, e.id));
    }
    await db.update(schema.children).set({ illustrations: true });
  }

  // Промо-съёмка (DEMO_CLOCK=1): видео из DEMO_REVIEWS «смотрит ИИ» несколько секунд по часам
  // стенда, потом в «Проверке» — готовый отчёт, как от worker.
  if (process.env.DEMO_CLOCK) {
    const seen = new Map<string, number>();
    const review = async () => {
      const queued = await db
        .select()
        .from(schema.moderationItems)
        .where(eq(schema.moderationItems.status, 'queued'));
      for (const item of queued) {
        const demo = DEMO_REVIEWS[item.externalId];
        if (!demo) continue;
        const first = seen.get(item.id) ?? now().getTime();
        seen.set(item.id, first);
        if (now().getTime() - first < 6000) continue;
        const report = await demoReport(demo.analysis, emoji);
        await db
          .update(schema.moderationItems)
          .set({
            status: 'ready',
            report: report as unknown as Record<string, unknown>,
            metadata: {
              ...item.metadata,
              durationSec: demo.durationSec,
              thumbnailUrl: `https://i.ytimg.com/vi/${item.externalId}/hqdefault.jpg`,
            },
            updatedAt: new Date(),
          })
          .where(eq(schema.moderationItems.id, item.id));
      }
    };
    setInterval(() => void review().catch((e: Error) => console.warn('проверка:', e.message)), 500);
  }

  await app.listen({ port: API_PORT, host: '127.0.0.1' });

  // ── Раздача PWA: статика + /api через прокси; Secure у cookie снимается (http://localhost) ──
  const types: Record<string, string> = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.woff2': 'font/woff2',
    '.json': 'application/json',
    '.webmanifest': 'application/manifest+json',
    '.webp': 'image/webp',
    '.mp3': 'audio/mpeg',
    '.jpg': 'image/jpeg',
  };
  const serve = (dist: string) => async (q: IncomingMessage, r: ServerResponse) => {
    const path = (q.url ?? '/').split('?')[0]!;
    // Промо-съёмка (этап 48): часы страницы виртуальные — DEMO_CLOCK=1 разрешает переводить
    // за ними и часы стенда (/__demo/clock?at=<мс>), чтобы время занятий засчитывалось.
    if (path === '/__demo/clock' && process.env.DEMO_CLOCK) {
      const at = Number(new URL(q.url!, 'http://x').searchParams.get('at'));
      if (Number.isFinite(at) && at > 0) shift = at - Date.now();
      r.writeHead(200, { 'content-type': 'application/json' });
      return r.end(JSON.stringify({ now: now().toISOString() }));
    }
    if (path.startsWith('/api/')) {
      const chunks: Buffer[] = [];
      for await (const c of q) chunks.push(c as Buffer);
      // Вкладка закрылась (окно «Глазами ребёнка», конец теста) — оборвать и запрос к api,
      // иначе поток событий висит до таймаута.
      const gone = new AbortController();
      r.on('close', () => gone.abort());
      const up = await fetch(`http://127.0.0.1:${API_PORT}${q.url}`, {
        signal: gone.signal,
        method: q.method,
        headers: Object.fromEntries(
          Object.entries(q.headers).filter(([k]) => k !== 'host' && k !== 'connection') as [
            string,
            string,
          ][],
        ),
        body: chunks.length ? Buffer.concat(chunks) : undefined,
        redirect: 'manual',
      });
      const headers: Record<string, string | string[]> = {};
      up.headers.forEach((v, k) => {
        if (k !== 'set-cookie' && k !== 'content-encoding' && k !== 'content-length')
          headers[k] = v;
      });
      const cookies = up.headers.getSetCookie().map((c) => c.replace(/;\s*Secure/gi, ''));
      if (cookies.length) headers['set-cookie'] = cookies;
      r.writeHead(up.status, headers);
      if (up.body) for await (const c of up.body) r.write(c);
      return r.end();
    }
    // Лендинг (как Caddy в deploy/web): /start, /guide и их файлы — из apps/landing.
    const landingDir = join(root, 'apps/landing');
    const pages: Record<string, string> = { '/start': '/index.html', '/guide': '/guide.html' };
    if (
      pages[path] ||
      /^\/(landing\.css|landing\.js|guide\.js|img\/|fonts\/|landing-voice\/)/.test(path)
    ) {
      const f = join(landingDir, pages[path] ?? path);
      if (existsSync(f)) {
        const type =
          types[extname(f)] ?? (f.endsWith('.woff2') ? 'font/woff2' : 'application/octet-stream');
        r.writeHead(200, { 'content-type': type });
        const body = readFileSync(f);
        return r.end(
          pages[path] ? body.toString('utf8').replaceAll('{{.Host}}', q.headers.host ?? '') : body,
        );
      }
    }
    const named: Record<string, string> = { '/': '/index.html' };
    let file = join(dist, named[path] ?? path);
    if (!existsSync(file) || statSync(file).isDirectory()) file = join(dist, 'index.html');
    r.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' });
    r.end(readFileSync(file));
  };
  const web = (dist: string, port: number) =>
    createServer((q, r) => {
      serve(dist)(q, r).catch((e: Error) => {
        // Ответ уже начат (оборвался поток событий) — заголовок 502 не отправить, только закрыть:
        // раньше здесь падал весь стенд (ERR_HTTP_HEADERS_SENT), а с ним — все следующие e2e.
        if (r.headersSent) return void r.destroy();
        r.writeHead(502);
        r.end(e.message);
      });
    }).listen(port, '127.0.0.1');
  web(join(root, 'apps/parent/dist'), PARENT_PORT);
  web(join(root, 'apps/kid/dist'), KID_PORT);

  // Ссылка привязки телефона Зайки — для детского приложения.
  const pair = await as<{ url: string }>('POST', '/api/parent/pairings', {
    childId: zaika,
    deviceName: 'Телефон Зайки',
  });
  console.log(
    JSON.stringify({
      parent: `http://localhost:${PARENT_PORT}`,
      landing: `http://localhost:${PARENT_PORT}/start`,
      kid: pair.body.url,
      email: DEMO_EMAIL,
      password: DEMO_PASSWORD,
      session,
      children: { zaika, mishka },
    }),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
