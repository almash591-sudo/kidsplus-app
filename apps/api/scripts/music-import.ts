// Готовит скрипт импорта уроков музыки для запуска в контейнере api на проде:
//   pnpm --filter api exec tsx scripts/music-import.ts [--commit] > music.js
// Без --commit скрипт всё делает в транзакции и откатывает её (холостой прогон).
import { musicImportScript } from '../src/music-import';

process.stdout.write(musicImportScript(process.argv.includes('--commit')));
