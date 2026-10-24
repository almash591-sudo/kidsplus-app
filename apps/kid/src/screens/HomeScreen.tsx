import type { KidCategory, KidItem } from '@kidsplus/shared/api';
import { useEffect } from 'react';
import { playSequence } from '../audio';
import { categoriesOf, restingIn } from '../categories';
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
import { CategoryArt } from '../ui/CategoryArt';
import { IdleHint } from '../ui/IdleHint';
import { Icon } from '../ui/icons';
import { isLessonPath, LessonPath } from './LessonPath';
import { CachedImg } from '../ui/CachedImg';

/** Приветствие — один раз за запуск приложения. */
let greeted = false;

/** Короткая подпись на плитке раздела (полное название звучит голосом). */
export const CATEGORY_SHORT: Record<KidCategory, string> = {
  video: 'Видео',
  english: 'Английский',
  math: 'Математика',
  chinese: 'Китайский',
  geography: 'География',
  nature: 'Природа',
  music: 'Музыка',
  letters: 'Буквы',
  poems: 'Стихи',
  games: 'Игры',
  other: 'Разное',
};

/** Плитка раздела: значок на белой плашке и подпись — малыш узнаёт по цвету и значку. */
export function CategoryFace({ category }: { category: KidCategory }) {
  return (
    <>
      <span className="tile-badge" aria-hidden="true">
        <CategoryArt category={category} />
      </span>
      <span className="tile-label" aria-hidden="true">
        {CATEGORY_SHORT[category]}
      </span>
    </>
  );
}

/** Экран разделов: видео, английский, математика, китайский… */
export function CategoryScreen({
  items,
  onPick,
  onBack,
}: {
  items: KidItem[];
  onPick: (category: KidCategory) => void;
  /** Назад к «Сегодня» — в режиме расписания (свободное время). */
  onBack?: (() => void) | undefined;
}) {
  useEffect(() => {
    if (greeted) return;
    greeted = true;
    void playSequence([ru(GREETING)]);
  }, []);
  return (
    <div
      className={[
        'screen tiles categories',
        onBack ? 'with-back' : '',
        // Много разделов: на невысоком экране (iPhone в Safari, iPhone SE) — в три колонки.
        categoriesOf(items).length > 6 ? 'many' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      data-testid="categories"
      style={
        {
          '--rows': Math.ceil(categoriesOf(items).length / 2),
          '--rows3': Math.ceil(categoriesOf(items).length / 3),
        } as React.CSSProperties
      }
    >
      {onBack ? (
        <button
          type="button"
          className="corner-button home"
          aria-label="К занятиям"
          onClick={onBack}
          data-testid="to-today"
        >
          <Icon name="back" size={34} stroke={2.6} />
        </button>
      ) : (
        <header className="screen-title" aria-hidden="true">
          <h1>Привет!</h1>
          <p>Что будем делать?</p>
        </header>
      )}
      {categoriesOf(items).map((c, i) => (
        <button
          key={c}
          type="button"
          className={`tile category ${c}`}
          style={{ '--i': i } as React.CSSProperties}
          onClick={() => {
            // Раздел называется вслух — ребёнок узнаёт, куда попал.
            fx.whoosh();
            void playSequence([ru(categoryPhrase(c))]);
            onPick(c);
          }}
          data-testid="category"
          data-category={c}
          data-hint={i === 0 ? '' : undefined}
          aria-label={CATEGORY_LABELS[c]}
        >
          <CategoryFace category={c} />
        </button>
      ))}
      <IdleHint onIdle={() => void playSequence([ru(HINT_PICK)])} first={9000} />
    </div>
  );
}

/** Пункты раздела: крупные карточки без текста. Только пункты списка своего ребёнка. */
export function HomeScreen({
  items,
  onPick,
  onBack,
}: {
  items: KidItem[];
  onPick: (index: number) => void;
  /** Назад к разделам — если разделов несколько. */
  onBack?: (() => void) | undefined;
}) {
  if (!items.length) {
    return (
      <div className="screen center" data-testid="empty">
        <div className="sun" aria-hidden="true">
          🌙
        </div>
      </div>
    );
  }
  return (
    <div className={onBack ? 'screen tiles with-back' : 'screen tiles'} data-testid="home">
      {onBack && (
        <button
          type="button"
          className="corner-button home"
          aria-label="К разделам"
          onClick={() => {
            fx.whoosh();
            onBack();
          }}
          data-testid="to-categories"
        >
          <Icon name="back" size={34} stroke={2.6} />
        </button>
      )}
      {isLessonPath(items) ? (
        <LessonPath items={items} onPick={onPick} />
      ) : (
        items.map((item, i) => {
          // Этап 34: пройденное отдыхает — бледная плитка со звёздочкой, совёнок зовёт к новому.
          const resting = restingIn(items, item);
          return (
            <button
              key={`${item.kind}-${item.id}`}
              type="button"
              className={`${
                item.kind === 'segment' ? 'tile' : `tile ${item.kind === 'deck' ? 'deck' : 'game'}`
              }${resting ? ' rested' : ''}`}
              style={{ '--i': i } as React.CSSProperties}
              onClick={() => {
                if (!resting) return onPick(i);
                fx.soft();
                void playSequence([ru(item.rest === 'learned' ? REST_LEARNED : REST_TODAY)]);
              }}
              data-testid="tile"
              data-kind={item.kind}
              data-rest={resting ? item.rest : undefined}
              data-hint={i === 0 ? '' : undefined}
              aria-label={
                item.kind === 'deck'
                  ? 'Карточки'
                  : item.kind === 'interactive'
                    ? 'Играть'
                    : 'Смотреть'
              }
            >
              {item.kind === 'interactive' ? (
                <GameTile spec={item.spec} />
              ) : item.kind === 'deck' ? (
                <CachedImg src={item.coverUrl} alt="" draggable={false} />
              ) : item.thumbnailUrl ? (
                <img src={item.thumbnailUrl} alt="" draggable={false} />
              ) : (
                <span className="tile-play" aria-hidden="true">
                  <Icon name="play" size={56} fill />
                </span>
              )}
              {item.kind === 'segment' && item.thumbnailUrl && !resting && (
                <span className="tile-play small" aria-hidden="true">
                  <Icon name="play" size={26} fill />
                </span>
              )}
              {resting && (
                <span className="tile-star" aria-hidden="true">
                  <Icon name="star" size={30} fill />
                </span>
              )}
            </button>
          );
        })
      )}
      <IdleHint onIdle={() => void playSequence([ru(HINT_PICK)])} first={8000} />
    </div>
  );
}
