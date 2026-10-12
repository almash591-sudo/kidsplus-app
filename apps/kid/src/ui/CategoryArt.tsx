// Картинки разделов (этап 12в): крупные залитые двухцветные значки — малыш узнаёт раздел
// с первого взгляда, без чтения. Цвет — цвет раздела (--c), второй тон — его светлый вариант.
import type { KidCategory } from '@kidsplus/shared/api';

type Art = KidCategory | 'free';

/** Буквы и цифры — самый понятный значок для языков и счёта. */
function Glyph({ text, size }: { text: string; size: number }) {
  return (
    <text
      x="24"
      y="25"
      textAnchor="middle"
      dominantBaseline="central"
      fontSize={size}
      fontWeight={900}
      fill="var(--c)"
      fontFamily="Nunito, system-ui, sans-serif"
      letterSpacing="-1"
    >
      {text}
    </text>
  );
}

const ART: Record<Art, React.ReactNode> = {
  video: (
    <>
      <path d="M17 6l7 6 7-6" stroke="var(--c)" strokeWidth="3" strokeLinecap="round" fill="none" />
      <rect x="5" y="12" width="38" height="28" rx="8" fill="var(--c)" />
      <rect x="10" y="17" width="28" height="18" rx="4" fill="var(--c-tint)" />
      <path d="M21 20.5v11l9-5.5z" fill="var(--c)" />
    </>
  ),
  english: <Glyph text="ABC" size={20} />,
  math: <Glyph text="123" size={21} />,
  chinese: <Glyph text="中" size={30} />,
  geography: (
    <>
      <circle cx="24" cy="24" r="19" fill="var(--c-tint)" />
      <path
        d="M14 13c4 1 6 4 5 7s-5 3-5 7 4 6 3 9c-4-2-8-6-9-12s2-9 6-11zM27 7c5 1 9 4 11 8-3 0-5 2-7 1s-1-4-4-5-3-3 0-4zM29 25c3-1 6 0 8 2-1 5-4 9-8 11-1-3 1-5 0-8s-2-4 0-5z"
        fill="var(--c)"
      />
    </>
  ),
  nature: (
    <>
      <rect x="21" y="27" width="6" height="15" rx="3" fill="#a0522d" />
      <circle cx="24" cy="17" r="11" fill="var(--c)" />
      <circle cx="15" cy="24" r="8" fill="var(--c)" />
      <circle cx="33" cy="24" r="8" fill="var(--c)" />
      <circle cx="20" cy="14" r="3.5" fill="var(--c-tint)" />
    </>
  ),
  letters: <Glyph text="АБВ" size={19} />,
  music: (
    <>
      <path
        d="M17 34V12l22-5v22"
        stroke="var(--c)"
        strokeWidth="4.5"
        fill="none"
        strokeLinejoin="round"
      />
      <path d="M17 18l22-5" stroke="var(--c)" strokeWidth="4.5" />
      <ellipse cx="12" cy="35" rx="7" ry="5.5" fill="var(--c)" />
      <ellipse cx="34" cy="30" rx="7" ry="5.5" fill="var(--c)" />
      <ellipse cx="10.5" cy="33.5" rx="2.5" ry="1.6" fill="var(--c-tint)" />
    </>
  ),
  games: (
    <>
      <path
        d="M14 15h20c5 0 9 4 9 9v4c0 4-3 7-7 7-2 0-4-1-5-3l-2-3h-10l-2 3c-1 2-3 3-5 3-4 0-7-3-7-7v-4c0-5 4-9 9-9z"
        fill="var(--c)"
      />
      <rect x="11" y="22" width="9" height="3.4" rx="1.7" fill="#fff" />
      <rect x="13.8" y="19.2" width="3.4" height="9" rx="1.7" fill="#fff" />
      <circle cx="31" cy="21.5" r="2.4" fill="var(--c-tint)" />
      <circle cx="35.5" cy="26" r="2.4" fill="var(--c-tint)" />
    </>
  ),
  other: (
    <path
      d="M24 5l5.6 11.6 12.7 1.8-9.2 8.9 2.2 12.6L24 34l-11.3 5.9 2.2-12.6-9.2-8.9 12.7-1.8z"
      fill="var(--c)"
      stroke="var(--c)"
      strokeWidth="2"
      strokeLinejoin="round"
    />
  ),
  free: (
    <>
      <path
        d="M24 33c-1 4 2 6 0 10"
        stroke="var(--c)"
        strokeWidth="2"
        fill="none"
        strokeLinecap="round"
      />
      <ellipse cx="24" cy="18" rx="12" ry="14" fill="var(--c)" />
      <path d="M21.5 31.5h5l-2.5 3z" fill="var(--c)" />
      <ellipse cx="19.5" cy="12.5" rx="3" ry="4.5" fill="var(--c-tint)" />
    </>
  ),
};

/** Картинка раздела; размер — от контейнера. */
export function CategoryArt({ category }: { category: Art }) {
  return (
    <svg className="category-art" viewBox="0 0 48 48" aria-hidden="true">
      {ART[category]}
    </svg>
  );
}
