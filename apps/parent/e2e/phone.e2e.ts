// Кабинет на телефоне (этап 24). На iPhone страница «уезжала»: Safari приближал её при касании
// поля со шрифтом меньше 16px, а в открытом окне отдалить было нельзя — кнопки оставались за краем.
import { expect, test, type Page } from '@playwright/test';

const EMAIL = 'demo@example.com';
const PASSWORD = 'demo-password-123';

const PAGES = [
  '/home',
  '/content',
  '/content?tab=videos',
  '/content?tab=decks',
  '/content?tab=games',
  '/content?tab=audio',
  '/plan',
  '/routine',
  '/routine?tab=plan',
  '/routine?tab=habits',
  '/routine?tab=sleep',
  '/progress',
  '/more',
  '/children',
  '/devices',
  '/account',
  '/mom-voice',
  '/captures',
  '/calls',
  '/now',
  '/routine?child=x',
  '/habits',
  '/sleep',
  '/families',
];

async function login(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(EMAIL);
  await page.getByLabel('Пароль').fill(PASSWORD);
  await page.getByRole('button', { name: 'Войти' }).click();
  await expect(page).toHaveURL(/\/home/);
}

/** Ширина страницы не больше экрана, поля ввода — не мельче 16px (иначе iPhone приближает). */
async function layoutProblems(page: Page) {
  return page.evaluate(() => {
    const problems: string[] = [];
    const w = window.innerWidth;
    if (document.documentElement.scrollWidth > w + 1)
      problems.push(`ширина ${document.documentElement.scrollWidth} > ${w}`);
    for (const el of document.querySelectorAll('input, textarea, select')) {
      const input = el as HTMLInputElement;
      if (['hidden', 'checkbox', 'radio', 'range', 'file'].includes(input.type)) continue;
      const fz = parseFloat(getComputedStyle(input).fontSize);
      if (fz < 16) problems.push(`поле ${input.type || el.tagName}: ${fz}px`);
    }
    for (const el of document.querySelectorAll('button, a[href], [role=tab], label')) {
      const r = el.getBoundingClientRect();
      // Чипы фильтров — строка с прокруткой вбок, так задумано.
      const clipped = el.closest(
        '.mantine-SegmentedControl-root, .photo-strip, .tabbar, .chip-row, .kid-switch',
      );
      if (r.width > 0 && r.right > w + 1 && !clipped)
        problems.push(
          `за краем: ${(el.textContent ?? '').trim().slice(0, 30)} (${Math.round(r.right)})`,
        );
    }
    return [...new Set(problems)];
  });
}

test('вход и все разделы помещаются в экран', async ({ page }) => {
  await login(page);
  for (const url of PAGES) {
    await page.goto(url);
    await page.waitForLoadState('networkidle');
    await expect(page.getByText('Unexpected Application Error')).toHaveCount(0);
    expect(await layoutProblems(page), url).toEqual([]);
  }
});

test('страница приглашения: поля не мельче 16px', async ({ page }) => {
  await page.goto('/invite?token=x');
  await expect(page.getByRole('button', { name: 'Создать аккаунт' })).toBeVisible();
  expect(await layoutProblems(page)).toEqual([]);
});

test('окно «Новый профиль» — шторка в пределах экрана, «Сохранить» доступна', async ({ page }) => {
  await login(page);
  await page.goto('/children');
  await page.getByRole('button', { name: 'Добавить ребёнка' }).click();
  const sheet = page.locator('.mantine-Modal-content');
  await expect(sheet).toBeVisible();
  await page.waitForTimeout(600); // анимация появления
  const box = (await sheet.boundingBox())!;
  const vp = page.viewportSize()!;
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(vp.height + 1);
  expect(await layoutProblems(page)).toEqual([]);

  await page.getByLabel('Прозвище').fill('Солнышко');
  const save = sheet.getByRole('button', { name: 'Сохранить' });
  await save.scrollIntoViewIfNeeded();
  await expect(save).toBeInViewport();
  await save.click();
  await expect(sheet).toBeHidden();
  await expect(page.getByText('Солнышко').first()).toBeVisible();
});

test('все вкладки «Контента» можно нажать', async ({ page }) => {
  await login(page);
  await page.goto('/content');
  for (const name of ['Видео', 'Карточки', 'Игры', 'Аудио']) {
    const tab = page.locator('.mantine-SegmentedControl-label', { hasText: name });
    await tab.scrollIntoViewIfNeeded();
    await tab.click();
    await expect(page).toHaveURL(new RegExp(`tab=`));
  }
});

