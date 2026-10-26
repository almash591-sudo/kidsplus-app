// Ролик №4 «35 видов игр» (этап 48): съёмка игр Зайки на вечернем демо-стенде. Свободное
// время → «Игры»: стена плиток, потом по несколько секунд каждой игры, наклейка и альбом.
//
// Стенд: DEMO_CLOCK=1 DEMO_FREE=1 DEMO_NOW=2026-10-25T17:30:00+03:00 DEMO_CLAY=<папка>
// (см. docs/promo.md), каждый раз свежий — игры съёмка добавляет сама, как родитель.
// Играет автопилот: где что лежит, игры пишут в data-атрибуты (как для e2e).
// Клипы: OUT/clips/4-*/000001.jpg… и meta.json; PROMO_ONLY=maze,puzzle — переснять только эти.
import { Cam, chromium, login, pairUrl, PARENT, phone, standNow } from './recorder.mjs';

/** PROMO_ONLY=maze,puzzle — переснять только эти части, остальные клипы останутся прежними. */
const only = process.env.PROMO_ONLY?.split(',');
const want = (part) => !only || only.includes(part);

const W = 390;
const H = 844;

const browser = await chromium.launch();
const kidCtx = await phone(browser, await standNow());
await login(kidCtx);
const api = kidCtx.request;
const { kid, url } = await pairUrl(kidCtx, 'Зайка');

// ── Игры, как их добавил бы родитель (картинки — эмодзи, на телефоне — объёмные) ──
const emoji = async (code) =>
  (await (await api.post(`${PARENT}/api/parent/media/emoji`, { data: { code } })).json()).id;
const [cat, dog, rabbit, carrot, fox, car, lion, bear, apple] = await Promise.all(
  ['1f431', '1f436', '1f430', '1f955', '1f98a', '1f697', '1f981', '1f43b', '1f34e'].map(emoji),
);
/** Снимаются по очереди: вид игры → параметры. */
const PLAYED = {
  rocket: { parts: 4, memory: false, quiz: 'sums', max: 5, asteroids: 'few', rounds: 1 },
  dive: { task: 'colors', max: 4, jellies: 'few', speed: 'slow', rounds: 2 },
  race: { quiz: 'numbers', max: 5, gates: 3, rivals: true, cones: 'none', speed: 'normal' },
  differences: { scenes: ['meadow'], count: 3, rounds: 1, hint: false },
  piano: { mode: 'find', keys: 5, rounds: 2 },
  maze: { heroId: rabbit, goalId: carrot, size: 4, rounds: 1 },
  colorNumbers: { pictures: ['butterfly'], hint: true },
  sudoku: { imageIds: [cat, dog, rabbit], size: 3, blanks: 3, rounds: 1 },
  syllableWord: { words: [{ imageId: car, word: 'МА-ШИ-НА' }], extra: 1 },
  clock: { half: false, choices: 3, rounds: 2 },
  fishing: { mode: 'numbers', max: 5, fish: 3, speed: 'slow', rounds: 2 },
  puzzle: { imageIds: [fox], cols: 2, rows: 2 },
};
/** Только на стене плиток: игр много. */
const WALL = {
  moles: { imageIds: [rabbit, cat], target: 0, prompt: 'Лови только зайчиков!', count: 5 },
  shadows: { imageIds: [cat, lion, rabbit], perRound: 3 },
  tracing: { shapes: ['circle', 'wave'] },
  tangram: { figures: ['house'], outline: true },
  flashlight: { scene: 'forest', items: [{ imageId: fox }, { imageId: bear }] },
  odd: { rounds: [{ imageIds: [cat, lion, rabbit, carrot], odd: 3 }] },
  builder: { height: 3, blocks: 4, hide: false, rounds: 1 },
  robot: { size: 4, steps: 3, rocks: true, rounds: 1 },
  space: { order: 'numbers', count: 4, step: 1, reverse: false, rounds: 1 },
  flight: { stars: 5, clouds: 'few', speed: 'slow' },
  shop: { imageIds: [apple], max: 4, coins: [1, 2], rounds: 2 },
  dots: { pictures: ['star'], hint: true },
  shapes: { shapes: ['circle', 'square', 'triangle'], rotate: false },
  melody: { bells: 4, start: 2, goal: 4 },
};
for (const [kind, spec] of Object.entries({ ...PLAYED, ...WALL })) {
  const res = await api.post(`${PARENT}/api/parent/games`, {
    data: { title: kind, category: 'games', spec: { kind, ...spec }, childIds: [kid.id] },
  });
  if (!res.ok()) throw new Error(`игра ${kind}: ${res.status()} ${await res.text()}`);
}
// Свободного времени — с запасом: игр много.
const schedulePath = `${PARENT}/api/parent/children/${kid.id}/schedule`;
const schedule = await (await api.get(schedulePath)).json();
await api.put(schedulePath, { data: { ...schedule, freeMinutes: 120 } });

