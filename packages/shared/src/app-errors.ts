// Сбои детского приложения (этап 51): телефон сообщает, что сломалось, родитель видит это
// в «Устройствах». Без имён и личных данных — только текст ошибки, экран и сборка.
import { z } from 'zod';

export const APP_ERROR_KINDS = ['error', 'rejection', 'screen', 'audio'] as const;
export type AppErrorKind = (typeof APP_ERROR_KINDS)[number];

/** Длины полей: телефон обрезает до них, сервер длиннее не принимает. */
export const APP_ERROR_LIMITS = { message: 300, stack: 2000, screen: 60, build: 40 } as const;

export const appErrorReport = z.object({
  kind: z.enum(APP_ERROR_KINDS),
  message: z.string().min(1).max(APP_ERROR_LIMITS.message),
  stack: z.string().max(APP_ERROR_LIMITS.stack).nullable(),
  screen: z.string().max(APP_ERROR_LIMITS.screen).nullable(),
  build: z.string().max(APP_ERROR_LIMITS.build).nullable(),
  /** Сколько раз повторилась на телефоне с прошлой отправки. */
  count: z.number().int().min(1).max(10_000),
  /** Когда случилась впервые (без связи телефон копит и отправляет позже). */
  at: z.iso.datetime(),
});
export type AppErrorReport = z.infer<typeof appErrorReport>;

/** Телефон отправляет накопленное пачкой. */
export const appErrorBatch = z.object({ errors: z.array(appErrorReport).min(1).max(10) });
export type AppErrorBatch = z.infer<typeof appErrorBatch>;

/** Сбой в кабинете: одинаковые за сутки сложены в одну строку. */
export interface AppErrorEntry {
  id: number;
  kind: AppErrorKind;
  message: string;
  stack: string | null;
  screen: string | null;
  build: string | null;
  userAgent: string | null;
  count: number;
  firstAt: string;
  lastAt: string;
}

/** Сколько дней сбои показываются в счётчике у телефона. */
export const APP_ERROR_RECENT_DAYS = 7;
