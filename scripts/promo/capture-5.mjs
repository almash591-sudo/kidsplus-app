// Ролик №5 «Вы на работе» (этап 48): «Пульт» мамы и телефон Зайки рядом. Зайка на уроке, мама
// видит это в «Пульте», листает день и журнал, зовёт и выключает экран на обед.
//
// Стенд: DEMO_CLOCK=1 DEMO_NOW=2026-10-27T13:10:00+03:00 DEMO_CLAY=<папка> (см. docs/promo.md),
// каждый раз свежий — вопросы к мультику съёмка добавляет сама. Клипы: OUT/clips/5-*/000001.jpg… и meta.json.
import { Cam, chromium, login, pairUrl, PARENT, phone, posters, standNow } from './recorder.mjs';

const BEAT_SEC = 15;

const browser = await chromium.launch();
const art = await posters(browser);
if (!art.size) throw new Error('нет заставок видео: задайте DEMO_CLAY');
const kidCtx = await phone(browser, await standNow(), { art, player: true });
await login(kidCtx);
// Вопросы к мультику о цветах (на стенде их нет) — чтобы в журнале было «Ответил на вопросы».
const api = kidCtx.request;
const segments = await (await api.get(`${PARENT}/api/parent/segments`)).json();
const colors = segments.find((x) => x.title === 'Colors song for kids');
const emoji = async (code) =>
  (await (await api.post(`${PARENT}/api/parent/media/emoji`, { data: { code } })).json()).id;
for (const [prompt, options] of [
  [
    'Что красное?',
    [
      ['1f34e', 'Яблоко'],
      ['1f34c', 'Банан'],
      ['1f966', 'Брокколи'],
    ],
  ],
  [
    'Кто зелёный?',
    [
      ['1f438', 'Лягушка'],
      ['1f955', 'Морковка'],
      ['1f352', 'Вишня'],
    ],
  ],
]) {
  const res = await api.post(`${PARENT}/api/parent/segments/${colors.id}/questions`, {
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

const { kid, url } = await pairUrl(kidCtx, 'Зайка');
const k = await kidCtx.newPage();
// Сигналы телефона серверу (раз в 15 с по часам страницы): с ответом на сигнал телефон узнаёт,
// что мама позвала или выключила экран.
let beats = 0;
k.on('request', (r) => {
  if (r.url().includes('/kid/heartbeat')) beats++;
});
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

/** Снимать (или мотать) кусками, пока не выполнится условие. */
async function until(c, check, maxSec, chunk = 0.2) {
  for (let t = 0; t < maxSec; t += chunk) {
    if (await check()) return true;
    if (c.dir) await c.rec(chunk);
    else await c.skip(chunk, 100);
    await c.settle(30);
  }
  return false;
}

/** За кадром: телефон отправил сигнал и до следующего осталось lead секунд. */
async function beforeBeat(lead = 1) {
  const was = beats;
  for (let i = 0; i < BEAT_SEC * 4 && beats === was; i++) {
    await cam.skip(0.25, 250);
    await cam.settle(30);
  }
  if (beats === was) throw new Error('телефон не шлёт сигналы');
  await cam.settle(300);
  await cam.skip(BEAT_SEC - lead);
}

// ── 1. Телефон Зайки: урок английского ──
// За кадром: мультик о цветах, вопросы совёнка — в журнале мамы будут «Досмотрел видео» и
// «Ответил на вопросы». В кадре — следующая часть урока, карточки «Фрукты».
await cam.tap(k.getByTestId('subject').filter({ hasText: 'Английский' }), { after: 1 });
const correct = k.locator('[data-testid=quiz-option][data-correct="1"]').first();
const answering = () =>
  k
    .getByTestId('quiz-round')
    .getAttribute('data-phase', { timeout: 200 })
    .then((x) => x === 'answering')
    .catch(() => false);
for (let i = 0; i < 200 && !(await has('deck-card')); i++) {
  if ((await has('quiz-option')) && (await answering())) await cam.tap(correct);
  await cam.skip(2, 500);
  await cam.settle(40);
}
if (!(await has('deck-card'))) throw new Error('после вопросов нет карточек');
await cam.skip(1.5);

cam.clip('5-kid');
await cam.rec(1.5);
for (let i = 0; i < 3; i++) {
  await cam.tap(k.getByTestId('deck-next'), { after: 0.4 });
  await cam.rec(1.1);
}
cam.cut();
// Сервер должен узнать, что Зайка на уроке, — до того как мама откроет «Пульт».
await beforeBeat(BEAT_SEC - 1);

// ── 2. «Пульт» мамы: что делает Зайка сейчас (карточки урока), день по порядку, журнал ──
const parentCtx = await phone(browser, new Date(cam.now + 1000));
await login(parentCtx);
const p = await parentCtx.newPage();
await p.goto(`${PARENT}/remote?child=${kid.id}`);
await p.getByTestId('hero-status').filter({ hasText: 'Английский' }).waitFor();
await p
  .getByTestId('activity-log')
  .getByText(/Ответил на вопросы/)
  .first()
  .waitFor();
await p.waitForTimeout(1500);
const pc = new Cam(p);
await pc.freeze({ serverClock: true });

/** Где на странице элемент (px от верха документа). */
const top = (locator) =>
  locator.evaluate((e) => e.getBoundingClientRect().top + document.scrollingElement.scrollTop);

pc.clip('5-remote');
await pc.rec(3);
await pc.scroll((await top(p.getByTestId('dayline'))) - 160, 1.2);
await pc.rec(1.6);
await pc.scroll((await top(p.getByTestId('activity-log'))) - 120, 1);
await pc.rec(2);
await pc.scroll((await top(p.getByTestId('remote-actions'))) - 260, 1);
await pc.rec(0.6);
pc.cut();

// ── 3. «Позвать»: у мамы — касание, у Зайки — «Тебя зовут!» ──
await beforeBeat(1.2);
pc.clip('5-call');
await pc.rec(0.4);
await pc.tap(p.getByTestId('call-kid'), { after: 1.6 });
pc.cut();

cam.clip('5-called');
if (!(await until(cam, () => has('called'), 4)))
  throw new Error('телефон не показал «Тебя зовут!»');
await cam.rec(3.5);
cam.cut();
// За кадром: Зайка коснулась — снова карточки.
await cam.tap(k.getByTestId('called'), { after: 1 });

// ── 4. «Пора кушать»: мама выключает экран, у Зайки — совёнок с тарелкой ──
await beforeBeat(1.2);
pc.clip('5-rest');
await pc.scroll((await top(p.getByTestId('screen-controls'))) - 300, 0.8);
await pc.rec(0.3);
await pc.tap(p.getByTestId('rest-eat'), { after: 1.8 });
pc.cut();

cam.clip('5-kid-rest');
if (!(await until(cam, () => has('rest'), 4))) throw new Error('экран не выключился');
await cam.rec(5);
cam.cut();

await browser.close();
console.log('клипы:', [...cam.clips, ...pc.clips].join(', '));
