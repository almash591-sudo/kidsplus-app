import { PALETTE, say, type PaintId } from './common';

/** Краски: крупные кружки; выбранный — с обводкой. Название цвета звучит при выборе. */
export function Palette({
  value,
  onChange,
  colors = PALETTE.map((p) => p.id),
}: {
  value: PaintId | null;
  onChange: (id: PaintId) => void;
  colors?: readonly PaintId[];
}) {
  return (
    <div className="palette" data-testid="palette">
      {colors.map((id) => {
        const p = PALETTE.find((x) => x.id === id)!;
        return (
          <button
            key={id}
            type="button"
            className={value === id ? 'paint on' : 'paint'}
            style={{ background: p.hex }}
            aria-label={p.name}
            data-paint={id}
            onClick={() => {
              onChange(id);
              void say(p.name);
            }}
          />
        );
      })}
    </div>
  );
}
