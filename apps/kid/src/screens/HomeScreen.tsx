import type { KidCategory, KidItem } from '@kidsplus/shared/api';
import { GAME_KINDS } from '@kidsplus/shared/games';
import { useEffect } from 'react';
import { playSequence } from '../audio';
import { categoriesOf, pathLength, restingIn } from '../categories';
import { fx } from '../fx';
import { GameTile } from '../games/GameTile';
import { ru } from '../games/common';
import {
  CATEGORY_LABELS,
  categoryPhrase,
  GREETING,
  HINT_PICK,
  REST_LEARNED,
  REST_TODAY,
} from '../phrases';
import { IdleHint } from '../ui/IdleHint';
import { Icon } from '../ui/icons';
import { LessonPath } from './LessonPath';
import { DeckPreview } from '../ui/DeckPreview';
import { CHILD_CATEGORY } from '../ui/childCategories';
import { FairyHeader } from '../ui/FairyGuide';
import { voiceLine } from '../voiceLines';

let greeted = false;
export const CATEGORY_SHORT: Record<KidCategory, string> = {
  video: 'Кинотеатр',
  english: 'Английский',
  math: 'Математика',
  chinese: 'Китайский',
  geography: 'Наш мир',
  nature: 'Природа',
  music: 'Музыка',
  letters: 'Буквы',
  poems: 'Стихи',
  books: 'Книжки',
  games: 'Игротека',
  other: 'Открытия',
};

/** Compatibility with the existing daily screen. */
export function CategoryFace({ category, coverUrl }: { category: KidCategory; coverUrl?: string }) {
  return (
    <>
      {coverUrl && <img className="category-cover" src={coverUrl} alt="" draggable={false} />}
      <span className="category-cover-shade" aria-hidden="true" />
      {category !== 'video' && (
        <img
          className="category-toy"
          src={CHILD_CATEGORY[category].picture}
          alt=""
          draggable={false}
        />
      )}
      {category === 'video' && (
        <span className="tile-badge" aria-hidden="true">
          <Icon name="play" size={32} fill />
        </span>
      )}
      <span className="tile-label" aria-hidden="true">
        {CHILD_CATEGORY[category].label}
      </span>
    </>
  );
}

export function CategoryScreen({
  items,
  onPick,
  onBack,
}: {
  items: KidItem[];
  onPick: (category: KidCategory) => void;
  onBack?: (() => void) | undefined;
}) {
  useEffect(() => {
    if (greeted) return;
    greeted = true;
    void playSequence([voiceLine(GREETING)]);
  }, []);
  return (
    <div className="screen fairy-page fairy-categories" data-testid="categories">
      <FairyHeader
        title="Выбирай!"
        picture="/playroom/chest-open.webp"
        hint={HINT_PICK}
        celebrate
        onBack={onBack}
        backTestId="to-today"
      />
      <div className="fairy-toy-grid">
        {categoriesOf(items).map((category, i) => (
          <button
            key={category}
            type="button"
            className="fairy-category"
            style={{ '--i': Math.min(i, 7) } as React.CSSProperties}
            data-testid="category"
            data-category={category}
            data-hint={i === 0 ? '' : undefined}
            aria-label={CATEGORY_LABELS[category]}
            onClick={() => {
              fx.whoosh();
              void playSequence([ru(categoryPhrase(category))]);
              onPick(category);
            }}
          >
            <img src={CHILD_CATEGORY[category].picture} alt="" draggable={false} />
            <span>{CHILD_CATEGORY[category].label}</span>
          </button>
        ))}
      </div>
      <IdleHint onIdle={() => void playSequence([voiceLine(HINT_PICK)])} first={9000} />
    </div>
  );
}

/** Assigned content and review rules are preserved; imagery carries the navigation. */
export function HomeScreen({
  items,
  onPick,
  onReview,
  onBack,
}: {
  items: KidItem[];
  onPick: (index: number) => void;
  onReview?: (index: number) => boolean;
  onBack?: (() => void) | undefined;
}) {
  const category = categoriesOf(items)[0];
  const path = pathLength(items);
  const tiles = items.slice(path);
  const video = category === 'video';
  return (
    <div
      className={`screen fairy-page fairy-collection${video ? ' fairy-cinema' : ''}`}
      data-testid={items.length ? 'home' : 'empty'}
    >
      <FairyHeader
        title={category ? CATEGORY_SHORT[category] : 'Пока пусто'}
        picture={category ? CHILD_CATEGORY[category].picture : '/playroom/chest.webp'}
        hint={HINT_PICK}
        celebrate
        onBack={onBack}
      />
      {!items.length && (
        <div className="fairy-empty">
          <img src="/playroom/bunny.webp" alt="" />
          <p>Здесь появятся твои приключения</p>
        </div>
      )}
      {path > 0 && <LessonPath items={items.slice(0, path)} onPick={onPick} />}
      <div className="fairy-items">
        {tiles.map((item, j) => {
          const i = path + j;
          const resting = restingIn(tiles, item);
          return (
            <button
              key={`${item.kind}-${item.id}`}
              type="button"
              className={`fairy-item ${item.kind === 'segment' ? 'fairy-film' : 'fairy-game'}${resting ? ' rested' : ''}`}
              style={{ '--i': Math.min(j, 6) } as React.CSSProperties}
              onClick={() => {
                if (!resting) {
                  fx.tap();
                  return onPick(i);
                }
                if (onReview?.(i)) return;
                fx.soft();
                void playSequence([voiceLine(item.rest === 'learned' ? REST_LEARNED : REST_TODAY)]);
              }}
              data-testid="tile"
              data-kind={item.kind}
              data-rest={resting ? item.rest : undefined}
              data-hint={i === 0 ? '' : undefined}
              aria-label={
                item.kind === 'deck'
                  ? `Карточки: ${item.cards
                      .slice(0, 3)
                      .map((card) => card.translation?.text || card.word.text)
                      .join(', ')}`
                  : item.kind === 'interactive'
                    ? GAME_KINDS[item.spec.kind]
                    : `${item.title?.trim() || `Видео ${j + 1}`}${item.subject ? `, ${CATEGORY_SHORT[item.subject]}` : ''}`
              }
            >
              <span className="fairy-item-art">
                {item.kind === 'interactive' ? (
                  <GameTile spec={item.spec} />
                ) : item.kind === 'deck' ? (
                  <DeckPreview deck={item} />
                ) : item.thumbnailUrl ? (
                  <img
                    src={item.thumbnailUrl}
                    alt=""
                    draggable={false}
                    loading={j > 1 ? 'lazy' : 'eager'}
                  />
                ) : (
                  <img
                    className="fairy-film-fallback"
                    src="/playroom/tablet.webp"
                    alt=""
                    draggable={false}
                  />
                )}
                {item.kind === 'segment' && (
                  <span className="fairy-play" aria-hidden="true">
                    <Icon name="play" size={30} fill />
                  </span>
                )}
              </span>
              {item.kind === 'segment' && (
                <span className="fairy-film-name" aria-hidden="true">
                  {item.title?.trim() || `Видео ${j + 1}`}
                </span>
              )}
              {resting && (
                <span className="fairy-rest-star" aria-hidden="true">
                  <img src="/games/robot-star.webp" alt="" />
                </span>
              )}
            </button>
          );
        })}
      </div>
      <IdleHint onIdle={() => void playSequence([voiceLine(HINT_PICK)])} first={8000} />
    </div>
  );
}
