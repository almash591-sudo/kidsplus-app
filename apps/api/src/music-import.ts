// Импорт 100 уроков музыки (этап 14б) на прод — текст самостоятельного скрипта для контейнера api.
// CLI: scripts/music-import.ts. Проверяется на PGlite в music-import.test.ts.
//
// Что делает скрипт: создаёт игры раздела «Музыка» (повторный запуск ничего не дублирует —
// игра узнаётся по названию) и назначает их детям по возрасту: младше MUSIC_OLD_FROM_AGE лет —
// уроки малышей, остальным — уроки дошкольников; в конец списка ребёнка, по порядку дорожки.
// Владелец решил: уроки включаются детям сразу, родитель может скрыть любой в кабинете.
import type { GameSpec } from '@kidsplus/shared/games';
import { LETTER_LESSONS } from '@kidsplus/shared/letters-lessons';
import { MUSIC_LESSONS, MUSIC_OLD_FROM_AGE } from '@kidsplus/shared/music-lessons';

/** Набор уроков для импорта: раздел, уроки по возрасту (young / old) и возраст «старших». */
export interface LessonCatalog {
  category: string;
  oldFromAge: number;
  lessons: { age: 'young' | 'old'; title: string; spec: GameSpec }[];
}

export const MUSIC_CATALOG: LessonCatalog = {
  category: 'music',
  oldFromAge: MUSIC_OLD_FROM_AGE,
  lessons: MUSIC_LESSONS,
};
/** Буквы (этап 15ж) — только дошкольникам: младшим уроков нет. */
export const LETTERS_CATALOG: LessonCatalog = {
  category: 'letters',
  oldFromAge: 4,
  lessons: LETTER_LESSONS,
};

/** Текст скрипта для `node -` в контейнере api; commit — сохранить, иначе откатить. */
export function musicImportScript(commit: boolean, catalog: LessonCatalog = MUSIC_CATALOG): string {
  const lessons = catalog.lessons.map((l) => ({
    age: l.age,
    title: l.title,
    kind: l.spec.kind,
    params: l.spec,
  }));
  return `const { Client } = require('/app/node_modules/pg');
const LESSONS = ${JSON.stringify(lessons)};
const OLD_FROM = ${catalog.oldFromAge};
const CATEGORY = ${JSON.stringify(catalog.category)};
const DRY = ${!commit};
const done = (async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  await c.query('begin');
  const ids = {};
  let created = 0;
  for (const l of LESSONS) {
    const found = (await c.query("select id from interactives where title = $1 and category = $2", [l.title, CATEGORY])).rows[0];
    if (found) { ids[l.title] = found.id; continue; }
    const row = (await c.query(
      "insert into interactives (title, category, kind, params) values ($1, $4, $2, $3) returning id",
      [l.title, l.kind, JSON.stringify(l.params), CATEGORY])).rows[0];
    ids[l.title] = row.id;
    created++;
  }
  const now = new Date();
  const kids = (await c.query('select id, birth_year, birth_month from children order by created_at')).rows;
  for (const k of kids) {
    let age = now.getFullYear() - k.birth_year;
    if (now.getMonth() + 1 < k.birth_month) age--;
    const group = age >= OLD_FROM ? 'old' : 'young';
    let pos = (await c.query('select coalesce(max(position), -1) as p from child_items where child_id = $1', [k.id])).rows[0].p;
    let added = 0;
    for (const l of LESSONS.filter((x) => x.age === group)) {
      const r = await c.query(
        "insert into child_items (child_id, kind, interactive_id, position) values ($1, 'interactive', $2, $3) on conflict do nothing",
        [k.id, ids[l.title], ++pos]);
      added += r.rowCount;
    }
    console.log('ребёнок', String(k.id).slice(0, 8), 'возраст', age, 'уроки', group, 'назначено', added);
  }
  console.log('уроков', LESSONS.length, 'создано игр', created, DRY ? '(холостой прогон, откат)' : '(сохранено)');
  await c.query(DRY ? 'rollback' : 'commit');
  await c.end();
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
`;
}