// ── Телефон Зайки ──
const k = await kidCtx.newPage();
await k.goto(url);
await k.getByTestId('today').waitFor();
await k.waitForTimeout(1500);
const cam = new Cam(k);
await cam.freeze();

const has = (id) =>
  k
    .getByTestId(id)
    .count()
    .then((n) => n > 0);
const attr = (loc, name) => loc.getAttribute(name, { timeout: 300 }).catch(() => null);
const json = async (loc, name) => JSON.parse((await attr(loc, name)) || 'null');
const xy = (s) => (s ?? '').split(',').map(Number);
const center = async (loc) => {
  const b = await loc.boundingBox();
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
};
/** Палец не прыгает: за кадр — не дальше step точек. */
const toward = (from, to, step) => {
  const d = Math.hypot(to.x - from.x, to.y - from.y);
  if (d <= step) return to;
  return { x: from.x + ((to.x - from.x) * step) / d, y: from.y + ((to.y - from.y) * step) / d };
};

/** Снимать (или мотать) кусками, пока не выполнится условие. */
async function until(check, maxSec, chunk = 0.2) {
  for (let t = 0; t < maxSec; t += chunk) {
    if (await check()) return true;
    if (cam.dir) await cam.rec(chunk);
    else await cam.skip(chunk, 100);
    await cam.settle(30);
  }
  return false;
}

const gameTiles = () => k.locator('[data-testid=tile]:has(img[src^="/games/icon-"])');
const tile = (kind) =>
  k.locator(`[data-testid=tile]:not([data-rest]):has(img[src="/games/icon-${kind}.webp"])`);

/** В раздел «Игры» — откуда угодно: из игры, праздника, альбома, разделов. */
async function toGames() {
  for (let i = 0; i < 200; i++) {
    if (await has('game-finished')) await cam.skip(0.5);
    else if (await has('game')) await cam.tap(k.getByTestId('go-home'));
    else if (await has('album')) await cam.tap(k.getByTestId('album-close'));
    else if ((await gameTiles().count()) > 0) return;
    else if (await has('category'))
      await cam.tap(k.getByTestId('category').filter({ hasText: 'Игры' }));
    else if (await has('free')) await cam.tap(k.getByTestId('free'));
    else await cam.skip(0.5);
    await cam.settle(60);
  }
  throw new Error('не попасть в «Игры»');
}

/** Открыть игру kind из раздела «Игры» (за кадром) и дать договорить задание. */
async function open(kind, intro = 2.5) {
  await toGames();
  const t = tile(kind).first();
  await t.scrollIntoViewIfNeeded();
  await cam.skip(0.3);
  await cam.tap(t, { after: 0.4 });
  if (!(await until(() => has(`game-${kind}`), 8))) throw new Error(`не открылась ${kind}`);
  await cam.skip(intro, 100);
  await cam.settle(60);
  return k.getByTestId(`game-${kind}`);
}

/** Доиграть за кадром: пока не праздник или не вышло время. */
async function finish(step, maxSec = 90) {
  for (let t = 0; t < maxSec && !(await has('game-finished')); t += 0.2) {
    if (step) await step();
    await cam.skip(0.2, 100);
    await cam.settle(30);
  }
}

// ── 1. Стена плиток: «Игры» открываются, листаем вниз ──
if (want('wall')) {
  await until(() => has('free'), 10);
  await cam.tap(k.getByTestId('free'), { after: 0.6 });
  await until(() => has('category'), 5);
  await cam.skip(1);
  cam.clip('4-wall');
  await cam.rec(0.6);
  await cam.tap(k.getByTestId('category').filter({ hasText: 'Игры' }), { after: 0.2 });
  await until(async () => (await gameTiles().count()) > 0, 5);
  await cam.rec(1.2);
  const bottom = await k.evaluate(
    () => document.scrollingElement.scrollHeight - document.scrollingElement.clientHeight,
  );
  await cam.scroll(bottom, 3.2);
  await cam.rec(0.6);
  cam.cut();
  await cam.scroll(0, 0.1);
}

