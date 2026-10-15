// Демо-стенд (этап 24): настоящий api на встроенной PGlite с демо-семьёй и собранные PWA кабинета
// и детского приложения на localhost. Для проверки вёрстки (iPhone/WebKit) и скриншотов лендинга.
// Внешних сервисов не трогает: YouTube — заглушка oEmbed, озвучка — голос браузера, push выключен.
//
//   pnpm --filter @kidsplus/parent build && pnpm --filter @kidsplus/kid build
//   pnpm --filter @kidsplus/api demo        # кабинет :4800, детское :4801, вход demo@example.com
import { readFileSync, existsSync, statSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { extname, join, resolve } from 'node:path';
import { createTestDb } from '@kidsplus/db/testing';
import { MemoryStorage } from '@kidsplus/providers';
import { buildApp } from '../app';

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
};
const fakeFetch = (async (input: string | URL | Request) => {
  const url = new URL(String(input instanceof Request ? input.url : input));
  const id = new URL(url.searchParams.get('url') ?? 'https://x/?v=x').searchParams.get('v') ?? 'x';
  return Response.json({ title: TITLES[id] ?? `Видео ${id}`, author_name: 'Детский канал' });
}) as typeof fetch;

async function main() {
  const { db } = await createTestDb();
  const app = await buildApp({
    db,
    storage: new MemoryStorage(),
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
  };
  await deck('Фрукты', 'en', 'english', [
    ['1f34e', 'apple', 'яблоко'],
    ['1f34c', 'banana', 'банан'],
    ['1f347', 'grapes', 'виноград'],
    ['1f353', 'strawberry', 'клубника'],
    ['1f34a', 'orange', 'апельсин'],
    ['1f349', 'watermelon', 'арбуз'],
  ]);
  await deck('Животные', 'ru', 'nature', [
    ['1f98a', 'лиса', null],
    ['1f43b', 'медведь', null],
    ['1f430', 'заяц', null],
    ['1f994', 'ёжик', null],
    ['1f989', 'сова', null],
  ]);
  await deck('Цвета', 'zh', 'chinese', [
    ['1f534', '红色', 'красный'],
    ['1f7e2', '绿色', 'зелёный'],
    ['1f535', '蓝色', 'синий'],
    ['1f7e1', '黄色', 'жёлтый'],
  ]);

  await as('POST', '/api/parent/games', {
    title: 'Лопни шарики',
    category: 'games',
    spec: { kind: 'balloons', count: 8, target: null },
    childIds: kids,
  });
  await as('POST', '/api/parent/games', {
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

  for (const [id, subject, end] of [
    ['demofox0001', 'nature', 180],
    ['democolor01', 'english', 150],
    ['demonum0001', 'math', 200],
    ['demoafrica1', 'nature', 240],
    ['demomusic01', 'music', 170],
  ] as const)
    await as('POST', '/api/parent/segments', {
      url: `https://www.youtube.com/watch?v=${id}`,
      title: TITLES[id],
      startSec: 0,
      endSec: end,
      subject,
      childIds: kids,
    });

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
  };
  const serve = (dist: string) => async (q: IncomingMessage, r: ServerResponse) => {
    const path = (q.url ?? '/').split('?')[0]!;
    if (path.startsWith('/api/')) {
      const chunks: Buffer[] = [];
      for await (const c of q) chunks.push(c as Buffer);
      const up = await fetch(`http://127.0.0.1:${API_PORT}${q.url}`, {
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
    const named: Record<string, string> = { '/start': '/start.html', '/guide': '/guide.html' };
    let file = join(dist, named[path] ?? path);
    if (!existsSync(file) || statSync(file).isDirectory()) file = join(dist, 'index.html');
    r.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' });
    r.end(readFileSync(file));
  };
  const web = (dist: string, port: number) =>
    createServer((q, r) => {
      serve(dist)(q, r).catch((e: Error) => {
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
