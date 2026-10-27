import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LETTER_LESSONS } from '@kidsplus/shared/letters-lessons';
import {
  LETTERS_CATALOG,
  LETTERS_SCHOOL_CATALOG,
  MUSIC_FUN_CATALOG,
  musicImportScript,
} from './music-import';
import { createChild, girl, makeApp, setupParent, SETUP_TOKEN, type TestApp } from './test/helpers';

interface Pg {
  query: (
    sql: string,
    params?: unknown[],
  ) => Promise<{ rows: Record<string, unknown>[]; affectedRows?: number }>;
}

let t: TestApp;
let pg: Pg;
beforeEach(async () => {
  t = await makeApp({ setupToken: SETUP_TOKEN });
  pg = (t.db as unknown as { $client: Pg }).$client;
});
afterEach(() => t.close());

/** Запустить готовый скрипт так же, как `node -` в контейнере, но с PGlite вместо pg. */
async function run(commit: boolean, catalog?: typeof LETTERS_CATALOG) {
  const log: string[] = [];
  class Client {
    connect() {}
    end() {}
    async query(sql: string, params?: unknown[]) {
      const r = await pg.query(sql, params);
      return { rows: r.rows, rowCount: r.affectedRows ?? r.rows.length };
    }
  }
  const script = `${musicImportScript(commit, catalog)}\nreturn done;`;
  const fn = new Function('require', 'process', 'console', script) as (
    ...a: unknown[]
  ) => Promise<void>;
  await fn(
    () => ({ Client }),
    {
      env: {},
      exit: (code: number) => {
        throw new Error(`exit ${code}`);
      },
    },
    {
      log: (...a: unknown[]) => log.push(a.join(' ')),
      error: (...a: unknown[]) => log.push(a.join(' ')),
    },
  );
  return log;
}

const count = async (sql: string, params: unknown[] = []) =>
  Number((await pg.query(sql, params)).rows[0]!.n);

