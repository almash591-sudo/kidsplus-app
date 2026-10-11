import { runMigrations } from './index';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL не задан (см. .env.example)');
  process.exit(1);
}

await runMigrations(url);
console.log('Миграции применены');
