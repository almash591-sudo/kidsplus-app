// Ролик №2 «Алгоритм подсовывает странное» (этап 48): съёмка проверки видео на демо-стенде —
// ссылка → «ИИ смотрит» → отчёт → «Одобрить» → мультик у Зайки; прозвище вместо имени.
//
// Стенд: DEMO_CLOCK=1 DEMO_FREE=1 DEMO_CLAY=<папка> DEMO_NOW=2026-10-25T17:30:00+03:00
// (см. docs/promo.md), каждый раз свежий — ёжик ещё не в очереди.
// Клипы: OUT/clips/2-*/000001.jpg… и meta.json.
import { Cam, chromium, login, pairUrl, PARENT, phone, posters, standNow } from './recorder.mjs';

const browser = await chromium.launch();
const art = await posters(browser);
if (!art.size) throw new Error('нет заставок видео: задайте DEMO_CLAY');

// ── Телефон Зайки: свободное время — только то, что выбрали родители ──
const kidCtx = await phone(browser, await standNow(), { art });
await login(kidCtx);
const { kid, url } = await pairUrl(kidCtx, 'Зайка');
const k = await kidCtx.newPage();
await k.goto(url);
await k.getByTestId('today').waitFor();
await k.waitForTimeout(1500);
const kc = new Cam(k);
await kc.freeze();

kc.clip('2-kid');
await kc.rec(1.2);
await kc.tap(k.getByTestId('free'), { after: 0.8 });
await kc.tap(k.locator('[data-category=video]'), { after: 0.3 });
await k.locator('[data-kind=segment] img').first().waitFor();
await kc.settle(600);
await kc.rec(3);
kc.cut();

// ── Кабинет родителя: проверка нового мультика ──
const parentCtx = await phone(browser, await standNow(), { art, player: true });
await login(parentCtx);
const p = await parentCtx.newPage();
await p.goto(`${PARENT}/content?tab=review`);
await p.getByText('Новых отчётов нет').waitFor();
await p.waitForTimeout(800);
const pc = new Cam(p);
// Часы стенда идут за часами страницы: «ИИ» отвечает через 6 секунд стенда.
await pc.freeze({ serverClock: true });

pc.clip('2-add');
await pc.rec(0.8);
await pc.tap(p.getByLabel('Ссылка YouTube'), { after: 0.3 });
await pc.type('youtu.be/demohedge01', 20);
await pc.rec(0.4);
await pc.tap(p.getByRole('button', { name: 'Добавить' }), { after: 0.2 });
await p.getByText('ИИ смотрит видео · 1').waitFor();
await pc.settle(300);
await pc.rec(2.5);
pc.cut();

// За кадром: «ИИ смотрит» (6 с стенда), список перечитывается раз в 20 с.
for (let i = 0; i < 40 && !(await p.getByTestId('review-card').count()); i++) {
  await pc.skip(1);
  await pc.settle(300);
}
await p.locator('[data-testid=review-card] img').evaluate((i) => i.decode());
await pc.skip(1);

pc.clip('2-card');
await pc.rec(2.2);
await pc.tap(p.getByRole('link', { name: 'Посмотреть' }), { after: 0.2 });
await p.getByText('Фрагменты и вопросы').waitFor();
await p.locator('img[src^="/api/media/"]').first().waitFor();
await pc.settle(800);
await pc.rec(1.6);
pc.cut();

/** Где на странице текст или поле с таким значением (вопросы — в полях ввода). */
const top = (text) =>
  p.evaluate((text) => {
    const all = [...document.querySelectorAll('td, p, input')];
    const e = all.find((x) => (x.tagName === 'INPUT' ? x.value : x.textContent) === text);
    return e.getBoundingClientRect().top + document.scrollingElement.scrollTop;
  }, text);
pc.clip('2-report');
await pc.rec(0.3);
await pc.scroll((await top('2-3 лет')) - 260, 1.2);
await pc.rec(2.4);
await pc.scroll((await top('Где ёжик?')) - 120, 1.6);
await pc.rec(3);
pc.cut();

await p.goBack();
await p.getByTestId('quick-approve').waitFor();
await pc.settle(600);
await pc.skip(0.5);
pc.clip('2-approve');
await pc.rec(1);
await pc.tap(p.getByTestId('quick-approve'), { after: 0.2 });
await p.getByText(/Одобрено/).waitFor();
await pc.settle(300);
await pc.rec(2.4);
pc.cut();

// Профиль: прозвище вместо имени. При загрузке страницы часы идут, потом — снова пауза.
await p.clock.resume();
await p.goto(`${PARENT}/child/${kid.id}`);
await p.getByTestId('preview-child').waitFor();
await p.waitForTimeout(1200);
await pc.freeze({ serverClock: true });
pc.clip('2-nickname');
await pc.rec(1);
await pc.tap(p.getByRole('button', { name: 'Изменить' }), { after: 0.3 });
await p.getByText('Не настоящее имя').waitFor();
await pc.settle(300);
await pc.rec(3);
pc.cut();

// ── Телефон Зайки: ёжик появился ──
// Список телефон перечитывает при запуске; после перезагрузки часы страницы — снова на паузу.
await k.clock.resume();
await k.goto(new URL(url).origin);
await k.getByTestId('today').waitFor();
await k.waitForTimeout(1500);
await kc.freeze();
kc.clip('2-kid-new');
await kc.rec(0.6);
await kc.tap(k.getByTestId('free'), { after: 0.8 });
await kc.tap(k.locator('[data-category=video]'), { after: 0.3 });
await k.locator('[data-kind=segment] img').first().waitFor();
await kc.settle(600);
await kc.rec(3.5);
kc.cut();

await browser.close();
console.log('клипы:', [...kc.clips, ...pc.clips].join(', '));
