/**
 * Хранилище медиа (озвучка, картинки). Локально — файловая система,
 * на Railway — S3-совместимый bucket, общий для api и worker.
 */
export interface MediaStorage {
  put(key: string, data: Uint8Array, mimeType: string): Promise<void>;
  get(key: string): Promise<Uint8Array | null>;
  exists(key: string): Promise<boolean>;
  delete(key: string): Promise<void>;
}

/** Ключ: латиница, цифры, `-`, `_`, `.` и `/` между сегментами; без `..` и ведущего `/`. */
const KEY = /^(?!\/)(?!.*\/\/)(?!.*(^|\/)\.\.?(\/|$))[A-Za-z0-9._\-/]{1,200}$/;

export function assertStorageKey(key: string): void {
  if (!KEY.test(key)) throw new Error(`недопустимый ключ хранилища: ${key}`);
}
