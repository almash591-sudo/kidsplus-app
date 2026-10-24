import { describe, expect, it } from 'vitest';
import { allOf, copiedText, giveLabel, hasLabel, hasMore, nickCase, phoneOf } from './names';

const f = (nickname: string) => ({ nickname, gender: 'f' as const });
const m = (nickname: string) => ({ nickname, gender: 'm' as const });

describe('прозвище в падежах (этап 44)', () => {
  it.each([
    [f('Зайка'), 'Зайки', 'Зайке'],
    [m('Мишутка'), 'Мишутки', 'Мишутке'],
    [f('Солнышко'), 'Солнышка', 'Солнышку'],
    [f('Лиза'), 'Лизы', 'Лизе'],
    [f('Маша'), 'Маши', 'Маше'],
    [f('Лисица'), 'Лисицы', 'Лисице'],
    [m('Ваня'), 'Вани', 'Ване'],
    [f('Дарья'), 'Дарьи', 'Дарье'],
    [f('Мария'), 'Марии', 'Марии'],
    [m('Ёжик'), 'Ёжика', 'Ёжику'],
    [m('Малыш'), 'Малыша', 'Малышу'],
    [m('Николай'), 'Николая', 'Николаю'],
    [m('Матвей'), 'Матвея', 'Матвею'],
    [f('ЗАЙКА'), 'ЗАЙКИ', 'ЗАЙКЕ'],
  ])('%o → %s, %s', (n, gen, dat) => {
    expect(nickCase(n, 'gen')).toBe(gen);
    expect(nickCase(n, 'dat')).toBe(dat);
  });

  it.each([
    m('Котёнок'), // беглая гласная: Котёнка
    m('Огонёк'),
    m('Птенец'),
    m('Лев'),
    m('Павел'),
    m('Воробей'),
    f('Ассоль'), // мягкий знак
    f('Кармен'), // женское имя на согласную не склоняется
    f('Ёжик'), // девочка «Ёжик» — не угадываем
    m('Mia'),
    m('Мини Маус'),
    f('Ноа'), // гласная перед -а
  ])('%o — без падежа', (n) => {
    expect(nickCase(n, 'gen')).toBeNull();
    expect(nickCase(n, 'dat')).toBeNull();
  });

  it('фразы: с падежом и запасная форма без него', () => {
    expect(hasLabel(f('Зайка'), true)).toBe('Есть у Зайки');
    expect(hasLabel(f('Зайка'), false)).toBe('Нет у Зайки');
    expect(hasLabel(m('Котёнок'), true)).toBe('Котёнок: есть');
    expect(giveLabel(f('Зайка'), true)).toBe('Дать Зайке');
    expect(giveLabel(f('Зайка'), false)).toBe('Убрать у Зайки');
    expect(giveLabel(m('Котёнок'), false)).toBe('Котёнок: убрать');
    expect(phoneOf(f('Солнышко'))).toBe('Телефон Солнышка');
    expect(phoneOf(m('Котёнок'))).toBe('Котёнок, телефон');
  });
});

describe('копирование между детьми', () => {
  it('с падежом и без него', () => {
    expect(allOf(m('Мишутка'))).toBe('Всё, что есть у Мишутки');
    expect(allOf(m('Котёнок'))).toBe('Всё, что есть: Котёнок');
    expect(hasMore(m('Мишутка'))).toBe('У Мишутки есть ещё');
    expect(copiedText(m('Мишутка'), f('Зайка'), 4)).toBe(
      'Зайка: добавлено 4 — то, что было у Мишутки',
    );
    expect(copiedText(m('Мишутка'), f('Зайка'), 0)).toBe('У Зайки уже есть всё, что у Мишутки');
    expect(copiedText(m('Котёнок'), f('Зайка'), 4)).toBe('Котёнок → Зайка: добавлено 4');
    expect(copiedText(f('Зайка'), m('Котёнок'), 0)).toBe('Зайка → Котёнок: всё уже есть');
  });
});
