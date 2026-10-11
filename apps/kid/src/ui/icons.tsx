// Значки интерфейса (этап 12): единый набор линий 24×24, вместо эмодзи и букв. Картинки в
// содержимом (карточки, игры) остаются своими — это значки только для «рамки» приложения.
import type { KidCategory } from '@kidsplus/shared/api';

const PATHS = {
  play: 'M8 5.5v13l10.5-6.5z',
  english: 'M4 19L8.5 5h1L14 19M5.8 14h6.4M16 9.5h4.5M18.2 9.5V19',
  chinese: 'M5 7h14M12 4v16M7 11h10v6H7z',
  math: 'M12 5v14M5 12h14',
  nature:
    'M12 21V11M12 11c0-4.2 3-7 7.5-7 0 4.3-3 7-7.5 7zM12 14.5C12 11.4 9.6 9 6 9c0 3.3 2.4 5.5 6 5.5z',
  games:
    'M6.5 9h11a3.5 3.5 0 0 1 3.4 4.3l-.5 2a2.6 2.6 0 0 1-4.5 1.1L14.5 15h-5l-1.4 1.4a2.6 2.6 0 0 1-4.5-1.1l-.5-2A3.5 3.5 0 0 1 6.5 9zM8 11v3M6.5 12.5h3M16 12h.01M17.5 13.5h.01',
  geography:
    'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c2.5 2.5 3.6 5.6 3.6 9s-1.1 6.5-3.6 9c-2.5-2.5-3.6-5.6-3.6-9S9.5 5.5 12 3z',
  other: 'M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.8l-5.2 2.8 1-5.8-4.3-4.1 5.9-.9z',
  free: 'M12 3a5 5 0 0 1 5 5c0 3.6-3 6-5 6s-5-2.4-5-6a5 5 0 0 1 5-5zM12 14v7M10 21h4',
  home: 'M4 11.5L12 5l8 6.5M6.5 10v9.5h11V10',
  back: 'M15 5l-7 7 7 7',
  camera:
    'M4 8.5h3.2L9 6h6l1.8 2.5H20a1 1 0 0 1 1 1V18a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5a1 1 0 0 1 1-1zM12 16.2a3.4 3.4 0 1 0 0-6.8 3.4 3.4 0 0 0 0 6.8z',
  phone:
    'M6.5 4h3l1.6 4.2-2 1.3a11 11 0 0 0 5.4 5.4l1.3-2L20 14.5v3a2.5 2.5 0 0 1-2.5 2.5A14.5 14.5 0 0 1 4 6.5 2.5 2.5 0 0 1 6.5 4z',
  gallery: 'M4 5h16v14H4zM9 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM20 15.5l-5-5L5.5 19',
  lock: 'M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  star: 'M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.8l-5.2 2.8 1-5.8-4.3-4.1 5.9-.9z',
  prev: 'M14.5 5.5L8 12l6.5 6.5',
  next: 'M9.5 5.5L16 12l-6.5 6.5',
  ear: 'M8 9a4 4 0 1 1 8 0c0 2.5-2.5 3.5-2.5 6a2.5 2.5 0 0 1-5 0M10.5 9a1.5 1.5 0 0 1 3 0',
  pause: 'M8 5v14M16 5v14',
  retry: 'M4.5 12a7.5 7.5 0 1 0 2.2-5.3M4.5 4.5v4h4',
  moon: 'M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z',
} as const;

export type IconName = keyof typeof PATHS;

/** Значок линиями; цвет — текущий цвет текста. */
export function Icon({
  name,
  size = 24,
  stroke = 2.2,
  fill = false,
}: {
  name: IconName;
  size?: number | string;
  stroke?: number;
  /** Залитый (play, star), а не контур. */
  fill?: boolean;
}) {
  return (
    <svg
      className="icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}

/** Значок раздела: ребёнок не читает — узнаёт по цвету и символу. */
export const CATEGORY_ICON: Record<KidCategory, IconName> = {
  video: 'play',
  english: 'english',
  math: 'math',
  chinese: 'chinese',
  geography: 'geography',
  nature: 'nature',
  games: 'games',
  other: 'other',
};
