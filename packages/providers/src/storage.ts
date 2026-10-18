/**
 * Хранилище медиа (озвучка, картинки). Локально — файловая система,
 * на Railway — S3-совместимый bucket, общий для api и worker.
 */
export interface MediaStorage {
  put(key: string, data: Uint8Array, mimeType: string): Promise<void>;
  get(key: string): Promise<Uint8Array | null>;
  exists(key: string): Promise<boolean>;
  delete(key: string): Promise<void>;
  /** Часть файла (байты start…end включительно) — для перемотки аудио; нет — читается целиком. */
  getRange?(key: string, start: number, end: number): Promise<Uint8Array | null>;
}

/**
 * Ключ: буквы (в том числе кириллица — у картинок карточек есть `…-красный.svg`), цифры, `-`, `_`,
 * `.` и `/` между сегментами; без `..` и ведущего `/`.
 */
const KEY = /^(?!\/)(?!.*\/\/)(?!.*(^|\/)\.\.?(\/|$))[\p{L}\p{N}._\-/]{1,200}$/u;

export function assertStorageKey(key: string): void {
  if (!KEY.test(key)) throw new Error(`недопустимый ключ хранилища: ${key}`);
}
