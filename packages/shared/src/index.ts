// Общие типы, Zod-схемы и константы для фронтендов и бэкенда.
// Код, зависящий от Node.js (например, чтение окружения), лежит в отдельных точках входа (`@kidsplus/shared/env`).

export const APP_NAME = 'KidsPlus';

/** Префикс всех маршрутов API. Веб-сервисы проксируют его на api. */
export const API_PREFIX = '/api';

export interface HealthResponse {
  status: 'ok' | 'error';
  db: 'ok' | 'unavailable';
}
