// Лендинг (apps/landing, этап 24; /start и /guide на домене кабинета) на телефонах: без ошибок и горизонтальной прокрутки,
// карточки переворачиваются (в Safari — без «зеркальной» обратной стороны), детское демо отвечает.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

test('лендинг помещается в экран и работает без ошибок', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto('/start');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('можно доверить');

  // Пролистать всю страницу — появляются все блоки, картинки грузятся.
  const height = await page.evaluate(() => document.body.scrollHeight);
  for (let y = 0; y < height; y += 700) {
    await page.evaluate((y) => window.scrollTo(0, y), y);
    await page.waitForTimeout(60);
  }
  const width = await page.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
  expect(width[0]).toBeLessThanOrEqual(width[1]! + 1);

  // Карточка «боли»: после касания видна только сторона с решением.
  const card = page.locator('.pcard').first();
  await card.scrollIntoViewIfNeeded();
  await card.click();
  await page.waitForTimeout(900);
  const opacity = await card.evaluate((c) => [
    getComputedStyle(c.querySelector('.front')!).opacity,
    getComputedStyle(c.querySelector('.back')!).opacity,
  ]);
  expect(opacity).toEqual(['0', '1']);

  // Детское демо: верный ответ — звёздочка.
  await page.locator('#kidPicks [data-go=quiz]').click();
  const right = page.locator('#kqOpts button[data-e="🦊"]');
  await right.click();
  await expect(right).toHaveClass(/good/);
  await expect(page.locator('#kStars')).toContainText('★');

  expect(errors).toEqual([]);
});

test('совёнок говорит готовой озвучкой, у каждой фразы есть файл', async ({ page }) => {
  // phrases.json ↔ файлы MP3: нет пропущенных и лишних.
  execFileSync(process.execPath, [
    fileURLToPath(new URL('../../../scripts/landing-voice.mjs', import.meta.url)),
    '--check',
  ]);

  const voice: [string, number][] = [];
  page.on(
    'response',
    (r) => r.url().includes('/landing-voice/') && voice.push([r.url(), r.status()]),
  );
  await page.goto('/start');
  await page.locator('#kidsSound').click();
  await page.locator('#kidPicks [data-go=quiz]').click();
  await page.locator('#kidPicks [data-go=cards]').click();
  await page.locator('#kcard').click();
  // Фразы экрана грузятся всегда; в WebKit для Windows (CI) нет Web Audio — там дальше голос браузера.
  await expect.poll(() => voice.length).toBeGreaterThan(2);
  expect(voice.filter(([, s]) => s !== 200)).toEqual([]);
});

test('инструкция: переключатель iPhone / Android', async ({ page }) => {
  await page.goto('/guide');
  await page.getByRole('tab', { name: 'У меня iPhone' }).click();
  await expect(page.getByText('В Safari нажмите кнопку').first()).toBeVisible();
  await page.getByRole('tab', { name: 'У меня Android' }).click();
  await expect(page.getByText('В Chrome нажмите меню').first()).toBeVisible();
  await expect(page.getByText('В Safari нажмите кнопку').first()).toBeHidden();
});

test('«Войти» с лендинга ведёт в кабинет', async ({ page }) => {
  await page.goto('/guide');
  await page.getByRole('link', { name: 'Войти', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('button', { name: 'Войти' })).toBeVisible();
});
