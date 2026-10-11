import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Регистрация — в коде приложения (@kidsplus/shared/sw-register), с автообновлением.
      injectRegister: false,
      includeAssets: ['favicon.svg'],
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
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:3000' },
  },
});
