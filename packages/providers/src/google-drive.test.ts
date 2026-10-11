import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { GoogleDrive } from './google-drive';

let dir = '';
afterEach(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
});

/** Google в памяти: токен, поиск и создание папки, возобновляемая загрузка кусками. */
function fakeGoogle() {
  const calls: { url: string; method: string; headers: Record<string, string>; bytes?: number }[] =
    [];
  let received = 0;
  const fetch = (async (input: string | URL, init: RequestInit = {}) => {
    const url = String(input);
    const headers = Object.fromEntries(new Headers(init.headers).entries());
    const bytes = init.body instanceof Uint8Array ? init.body.byteLength : undefined;
    calls.push({
      url,
      method: init.method ?? 'GET',
      headers,
      ...(bytes !== undefined && { bytes }),
    });
    if (url.startsWith('https://oauth2.googleapis.com/token'))
      return Response.json({ access_token: 'AT', expires_in: 3600 });
    if (url.includes('/drive/v3/files?q=')) return Response.json({ files: [] });
    if (url.includes('/drive/v3/files?fields=id')) return Response.json({ id: 'folder1' });
    if (url.includes('uploadType=resumable'))
      return new Response(null, { status: 200, headers: { location: 'https://upload/session' } });
    if (url === 'https://upload/session') {
      received += bytes ?? 0;
      const total = Number(headers['content-range']!.split('/')[1]);
      return received < total
        ? new Response(null, { status: 308 })
        : Response.json({ id: 'file1', name: 'x.dump', createdTime: 'now' });
    }
    return new Response('нет такого', { status: 404 });
  }) as typeof globalThis.fetch;
  return { fetch, calls, received: () => received };
}

describe('GoogleDrive', () => {
  it('папка создаётся, файл грузится кусками по 8 МБ, ключ — по refresh-токену', async () => {
    const g = fakeGoogle();
    const drive = new GoogleDrive({
      clientId: 'c',
      clientSecret: 's',
      refreshToken: 'r',
      fetch: g.fetch,
    });
    dir = await mkdtemp(join(tmpdir(), 'drive-'));
    const path = join(dir, 'x.dump');
    await writeFile(path, Buffer.alloc(9 * 1024 * 1024));

    const folder = await drive.folder('Копии');
    expect(folder).toBe('folder1');
    const file = await drive.upload(folder, 'x.dump', path, 'application/octet-stream');
    expect(file.id).toBe('file1');
    expect(g.received()).toBe(9 * 1024 * 1024);

    const chunks = g.calls.filter((c) => c.url === 'https://upload/session');
    expect(chunks.map((c) => c.headers['content-range'])).toEqual([
      'bytes 0-8388607/9437184',
      'bytes 8388608-9437183/9437184',
    ]);
    // Токен запрошен один раз и используется во всех вызовах API.
    expect(g.calls.filter((c) => c.url.includes('oauth2')).length).toBe(1);
    expect(g.calls.find((c) => c.url.includes('/drive/v3/files?q='))!.headers.authorization).toBe(
      'Bearer AT',
    );
  });
});