// ── 2. Ракета: сборка по чертежу, отсчёт и пуск, полёт к планете с ответом ──
if (want('rocket')) {
  const g = await open('rocket', 1.5);
  const tray = async () => (await json(g, 'data-tray')) ?? [];
  await until(async () => (await tray()).length > 0, 6);
  cam.clip('4-rocket-build');
  await cam.rec(0.4);
  for (let i = 0; i < 10; i++) {
    const good = (await tray()).filter((p) => p.good);
    if (!good.length) break;
    const [x, y] = xy(await attr(g, 'data-drop'));
    await cam.drag(good[0], { x, y }, 0.45);
    await cam.tick(9);
    if (i === 2) cam.cut();
  }
  if (cam.dir) cam.cut();
  await until(async () => (await attr(g, 'data-phase')) === 'countdown', 8);
  cam.clip('4-rocket-launch');
  await until(async () => (await attr(g, 'data-phase')) === 'fly', 14, 1 / 30);
  await cam.rec(0.3);
  cam.cut();
  // Полёт: палец ведёт ракету под планету с ответом.
  cam.clip('4-rocket-fly');
  let finger = null;
  for (let i = 0; i < 30 * 40 && !(await has('game-finished')); i++) {
    const phase = await attr(g, 'data-phase');
    const target = ((await json(g, 'data-planets')) ?? []).find((p) => p.good);
    if (phase === 'fly' && target) {
      const [rx] = xy(await attr(g, 'data-rocket'));
      if (!finger) {
        finger = { x: rx || W / 2, y: H * 0.8 };
        await cam.down(finger.x, finger.y);
      }
      finger = toward(finger, { x: target.x, y: H * 0.8 }, 9);
      await cam.move(finger.x, finger.y);
    } else if (finger) {
      await cam.up();
      finger = null;
    }
    if (phase === 'land' && cam.dir && i > 30) {
      await cam.rec(2.2);
      cam.cut();
    }
    await cam.tick();
  }
  if (finger) await cam.up();
  if (cam.dir) cam.cut();
}

// ── 3. Подводное: батискаф за пальцем ловит нужных рыбок ──
if (want('dive')) {
  const g = await open('dive', 3);
  let finger = { x: W * 0.4, y: H * 0.5 };
  await cam.down(finger.x, finger.y);
  const pilot = async () => {
    const [sx, sy] = xy(await attr(g, 'data-sub'));
    const fish = ((await json(g, 'data-swimmers')) ?? []).filter(
      (f) => f.good && !f.jelly && f.x > 30 && f.x < W - 20,
    );
    const want = fish.sort(
      (a, b) => Math.hypot(a.x - sx, a.y - sy) - Math.hypot(b.x - sx, b.y - sy),
    )[0];
    if (want) {
      finger = toward(finger, { x: want.x - 25, y: want.y }, 14);
      await cam.move(finger.x, finger.y);
    }
  };
  cam.clip('4-dive');
  for (let i = 0; i < 30 * 6; i++) {
    await pilot();
    await cam.tick();
  }
  cam.cut();
  await finish(pilot);
  await cam.up();
}

// ── 4. Гонки: светофор, ворота с цифрой ──
if (want('race')) {
  const g = await open('race', 0.3);
  await until(async () => (await attr(g, 'data-phase')) === 'ready', 6);
  let finger = null;
  const steer = async () => {
    if ((await attr(g, 'data-phase')) !== 'race') return;
    const target = Number(await attr(g, 'data-target'));
    const car = Number(await attr(g, 'data-car')) || W / 2;
    if (!finger) {
      finger = { x: car, y: H * 0.85 };
      await cam.down(finger.x, finger.y);
    }
    if (target) finger = toward(finger, { x: target, y: H * 0.85 }, 10);
    await cam.move(finger.x, finger.y);
  };
  await cam.skip(0.8);
  cam.clip('4-race');
  for (let i = 0; i < 30 * 8; i++) {
    await steer();
    await cam.tick();
  }
  cam.cut();
  await finish(steer, 120);
  if (finger) await cam.up();
}

// ── 5. Найди отличия ──
if (want('differences')) {
  const g = await open('differences', 0.5);
  await until(async () => (await attr(g, 'data-phase')) === 'play', 10);
  await cam.skip(1.5);
  cam.clip('4-differences');
  await cam.rec(0.6);
  for (let i = 0; i < 3; i++) {
    const [d] = (await json(g, 'data-diffs')) ?? [];
    if (!d) break;
    await cam.tap(d, { after: 0.9 });
    if (i === 1) cam.cut();
  }
  if (cam.dir) cam.cut();
  await finish();
}

