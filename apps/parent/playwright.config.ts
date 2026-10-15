import { defineConfig, devices } from '@playwright/test';

// Кабинет на телефонах (этап 24): Safari-движок с экранами iPhone и узкий Android. Сервер —
// демо-стенд (настоящий api на встроенной PGlite с демо-семьёй), см. apps/api/src/demo/stand.ts.
const PORT = 4800;

export default defineConfig({
  testDir: 'e2e',
  testMatch: '**/*.e2e.ts',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'iphone-15', use: { ...devices['iPhone 15'] } },
    { name: 'iphone-se', use: { ...devices['iPhone SE'] } },
    { name: 'android-narrow', use: { ...devices['Galaxy S9+'] } },
  ],
  webServer: {
    command: 'pnpm build && pnpm --filter @kidsplus/api demo',
    url: `http://127.0.0.1:${PORT}/login`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
