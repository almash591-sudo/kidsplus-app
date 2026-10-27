// Кабинет на телефоне (этап 24). На iPhone страница «уезжала»: Safari приближал её при касании
// поля со шрифтом меньше 16px, а в открытом окне отдалить было нельзя — кнопки оставались за краем.
import { expect, test, type Page } from '@playwright/test';

const EMAIL = 'demo@example.com';
const PASSWORD = 'demo-password-123';

const PAGES = [
  '/remote',
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
  await expect(page).toHaveURL(/\/remote/);
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
  // «Все» — по строке на ребёнка; касание строки — пульт этого ребёнка (этап 47).
  await expect(page.getByTestId('kid-card').nth(1)).toBeVisible();
  await page.getByRole('button', { name: 'Открыть: Зайка' }).click();
  await expect(page).toHaveURL(/\/remote/);
  await expect(page.getByTestId('kid-remote')).toBeVisible();
  await expect(sw.getByRole('tab', { name: /Зайка/ })).toHaveAttribute('aria-selected', 'true');
  const lib = page.getByTestId('library');
  await expect(lib).toContainText('Что доступно: Зайка');
  await expect(page.getByTestId('library-videos')).toHaveText(/\d+/);
  expect(await layoutProblems(page)).toEqual([]);

  // Видео ребёнка — «Контент» уже с фильтром «Есть у Зайки».
  await lib.getByRole('link', { name: /Видео/ }).click();
  await expect(page).toHaveURL(/tab=videos&owner=/);
  await expect(
    page.getByTestId('owner-chips').getByRole('button', { name: /^Есть у Зайки/ }),
  ).toHaveClass(/on/);

  // Из пульта — профиль: там «Глазами ребёнка» крупной кнопкой. Выбор ребёнка общий.
  await page.goto('/remote');
  await page.getByTestId('now-hero').getByRole('link', { name: 'Профиль ›' }).click();
  const child = page.getByTestId('child-page');
  await expect(child).toContainText('Зайка');
  await expect(child.getByTestId('preview-child')).toHaveText(/Глазами ребёнка/);
  expect(await layoutProblems(page)).toEqual([]);
  await page.getByRole('button', { name: /Всё, что есть у Мишутки/ }).click();
  await expect(page.getByText(/Зайка: добавлено|У Зайки уже есть/)).toBeVisible();
  await page.getByRole('link', { name: /Привычки и награды/ }).click();
  await expect(page).toHaveURL(/\/routine\?tab=habits/);
  await expect(page.getByRole('tab', { name: 'Зайка' })).toHaveAttribute('aria-selected', 'true');

  // Пульт: лента дня по порядку; касание строки — её вкладка в «Распорядке».
  await page.goto('/remote');
  const day = page.getByTestId('dayline');
  await expect(day).toBeVisible();
  await day.locator('[data-state]').first().click();
  await expect(page).toHaveURL(/\/routine\?tab=(plan|habits|sleep)/);

  // «Все» — снова строки всех детей.
  await page.goto('/remote');
  await sw.getByRole('tab', { name: 'Все' }).click();
  await expect(page.getByTestId('kid-card').nth(1)).toBeVisible();
});

