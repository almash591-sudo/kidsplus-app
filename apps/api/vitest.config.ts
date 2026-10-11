import { defineConfig } from 'vitest/config';

export default defineConfig({
  // PGlite и argon2 при параллельном запуске стартуют медленно.
  test: { testTimeout: 30_000, hookTimeout: 30_000 },
});
