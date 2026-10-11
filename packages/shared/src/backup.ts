// Резервные копии базы (этап 15а): статус для кабинета. Копию делает worker, хранит Google Drive.

export interface BackupStatus {
  /** worker знает ключи Google Drive — копии делаются. */
  configured: boolean;
  /** Последняя удачная копия. */
  last: { at: string; name: string; bytes: number } | null;
  /** Последняя ошибка (после неё — удачных копий не было). */
  error: { at: string; message: string } | null;
  /** Родитель попросил сделать копию сейчас — ещё не сделана. */
  requestedAt: string | null;
  /** Сколько копий храним. */
  keep: number;
}

/** Папка на Google Диске владельца. */
export const BACKUP_FOLDER = 'KidsPlus — резервные копии';
export const BACKUP_KEEP = 14;
/** Ключи в app_settings. */
export const BACKUP_STATUS_KEY = 'backup';
export const BACKUP_REQUEST_KEY = 'backup_request';