test('«Пульт» (этап 47): всё на виду — звонок, «Позвать», «Слушать», «Глазами ребёнка»', async ({
  page,
}) => {
  await login(page);
  await expect(page.getByTestId('kid-card').first()).toBeVisible();
  expect(await layoutProblems(page)).toEqual([]);
  if (process.env.SHOTS)
    await page.screenshot({
      path: `${process.env.SHOTS}/remote-all-${test.info().project.name}.png`,
    });

  // Выбран ребёнок — его пульт целиком, без шторки.
  const sw = page.getByTestId('kid-switch');
  await sw.getByRole('tab').nth(1).click();
  const hero = page.getByTestId('now-hero');
  await expect(hero).toBeVisible();
  const actions = page.getByTestId('remote-actions');
  for (const id of ['call-video', 'call-kid', 'monitor-listen', 'preview-child'])
    await expect(actions.getByTestId(id)).toBeVisible();
  await expect(actions.getByTestId('preview-child')).toContainText('Глазами ребёнка');
  await expect(page.getByTestId('rest-eat')).toBeVisible();
  await expect(page.getByTestId('volume')).toBeVisible();
  await expect(page.getByTestId('monitor-switch')).toBeAttached();
  await expect(page.getByTestId('dayline')).toBeVisible();
  await expect(page.getByTestId('activity-log')).toBeVisible();
  await expect(page.getByTestId('remote-settings')).toContainText('План дня');
  expect(await layoutProblems(page)).toEqual([]);
  if (process.env.SHOTS) {
    await page.waitForTimeout(1000); // кольца дорисовываются
    await page.screenshot({
      path: `${process.env.SHOTS}/remote-kid-${test.info().project.name}.png`,
      fullPage: true,
    });
  }

  // «Глазами ребёнка» — детское приложение этого ребёнка в отдельном окне: окно уходит на привязку
  // по коду. Ждём сам запрос, а не загрузку: WebKit на Linux идёт на localhost по IPv6, а стенд
  // слушает только 127.0.0.1.
  const paired = page.context().waitForEvent('request', (r) => r.url().includes('/pair?code='));
  const [popup] = await Promise.all([
    page.waitForEvent('popup'),
    actions.getByTestId('preview-child').click(),
  ]);
  await paired;
  await popup.close();

  // Переключатель — пульт другого ребёнка.
  const first = await hero.getAttribute('data-child');
  await sw.getByRole('tab').nth(2).click();
  await expect(hero).not.toHaveAttribute('data-child', first!);

  // «Позвать» — на телефоне «Мама зовёт!», здесь подтверждение.
  await actions.getByTestId('call-kid').click();
  await expect(page.getByText(/на телефоне «Мама зовёт!»/)).toBeVisible();

  // Выключить экран с поводом — прямо в пульте; включить обратно.
  await page.getByTestId('rest-eat').click();
  await expect(hero).toContainText('Экран выключен');
  await hero.getByRole('button', { name: 'Включить' }).click();
  await expect(hero).not.toContainText('Экран выключен');

  // Старые адреса из push — пульт нужного ребёнка; из «шумно» — «Слушать» подсвечена.
  for (const old of [`/now?listen=${first}`, `/routine?listen=${first}`]) {
    await page.goto(old);
    await expect(page).toHaveURL(`/remote?listen=${first}`);
    await expect(hero).toHaveAttribute('data-child', first!);
    await expect(actions.getByTestId('monitor-listen')).toHaveClass(/accent/);
  }
  await page.goto(`/routine?child=${first}`);
  await expect(page).toHaveURL(`/remote?child=${first}`);
  await expect(hero).toHaveAttribute('data-child', first!);
  await page.goto('/home');
  await expect(page).toHaveURL('/remote');
  // «Распорядок» — только «План», «Привычки», «Сон».
  await page.goto('/routine');
  await expect(page).toHaveURL('/routine');
  await expect(page.getByText('Сегодня, по порядку')).toHaveCount(0);
  await expect(page.locator('.mantine-SegmentedControl-root').first()).toHaveText(
    /^План.*Привычки.*Сон$/,
  );
});

test('перерыв для глаз (этап 50): включить в профиле; ребёнок просит ещё — ответ в «Пульте»', async ({
  page,
  playwright,
}) => {
  await login(page);
  await page.goto('/children');
  await page.getByRole('button', { name: 'Добавить ребёнка' }).click();
  const sheet = page.locator('.mantine-Modal-content');
  await page.getByLabel('Прозвище').fill('Бельчонок');
  await sheet.getByLabel('Перерыв для глаз').check();
  await expect(sheet.getByTestId('eye-break-settings')).toContainText('Минут у экрана');
  expect(await layoutProblems(page)).toEqual([]);
  const save = sheet.getByRole('button', { name: 'Сохранить' });
  await save.scrollIntoViewIfNeeded();
  await save.click();
  await expect(sheet).toBeHidden();
  const kids = (await (await page.request.get('/api/parent/children')).json()) as {
    id: string;
    nickname: string;
    eyeBreakEvery: number | null;
    eyeBreakRest: number;
  }[];
  const kid = kids.find((k) => k.nickname === 'Бельчонок')!;
  expect(kid).toMatchObject({ eyeBreakEvery: 15, eyeBreakRest: 15 });

  // Телефон ребёнка: привязан по коду, 15 минут прошли — перерыв, ребёнок просит ещё.
  const { code } = (await (
    await page.request.post('/api/parent/pairings', {
      data: { childId: kid.id, deviceName: 'Телефон Бельчонка' },
    })
  ).json()) as { code: string };
  const phone = await playwright.request.newContext({ baseURL: test.info().project.use.baseURL });
  expect((await phone.post('/api/kid/pair', { data: { code } })).status()).toBe(204);
  expect((await phone.post('/api/kid/eye-break', { data: { action: 'start' } })).ok()).toBe(true);
  expect((await phone.post('/api/kid/eye-break', { data: { action: 'ask' } })).ok()).toBe(true);
  const onPhone = async () =>
    (
      (await (await phone.get('/api/kid/today')).json()) as {
        eyeBreak: { current: { secondsLeft: number; ask: string | null } | null };
      }
    ).eyeBreak.current;

  // «Все»: в «Нужно ваше внимание» и в строке ребёнка — сразу ответить.
  await page.goto('/remote');
  const row = page.getByTestId('kid-card').filter({ hasText: 'Бельчонок' });
  await expect(row).toContainText('Перерыв · просит ещё');
  await expect(row.getByTestId('eye-break-allow')).toContainText('Разрешить 15 мин');
  expect(await layoutProblems(page)).toEqual([]);
  await page.getByTestId('attention').getByText('Бельчонок: просит ещё посмотреть').click();
  await expect(page).toHaveURL(new RegExp(`/remote\\?child=${kid.id}`));
  const alert = page.getByTestId('kid-remote').getByTestId('eye-break-alert');
  await expect(alert).toContainText('просит ещё посмотреть');

  // «Пусть отдохнёт» — на телефоне совёнок скажет; перерыв идёт дальше, его можно снять.
  await alert.getByTestId('eye-break-deny').click();
  await expect(alert).not.toContainText('просит ещё');
  await expect(alert.getByTestId('eye-break-allow')).toHaveText('Снять перерыв');
  expect(await onPhone()).toMatchObject({ ask: 'no' });
  expect(await layoutProblems(page)).toEqual([]);
  await alert.getByTestId('eye-break-allow').click();
  await expect(page.getByTestId('eye-break-alert')).toHaveCount(0);
  expect(await onPhone()).toMatchObject({ secondsLeft: 0, ask: 'yes' });
  await phone.dispose();

  // Профиль-помощник больше не нужен.
  await page.goto(`/child/${kid.id}`);
  await page.getByTestId('child-page').getByTestId('child-delete').click();
  await page.getByRole('dialog').getByRole('button', { name: 'Удалить' }).click();
  await expect(page).toHaveURL(/\/children$/);
});

