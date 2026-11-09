import { expect, test } from '@playwright/test';

test('карточка семьи: пауза, продолжение и пять минут меняют состояние на сервере', async ({
  page,
  playwright,
}) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('demo@example.com');
  await page.getByLabel('Пароль').fill('demo-password-123');
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(page).toHaveURL(/\/remote/);
  const created = await page.request.post('/api/parent/children', {
    data: {
      nickname: 'Проверка карточки',
      birthYear: 2022,
      birthMonth: 1,
      gender: 'm',
      languages: ['ru'],
    },
  });
  expect(created.ok()).toBe(true);
  const { id } = (await created.json()) as { id: string };
  const phone = await playwright.request.newContext({ baseURL: test.info().project.use.baseURL });
  try {
    const schedule = await page.request.put(`/api/parent/children/${id}/schedule`, {
      data: {
        enabled: true,
        subjectsPerDay: 1,
        minutesPerSubject: 10,
        freeMinutes: 20,
        timezone: 'UTC',
        windows: Object.fromEntries(
          ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => [
            d,
            { from: '00:00', to: '23:59' },
          ]),
        ),
      },
    });
    expect(schedule.ok()).toBe(true);
    const { code } = await (
      await page.request.post('/api/parent/pairings', { data: { childId: id, deviceName: 'Демо' } })
    ).json();
    expect((await phone.post('/api/kid/pair', { data: { code } })).ok()).toBe(true);
    expect(
      (await phone.post('/api/kid/heartbeat', { data: { activity: 'free', active: false } })).ok(),
    ).toBe(true);
    await page.reload();
    const card = page.getByTestId('kid-card').filter({ hasText: 'Проверка карточки' });
    await card.getByRole('button', { name: 'Пауза', exact: true }).click();
    await expect(card.getByRole('button', { name: 'Продолжить' })).toBeVisible();
    const state = async () => (await page.request.get(`/api/parent/children/${id}/now`)).json();
    expect((await state()).paused).toBe(true);
    await card.getByRole('button', { name: 'Продолжить' }).click();
    await expect(card.getByRole('button', { name: 'Пауза', exact: true })).toBeVisible();
    expect((await state()).paused).toBe(false);
    const minutes = Number(await card.getByTestId('family-minutes').textContent());
    await card.getByRole('button', { name: '+5 мин', exact: true }).click();
    await expect(card.getByTestId('family-minutes')).toHaveText(String(minutes + 5));
    expect((await state()).extraMinutes).toBe(5);
    await card.getByRole('button', { name: 'Пульт: Проверка карточки' }).click();
    await expect(page.getByTestId('kid-remote')).toHaveAttribute('data-child', id);
    await expect(page.getByTestId('remote-actions')).toBeVisible();
  } finally {
    await phone.dispose();
    expect((await page.request.delete(`/api/parent/children/${id}`)).ok()).toBe(true);
  }
});
