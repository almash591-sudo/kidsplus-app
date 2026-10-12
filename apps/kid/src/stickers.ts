// Наклейки (этап 17): за каждое пройденное задание ребёнок получает наклейку в альбом.
// Сначала — новые, когда собраны все, — повторы (счётчик растёт). Хранятся на телефоне ребёнка.

export const STICKERS: readonly { emoji: string; name: string }[] = [
  { emoji: '🐱', name: 'котёнок' },
  { emoji: '🐶', name: 'щенок' },
  { emoji: '🦊', name: 'лисичка' },
  { emoji: '🐼', name: 'панда' },
  { emoji: '🐨', name: 'коала' },
  { emoji: '🦁', name: 'львёнок' },
  { emoji: '🐯', name: 'тигрёнок' },
  { emoji: '🐸', name: 'лягушонок' },
  { emoji: '🐵', name: 'обезьянка' },
  { emoji: '🐰', name: 'зайчик' },
  { emoji: '🐻', name: 'медвежонок' },
  { emoji: '🐷', name: 'поросёнок' },
  { emoji: '🐮', name: 'коровка' },
  { emoji: '🐔', name: 'курочка' },
  { emoji: '🐧', name: 'пингвин' },
  { emoji: '🦉', name: 'совёнок' },
  { emoji: '🦄', name: 'единорог' },
  { emoji: '🐲', name: 'дракончик' },
  { emoji: '🐳', name: 'кит' },
  { emoji: '🐬', name: 'дельфин' },
  { emoji: '🐙', name: 'осьминог' },
  { emoji: '🦀', name: 'крабик' },
  { emoji: '🐠', name: 'рыбка' },
  { emoji: '🐢', name: 'черепашка' },
  { emoji: '🦋', name: 'бабочка' },
  { emoji: '🐞', name: 'божья коровка' },
  { emoji: '🐝', name: 'пчёлка' },
  { emoji: '🐌', name: 'улитка' },
  { emoji: '🦒', name: 'жираф' },
  { emoji: '🐘', name: 'слонёнок' },
  { emoji: '🦓', name: 'зебра' },
  { emoji: '🦔', name: 'ёжик' },
  { emoji: '🌈', name: 'радуга' },
  { emoji: '⭐', name: 'звёздочка' },
  { emoji: '🌙', name: 'месяц' },
  { emoji: '☀️', name: 'солнышко' },
  { emoji: '🌸', name: 'цветочек' },
  { emoji: '🌻', name: 'подсолнух' },
  { emoji: '🍄', name: 'грибок' },
  { emoji: '🍓', name: 'клубничка' },
  { emoji: '🍉', name: 'арбуз' },
  { emoji: '🍒', name: 'вишенки' },
  { emoji: '🍭', name: 'леденец' },
  { emoji: '🧁', name: 'кекс' },
  { emoji: '🍦', name: 'мороженое' },
  { emoji: '🎈', name: 'шарик' },
  { emoji: '🎁', name: 'подарок' },
  { emoji: '🧸', name: 'мишка' },
  { emoji: '🪁', name: 'воздушный змей' },
  { emoji: '🚀', name: 'ракета' },
  { emoji: '🚂', name: 'паровозик' },
  { emoji: '🚁', name: 'вертолёт' },
  { emoji: '⛵', name: 'кораблик' },
  { emoji: '🚗', name: 'машинка' },
  { emoji: '🏰', name: 'замок' },
  { emoji: '👑', name: 'корона' },
  { emoji: '💎', name: 'кристалл' },
  { emoji: '🎨', name: 'краски' },
  { emoji: '🎵', name: 'нотка' },
  { emoji: '🌍', name: 'планета' },
];

const STORE = 'kidsplus.stickers';

/** Сколько раз получена каждая наклейка (по эмодзи). */
export function stickerCounts(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(STORE) ?? '{}') as Record<string, number>;
  } catch {
    return {};
  }
}

/** Выдать наклейку: случайную из ещё не собранных, а когда собраны все — любую. */
export function awardSticker(rnd: () => number = Math.random) {
  const counts = stickerCounts();
  const fresh = STICKERS.filter((s) => !counts[s.emoji]);
  const pool = fresh.length ? fresh : STICKERS;
  const s = pool[Math.floor(rnd() * pool.length)]!;
  counts[s.emoji] = (counts[s.emoji] ?? 0) + 1;
  try {
    localStorage.setItem(STORE, JSON.stringify(counts));
  } catch {
    // нет хранилища — наклейка всё равно показывается
  }
  return { ...s, isNew: counts[s.emoji] === 1, total: Object.keys(counts).length };
}

/** Для тестов. */
export function resetStickers() {
  try {
    localStorage.removeItem(STORE);
  } catch {
    // нет хранилища
  }
}