test('массовые действия (этап 33): выбрать все видео, убрать у ребёнка, отменить', async ({
  page,
}) => {
  await login(page);
  await page.goto('/content?tab=videos');
  const chips = page.getByTestId('owner-chips');
  await chips.getByRole('button', { name: /^Есть у Зайки/ }).click();
  await page.getByTestId('bulk-select').click();
  await page.getByRole('button', { name: 'Выбрать все' }).click();
  const bar = page.getByTestId('bulk-bar');
  await expect(bar).toContainText('видео');
  expect(await layoutProblems(page)).toEqual([]);
  if (process.env.SHOTS)
    await page.screenshot({ path: `${process.env.SHOTS}/bulk-${test.info().project.name}.png` });
  await bar.getByRole('button', { name: 'Зайка' }).click();
  await page.getByRole('menuitem', { name: 'Убрать у Зайки' }).click();
  await expect(page.getByText(/Зайка: убрано \d+ видео/)).toBeVisible();
  await expect(chips.getByRole('button', { name: /^Нет у Зайки · \d+/ })).toBeVisible();
  // Передумали — всё вернулось.
  await page.getByRole('button', { name: 'Отменить' }).click();
  await expect(chips.getByRole('button', { name: /^Нет у Зайки/ })).toHaveCount(0);

  // Имя у набора карточек: касание — скрыть у ребёнка, ещё раз — вернуть.
  await page.goto('/content?tab=decks');
  const pill = page.locator('.row-pills').first().getByRole('button', { name: /Зайка/ });
  await expect(pill).toHaveAttribute('aria-pressed', 'true');
  await pill.click();
  await expect(pill).toHaveAttribute('aria-pressed', 'false');
  await pill.click();
  await expect(pill).toHaveAttribute('aria-pressed', 'true');
});

test('кабинет вокруг ребёнка (этап 33): переключатель, «что доступно», страница ребёнка', async ({
  page,
}) => {
  await login(page);
  const sw = page.getByTestId('kid-switch');
  await sw.getByRole('tab', { name: /Зайка/ }).click();
  await expect(page.getByTestId('kid-card')).toHaveCount(1);
  const lib = page.getByTestId('library');
  await expect(lib).toContainText('Что доступно: Зайка');
  await expect(page.getByTestId('library-videos')).toHaveText(/\d+/);
  expect(await layoutProblems(page)).toEqual([]);
  if (process.env.SHOTS)
    await page.screenshot({ path: `${process.env.SHOTS}/home33-${test.info().project.name}.png` });

  // Видео ребёнка — «Контент» уже с фильтром «Есть у Зайки».
  await lib.getByRole('link', { name: /Видео/ }).click();
  await expect(page).toHaveURL(/tab=videos&owner=/);
  await expect(
    page.getByTestId('owner-chips').getByRole('button', { name: /^Есть у Зайки/ }),
  ).toHaveClass(/on/);

  // Строка ребёнка — его «Распорядок» с карточкой «Сейчас»; оттуда — профиль. Выбор общий.
  await page.goto('/home');
  await page.getByRole('button', { name: 'Открыть: Зайка' }).click();
  await expect(page).toHaveURL(/\/routine\?child=/);
  await expect(page.getByTestId('now-hero')).toBeVisible();
  await page.getByRole('link', { name: 'Профиль ›' }).click();
  await expect(page.getByTestId('child-page')).toContainText('Зайка');
  expect(await layoutProblems(page)).toEqual([]);
  await page.getByRole('button', { name: /Всё, что есть у Мишутки/ }).click();
  await expect(page.getByText(/Зайка: добавлено|У Зайки уже есть/)).toBeVisible();
  await page.getByRole('link', { name: /Привычки и награды/ }).click();
  await expect(page).toHaveURL(/\/routine\?tab=habits/);
  await expect(page.getByRole('tab', { name: 'Зайка' })).toHaveAttribute('aria-selected', 'true');

  // «Распорядок» → «День»: лента по порядку; касание строки урока — вкладка «План».
  await page.goto('/routine');
  const day = page.getByTestId('dayline');
  await expect(day).toBeVisible();
  expect(await layoutProblems(page)).toEqual([]);
  if (process.env.SHOTS)
    await page.screenshot({ path: `${process.env.SHOTS}/routine-${test.info().project.name}.png` });
  await day.locator('[data-state]').first().click();
  await expect(page).toHaveURL(/tab=(plan|habits|sleep)/);

  // «Все» — снова карточки всех детей.
  await page.goto('/home');
  await sw.getByRole('tab', { name: 'Все' }).click();
  await expect(page.getByTestId('kid-card').nth(1)).toBeVisible();
});

