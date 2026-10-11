import type { KidCategory, KidItem } from '@kidsplus/shared/api';
import { useEffect } from 'react';
import { playSequence } from '../audio';
import { categoriesOf } from '../categories';
import { fx } from '../fx';
import { GameTile } from '../games/GameTile';
import { ru } from '../games/common';
import { CATEGORY_LABELS, categoryPhrase, GREETING, HINT_PICK } from '../phrases';
import { CategoryArt } from '../ui/CategoryArt';
import { IdleHint } from '../ui/IdleHint';
import { Icon } from '../ui/icons';
import { isLessonPath, LessonPath } from './LessonPath';

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
      className={onBack ? 'screen tiles categories with-back' : 'screen tiles categories'}
      data-testid="categories"
      style={{ '--rows': Math.ceil(categoriesOf(items).length / 2) } as React.CSSProperties}
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
        items.map((item, i) => (
          <button
            key={`${item.kind}-${item.id}`}
            type="button"
            className={
              item.kind === 'segment' ? 'tile' : `tile ${item.kind === 'deck' ? 'deck' : 'game'}`
            }
            style={{ '--i': i } as React.CSSProperties}
            onClick={() => onPick(i)}
            data-testid="tile"
            data-kind={item.kind}
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
              <img src={item.coverUrl} alt="" draggable={false} />
            ) : item.thumbnailUrl ? (
              <img src={item.thumbnailUrl} alt="" draggable={false} />
            ) : (
              <span className="tile-play" aria-hidden="true">
                <Icon name="play" size={56} fill />
              </span>
            )}
            {item.kind === 'segment' && item.thumbnailUrl && (
              <span className="tile-play small" aria-hidden="true">
                <Icon name="play" size={26} fill />
              </span>
            )}
          </button>
        ))
      )}
      <IdleHint onIdle={() => void playSequence([ru(HINT_PICK)])} first={8000} />
    </div>
  );
}
