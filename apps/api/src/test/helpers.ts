import type { Db } from '@kidsplus/db';
import { createTestDb } from '@kidsplus/db/testing';
import { MemoryStorage } from '@kidsplus/providers';
import type { ChildInput } from '@kidsplus/shared/api';
import type { LightMyRequestResponse } from 'fastify';
import { vi } from 'vitest';
import { buildApp } from '../app';
import type { Ctx, YouTubeClient } from '../context';

export const SETUP_TOKEN = 'test-setup-token-0123456789abcdef';
export const KID_APP_URL = 'https://kid.example.test';

/** Настройки озвучки в тестах: от них зависит ключ кэша. */
export const TEST_TTS = { providerId: 'fake', speed: 0.85, voices: {} };

/** Видео, для которых oEmbed отвечает «встраивание запрещено» / «не найдено». */
export const BLOCKED_ID = 'blocked0000';
export const MISSING_ID = 'missing0000';

export function oembedFetch() {
  return vi.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input instanceof Request ? input.url : input));
    const videoId = new URL(url.searchParams.get('url')!).searchParams.get('v');
    if (videoId === BLOCKED_ID) return new Response('Unauthorized', { status: 401 });
    if (videoId === MISSING_ID) return new Response('Not Found', { status: 404 });
    return Response.json({
      title: `Видео ${videoId}`,
      author_name: 'Канал',
      thumbnail_url: 'https://evil.example/x.jpg',
    });
  });
}

export async function makeApp(
  options: {
    setupToken?: string | undefined;
    tts?: typeof TEST_TTS;
    youtube?: YouTubeClient | null;
    rateLimit?: boolean;
    push?: Ctx['push'];
    capturesQuotaBytes?: number;
  } = { setupToken: SETUP_TOKEN },
) {
  const { db, close } = await createTestDb();
  const clock = { now: new Date('2026-10-07T10:00:00Z') };
  const fetch = oembedFetch();
  const storage = new MemoryStorage();
  const app = await buildApp({
    db,
    storage,
    config: {
      setupToken: options.setupToken,
      kidAppUrl: KID_APP_URL,
      trustProxyHops: 0,
      tts: options.tts ?? TEST_TTS,
      moderation: { maxVideoSec: 30 * 60, dailyTokenLimit: 1_000_000, totalTokenLimit: 10_000_000 },
      captures: { quotaBytes: options.capturesQuotaBytes ?? 200 * 1024 * 1024 },
    },
    youtube: options.youtube ?? null,
    rateLimit: options.rateLimit ?? true,
    push: options.push ?? null,
    pingDb: async () => {},
    fetch,
    now: () => clock.now,
  });
  return {
    app,
    db: db as Db,
    storage,
    fetch,
    clock,
    /** Сдвигает «текущее время» вперёд. */
    advance(ms: number) {
      clock.now = new Date(clock.now.getTime() + ms);
    },
    async close() {
      await app.close();
      await close();
    },
  };
}

export type TestApp = Awaited<ReturnType<typeof makeApp>>;

export function cookieFrom(res: LightMyRequestResponse, name: string): string {
  const c = res.cookies.find((x) => x.name === name);
  if (!c) throw new Error(`нет cookie ${name}: ${res.statusCode} ${res.body}`);
  return c.value;
}

/** Создаёт первый родительский аккаунт и возвращает cookie сессии. */
export async function setupParent(
  t: TestApp,
  email = 'mama@example.com',
  password = 'correct horse battery',
) {
  const res = await t.app.inject({
    method: 'POST',
    url: '/api/parent/setup',
    payload: { token: SETUP_TOKEN, email, password },
  });
  return { kp_session: cookieFrom(res, 'kp_session') };
}

export const girl = (overrides: Partial<ChildInput> = {}): ChildInput => ({
  nickname: 'Солнышко',
  birthYear: 2021,
  birthMonth: 5,
  gender: 'f',
  languages: ['ru', 'en'],
  ...overrides,
});

export async function createChild(t: TestApp, cookies: Record<string, string>, input = girl()) {
  const res = await t.app.inject({
    method: 'POST',
    url: '/api/parent/children',
    cookies,
    payload: input,
  });
  return res.json<{ id: string }>().id;
}

/** Привязывает новое устройство к ребёнку и возвращает cookie устройства. */
export async function pairDevice(t: TestApp, cookies: Record<string, string>, childId: string) {
  const created = await t.app.inject({
    method: 'POST',
    url: '/api/parent/pairings',
    cookies,
    payload: { childId, deviceName: 'S20+' },
  });
  const { code } = created.json<{ code: string }>();
  const res = await t.app.inject({ method: 'POST', url: '/api/kid/pair', payload: { code } });
  return { kp_device: cookieFrom(res, 'kp_device') };
}

export const videoUrl = (id: string) => `https://www.youtube.com/watch?v=${id}`;

export async function createSegment(
  t: TestApp,
  cookies: Record<string, string>,
  body: { videoId: string; childIds: string[]; startSec?: number; endSec?: number },
) {
  const res = await t.app.inject({
    method: 'POST',
    url: '/api/parent/segments',
    cookies,
    payload: {
      url: videoUrl(body.videoId),
      title: `Фрагмент ${body.videoId}`,
      startSec: body.startSec ?? 0,
      endSec: body.endSec ?? 120,
      childIds: body.childIds,
    },
  });
  if (res.statusCode !== 201) throw new Error(`createSegment: ${res.statusCode} ${res.body}`);
  return res.json<{ id: string }>().id;
}

export const json = (res: LightMyRequestResponse) => res.json<Record<string, unknown>>();
