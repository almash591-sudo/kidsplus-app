import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

/** Случайный токен для cookie и ссылок (256 бит, base64url). */
export function randomToken(): string {
  return randomBytes(32).toString('base64url');
}

/** В БД хранится только SHA-256 токенов и кодов. */
export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** Алфавит без похожих символов (0/O, 1/I/L). */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** Код привязки устройства: 8 символов (~39 бит), живёт 10 минут, защищён rate limit. */
export function pairingCode(): string {
  let code = '';
  for (let i = 0; i < 8; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return code;
}

export function formatPairingCode(code: string): string {
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

/** Сравнение строк за постоянное время. */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}