// ── 6. Пианино: «Найди ноту…» ──
if (want('piano')) {
  const g = await open('piano', 0.5);
  cam.clip('4-piano');
  for (let round = 0; round < 6 && !(await has('game-finished')); round++) {
    await until(async () => (await attr(g, 'data-ready')) === 'true', 12);
    const answer = await attr(g, 'data-answer');
    if (answer === null) break;
    await cam.tap(k.locator(`[data-testid=piano-key][data-key="${answer}"]`), { after: 0.8 });
    if (round === 1) cam.cut();
  }
  if (cam.dir) cam.cut();
  await finish();
}

// ── 7. Лабиринт: ведём зайку пальцем к морковке ──
if (want('maze')) {
  const g = await open('maze', 2.5);
  const n = Number(await attr(g, 'data-n'));
  // «1» — стенка справа (снизу) от клетки, «0» — проход (как в mazeGen).
  const bits = async (a) => [...((await attr(g, a)) ?? '')].map((c) => c === '0');
  const right = await bits('data-right');
  const down = await bits('data-down');
  // Путь из клетки 0 в последнюю.
  const prev = new Map([[0, -1]]);
  for (const q = [0]; q.length;) {
    const c = q.shift();
    const [x, y] = [c % n, Math.floor(c / n)];
    const next = [
      x < n - 1 && right[c] && c + 1,
      x > 0 && right[c - 1] && c - 1,
      y < n - 1 && down[c] && c + n,
      y > 0 && down[c - n] && c - n,
    ];
    for (const m of next) {
      if (m === false || prev.has(m)) continue;
      prev.set(m, c);
      q.push(m);
    }
  }
  if (!prev.has(n * n - 1)) throw new Error('лабиринт: нет пути');
  const path = [];
  for (let c = n * n - 1; c !== -1; c = prev.get(c)) path.unshift(c);
  const box = await k.getByTestId('maze').boundingBox();
  // viewBox (-2 -2 n·10+4 n·10+4) вписан по центру.
  const view = n * 10 + 4;
  const s = Math.min(box.width, box.height) / view;
  const ox = box.x + (box.width - view * s) / 2 + 2 * s;
  const oy = box.y + (box.height - view * s) / 2 + 2 * s;
  const at = (c) => ({ x: ox + ((c % n) * 10 + 5) * s, y: oy + (Math.floor(c / n) * 10 + 5) * s });
  cam.clip('4-maze');
  await cam.rec(0.4);
  await cam.down(at(0).x, at(0).y);
  await cam.tick(3);
  for (let i = 1; i < path.length; i++) {
    const [a, b] = [at(path[i - 1]), at(path[i])];
    for (let f = 1; f <= 7; f++) {
      await cam.move(a.x + ((b.x - a.x) * f) / 7, a.y + ((b.y - a.y) * f) / 7);
      await cam.tick();
    }
  }
  await cam.up();
  await cam.rec(0.6);
  cam.cut();
  await finish();
}

// ── 8. Раскраска по цифрам ──
if (want('colorNumbers')) {
  await open('colorNumbers', 2.5);
  cam.clip('4-colorNumbers');
  await cam.rec(0.3);
  for (let n = 1; n <= 8; n++) {
    const paint = k.locator(`.paint.numbered[data-n="${n}"]`);
    if (!(await paint.count())) break;
    await cam.tap(paint, { after: 0.25 });
    for (;;) {
      const spot = k
        .getByTestId('number-spot')
        .filter({ hasText: new RegExp(`^${n}$`) })
        .first();
      if (!(await spot.count())) break;
      await cam.tap(await center(spot.locator('circle')), { after: 0.45 });
    }
    if (n === 3) cam.cut();
  }
  if (cam.dir) cam.cut();
  await finish();
}

// ── 9. Судоку-малыш ──
if (want('sudoku')) {
  await open('sudoku', 2.5);
  cam.clip('4-sudoku');
  await cam.rec(0.4);
  for (let i = 0; i < 12 && !(await has('game-finished')); i++) {
    const target = k.locator('[data-testid=sudoku-cell][data-hint-target]');
    if (!(await target.count())) break;
    const v = await attr(target.first(), 'data-value');
    await cam.tap(k.locator(`[data-testid=sudoku-pick][data-value="${v}"]`), { after: 0.6 });
  }
  await cam.rec(0.5);
  cam.cut();
  await finish();
}

