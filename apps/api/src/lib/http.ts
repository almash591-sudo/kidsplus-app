import type { ApiError } from '@kidsplus/shared/api';
import type { FastifyError, FastifyInstance } from 'fastify';
import { z } from 'zod';

export class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export const notFound = (what = 'не найдено') => new HttpError(404, 'not_found', what);

/** Проверяет данные запроса по Zod-схеме; при ошибке — 400 с понятным текстом. */
export function parse<T extends z.ZodType>(schema: T, value: unknown): z.output<T> {
  const r = schema.safeParse(value);
  if (!r.success) throw new HttpError(400, 'validation', z.prettifyError(r.error));
  return r.data;
}

const idParam = z.object({ id: z.uuid() });

/** `:id` из пути; некорректный UUID — 404, как и несуществующий. */
export function idFrom(params: unknown): string {
  const r = idParam.safeParse(params);
  if (!r.success) throw notFound();
  return r.data.id;
}

export function registerErrorHandler(app: FastifyInstance) {
  app.setErrorHandler((err: FastifyError, request, reply) => {
    if (err instanceof HttpError) {
      return reply
        .code(err.statusCode)
        .send({ error: err.code, message: err.message } satisfies ApiError);
    }
    const status = err.statusCode;
    if (status && status >= 400 && status < 500) {
      // Ошибки Fastify: неверный JSON, неподдерживаемый Content-Type, rate limit и т.п.
      const code = status === 429 ? 'rate_limited' : 'bad_request';
      const message = status === 429 ? 'слишком много попыток, подождите минуту' : err.message;
      return reply.code(status).send({ error: code, message } satisfies ApiError);
    }
    request.log.error({ err }, 'необработанная ошибка');
    return reply
      .code(500)
      .send({ error: 'internal', message: 'внутренняя ошибка сервера' } satisfies ApiError);
  });

  app.setNotFoundHandler((_request, reply) =>
    reply.code(404).send({ error: 'not_found', message: 'не найдено' } satisfies ApiError),
  );
}
