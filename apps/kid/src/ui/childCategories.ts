import type { KidCategory } from '@kidsplus/shared/api';

/** Stable pictures across the daily screen and free play: recognition comes before reading. */
export const CHILD_CATEGORY: Record<KidCategory, { picture: string; label: string }> = {
  video: { picture: '/playroom/tablet.webp', label: 'Смотрим' },
  math: { picture: '/playroom/math-house.webp', label: 'Считаем' },
  english: { picture: '/playroom/book-english.webp', label: 'Английский' },
  chinese: { picture: '/playroom/book-chinese.webp', label: 'Китайский' },
  geography: { picture: '/games/icon-flight.webp', label: 'Наш мир' },
  nature: { picture: '/games/animal-rabbit.webp', label: 'Природа' },
  music: { picture: '/games/icon-piano.webp', label: 'Музыка' },
  letters: { picture: '/games/icon-word.webp', label: 'Буквы' },
  poems: { picture: '/games/icon-poem.webp', label: 'Стихи' },
  books: { picture: '/games/icon-book.webp', label: 'Книжки' },
  games: { picture: '/games/icon-builder.webp', label: 'Играем' },
  other: { picture: '/games/icon-memory.webp', label: 'Открытия' },
};
