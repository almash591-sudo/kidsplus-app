// Готовит скрипт импорта уроков для запуска в контейнере api на проде:
//   pnpm --filter api exec tsx scripts/music-import.ts [--letters | --sounds | --math | --fun] [--commit] > lessons.js
// По умолчанию — музыка; --letters — «Буквы» 1–40; --sounds — «Буквы» 41–60, звуки и чтение
// (только семье владельца); --math — «Счёт» к школе (только семье владельца); --fun — весёлая музыка (песенки, «Замри!», оркестр) вперемешку
// с упражнениями. Без --commit — холостой прогон (откат).
import {
  LETTERS_CATALOG,
  LETTERS_SCHOOL_CATALOG,
  MATH_COUNT_CATALOG,
  MUSIC_CATALOG,
  MUSIC_FUN_CATALOG,
  musicImportScript,
} from '../src/music-import';

const catalog = process.argv.includes('--letters')
  ? LETTERS_CATALOG
  : process.argv.includes('--sounds')
    ? LETTERS_SCHOOL_CATALOG
    : process.argv.includes('--math')
      ? MATH_COUNT_CATALOG
      : process.argv.includes('--fun')
        ? MUSIC_FUN_CATALOG
        : MUSIC_CATALOG;
process.stdout.write(musicImportScript(process.argv.includes('--commit'), catalog));
