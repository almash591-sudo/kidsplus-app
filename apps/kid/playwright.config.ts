import { defineConfig } from '@playwright/test';

// Galaxy S20+: 1440×3200 физических пикселей, DPR 3.5 → 412×915 CSS-пикселей.
const s20 = { deviceScaleFactor: 3.5, isMobile: true, hasTouch: true };

export default defineConfig({
  testDir: 'e2e',
  testMatch: '**/*.e2e.ts',
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    // Service worker мешает подмене запросов в тестах.
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
    // Камера (этап 9): поддельное устройство Chromium, без вопроса о разрешении.
    launchOptions: {
      args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
    },
    permissions: ['camera', 'microphone'],
  },
  projects: [
    { name: 's20-portrait', use: { ...s20, viewport: { width: 412, height: 915 } } },
    { name: 's20-landscape', use: { ...s20, viewport: { width: 915, height: 412 } } },
  ],
  webServer: {
    command: 'pnpm build && pnpm preview --host 127.0.0.1 --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
