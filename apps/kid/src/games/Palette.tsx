import { PALETTE, say, type PaintId } from './common';
import { Icon } from '../ui/icons';

/** Краски: крупные кружки; выбранный — с обводкой. Название цвета звучит при выборе. */
export function Palette({
  value,
  onChange,
  colors = PALETTE.map((p) => p.id),
  marked = false,
  hintColor,
}: {
  value: PaintId | null;
  onChange: (id: PaintId) => void;
  colors?: readonly PaintId[];
  marked?: boolean;
  hintColor?: PaintId | undefined;
}) {
  return (
    <div className="palette" data-testid="palette">
      {colors.map((id) => {
        const p = PALETTE.find((x) => x.id === id)!;
        return (
          <button
            key={id}
            type="button"
            className={`paint${value === id ? ' on' : ''}${hintColor === id ? ' suggested' : ''}`}
            style={{ background: p.hex }}
            aria-label={p.name}
            aria-pressed={value === id}
            data-paint={id}
            onClick={() => {
              onChange(id);
              void say(p.name);
            }}
          >
            {marked && value === id && <Icon name="check" size={25} />}
          </button>
        );
      })}
    </div>
  );
}
