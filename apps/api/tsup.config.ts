import { defineConfig } from 'tsup';

// Workspace-пакеты (@kidsplus/*) — в devDependencies, поэтому tsup вшивает их в бандл;
// зависимости из dependencies остаются внешними и ставятся в образ через `pnpm deploy`.
export default defineConfig({
  entry: ['src/index.ts', 'src/migrate.ts'],
  format: 'esm',
  platform: 'node',
  target: 'node24',
  clean: true,
  sourcemap: true,
});