test('точность (этап 47): уроки подписаны, завершённый день — «не сегодня», а не «позже»', async ({
  page,
}) => {
  await login(page);
  // «Все»: под именем — уроки с названием и остатком, а не безымянные кольца.
  const lessons = page.getByTestId('kid-lessons').first();
  await expect(lessons).toContainText(/Английский|Китайский|Математика/);
  expect(await layoutProblems(page)).toEqual([]);

  // «Завершить на сегодня» — не пройденные уроки в ленте «не сегодня» с причиной.
  await page.getByTestId('kid-switch').getByRole('tab').nth(1).click();
  await page.getByTestId('end-day').click();
  const day = page.getByTestId('dayline');
  const missed = day.locator('[data-state=missed]');
  await expect(missed.first()).toContainText('день завершён вами');
  await expect(missed.first()).toContainText('не сегодня');
  await page.getByRole('button', { name: 'Снова открыть день' }).click();
  await expect(page.getByTestId('end-day')).toBeVisible();
});

test('навигация (этап 47): боковое меню — все разделы, переключатель детей — один на кабинет', async ({
  page,
}) => {
  await login(page);
  // Компьютер: в боковом меню то же, что во вкладках и в «Ещё».
  const phone = page.viewportSize()!;
  await page.setViewportSize({ width: 1280, height: 800 });
  const side = page.getByTestId('side-nav');
  await expect(side).toBeVisible();
  for (const label of [
    'Пульт',
    'Контент',
    'Распорядок',
    'Прогресс',
    'Дети',
    'Мамин голос',
    'Фото и видео',
    'Звонки',
    'Устройства',
    'Аккаунт и оформление',
  ])
    await expect(side.getByRole('link', { name: label, exact: true })).toBeVisible();
  await side.getByRole('link', { name: 'Мамин голос' }).click();
  await expect(page).toHaveURL(/\/mom-voice/);
  await expect(side.getByRole('link', { name: 'Мамин голос' })).toHaveAttribute(
    'data-active',
    'true',
  );
  if (process.env.SHOTS)
    await page.screenshot({ path: `${process.env.SHOTS}/side-${test.info().project.name}.png` });
  await page.setViewportSize(phone);

  // Один переключатель: выбрали ребёнка в «Прогрессе» — он же в «Пульте» и в «Распорядке».
  await page.goto('/progress');
  const sw = page.getByTestId('kid-switch');
  await sw.getByRole('tab', { name: 'Мишутка' }).click();
  await expect(sw.getByRole('tab', { name: 'Мишутка' })).toHaveAttribute('aria-selected', 'true');
  for (const url of ['/remote', '/routine?tab=habits']) {
    await page.goto(url);
    await expect(
      page.getByTestId('kid-switch').getByRole('tab', { name: 'Мишутка' }),
    ).toHaveAttribute('aria-selected', 'true');
  }
});

