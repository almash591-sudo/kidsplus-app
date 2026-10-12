import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LETTERS_CATALOG, musicImportScript } from './music-import';
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
});
