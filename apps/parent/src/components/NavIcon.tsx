// Значки разделов (этап 47): линия на вкладках, белая линия на цветной плитке — в «Ещё» и в
// боковом меню на компьютере (раньше там были эмодзи).

export function LineIcon({ d, size = 26 }: { d: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  );
}

export function TileIcon({ d, color }: { d: string; color: string }) {
  return (
    <span className="attention-icon" style={{ background: color, color: '#fff' }}>
      <LineIcon d={d} size={18} />
    </span>
  );
}
