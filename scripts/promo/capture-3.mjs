// Ролик №3 «Смотрит часами, а в голове пусто» (этап 48): съёмка урока Зайки на демо-стенде —
// карточки → мультик о том же → вопросы совёнка; у родителя — «Прогресс» и «План».
//
// Стенд: DEMO_CLOCK=1 DEMO_CLAY=<папка> DEMO_NOW=2026-10-25T09:30:00+03:00 (см. docs/promo.md),
// каждый раз свежий — вопросы к мультику съёмка добавляет сама.
// Клипы: OUT/clips/3-*/000001.jpg… и meta.json.
import { Cam, chromium, login, pairUrl, PARENT, phone, posters, standNow } from './recorder.mjs';

const browser = await chromium.launch();
const art = await posters(browser);
if (!art.size) throw new Error('нет заставок видео: задайте DEMO_CLAY');

// ── Вопрос к «Кто живёт в лесу», как его добавил бы родитель (картинки — эмодзи) ──
// Один: порядок вопросов телефон перемешивает, а совёнок в ролике спрашивает именно это.
const kidCtx = await phone(browser, await standNow(), { art, player: true });
await login(kidCtx);
const api = kidCtx.request;
const segments = await (await api.get(`${PARENT}/api/parent/segments`)).json();
const fox = segments.find((s) => s.title === 'Кто живёт в лесу');
const emoji = async (code) =>
  (await (await api.post(`${PARENT}/api/parent/media/emoji`, { data: { code } })).json()).id;
for (const [prompt, options] of [
  [
    'Кто спит зимой?',
    [
      ['1f43b', 'Медведь'],
      ['1f98a', 'Лиса'],
      ['1f989', 'Сова'],
    ],
  ],
]) {
  const res = await api.post(`${PARENT}/api/parent/segments/${fox.id}/questions`, {
    data: {
      prompt,
      lang: 'ru',
      options: await Promise.all(
        options.map(async ([code, label], i) => ({
          imageId: await emoji(code),
          label,
          isCorrect: i === 0,
        })),
      ),
    },
  });
  if (!res.ok()) throw new Error(`вопрос «${prompt}»: ${res.status()}`);
}

// ── Телефон Зайки: урок «Природы» ──
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
const correct = k.locator('[data-testid=quiz-option][data-correct="1"]').first();

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

// 1. «Твои занятия» → «Природа» → карточки
cam.clip('3-lesson');
await cam.rec(1.5);
await cam.tap(k.getByTestId('subject').filter({ hasText: 'Природа' }), { after: 0.6 });
await until(() => has('deck-card'), 5);
await cam.rec(1.4);
for (let i = 0; i < 2; i++) {
  await cam.tap(k.getByTestId('deck-next'), { after: 0.4 });
  await cam.rec(1);
}
cam.cut();

// За кадром: остальные карточки, вопросы к ним и наклейка — до мультика.
for (let i = 0; i < 200 && !(await has('player')); i++) {
  if ((await has('quiz-option')) && (await phase()) === 'answering') await cam.tap(correct);
  else if (await has('deck-next')) await cam.tap(k.getByTestId('deck-next'));
  await cam.skip(2, 500);
  await cam.settle(40);
}
if (!(await until(() => has('pause'), 10))) throw new Error('мультик не начался');
await cam.skip(0.5);

// 2. Мультик «играет»: заставка наплывает
cam.clip('3-video');
await cam.rec(5);
cam.cut();

// За кадром: мультик до конца (3 минуты), звёздочка.
if (!(await until(() => has('quiz-round'), 200, 1))) throw new Error('нет вопросов после мультика');

// 3. Вопрос совёнка: «Кто спит зимой?» — касание правильной
cam.clip('3-quiz');
await until(async () => (await phase()) === 'answering', 8);
await cam.rec(0.6);
await cam.tap(correct, { after: 0.6 });
await cam.rec(2);
cam.cut();

// ── Кабинет родителя: «Прогресс» и «План» ──
const parentCtx = await phone(browser, new Date(cam.now + 2000));
await login(parentCtx);
const p = await parentCtx.newPage();
await p.goto(`${PARENT}/plan`);
await p.getByText('Учебный план').waitFor();
await p.waitForTimeout(1500);
const pc = new Cam(p);
await pc.freeze({ serverClock: true });

// Переход по меню при стоящих часах; страница показывает данные, когда часы идут, — по кадру,
// пока не появятся цифры: досчитывают они уже на съёмке.
await pc.tap(p.getByRole('link', { name: 'Прогресс', exact: true }).last(), { after: 0 });
const stats = p.getByText('верно с первой попытки', { exact: true });
for (let i = 0; i < 100 && !(await stats.isVisible()); i++) {
  await pc.skip(1 / 30);
  await pc.settle(100);
}

/** Где на странице заголовок раздела. */
const top = (text) =>
  p.evaluate((text) => {
    const e = [...document.querySelectorAll('h2, h3, p, div, span')].find(
      (x) => x.childElementCount === 0 && x.textContent.trim() === text,
    );
    return e.getBoundingClientRect().top + document.scrollingElement.scrollTop;
  }, text);

pc.clip('3-progress');
await pc.rec(3);
await pc.scroll((await top('Повторить')) - 180, 1.4);
await pc.rec(3);
pc.cut();

await p.clock.resume();
await p.goto(`${PARENT}/plan?child=${kid.id}`);
await p.getByText('Учебный план').waitFor();
await p.waitForTimeout(1500);
await pc.freeze({ serverClock: true });
pc.clip('3-plan');
await pc.rec(3.5);
pc.cut();

await browser.close();
console.log('клипы:', [...cam.clips, ...pc.clips].join(', '));
