import { defineConfig } from 'vitest/config';

export default defineConfig({
  // PGlite при параллельном запуске стартует медленно.
  test: { testTimeout: 30_000, hookTimeout: 30_000 },
});
