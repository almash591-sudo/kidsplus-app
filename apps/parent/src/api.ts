import { API_PREFIX } from '@kidsplus/shared';
import type { ApiError } from '@kidsplus/shared/api';

export class ApiClientError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_PREFIX}${path}`, {
      method,
      credentials: 'same-origin',
      // Файл (картинка) уходит как есть, с его типом; остальное — JSON.
      headers:
        body === undefined
          ? {}
          : { 'content-type': body instanceof Blob ? body.type : 'application/json' },
      body: body === undefined ? undefined : body instanceof Blob ? body : JSON.stringify(body),
    });
  } catch {
    throw new ApiClientError(0, 'network', 'нет связи с сервером');
  }
  if (res.status === 204) return undefined as T;
  const data = (await res.json().catch(() => null)) as T | ApiError | null;
  if (!res.ok) {
    const err = data as ApiError | null;
    throw new ApiClientError(
      res.status,
      err?.error ?? 'unknown',
      err?.message ?? `ошибка ${res.status}`,
    );
  }
  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body: unknown = {}) => request<T>('POST', path, body),
  put: <T>(path: string, body: unknown) => request<T>('PUT', path, body),
  patch: <T>(path: string, body: unknown) => request<T>('PATCH', path, body),
  delete: <T = void>(path: string) => request<T>('DELETE', path),
  upload: <T>(path: string, file: Blob) => request<T>('POST', path, file),
};

export const errorMessage = (err: unknown) =>
  err instanceof ApiClientError ? err.message : 'что-то пошло не так';