test('«Распорядок» — пульт ребёнка (этап 40): карточка «Сейчас», шторка, «Глазами ребёнка»', async ({
  page,
}) => {
  await login(page);
  await expect(page.getByTestId('kid-card').first()).toBeVisible();
  if (process.env.SHOTS)
    await page.screenshot({ path: `${process.env.SHOTS}/home40-${test.info().project.name}.png` });
  await page.goto('/routine');
  const hero = page.getByTestId('now-hero');
  await expect(hero).toBeVisible();
  await expect(page.getByTestId('preview-child')).toBeVisible();
  expect(await layoutProblems(page)).toEqual([]);
  if (process.env.SHOTS) {
    await page.waitForTimeout(1000); // кольца дорисовываются
    await page.screenshot({
      path: `${process.env.SHOTS}/routine40-${test.info().project.name}.png`,
      fullPage: true,
    });
  }

  // Переключатель детей — карточка другого ребёнка.
  const first = await hero.getAttribute('data-child');
  await page.getByRole('tablist', { name: 'Ребёнок' }).getByRole('tab').nth(1).click();
  await expect(hero).not.toHaveAttribute('data-child', first!);

  // «Пульт» — шторка: поводы выключить экран, «Позвать», радионяня.
  await page.getByTestId('open-remote').click();
  const sheet = page.getByTestId('remote-sheet');
  await expect(sheet.getByTestId('call-kid')).toBeVisible();
  await expect(sheet.getByTestId('monitor-switch')).toBeAttached();
  expect(await layoutProblems(page)).toEqual([]);
  if (process.env.SHOTS) {
    await page.waitForTimeout(500); // шторка доезжает
    await page.screenshot({
      path: `${process.env.SHOTS}/remote40-${test.info().project.name}.png`,
    });
  }
  await sheet.getByTestId('rest-eat').click();
  await expect(hero).toContainText('Экран выключен');
  await page.keyboard.press('Escape');
  await hero.getByRole('button', { name: 'Включить' }).click();
  await expect(hero).not.toContainText('Экран выключен');

  // Старый адрес из push «шумно» — сразу пульт этого ребёнка.
  await page.goto(`/now?listen=${first}`);
  await expect(page).toHaveURL(/\/routine\?listen=/);
  await expect(page.getByTestId('remote-sheet')).toBeVisible();
  await expect(page.getByTestId('now-hero')).toHaveAttribute('data-child', first!);
});

test('поиск по названию в играх (этап 33)', async ({ page }) => {
  await login(page);
  await page.goto('/content?tab=games');
  await expect(page.getByText('Найди пару').first()).toBeVisible();
  await page.getByRole('textbox', { name: 'Поиск' }).fill('ягод');
  await expect(page.getByText('Посчитай ягодки').first()).toBeVisible();
  await expect(page.getByText('Найди пару')).toHaveCount(0);
  await expect(page.getByText('Показано: 1')).toBeVisible();
});

test('привычки: готовое и своё дело, отметка за ребёнка, награда за звёзды', async ({ page }) => {
  await login(page);
  await page.goto('/habits');
  await page.getByTestId('preset-teeth').click();
  await expect(page.getByTestId('habit-row')).toHaveCount(1);
  await page.getByTestId('habit-title').fill('Покормить рыбок');
  await page.getByTestId('habit-add').click();
  await expect(page.getByTestId('habit-row')).toHaveCount(2);

  // Ребёнок забыл нажать — родитель ставит отметку: звёздочка в копилке.
  const today = page.getByTestId('habit-row').first().getByTestId('mark').last();
  await today.click();
  await expect(today).toHaveAttribute('data-on', '1');
  await expect(page.getByTestId('stars')).toContainText('1');

  await page.getByTestId('reward-title').fill('Поход в кафе');
  await page.getByTestId('reward-add').click();
  const reward = page.getByTestId('reward').filter({ hasText: 'Поход в кафе' });
  await expect(reward.getByTestId('grant')).toBeDisabled(); // 5 звёзд, а есть 1
  expect(await layoutProblems(page)).toEqual([]);

  // Уборка за собой: стенд общий для тестов.
  await today.click();
  await expect(page.getByTestId('stars')).toContainText('0');
  while ((await page.getByTestId('habit-row').count()) > 0) {
    const n = await page.getByTestId('habit-row').count();
    await page.getByRole('button', { name: 'Удалить дело' }).first().click();
    await expect(page.getByTestId('habit-row')).toHaveCount(n - 1);
  }
  await reward.getByRole('button', { name: 'Удалить награду' }).click();
  await expect(reward).toHaveCount(0);
});

test('сон: отбой и готовая сказка; придуманная ждёт одобрения', async ({ page }) => {
  await login(page);
  await page.goto('/sleep');
  await page.getByTestId('sleep-enabled').click();
  await page.getByTestId('sleep-at').fill('20:45');
  await page.getByTestId('sleep-save').click();
  await expect(page.getByTestId('sleep-save')).toBeDisabled();

  await page.getByTestId('library-hedgehog-dark').getByRole('button', { name: 'Добавить' }).click();
  const story = page.getByTestId('story').filter({ hasText: 'Ёжик и тёплая темнота' });
  await expect(story).toHaveAttribute('data-status', 'approved');
  await expect(page.getByTestId('library-hedgehog-dark')).toHaveCount(0);

  await page.getByTestId('story-theme').fill('про первый снег');
  await page.getByTestId('story-order').click();
  const ordered = page.getByTestId('story').filter({ hasText: 'про первый снег' });
  // Модели на стенде нет — заявка ждёт; ребёнку она не попадёт.
  await expect(ordered).toHaveAttribute('data-status', 'queued');
  expect(await layoutProblems(page)).toEqual([]);

  // Уборка за собой: стенд общий для тестов.
  for (const s of [ordered, story]) {
    await s.getByTestId('story-delete').click();
    await expect(s).toHaveCount(0);
  }
  await page.getByTestId('sleep-enabled').click();
  await page.getByTestId('sleep-save').click();
  await expect(page.getByTestId('sleep-save')).toBeDisabled();
});
