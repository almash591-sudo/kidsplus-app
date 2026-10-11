import { hash, verify } from '@node-rs/argon2';

// Argon2id с параметрами OWASP (19 МиБ, 2 прохода) — укладывается в бюджет памяти сервера.
const OPTIONS = { memoryCost: 19456, timeCost: 2, parallelism: 1 };

export function hashPassword(password: string): Promise<string> {
  return hash(password, OPTIONS);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

let dummyHash: Promise<string> | undefined;

/**
 * Проверка с фиктивным хэшем, когда пользователь не найден: время ответа не выдаёт,
 * существует ли email.
 */
export async function verifyDummy(password: string): Promise<false> {
  dummyHash ??= hashPassword('dummy-password-for-timing');
  await verifyPassword(await dummyHash, password);
  return false;
}
