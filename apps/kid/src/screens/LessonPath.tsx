import type { KidItem } from '@kidsplus/shared/api';
import { useEffect, useRef, useState } from 'react';
import { ICON } from '../games/GameTile';
import { doneIds, STUCK_AFTER, triedCounts } from '../progress';
import { Icon } from '../ui/icons';
import '../games/music/music.css';

/** Раздел — дорожка уроков: все пункты — игры-уроки музыки или букв (по порядку). */
export const isLessonPath = (items: readonly KidItem[]) =>
  items.length > 0 &&
  items.every(
    (i) => i.kind === 'interactive' && (i.category === 'music' || i.category === 'letters'),
  );

/**
 * Дорожка уроков: кружки по порядку, пройденные — со звёздочкой, следующий светится.
 * Ребёнку не нужно выбирать из десятков плиток — нажать на светящийся кружок.
 */
export function LessonPath({
  items,
  onPick,
}: {
  items: KidItem[];
  onPick: (index: number) => void;
}) {
  const [done] = useState(doneIds);
  const [tried] = useState(triedCounts);
  const isStuck = (id: string) => !done.has(id) && (tried[id] ?? 0) >= STUCK_AFTER;
  // Светится первый непройденный урок; трудный, из которого ребёнок уже дважды ушёл, — подождёт.
  const fresh = items.findIndex((i) => !done.has(i.id) && !isStuck(i.id));
  const next = Math.max(0, fresh >= 0 ? fresh : items.findIndex((i) => !done.has(i.id)));
  const nextRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    nextRef.current?.scrollIntoView?.({ block: 'center' });
  }, []);
  return (
    <div className="lesson-path" data-testid="lesson-path">
      {items.map((item, i) => {
        const isDone = done.has(item.id);
        return (
          <button
            key={item.id}
            ref={i === next ? nextRef : undefined}
            type="button"
            className={['path-step', isDone && 'done', i === next && 'next']
              .filter(Boolean)
              .join(' ')}
            style={{ '--i': i % 6 } as React.CSSProperties}
            data-testid="tile"
            data-kind={item.kind}
            data-done={isDone}
            data-hint={i === next ? '' : undefined}
            aria-label={`Урок ${i + 1}`}
            onClick={() => onPick(i)}
          >
            <span className="path-icon" aria-hidden="true">
              {item.kind === 'interactive' ? ICON[item.spec.kind] : '🎵'}
            </span>
            <span className="path-num" aria-hidden="true">
              {i + 1}
            </span>
            {isDone && (
              <span className="path-star" aria-hidden="true">
                <Icon name="star" size="100%" fill stroke={1.2} />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
