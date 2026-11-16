import { useEffect, useRef, useState } from 'react';
import { playSequence } from '../audio';
import { fx } from '../fx';
import { ru } from '../games/common';
import { ROOM_PHRASES, stickerName } from '../phrases';
import { STICKERS, stickerCounts } from '../stickers';
import { FairyHeader } from '../ui/FairyGuide';
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
      <Icon name="star" size={34} />
    </button>
  );
}

const PAGE_SIZE = 12;
function StickerPreview({
  sticker,
  onClose,
}: {
  sticker: (typeof STICKERS)[number];
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const opener = useRef(document.activeElement as HTMLElement | null);
  useEffect(() => {
    const dialog = ref.current!;
    const before = opener.current;
    dialog.showModal();
    return () => {
      dialog.close();
      if (before?.isConnected) before.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="fairy-sticker-preview"
      aria-label={sticker.name}
      onCancel={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          const b = event.currentTarget.getBoundingClientRect();
          if (
            event.clientX < b.left ||
            event.clientX > b.right ||
            event.clientY < b.top ||
            event.clientY > b.bottom
          )
            onClose();
        }
      }}
    >
      <button
        className="fairy-back"
        type="button"
        onClick={onClose}
        aria-label="Закрыть наклейку"
        autoFocus
      >
        <Icon name="close" size={28} />
      </button>
      <div className="fairy-sticker-big" aria-hidden="true">
        {sticker.emoji}
      </div>
      <p>{sticker.name}</p>
      <div className="fairy-sticker-sparks" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <img
            key={i}
            src="/games/robot-star.webp"
            alt=""
            style={{ '--i': i } as React.CSSProperties}
          />
        ))}
      </div>
    </dialog>
  );
}

export function AlbumScreen({ onExit }: { onExit: () => void }) {
  const [counts] = useState(stickerCounts);
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<(typeof STICKERS)[number] | null>(null);
  const got = STICKERS.filter((s) => counts[s.emoji]).length;
  const sorted = [...STICKERS].sort(
    (a, b) => Number(Boolean(counts[b.emoji])) - Number(Boolean(counts[a.emoji])),
  );
  const pages = Math.ceil(sorted.length / PAGE_SIZE);
  return (
    <div className="screen album fairy-page fairy-album" data-testid="album">
      <FairyHeader
        title="Мои сокровища"
        picture="/playroom/basket.webp"
        hint={ROOM_PHRASES.stickers}
        onBack={onExit}
        backTestId="album-close"
      />
      <div className="fairy-album-count" aria-label={`Собрано ${got} из ${STICKERS.length}`}>
        <img src="/games/robot-star.webp" alt="" />
        <span>
          {got} <span className="fairy-count-total">/ {STICKERS.length}</span>
        </span>
        <div className="album-progress" aria-hidden="true">
          <span style={{ width: `${(got / STICKERS.length) * 100}%` }} />
        </div>
      </div>
      <div className="fairy-album-paper" key={page} data-testid="album-page" data-page={page}>
        <div className="album-grid">
          {sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map((s, i) => {
            const n = counts[s.emoji] ?? 0;
            return (
              <button
                key={s.emoji}
                type="button"
                className={`album-cell ${n ? 'got' : 'empty'}`}
                style={{ '--i': i } as React.CSSProperties}
                data-testid="album-cell"
                data-got={n > 0}
                aria-label={n ? s.name : 'Ещё не собрана'}
                onClick={() => {
                  if (!n) {
                    fx.soft();
                    void playSequence([ru(ROOM_PHRASES.stickers)]);
                    return;
                  }
                  setSelected(s);
                  fx.sparkle();
                  void playSequence([ru(stickerName(s.name))]);
                }}
              >
                {n ? (
                  <span className="album-emoji" aria-hidden="true">
                    {s.emoji}
                  </span>
                ) : (
                  <Icon name="star" size={32} />
                )}
                {n > 1 && <span className="album-count">×{n}</span>}
              </button>
            );
          })}
        </div>
      </div>
      <nav className="fairy-page-controls" aria-label="Страницы альбома">
        <button
          type="button"
          aria-label="Предыдущая страница"
          data-testid="album-prev"
          disabled={page === 0}
          onClick={() => {
            fx.flip();
            setPage((p) => p - 1);
          }}
        >
          <Icon name="prev" size={30} />
        </button>
        <span
          className="fairy-page-dots"
          role="status"
          aria-label={`Страница ${page + 1} из ${pages}`}
        >
          {Array.from({ length: pages }, (_, i) => (
            <span key={i} className={i === page ? 'is-current' : ''} />
          ))}
        </span>
        <button
          type="button"
          aria-label="Следующая страница"
          data-testid="album-next"
          disabled={page === pages - 1}
          onClick={() => {
            fx.flip();
            setPage((p) => p + 1);
          }}
        >
          <Icon name="next" size={30} />
        </button>
      </nav>
      {selected && <StickerPreview sticker={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
