import { describe, expect, it } from 'vitest';
import { EmojiCatalog } from './emoji';

describe('EmojiCatalog', () => {
  const catalog = new EmojiCatalog();

  it.each([
    ['1F431', '1f431'],
    ['0031-FE0F-20E3', '31-20e3'],
    ['00A9-FE0F', 'a9'],
    ['2764-FE0F', '2764'],
    ['2764-FE0F-200D-1F525', '2764-fe0f-200d-1f525'],
  ])('имя файла Twemoji: %s → %s', (hex, file) => {
    expect(catalog.fileCode(hex)).toBe(file);
  });

  it('находит цифры (клавиши 1️⃣–🔟) — для квизов по математике', () => {
    const codes = catalog.search('клавиша').map((e) => e.code);
    expect(codes).toContain('31-20e3');
    expect(codes).toContain('35-20e3');
  });

  it('находит животных по-русски', () => {
    expect(catalog.search('кошк').map((e) => e.code)).toContain('1f431');
  });

  it('у каждого найденного эмодзи есть SVG', () => {
    for (const e of catalog.search('сердце')) expect(catalog.svg(e.code)).not.toBeNull();
  });
});