test('«Дети» (этап 47): касание — профиль; там «Изменить», телефон и «Удалить»', async ({
  page,
}) => {
  await login(page);
  await page.goto('/children');
  await page.getByRole('button', { name: 'Добавить ребёнка' }).click();
  await page.getByLabel('Прозвище').fill('Ёжик');
  const save = page.locator('.mantine-Modal-content').getByRole('button', { name: 'Сохранить' });
  await save.scrollIntoViewIfNeeded();
  await save.click();
  const list = page.getByTestId('children-list');
  await expect(list).toContainText('Ёжик');
  expect(await layoutProblems(page)).toEqual([]);

  await list.getByRole('link', { name: /Ёжик/ }).last().click();
  const child = page.getByTestId('child-page');
  await expect(child).toContainText('Ёжик');
  await expect(child).toContainText('не привязан');
  // «Изменить» — то же окно профиля, что в «Детях».
  await child.getByRole('button', { name: 'Изменить' }).click();
  const sheet = page.locator('.mantine-Modal-content');
  await expect(sheet).toContainText('Профиль ребёнка');
  await expect(sheet.getByLabel('Прозвище')).toHaveValue('Ёжик');
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
  expect(await layoutProblems(page)).toEqual([]);

  // «Удалить профиль» — подтверждение, потом список детей без него.
  await child.getByTestId('child-delete').click();
  await page.getByRole('dialog').getByRole('button', { name: 'Удалить' }).click();
  await expect(page).toHaveURL(/\/children$/);
  await expect(page.getByTestId('children-list')).not.toContainText('Ёжик');
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

test('стих в конструкторе игр (этап 45): раздел и название по произведению, весь текст', async ({
  page,
}) => {
  await login(page);
  await page.goto('/content?tab=games');
  await page.getByRole('button', { name: '+ Игра' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('combobox', { name: 'Вид игры' }).click();
  await page.getByRole('option', { name: 'Стих или сказка' }).click();
  // Раздел «Стихи и сказки» и название — сами.
  await expect(dialog.getByRole('combobox', { name: 'Раздел у ребёнка' })).toHaveValue(
    'Стихи и сказки',
  );
  const title = dialog.getByRole('textbox', { name: 'Название (видите только вы)' });
  await expect(title).toHaveValue('Петушок, петушок');
  await dialog.getByRole('combobox', { name: 'Что учим' }).click();
  await page.getByRole('option', { name: /Осень наступила/ }).click();
  await expect(title).toHaveValue('Осень наступила');
  await expect(dialog.getByText('Стихотворение «Осень наступила». Алексей Плещеев.')).toBeVisible();
  await dialog.getByRole('button', { name: 'Весь текст' }).click();
  await expect(dialog.getByText(/Птички улетели/)).toBeVisible();
  expect(await layoutProblems(page)).toEqual([]);
  await dialog.getByRole('button', { name: 'Сохранить' }).click();
  await expect(dialog).toHaveCount(0);
  const row = page.locator('.attention-row').filter({ hasText: 'Осень наступила' });
  await expect(row).toContainText('Стих или сказка · Стихи и сказки · «Осень наступила» · учим');

  // Уборка за собой: стенд общий для тестов.
  await row.getByRole('button', { name: 'Действия' }).click();
  await page.getByRole('menuitem', { name: 'Удалить' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Удалить' }).click();
  await expect(row).toHaveCount(0);
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

test('«Что нравится» в «Прогрессе» (этап 44): любимое, бросает; не открытое — убрать и отменить', async ({
  page,
}) => {
  await login(page);
  // Убрать/вернуть — подменено: стенд общий для всех телефонов, его данные не трогаем.
  const sent: { remove?: unknown[]; add?: unknown[] }[] = [];
  await page.route('**/api/parent/children/*/items/bulk', async (route) => {
    sent.push(route.request().postDataJSON());
    await route.fulfill({ json: { added: 1, removed: 1 } });
  });
  await page.goto('/progress');
  const likes = page.getByTestId('likes');
  await expect(likes.getByTestId('likes-favorites')).toContainText('Кто живёт в лесу');
  const dropped = likes.getByTestId('likes-dropped');
  await expect(dropped).toContainText('Посчитай ягодки');
  await expect(dropped).toContainText('обычно уходит');
  const unopened = likes.getByTestId('likes-unopened');
  await expect(unopened).toContainText('Найди пару');
  await unopened.scrollIntoViewIfNeeded();
  expect(await layoutProblems(page)).toEqual([]);
  if (process.env.SHOTS)
    await likes.screenshot({ path: `${process.env.SHOTS}/likes-${test.info().project.name}.png` });

  await unopened.getByRole('button', { name: /^Убрать у (Зайки|Мишутки) — 1$/ }).click();
  await expect(page.getByText(/: убрано 1$/)).toBeVisible();
  await page.getByRole('button', { name: 'Отменить' }).click();
  await expect.poll(() => sent.length).toBe(2);
  expect(sent[0]).toEqual({ remove: [{ kind: 'interactive', refId: expect.any(String) }] });
  expect(sent[1]).toEqual({ add: sent[0]!.remove });
});
