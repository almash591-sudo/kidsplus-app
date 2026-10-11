// Снимки на телефоне (IndexedDB приложения): оригиналы для галереи ребёнка и очередь копий
// в кабинет. Пока нет связи, копия ждёт и уходит позже.
import type { CaptureKind } from '@kidsplus/shared/captures';

export interface StoredCapture {
  id: string;
  kind: CaptureKind;
  blob: Blob;
  durationMs: number | null;
  takenAt: string;
  /** Копия уже на сервере (или сервер её не примет — тогда не повторяем). */
  uploaded: boolean;
}

const DB = 'kidsplus-camera';
const STORE = 'captures';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      const s = req.result.createObjectStore(STORE, { keyPath: 'id' });
      s.createIndex('takenAt', 'takenAt');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>) {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const req = run(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

export const saveCapture = (c: StoredCapture) => tx('readwrite', (s) => s.put(c));

/** Новые сверху. */
export async function listCaptures(): Promise<StoredCapture[]> {
  const all = await tx<StoredCapture[]>('readonly', (s) => s.getAll());
  return all.sort((a, b) => b.takenAt.localeCompare(a.takenAt));
}

export async function markUploaded(id: string) {
  const all = await tx<StoredCapture | undefined>('readonly', (s) => s.get(id));
  if (all) await saveCapture({ ...all, uploaded: true });
}
