import type { KidItem } from '@kidsplus/shared/api';
import { CachedImg } from './CachedImg';
import './deck-preview.css';

/** Show a set of actual cards, rather than an unrelated cover or an enlarged first image. */
export function DeckPreview({ deck }: { deck: Extract<KidItem, { kind: 'deck' }> }) {
  const pictures = [...new Set(deck.cards.map((card) => card.imageUrl))].slice(0, 2);
  if (!pictures.length && deck.coverUrl) pictures.push(deck.coverUrl);
  return (
    <span
      className="deck-preview"
      data-preview="deck"
      data-cards={pictures.length}
      aria-hidden="true"
    >
      <span className="deck-preview-back" />
      {pictures.map((src) => (
        <span className="deck-preview-card" key={src}>
          <CachedImg src={src} alt="" draggable={false} loading="lazy" />
          <span className="deck-preview-voice">
            <svg viewBox="0 0 24 24">
              <path d="M4 9h4l5-4v14l-5-4H4zM17 8c3 2 3 6 0 8" />
            </svg>
          </span>
        </span>
      ))}
    </span>
  );
}