describe('импорт уроков музыки', () => {
  it('холостой прогон ничего не сохраняет', async () => {
    const parent = await setupParent(t);
    await createChild(t, parent, girl({ birthYear: 2021 }));
    const log = await run(false);
    expect(log.at(-1)).toContain('откат');
    expect(await count("select count(*) as n from interactives where category = 'music'")).toBe(0);
  });

  it('100 игр; младшему — 40 уроков малышей, старшему — 60, по порядку; повтор не дублирует', async () => {
    const parent = await setupParent(t);
    const year = new Date().getFullYear();
    const small = await createChild(t, parent, girl({ nickname: 'Зайка', birthYear: year - 2 }));
    const big = await createChild(t, parent, girl({ nickname: 'Солнышко', birthYear: year - 6 }));

    await run(true);
    expect(await count("select count(*) as n from interactives where category = 'music'")).toBe(
      100,
    );
    const items = (id: string) =>
      pg.query(
        `select i.title from child_items c join interactives i on i.id = c.interactive_id
         where c.child_id = $1 order by c.position`,
        [id],
      );
    const smallItems = (await items(small)).rows.map((r) => r.title as string);
    const bigItems = (await items(big)).rows.map((r) => r.title as string);
    expect(smallItems).toHaveLength(40);
    expect(bigItems).toHaveLength(60);
    expect(smallItems[0]).toMatch(/^Музыка для малышей 01 · /);
    expect(bigItems[0]).toMatch(/^Музыка 01 · /);
    expect(bigItems.at(-1)).toMatch(/^Музыка 60 · /);

    await run(true);
    expect(await count("select count(*) as n from interactives where category = 'music'")).toBe(
      100,
    );
    expect(await count('select count(*) as n from child_items where child_id = $1', [big])).toBe(
      60,
    );
  });

  it('весёлая музыка — вперемешку с упражнениями, повтор порядок не меняет', async () => {
    const parent = await setupParent(t);
    const year = new Date().getFullYear();
    const big = await createChild(t, parent, girl({ nickname: 'Солнышко', birthYear: year - 6 }));
    await run(true);
    await run(true, MUSIC_FUN_CATALOG);
    const titles = async () =>
      (
        await pg.query(
          `select i.title from child_items c join interactives i on i.id = c.interactive_id
           where c.child_id = $1 order by c.position`,
          [big],
        )
      ).rows.map((r) => r.title as string);
    const list = await titles();
    expect(list).toHaveLength(80);
    expect(list[0]).toMatch(/^Музыка 01 · /);
    // 60 упражнений и 20 весёлых: весёлый — после каждых трёх упражнений.
    expect(list[3]).toMatch(/^Весёлая музыка 01 · Сыграй песенку/);
    expect(list.filter((x, i) => i < 40 && x.startsWith('Весёлая'))).toHaveLength(10);
    await run(true, MUSIC_FUN_CATALOG);
    expect(await titles()).toEqual(list);
  });

  it('«Буквы»: 40 уроков только старшему ребёнку, раздел letters', async () => {
    const parent = await setupParent(t);
    const year = new Date().getFullYear();
    const small = await createChild(t, parent, girl({ nickname: 'Зайка', birthYear: year - 2 }));
    const big = await createChild(t, parent, girl({ nickname: 'Солнышко', birthYear: year - 6 }));
    await run(true, LETTERS_CATALOG);
    expect(await count("select count(*) as n from interactives where category = 'letters'")).toBe(
      40,
    );
    expect(await count('select count(*) as n from child_items where child_id = $1', [big])).toBe(
      40,
    );
    expect(await count('select count(*) as n from child_items where child_id = $1', [small])).toBe(
      0,
    );
  });

  it('звуки и чтение: только семье владельца, на слух — между непройденными, чтение — в конец', async () => {
    const parent = await setupParent(t);
    const year = new Date().getFullYear();
    const small = await createChild(t, parent, girl({ nickname: 'Зайка', birthYear: year - 2 }));
    const big = await createChild(t, parent, girl({ nickname: 'Солнышко', birthYear: year - 6 }));
    const other = await createChild(t, parent, girl({ nickname: 'Мишутка', birthYear: year - 6 }));
    const fam = (await pg.query("insert into families (name) values ('Родственники') returning id"))
      .rows[0]!.id;
    await pg.query('update children set family_id = $1 where id = $2', [fam, other]);
    await run(true, LETTERS_CATALOG);
    // Пройдены уроки 1–9 и 12: 10 и 11 пропущены, но остаются позади.
    const done = [1, 2, 3, 4, 5, 6, 7, 8, 9, 12].map((n) => LETTER_LESSONS[n - 1]!.title);
    await pg.query(
      `insert into events (child_id, type, payload)
       select $1, 'interactive_complete', jsonb_build_object('interactiveId', id::text)
       from interactives where title = any($2)`,
      [big, done],
    );

    const log = await run(true, LETTERS_SCHOOL_CATALOG);
    expect(log.some((l) => l.includes('пройдено 12, впереди 28'))).toBe(true);
    expect(await count("select count(*) as n from interactives where category = 'letters'")).toBe(
      60,
    );
    const titles = async (id: string) =>
      (
        await pg.query(
          `select i.title from child_items c join interactives i on i.id = c.interactive_id
           where c.child_id = $1 order by c.position`,
          [id],
        )
      ).rows.map((r) => r.title as string);
    const list = await titles(big);
    const all = LETTER_LESSONS.map((l) => l.title);
    expect(list).toHaveLength(60);
    expect(list.slice(0, 12)).toEqual(all.slice(0, 12));
    const middle = list.slice(12, 52);
    const isNew = (x: string) => all.indexOf(x) >= 40;
    expect(middle.filter((x) => !isNew(x))).toEqual(all.slice(12, 40));
    expect(middle.filter(isNew)).toEqual(all.slice(40, 52));
    expect(LETTER_LESSONS.slice(40, 52).every((l) => l.spread)).toBe(true);
    // Между непройденными — не подряд и с самого начала, а не одной кучей в конце.
    expect(middle.findIndex(isNew)).toBeLessThan(4);
    middle.forEach((x, i) => i > 0 && expect(isNew(x) && isNew(middle[i - 1]!)).toBe(false));
    expect(list.slice(52)).toEqual(all.slice(52));

    expect(await titles(small)).toEqual([]);
    // Семья родственников: уроки 1–40 у неё были, новые не назначены.
    expect(await titles(other)).toEqual(all.slice(0, 40));

    await run(true, LETTERS_SCHOOL_CATALOG);
    expect(await titles(big)).toEqual(list);
  });
});
