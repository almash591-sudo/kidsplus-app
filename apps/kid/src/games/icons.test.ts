// Глиняные значки игр (этап 35): у каждого вида игры есть картинка и на телефоне, и в кабинете —
// иначе плитка и список игр показывают пустой кружок.
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { GAME_KINDS, type GameKind } from '@kidsplus/shared/games';
import { describe, expect, it } from 'vitest';

const icon = (app: 'kid' | 'parent', kind: string) =>
  fileURLToPath(new URL(`../../../${app}/public/games/icon-${kind}.webp`, import.meta.url));

describe('значки игр', () => {
  const kinds = Object.keys(GAME_KINDS) as GameKind[];

  it.each(['kid', 'parent'] as const)('у каждого вида игры есть значок (%s)', (app) => {
    expect(kinds.filter((k) => !existsSync(icon(app, k)))).toEqual([]);
  });
});
