import type { CaptureUsage, ParentCapture } from '@kidsplus/shared/captures';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
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
let sister: string;
let device: Record<string, string>;

const jpeg = (size = 1000) => {
  const b = Buffer.alloc(size, 7);
  b.set([0xff, 0xd8, 0xff, 0xe0]);
  return b;
};
const webm = (size = 1000) => {
  const b = Buffer.alloc(size, 1);
  b.set([0x1a, 0x45, 0xdf, 0xa3]);
  return b;
};

async function start(quota?: number) {
  t = await makeApp({
    setupToken: SETUP_TOKEN,
    rateLimit: false,
    ...(quota ? { capturesQuotaBytes: quota } : {}),
  });
  t.clock.now = new Date('2026-10-14T10:00:00Z');
  parent = await setupParent(t);
  child = await createChild(t, parent, girl({ gender: 'f', nickname: 'Зайка' }));
  sister = await createChild(t, parent, girl({ gender: 'f', nickname: 'Солнышко' }));
  device = await pairDevice(t, parent, child);
}
afterEach(() => t.close());

const upload = (body: Buffer, query: string, cookies = device) =>
  t.app.inject({
    method: 'POST',
    url: `/api/kid/captures?${query}`,
    cookies,
    headers: { 'content-type': 'application/octet-stream' },
    payload: body,
  });
const list = async (q = '') =>
  (await t.app.inject({ url: `/api/parent/captures${q}`, cookies: parent })).json<
    ParentCapture[]
  >();

describe('снимки ребёнка', () => {
  beforeEach(() => start());

  it('фото и видео: загрузка, список и файл — только родителю', async () => {
    const photo = await upload(jpeg(), 'kind=photo&mime=image/jpeg');
    expect(photo.statusCode).toBe(201);
    expect(photo.json().today.photo).toEqual({ used: 1, limit: 30 });
    const video = await upload(webm(), 'kind=video&mime=video/webm&durationMs=30000');
    expect(video.statusCode).toBe(201);

    const all = await list();
    expect(all.map((c) => c.kind).sort()).toEqual(['photo', 'video']);
    expect(all.find((c) => c.kind === 'video')).toMatchObject({
      childId: child,
      mimeType: 'video/webm',
      durationMs: 30000,
    });
    expect(await list(`?childId=${sister}`)).toEqual([]);

    const file = await t.app.inject({
      url: `/api/parent/captures/${all[0]!.id}/file`,
      cookies: parent,
    });
    expect(file.statusCode).toBe(200);
    expect(file.headers['x-content-type-options']).toBe('nosniff');

    // Телефон чужие снимки не смотрит: список и файлы — только родителю.
    expect((await t.app.inject({ url: '/api/parent/captures', cookies: device })).statusCode).toBe(
      401,
    );
    expect(
      (await t.app.inject({ url: `/api/parent/captures/${all[0]!.id}/file`, cookies: device }))
        .statusCode,
    ).toBe(401);
  });

  it('тип — по содержимому; размер; без устройства — 401', async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>');
    expect((await upload(svg, 'kind=photo&mime=image/jpeg')).statusCode).toBe(415);
    // Видео под видом фото.
    expect((await upload(webm(), 'kind=photo&mime=image/jpeg')).statusCode).toBe(415);
    expect(
      (await upload(jpeg(3 * 1024 * 1024 + 10), 'kind=photo&mime=image/jpeg')).statusCode,
    ).toBe(413);
    expect((await upload(jpeg(), 'kind=photo&mime=image/jpeg', {})).statusCode).toBe(401);
  });

  it('лимит в день: 10 видео, потом 429; на следующий день — снова', async () => {
    for (let i = 0; i < 10; i++)
      expect((await upload(webm(), 'kind=video&mime=video/webm&durationMs=1000')).statusCode).toBe(
        201,
      );
    const over = await upload(webm(), 'kind=video&mime=video/webm&durationMs=1000');
    expect(over.statusCode).toBe(429);
    // Фото — свой лимит.
    expect((await upload(jpeg(), 'kind=photo&mime=image/jpeg')).statusCode).toBe(201);
    t.advance(24 * 3600 * 1000);
    expect((await upload(webm(), 'kind=video&mime=video/webm&durationMs=1000')).statusCode).toBe(
      201,
    );
  });

  it('родитель удаляет снимок — файл тоже удаляется', async () => {
    await upload(jpeg(), 'kind=photo&mime=image/jpeg');
    const [c] = await list();
    const del = await t.app.inject({
      method: 'DELETE',
      url: `/api/parent/captures/${c!.id}`,
      cookies: parent,
    });
    expect(del.statusCode).toBe(204);
    expect(await list()).toEqual([]);
    expect(
      (await t.app.inject({ url: `/api/parent/captures/${c!.id}/file`, cookies: parent }))
        .statusCode,
    ).toBe(404);
  });
});

describe('квота на сервере', () => {
  beforeEach(() => start(3000));

  it('сверх квоты удаляются самые старые', async () => {
    for (let i = 0; i < 3; i++) {
      await upload(jpeg(1200), `kind=photo&mime=image/jpeg&takenAt=2026-10-14T0${i}:00:00Z`);
    }
    const left = await list();
    expect(left).toHaveLength(2);
    expect(left.map((c) => c.takenAt)).toEqual([
      '2026-10-14T02:00:00.000Z',
      '2026-10-14T01:00:00.000Z',
    ]);
    const usage = (
      await t.app.inject({ url: '/api/parent/captures/usage', cookies: parent })
    ).json<CaptureUsage>();
    expect(usage).toEqual({ bytes: 2400, quotaBytes: 3000 });
  });
});
