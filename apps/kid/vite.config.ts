import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // Сборка — в отчётах о сбоях (этап 51): видно, на какой версии сломалось.
  define: {
    __KID_BUILD__: JSON.stringify(
      process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 7) || new Date().toISOString().slice(0, 16),
    ),
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Регистрация — в коде приложения (@kidsplus/shared/sw-register), с автообновлением.
      injectRegister: false,
      // owl — кадры совёнка (этап 26), games — глиняная графика игр (этап 35), poems — сцены стихов
      // и сказок (этап 45): нужны и без интернета. Сцены книжек (books, этап 52) — не здесь: их
      // много, телефон качает только назначенные книжки (offline.ts).
      includeAssets: [
        'favicon.svg',
        'apple-touch-icon.png',
        'owl/*.webp',
        'rest/*.webp',
        'habits/*.webp',
        'games/*.webp',
        'poems/*.webp',
      ],
      manifest: {
        name: 'KidsPlus',
        short_name: 'KidsPlus',
        lang: 'ru',
        start_url: '/',
        scope: '/',
        display: 'fullscreen',
        // Книжная; в видео приложение само разрешает поворот (kiosk.ts, allowLandscape).
        orientation: 'portrait',
        background_color: '#FFF4DE',
        theme_color: '#FFB347',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Новая версия сразу берёт управление открытыми страницами.
        skipWaiting: true,
        clientsClaim: true,
        navigateFallbackDenylist: [/^\/api\//],
        // Работа без интернета (этап 15г): картинки и озвучка не меняются по id — берём из кэша;
        // список занятий — из сети, а без неё (4 с) — последний сохранённый.
        runtimeCaching: [
          {
            urlPattern: ({ url, sameOrigin }) =>
              sameOrigin && url.pathname.startsWith('/api/media/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'kidsplus-media',
              expiration: { maxEntries: 4000, maxAgeSeconds: 60 * 24 * 3600 },
              cacheableResponse: { statuses: [200] },
            },
          },
          {
            // Сцены книжек (этап 52). Нет файла — веб-сервер отвечает index.html: такое не кэшируем.
            urlPattern: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith('/books/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'kidsplus-books',
              expiration: { maxEntries: 600, maxAgeSeconds: 120 * 24 * 3600 },
              cacheableResponse: { statuses: [200], headers: { 'content-type': 'image/webp' } },
            },
          },
          {
            urlPattern: ({ url, sameOrigin, request }) =>
              sameOrigin &&
              request.method === 'GET' &&
              /^\/api\/kid\/(playlist|today|now|speech)/.test(url.pathname),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'kidsplus-kid-api',
              networkTimeoutSeconds: 4,
              cacheableResponse: { statuses: [200] },
            },
          },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:3000' },
  },
});