// ── 10. Слово из слогов: МА-ШИ-НА ──
if (want('syllableWord')) {
  await open('syllableWord', 3);
  cam.clip('4-syllableWord');
  await cam.rec(0.4);
  for (const s of ['МА', 'ШИ', 'НА'])
    await cam.tap(k.locator(`[data-testid=word-tile][data-letter="${s}"]`), { after: 0.6 });
  await cam.rec(0.6);
  cam.cut();
  await finish();
}

// ── 11. Который час ──
if (want('clock')) {
  const g = await open('clock', 3);
  cam.clip('4-clock');
  await cam.rec(0.4);
  for (let round = 0; round < 6 && !(await has('game-finished')); round++) {
    const answer = Number(await attr(g, 'data-answer'));
    await cam.tap(k.getByTestId('clock-option').nth(answer), { after: 0.6 });
    if (round === 0) {
      await cam.rec(0.6);
      cam.cut();
    }
    await cam.skip(2.6, 100);
    await cam.settle(60);
  }
  if (cam.dir) cam.cut();
  await finish();
}

// ── 12. Рыбалка: крючок к рыбке с нужной цифрой ──
if (want('fishing')) {
  const g = await open('fishing', 3);
  const hook = k.getByTestId('fishing-hook');
  /** Палец держит крючок на рыбке, пока он не доплывёт, и отпускает. */
  const catchFish = async () => {
    const target = await attr(g, 'data-target');
    const fish = k.locator(`[data-testid=fishing-fish][data-value="${target}"]`).first();
    if (!(await fish.count())) return cam.tick();
    let f = await center(fish);
    let finger = { ...f };
    await cam.down(finger.x, finger.y);
    for (let i = 0; i < 90; i++) {
      f = await center(fish);
      finger = toward(finger, f, 16);
      await cam.move(finger.x, finger.y);
      const b = await fish.boundingBox();
      const h = await hook.boundingBox();
      const near =
        Math.abs(h.x + h.width / 2 - f.x) < b.width * 0.25 &&
        Math.abs(h.y + h.height - f.y) < b.height * 0.3;
      await cam.tick();
      if (near) break;
    }
    await cam.up();
  };
  cam.clip('4-fishing');
  await cam.rec(0.3);
  await catchFish();
  await cam.rec(1.4);
  cam.cut();
  await finish(async () => {
    if ((await k.locator('.fishing-fish.caught').count()) === 0) await catchFish();
  });
}

// ── 13. Найди пару (засеяна стендом): сначала мимо, потом пары по очереди ──
if (want('memory')) {
  await open('memory', 2);
  const pair = (p) => k.locator(`[data-testid=memory-card][data-pair="${p}"]`);
  const pairs = [
    ...new Set(
      await k.getByTestId('memory-card').evaluateAll((cs) => cs.map((c) => c.dataset.pair)),
    ),
  ];
  cam.clip('4-memory');
  await cam.rec(0.4);
  await cam.tap(pair(pairs[0]).nth(0), { after: 0.35 });
  await cam.tap(pair(pairs[1]).nth(0), { after: 1.3 });
  for (const p of pairs) {
    await cam.tap(pair(p).nth(0), { after: 0.35 });
    await cam.tap(pair(p).nth(1), { after: 0.7 });
  }
  cam.cut();
  await finish();
}

// ── 14. Пазл — последним: собран на камеру, праздник с наклейкой ──
if (want('puzzle')) {
  await open('puzzle', 2.5);
  cam.clip('4-puzzle');
  await cam.rec(0.3);
  for (let i = 0; i < 8; i++) {
    const piece = k.getByTestId('puzzle-piece').first();
    if (!(await piece.count())) break;
    const n = Number(await attr(piece, 'data-piece'));
    await cam.drag(await center(piece), await center(k.getByTestId('puzzle-slot').nth(n)), 0.45);
    await cam.rec(0.2);
  }
  cam.cut();
  cam.clip('4-sticker');
  await until(() => has('sticker-award'), 4, 1 / 30);
  await cam.rec(3);
  cam.cut();
}

// ── 15. Альбом наклеек ──
if (want('album')) {
  await until(async () => !(await has('game-finished')), 12);
  await toGames();
  await cam.skip(1);
  cam.clip('4-album');
  await cam.rec(0.4);
  await cam.tap(k.getByTestId('album-open'), { after: 0.3 });
  await until(() => has('album'), 3, 1 / 30);
  await cam.rec(2.6);
  cam.cut();
}

await browser.close();
console.log('клипы:', cam.clips.join(', '));
