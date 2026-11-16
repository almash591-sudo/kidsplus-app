// Галерея ребёнка: свои снимки с телефона, крупной сеткой. Без «поделиться» и скачивания;
// удаляет только родитель (в кабинете).
import { useEffect, useMemo, useRef, useState } from 'react';
import { fx } from '../fx';
import { listCaptures, type StoredCapture } from './store';
import { Icon } from '../ui/icons';
import { FairyHeader } from '../ui/FairyGuide';
import { ROOM_PHRASES } from '../phrases';

function CapturePreview({
  item,
  url,
  onClose,
}: {
  item: StoredCapture;
  url: string;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef(document.activeElement as HTMLElement | null);
  useEffect(() => {
    const element = dialog.current!;
    const before = opener.current;
    element.showModal();
    return () => {
      element.close();
      if (before?.isConnected) before.focus();
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className="gallery-viewer fairy-capture-preview"
      data-testid="gallery-viewer"
      aria-label={item.kind === 'photo' ? 'Мой снимок' : 'Моё видео'}
      onCancel={onClose}
    >
      <button
        type="button"
        className="fairy-back"
        aria-label="Назад"
        data-testid="gallery-close"
        onClick={onClose}
        autoFocus
      >
        <Icon name="close" size={28} />
      </button>
      {item.kind === 'photo' ? (
        <img src={url} alt="Мой снимок" />
      ) : (
        <video
          src={url}
          autoPlay
          playsInline
          controls
          controlsList="nodownload noplaybackrate noremoteplayback"
          disablePictureInPicture
        />
      )}
    </dialog>
  );
}

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
    <div className="screen gallery fairy-page fairy-gallery" data-testid="gallery">
      <FairyHeader
        title="Мои снимки"
        picture="/playroom/camera.webp"
        hint={ROOM_PHRASES.gallery}
        onBack={onBack}
        backLabel="Вернуться к фотоаппарату"
        backTestId="go-home"
      />
      {items && !items.length && (
        <div className="fairy-gallery-empty">
          <div className="fairy-photo-friend">
            <img src="/playroom/bunny-wave.webp" alt="" />
          </div>
          <p>Снимем что-нибудь?</p>
          <button type="button" className="fairy-photo-start" onClick={onBack}>
            <Icon name="camera" size={32} /> Сделать фото
          </button>
        </div>
      )}
      <div className="gallery-grid">
        {items?.map((c, i) => (
          <button
            key={c.id}
            type="button"
            className="gallery-tile"
            data-testid="gallery-item"
            data-kind={c.kind}
            aria-label={`${c.kind === 'photo' ? 'Снимок' : 'Видео'} ${i + 1}`}
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
                <span className="gallery-play">
                  <Icon name="play" size={32} />
                </span>
              </>
            )}
          </button>
        ))}
      </div>

      {current && (
        <CapturePreview
          item={current}
          url={urls[open!]!}
          onClose={() => {
            fx.whoosh();
            setOpen(null);
          }}
        />
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
