import { bookOf, bookPicture, type BookCode } from '@kidsplus/shared/books';

/** Тон фона сцены-заглушки — свой у каждой сцены, чтобы страницы различались. */
const hue = (scene: string) => [...scene].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);

/**
 * Сцена книжки (этап 52): глиняная картинка целиком, за ней — она же, размытая. Пока сцены не
 * нарисованы (drawn: false), — её эмодзи на цветном фоне. pan — куда наезжает камера: соседние
 * страницы с одной сценой смотрятся по-разному.
 */
export function BookScene({
  code,
  scene,
  pan = 0,
  className = 'poem-pic book-pic',
}: {
  code: BookCode;
  scene: string;
  pan?: number;
  className?: string;
}) {
  const book = bookOf(code);
  const cls = `${className} pan-${pan % 3}`;
  if (!book.drawn) {
    return (
      <div
        className={`${cls} draft`}
        key={`${scene}-${pan}`}
        data-picture={scene}
        style={{ '--h': hue(scene) } as React.CSSProperties}
      >
        <span className="book-draft" aria-hidden="true">
          {book.art[scene]}
        </span>
      </div>
    );
  }
  const src = bookPicture(scene);
  return (
    <div className={cls} key={`${scene}-${pan}`} data-picture={scene}>
      <img className="poem-pic-bg" src={src} alt="" draggable={false} aria-hidden="true" />
      <img className="poem-pic-img" src={src} alt="" draggable={false} />
    </div>
  );
}
