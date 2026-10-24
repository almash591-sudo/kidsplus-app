// Альбом наклеек (этап 17): все наклейки сеткой — собранные яркие (касание — имя голосом),
// несобранные — серые силуэты «?». Сверху — сколько собрано.
import { useState } from 'react';
import { playSequence } from '../audio';
import { fx } from '../fx';
import { ru } from '../games/common';
import { stickerName } from '../phrases';
import { STICKERS, stickerCounts } from '../stickers';
import { Icon } from '../ui/icons';

export function AlbumButton({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      type="button"
      className="album-open"
      aria-label="Альбом наклеек"
      data-testid="album-open"
      onClick={() => {
        fx.tap();
        onOpen();
      }}
    >
      <span aria-hidden="true">⭐</span>
    </button>
  );
}

export function AlbumScreen({ onExit }: { onExit: () => void }) {
  const [counts] = useState(stickerCounts);
  const [popped, setPopped] = useState<string | null>(null);
  const got = STICKERS.filter((s) => counts[s.emoji]).length;
  return (
    <div className="screen album" data-testid="album">
      <button
        type="button"
        className="corner-button home"
        aria-label="Домой"
        onClick={onExit}
        data-testid="album-close"
      >
        <Icon name="home" size={34} stroke={2.6} />
      </button>
      <header className="album-head">
        <h1>Мои наклейки</h1>
        <div className="album-progress" aria-label={`Собрано ${got} из ${STICKERS.length}`}>
          <span style={{ width: `${(got / STICKERS.length) * 100}%` }} />
        </div>
        <p>
          {got} из {STICKERS.length}
        </p>
      </header>
      <div className="album-grid">
        {/* Собранные — первыми: ребёнок сразу видит свою коллекцию. */}
        {[...STICKERS]
          .sort((a, b) => Number(Boolean(counts[b.emoji])) - Number(Boolean(counts[a.emoji])))
          .map((s, i) => {
            const n = counts[s.emoji] ?? 0;
            return (
              <button
                key={s.emoji}
                type="button"
                className={['album-cell', n ? 'got' : 'empty', popped === s.emoji && 'popped']
                  .filter(Boolean)
                  .join(' ')}
                style={{ '--i': i % 12 } as React.CSSProperties}
                data-testid="album-cell"
                data-got={n > 0}
                aria-label={n ? s.name : 'Ещё не собрана'}
                onClick={() => {
                  if (!n) return void fx.soft();
                  setPopped(s.emoji);
                  fx.sparkle();
                  void playSequence([ru(stickerName(s.name))]);
                  setTimeout(() => setPopped((p) => (p === s.emoji ? null : p)), 700);
                }}
              >
                <span className="album-emoji">{n ? s.emoji : '?'}</span>
                {n > 1 && <span className="album-count">×{n}</span>}
              </button>
            );
          })}
      </div>
    </div>
  );
}
