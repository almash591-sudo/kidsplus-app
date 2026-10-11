// Google Drive для резервных копий (этап 15а). Доступ — OAuth владельца с правом drive.file:
// приложение видит и меняет только файлы, которые создало само, остальной Диск ему не виден.
import { open, stat } from 'node:fs/promises';

export interface DriveConfig {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  fetch?: typeof fetch;
}

export interface DriveFile {
  id: string;
  name: string;
  createdTime: string;
  size?: string;
}

const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
const FOLDER = 'application/vnd.google-apps.folder';
/** Кусок загрузки: кратен 256 КБ, как требует Google. */
const CHUNK = 32 * 256 * 1024;

export class DriveError extends Error {}

export class GoogleDrive {
  private token: { value: string; until: number } | null = null;
  private readonly fetchFn: typeof fetch;

  constructor(private readonly config: DriveConfig) {
    this.fetchFn = config.fetch ?? globalThis.fetch;
  }

  private async accessToken(): Promise<string> {
    if (this.token && this.token.until > Date.now() + 60_000) return this.token.value;
    const res = await this.fetchFn('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        refresh_token: this.config.refreshToken,
        grant_type: 'refresh_token',
      }),
    });
    if (!res.ok) throw new DriveError(`Google OAuth ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as { access_token: string; expires_in: number };
    this.token = { value: data.access_token, until: Date.now() + data.expires_in * 1000 };
    return data.access_token;
  }

  private async call<T>(url: string, init: RequestInit = {}): Promise<T> {
    const res = await this.fetchFn(url, {
      ...init,
      headers: { authorization: `Bearer ${await this.accessToken()}`, ...init.headers },
    });
    if (!res.ok) throw new DriveError(`Google Drive ${res.status}: ${await res.text()}`);
    return (res.status === 204 ? undefined : await res.json()) as T;
  }

  /** Папка в корне Диска (создаётся при первом вызове). */
  async folder(name: string): Promise<string> {
    const q = `name = '${name.replace(/'/g, "\\'")}' and mimeType = '${FOLDER}' and trashed = false`;
    const found = await this.call<{ files: DriveFile[] }>(
      `${API}/files?${new URLSearchParams({ q, fields: 'files(id,name,createdTime)' })}`,
    );
    if (found.files[0]) return found.files[0].id;
    const created = await this.call<DriveFile>(`${API}/files?fields=id`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, mimeType: FOLDER }),
    });
    return created.id;
  }

  async list(folderId: string): Promise<DriveFile[]> {
    const q = `'${folderId}' in parents and trashed = false`;
    const res = await this.call<{ files: DriveFile[] }>(
      `${API}/files?${new URLSearchParams({ q, orderBy: 'createdTime desc', pageSize: '200', fields: 'files(id,name,createdTime,size)' })}`,
    );
    return res.files;
  }

  async remove(fileId: string): Promise<void> {
    await this.call(`${API}/files/${fileId}`, { method: 'DELETE' });
  }

  /** Загрузить файл с диска возобновляемой загрузкой — кусками, без чтения целиком в память. */
  async upload(folderId: string, name: string, path: string, mimeType: string): Promise<DriveFile> {
    const size = (await stat(path)).size;
    const start = await this.fetchFn(
      `${UPLOAD}?uploadType=resumable&fields=id,name,createdTime,size`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${await this.accessToken()}`,
          'content-type': 'application/json',
          'x-upload-content-type': mimeType,
          'x-upload-content-length': String(size),
        },
        body: JSON.stringify({ name, parents: [folderId] }),
      },
    );
    const session = start.headers.get('location');
    if (!start.ok || !session)
      throw new DriveError(`Google Drive загрузка ${start.status}: ${await start.text()}`);

    const file = await open(path, 'r');
    try {
      let offset = 0;
      for (;;) {
        const len = Math.min(CHUNK, size - offset);
        const buf = Buffer.alloc(len);
        await file.read(buf, 0, len, offset);
        const last = offset + len >= size;
        const res = await this.fetchFn(session, {
          method: 'PUT',
          headers: {
            'content-length': String(len),
            'content-range':
              size === 0 ? 'bytes */0' : `bytes ${offset}-${offset + len - 1}/${size}`,
          },
          body: buf,
        });
        if (last) {
          if (!res.ok)
            throw new DriveError(`Google Drive загрузка ${res.status}: ${await res.text()}`);
          return (await res.json()) as DriveFile;
        }
        if (res.status !== 308)
          throw new DriveError(`Google Drive загрузка ${res.status}: ${await res.text()}`);
        offset += len;
      }
    } finally {
      await file.close();
    }
  }
}
