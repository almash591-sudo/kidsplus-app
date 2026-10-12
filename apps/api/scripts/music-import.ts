// Готовит скрипт импорта уроков для запуска в контейнере api на проде:
//   pnpm --filter api exec tsx scripts/music-import.ts [--letters | --fun] [--commit] > lessons.js
// По умолчанию — музыка; --letters — «Буквы»; --fun — весёлая музыка (песенки, «Замри!», оркестр)
// вперемешку с упражнениями. Без --commit — холостой прогон (откат).
import {
  LETTERS_CATALOG,
  MUSIC_CATALOG,
  MUSIC_FUN_CATALOG,
  musicImportScript,
} from '../src/music-import';

const catalog = process.argv.includes('--letters')
  ? LETTERS_CATALOG
  : process.argv.includes('--fun')
    ? MUSIC_FUN_CATALOG
    : MUSIC_CATALOG;
process.stdout.write(musicImportScript(process.argv.includes('--commit'), catalog));
