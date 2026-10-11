// Готовит скрипт импорта уроков для запуска в контейнере api на проде:
//   pnpm --filter api exec tsx scripts/music-import.ts [--letters] [--commit] > lessons.js
// По умолчанию — музыка; --letters — «Буквы». Без --commit — холостой прогон (откат).
import { LETTERS_CATALOG, MUSIC_CATALOG, musicImportScript } from '../src/music-import';

const catalog = process.argv.includes('--letters') ? LETTERS_CATALOG : MUSIC_CATALOG;
process.stdout.write(musicImportScript(process.argv.includes('--commit'), catalog));
