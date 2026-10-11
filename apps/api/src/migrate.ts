// Точка входа для применения миграций в продакшене (preDeployCommand на Railway).
import { runMigrations } from '@kidsplus/db';
import { parseEnv, workerEnvSchema } from '@kidsplus/shared/env';

const env = parseEnv(workerEnvSchema);
await runMigrations(env.DATABASE_URL);
console.log('Миграции применены');
