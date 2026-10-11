import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import type { EmojiItem } from '@kidsplus/shared/api';

const require = createRequire(import.meta.url);

interface EmojibaseEntry {
  label: string;
  hexcode: string;
  emoji: string;
  tags?: string[];
  group?: number;
  skins?: unknown[];
}

/** Группа «флаги» и «компоненты» детям не нужны. */
const SKIP_GROUPS = new Set([2, 9]);

interface Indexed extends EmojiItem {
  search: string;
}

/**
 * Каталог эмодзи: русские названия и теги из emojibase, картинки — Twemoji (CC BY 4.0).
 * Загружается лениво при первом поиске.
 */
export class EmojiCatalog {
  private items: Indexed[] | null = null;
  private readonly svgDir: string;

  constructor() {
    this.svgDir = dirname(require.resolve('@twemoji/svg/1f431.svg'));
  }

  /** Имя файла Twemoji: без FE0F, если в последовательности нет ZWJ (как в самом twemoji). */
  fileCode(hexcode: string): string {
    // Twemoji пишет коды без ведущих нулей: 0031-FE0F-20E3 (1️⃣) → 31-20e3.
    const parts = hexcode.split('-').map((h) => parseInt(h, 16).toString(16));
    return (parts.includes('200d') ? parts : parts.filter((p) => p !== 'fe0f')).join('-');
  }

  private load(): Indexed[] {
    if (this.items) return this.items;
    const data = JSON.parse(
      readFileSync(require.resolve('emojibase-data/ru/data.json'), 'utf8'),
    ) as EmojibaseEntry[];
    this.items = data
      .filter((e) => e.group === undefined || !SKIP_GROUPS.has(e.group))
      .map((e) => ({
        code: this.fileCode(e.hexcode),
        label: e.label,
        emoji: e.emoji,
        search: [e.label, ...(e.tags ?? [])].join(' ').toLowerCase(),
      }))
      .filter((e) => existsSync(join(this.svgDir, `${e.code}.svg`)));
    return this.items;
  }

  search(query: string, limit = 60): EmojiItem[] {
    const q = query.trim().toLowerCase();
    const all = this.load();
    if (!q) return [];
    // Сначала совпадения в начале названия, потом — где угодно в названии и тегах.
    const starts = all.filter((e) => e.label.toLowerCase().startsWith(q));
    const rest = all.filter((e) => !e.label.toLowerCase().startsWith(q) && e.search.includes(q));
    return [...starts, ...rest]
      .slice(0, limit)
      .map(({ code, label, emoji }) => ({ code, label, emoji }));
  }

  /** SVG эмодзи или null, если такого нет в каталоге. */
  svg(code: string): Uint8Array | null {
    if (!/^[0-9a-f]{2,6}(-[0-9a-f]{2,6}){0,8}$/.test(code)) return null;
    const path = join(this.svgDir, `${code}.svg`);
    return existsSync(path) ? new Uint8Array(readFileSync(path)) : null;
  }
}
