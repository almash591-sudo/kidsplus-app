// Ролик №1 «Мультик на 5 минут» (этап 48): съёмка дня Зайки и «Пульта» на демо-стенде.
//
// Стенд: DEMO_CLOCK=1 DEMO_CLAY=<папка> DEMO_NOW=2026-10-25T09:30:00+03:00 (см. docs/promo.md),
// каждый раз свежий — день Зайки должен начинаться с пустых колец.
// Клипы: OUT/clips/1-*/000001.jpg… и meta.json (кадры, что сказал голос).
import { Cam, chromium, login, pairUrl, PARENT, phone, standNow } from './recorder.mjs';

const LESSON_S = 600;

const browser = await chromium.launch();
const kidCtx = await phone(browser, await standNow());
await login(kidCtx);
const { kid, url } = await pairUrl(kidCtx, 'Зайка');
const k = await kidCtx.newPage();
await k.goto(url);
await k.getByTestId('today').waitFor();
await k.waitForTimeout(1500);
const cam = new Cam(k);
await cam.freeze({ serverClock: true });

const has = (id) =>
  k
    .getByTestId(id)
    .count()
    .then((n) => n > 0);
const phase = () =>
  k
    .getByTestId('quiz-round')
    .getAttribute('data-phase', { timeout: 200 })
    .catch(() => null);

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

/** Ход ребёнка: ответить правильно, листнуть карточку, лопнуть шарик, открыть пару. */
async function move() {
  if ((await has('quiz-option')) && (await phase()) === 'answering')
    return cam.tap(k.locator('[data-testid=quiz-option][data-correct="1"]').first());
  if (await has('deck-next')) return cam.tap(k.getByTestId('deck-next'));
  if (await k.locator('.memory-card').count()) {
    // Номера карт пары — заранее: открытая карта выпадает из «:not(.open)».
    const pair = await k.locator('.memory-card').evaluateAll((els) => {
      const closed = els.flatMap((e, i) => (e.matches('.open, .found') ? [] : [i]));
      const first = closed[0];
      if (first === undefined) return null;
      const mate = closed.find(
        (i) => i !== first && els[i].dataset.pair === els[first].dataset.pair,
      );
      return mate === undefined ? null : [first, mate];
    });
    if (!pair) return;
    const cards = k.locator('.memory-card');
    await cam.tap(cards.nth(pair[0]), { after: 0.3 });
    return cam.tap(cards.nth(pair[1]), { after: 0.6 });
  }
  if (await has('balloon')) {
    // Шарик повыше середины экрана — его лучше видно.
    const boxes = await k.getByTestId('balloon').evaluateAll((els) =>
      els.map((e, i) => {
        const r = e.getBoundingClientRect();
        return { i, y: r.top + r.height / 2 };
      }),
    );
    const best = boxes.filter((b) => b.y > 150 && b.y < 650).sort((a, b) => a.y - b.y)[0];
    if (best) return cam.tap(k.getByTestId('balloon').nth(best.i), { after: 0.4 });
  }
}

/** Пройти занятие без съёмки, пока его время не выйдет и телефон не вернётся на «Сегодня». */
async function playLesson(name) {
  const started = cam.now;
  for (;;) {
    if (await has('today')) return;
    // Игра в уроке не кончается сама — по времени выходим домой, как ребёнок по звонку.
    if ((await has('game')) && cam.now - started > (LESSON_S + 20) * 1000) {
      await cam.tap(k.getByTestId('go-home'));
      await cam.skip(2);
      await cam.settle(400);
      continue;
    }
    await move();
    await cam.skip(2, 500);
    await cam.settle(40);
    if (cam.now - started > 30 * 60_000) throw new Error(`${name}: урок не закончился`);
  }
}

const subject = (title) => k.getByTestId('subject').filter({ hasText: title });
const open = (title) => subject(title).filter({ hasText: /мин/ });

// ── 1. «Твои занятия»: пустые кольца, касание «Природы», первая карточка ──
cam.clip('1-today');
await cam.rec(2.5);
await cam.tap(subject('Природа'), { after: 0.6 });
await until(() => has('deck-card'), 5);
await cam.rec(1.2);

