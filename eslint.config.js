import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/dev-dist/**',
      '**/coverage/**',
      'packages/db/drizzle/**',
      // Android-проект киоска (Java, Gradle) — не JS.
      'apps/kiosk/android/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['apps/api/**', 'apps/worker/**', 'packages/**', 'scripts/**', '*.config.{js,ts}'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['apps/kid/src/**/*.{ts,tsx}', 'apps/parent/src/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    ...reactHooks.configs.flat.recommended,
  },
  {
    // Статические страницы кабинета (лендинг /start) — обычные браузерные скрипты.
    files: ['apps/parent/public/start.js'],
    languageOptions: { globals: globals.browser },
  },
  {
    // e2e: тесты Playwright выполняются в Node, а их фрагменты — в браузере.
    files: ['apps/*/e2e/**'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
);
