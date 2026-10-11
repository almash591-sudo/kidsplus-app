// Галерея ребёнка: свои снимки с телефона, крупной сеткой. Без «поделиться» и скачивания;
// удаляет только родитель (в кабинете).
import { useEffect, useMemo, useState } from 'react';
import { fx } from '../fx';
import { listCaptures, type StoredCapture } from './store';
import { Icon } from '../ui/icons';

export function GalleryScreen({ onBack }: { onBack: () => void }) {
  const [items, setItems] = useState<StoredCapture[] | null>(null);
  const [open, setOpen] = useState<number | null>(null);

  useEffect(() => {
    listCaptures().then(setItems, () => setItems([]));
  }, []);

  // Ссылки на файлы — пока галерея открыта.
  const urls = useMemo(() => (items ?? []).map((c) => URL.createObjectURL(c.blob)), [items]);
  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [urls]);

  const current = open === null ? null : items?.[open];
  return (
    <div className="screen gallery" data-testid="gallery">
      {items && !items.length && <div className="gallery-empty">📷</div>}
      <div className="gallery-grid">
        {items?.map((c, i) => (
          <button
            key={c.id}
            type="button"
            className="gallery-tile"
            data-testid="gallery-item"
            data-kind={c.kind}
            onClick={() => {
              fx.tap();
              setOpen(i);
            }}
          >
            {c.kind === 'photo' ? (
              <img src={urls[i]} alt="" />
            ) : (
              <>
                <video src={urls[i]} muted playsInline preload="metadata" />
                <span className="gallery-play">▶</span>
              </>
            )}
          </button>
        ))}
      </div>

      {current && (
        <div className="gallery-viewer" data-testid="gallery-viewer">
          {current.kind === 'photo' ? (
            <img src={urls[open!]} alt="" />
          ) : (
            <video
              src={urls[open!]}
              autoPlay
              playsInline
              controls
              controlsList="nodownload noplaybackrate noremoteplayback"
              disablePictureInPicture
            />
          )}
          <button
            type="button"
            className="corner-button home"
            aria-label="Назад"
            data-testid="gallery-close"
            onClick={() => {
              fx.whoosh();
              setOpen(null);
            }}
          >
            ✕
          </button>
        </div>
      )}

      {!current && (
        <button
          type="button"
          className="corner-button home"
          aria-label="Назад"
          onClick={onBack}
          data-testid="go-home"
        >
          <Icon name="home" size={34} stroke={2.6} />
        </button>
      )}
    </div>
  );
}

/** Кнопка камеры на экранах выбора (вне уроков). */
export function CameraButton({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      type="button"
      className="camera-open"
      aria-label="Камера"
      data-testid="camera-open"
      onClick={() => {
        fx.tap();
        onOpen();
      }}
    >
      <Icon name="camera" size={34} stroke={2} />
    </button>
  );
}
