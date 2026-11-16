// Яркость экрана (этап 12в): кнопка-солнышко и три больших солнца — тусклее, средне,
// ярче. Меняет системную яркость через киоск (владелец устройства); вне киоска кнопки нет.
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { fx } from '../fx';
import { brightnessSupported, setBrightness } from '../kiosk';
import { Icon } from './icons';

const LEVELS = [
  { level: 0.15, label: 'Тусклее', size: 34 },
  { level: 0.5, label: 'Средне', size: 50 },
  { level: 1, label: 'Ярче', size: 66 },
] as const;

function Sun({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <circle cx="24" cy="24" r="10" fill="#ffc21a" />
      {Array.from({ length: 8 }, (_, i) => (
        <rect
          key={i}
          x="22.5"
          y="3"
          width="3"
          height="8"
          rx="1.5"
          fill="#ffc21a"
          transform={`rotate(${i * 45} 24 24)`}
        />
      ))}
    </svg>
  );
}

function BrightnessPicker({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const node = dialog.current!;
    node.showModal();
    return () => node.close();
  }, []);
  // Native modal stays above the room's tools dialog and keeps its controls interactive.
  return createPortal(
    <dialog
      ref={dialog}
      className="brightness-dialog"
      data-testid="brightness"
      aria-label="Яркость экрана"
      onCancel={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }}
    >
      <div className="sheet-backdrop" onClick={onClose} role="presentation">
        <div className="sheet">
          <div className="brightness-levels">
            {LEVELS.map((l) => (
              <button
                key={l.level}
                type="button"
                className="brightness-level"
                aria-label={l.label}
                data-testid="brightness-level"
                onClick={(e) => {
                  e.stopPropagation();
                  fx.drop();
                  setBrightness(l.level);
                  onClose();
                }}
              >
                <Sun size={l.size} />
              </button>
            ))}
          </div>
          <button type="button" className="sheet-close" aria-label="Закрыть" onClick={onClose}>
            <Icon name="back" size={28} stroke={2.6} />
          </button>
        </div>
      </div>
    </dialog>,
    document.body,
  );
}

export function BrightnessButton() {
  const [open, setOpen] = useState(false);
  if (!brightnessSupported()) return null;
  return (
    <>
      <button
        type="button"
        className="brightness-open"
        aria-label="Яркость"
        data-testid="brightness-open"
        onClick={() => setOpen(true)}
      >
        <Sun size={40} />
      </button>
      {open && <BrightnessPicker onClose={() => setOpen(false)} />}
    </>
  );
}
