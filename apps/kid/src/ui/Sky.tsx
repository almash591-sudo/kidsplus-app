// Живой фон детского приложения (этап 17): цветные облака плывут, иногда мерцают звёздочки.
const STARS = [
  { x: 12, y: 18, d: 0 },
  { x: 78, y: 12, d: 2.3 },
  { x: 64, y: 46, d: 4.1 },
  { x: 22, y: 70, d: 1.4 },
  { x: 88, y: 80, d: 5.6 },
];

export function Sky() {
  return (
    <div className="sky" aria-hidden="true">
      <i />
      <i />
      <i />
      <i />
      {STARS.map((s, k) => (
        <b key={k} style={{ left: `${s.x}%`, top: `${s.y}%`, animationDelay: `${s.d}s` }}>
          ✦
        </b>
      ))}
    </div>
  );
}