// ── 2. Урок: карточки → вопросы → наклейка ──
cam.clip('1-lesson');
await cam.rec(0.6);
for (let i = 0; i < 6 && !(await has('quiz-option')); i++) {
  await cam.tap(k.getByTestId('deck-next'), { after: 0.4 });
  await cam.rec(0.8);
}
while (await has('quiz-option')) {
  await until(async () => (await phase()) === 'answering', 6);
  await cam.rec(0.5);
  await cam.tap(k.locator('[data-testid=quiz-option][data-correct="1"]').first(), { after: 0.6 });
  await until(async () => !(await has('quiz-option')) || (await phase()) === 'answering', 8);
}
await until(() => has('sticker-award'), 6);
await cam.rec(3.5);
cam.cut();

// ── За кадром: остальное время уроков ──
// Видео на съёмке не грузятся: после двух неудач телефон уводит домой («видео отдыхают»),
// и «Природу» открываем снова — уже с одними карточками.
await playLesson('Природа');
for (let n = 0; n < 6 && (await open('Природа').count()); n++) {
  await cam.tap(open('Природа'));
  await cam.skip(2);
  await playLesson('Природа');
}
await cam.tap(open('Музыка'));
await cam.skip(2);
await playLesson('Музыка');

// Последний урок: снимаем конец — наклейка, «Сегодня» с тремя галочками, совёнок хвалит.
await cam.tap(open('Английский'));
await cam.skip(2);
const started = cam.now;
while (cam.now - started < LESSON_S * 1000 || !(await has('quiz-option'))) {
  if (await has('today')) break;
  await move();
  await cam.skip(2, 500);
  await cam.settle(40);
}
cam.clip('1-done');
for (let i = 0; i < 40 && !(await has('today')); i++) {
  await move();
  await cam.rec(0.6);
}
await until(() => has('free'), 6);
await cam.rec(4);

// ── 3. Свободное время: разделы → игры → игра ──
cam.clip('1-free');
await cam.rec(0.6);
await cam.tap(k.getByTestId('free'), { after: 0.6 });
await until(() => has('category'), 4);
await cam.rec(0.8);
await cam.tap(k.getByTestId('category').filter({ hasText: 'Игры' }), { after: 0.6 });
await until(() => has('tile'), 4);
await cam.rec(0.8);
await cam.tap(k.locator('[data-testid=tile]:not([data-rest])').first(), { after: 0.6 });
await until(() => has('game'), 4);
await cam.rec(1.5);
for (let i = 0; i < 3; i++) {
  await move();
  await cam.rec(0.5);
}
await cam.rec(1);
cam.cut();

// ── За кадром: свободное время (15 мин) подходит к концу ──
await cam.skip(14 * 60 + 20, 1000);
await cam.settle(500);

// ── 4. «На сегодня всё»: время вышло — телефон сам уходит к луне и звёздам ──
cam.clip('1-dayover');
await until(() => has('day-over'), 60, 0.5);
await cam.rec(4);
cam.cut();

// ── 5. Родитель: «Пульт» Зайки — «На сегодня всё», касание «+10» ──
const parentCtx = await phone(browser, new Date(cam.now + 2000));
await login(parentCtx);
const p = await parentCtx.newPage();
await p.goto(`${PARENT}/remote?child=${kid.id}`);
await p.getByTestId('now-hero').waitFor();
await p.waitForTimeout(2500);
const pcam = new Cam(p);
await pcam.freeze({ serverClock: true });
pcam.clip('1-parent');
await pcam.rec(2.5);
await pcam.tap(p.getByTestId('now-hero').getByRole('button', { name: '+10' }), { after: 0.6 });
await pcam.settle(800);
await pcam.rec(2.5);
pcam.cut();

// ── 6. Телефон Зайки: десять минут от мамы ──
await k.waitForTimeout(1500);
cam.clip('1-extra');
await until(() => has('free'), 5);
await cam.rec(3);
cam.cut();

await browser.close();
console.log('готово:', [...cam.clips, ...pcam.clips].join(', '));
