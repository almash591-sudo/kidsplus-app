import type { BookPlayed, KidBedtime } from '@kidsplus/shared/bedtime';
import type { KidHabitDone, KidHabits } from '@kidsplus/shared/habits';
import { API_PREFIX } from '@kidsplus/shared';
import type { KidAudioTrack } from '@kidsplus/shared/audio';
import type { BatteryReport } from '@kidsplus/shared/battery';
import type { CaptureKind, CaptureToday } from '@kidsplus/shared/captures';
import type { KidEventRequest, KidItem, KidPlaylist } from '@kidsplus/shared/api';
import type {
  HeartbeatRequest,
  HeartbeatResponse,
  KidToday,
  Subject,
} from '@kidsplus/shared/schedule';

import { sendEventQueued } from './offline';

export class NotPairedError extends Error {}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_PREFIX}${path}`, {
    method,
    credentials: 'same-origin',
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 401) throw new NotPairedError();
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (res.status === 204 ? undefined : await res.json()) as T;
}

export const kidApi = {
  me: () => request<{ paired: true }>('GET', '/kid/me'),
  playlist: () => request<KidPlaylist>('GET', '/kid/playlist'),
  reportVoices: (langs: string[]) => request<void>('POST', '/kid/voices', { langs }),
  today: () => request<KidToday>('GET', '/kid/today'),
  heartbeat: (beat: HeartbeatRequest) => request<HeartbeatResponse>('POST', '/kid/heartbeat', beat),
  /** Перерыв для глаз (этап 50): начался или ребёнок просит ещё. */
  eyeBreak: (action: 'start' | 'ask') => request<KidToday>('POST', '/kid/eye-break', { action }),
  lesson: (subject: Subject) => request<{ items: KidItem[] }>('GET', `/kid/lesson/${subject}`),
  battery: (b: BatteryReport) => request<void>('POST', '/kid/battery', b),
  captureToday: () => request<CaptureToday>('GET', '/kid/captures/today'),
  audio: () => request<KidAudioTrack[]>('GET', '/kid/audio'),
  habits: () => request<KidHabits>('GET', '/kid/habits'),
  habitDone: (id: string) => request<KidHabitDone>('POST', `/kid/habits/${id}/done`),
  bedtime: () => request<KidBedtime>('GET', '/kid/bedtime'),
  storyPlayed: (storyId: string) => request<void>('POST', '/kid/bedtime/played', { storyId }),
  bookPlayed: (b: BookPlayed) => request<void>('POST', '/kid/bedtime/played', b),
  /** Копия снимка в кабинет; возвращает код ответа (0 — нет связи). */
  uploadCapture: async (c: {
    kind: CaptureKind;
    blob: Blob;
    durationMs: number | null;
    takenAt: string;
  }): Promise<number> => {
    const q = new URLSearchParams({
      kind: c.kind,
      mime: c.blob.type.split(';')[0]!,
      takenAt: c.takenAt,
    });
    if (c.durationMs !== null) q.set('durationMs', String(Math.round(c.durationMs)));
    const res = await fetch(`${API_PREFIX}/kid/captures?${q}`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/octet-stream' },
      body: c.blob,
    });
    return res.status;
  },
  unlock: (pin: string) => request<{ ok: boolean }>('POST', '/kid/unlock', { pin }),
  /** true — привязано; false — код неверный или истёк. */
  pair: async (code: string) => {
    try {
      await request<void>('POST', '/kid/pair', { code });
      return true;
    } catch (err) {
      if (err instanceof Error && /HTTP 4\d\d/.test(err.message)) return false;
      throw err;
    }
  },
};

/** События для аналитики: «выстрелил и забыл», переживает закрытие страницы. */
/** Событие для родителя и аналитики; без сети — копится и уходит позже (offline.ts). */
export function sendEvent(event: KidEventRequest): void {
  void sendEventQueued(event);
}
