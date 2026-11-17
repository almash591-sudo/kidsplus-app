import { mediaUrl } from '@kidsplus/shared/api';
import { bookOf } from '@kidsplus/shared/books';
import { poemOf } from '@kidsplus/shared/poems';
import type { GameKind, GameSpec } from '@kidsplus/shared/games';
import { BookScene } from './BookScene';
import { markOf, shelfState } from './bookPlan';
import { PictureSvg } from './Coloring';
import { PALETTE } from './common';
import { PICTURES } from './pictures';
import { CachedImg } from '../ui/CachedImg';
import { TRACES } from './traceShapes';
import './game-previews.css';

/** Запасной значок-эмодзи (подпись для озвучки и тестов); на экране — глиняная картинка. */
export const ICON: Record<GameKind, string> = {
  drawing: '🖍️',
  coloring: '🎨',
  sorting: '🧺',
  memory: '🃏',
  puzzle: '🧩',
  tracing: '✏️',
  balloons: '🎈',
  counting: '🔢',
  maze: '🌀',
  shadows: '👤',
  flashlight: '🔦',
  moles: '🕳️',
  melody: '🔔',
  shapes: '🔺',
  odd: '❓',
  pattern: '🔁',
  compare: '⚖️',
  arithmetic: '➕',
  size: '📏',
  sequence: '➡️',
  word: '🔤',
  pitch: '🐦',
  loudness: '🐘',
  tempo: '🐇',
  duration: '🚂',
  direction: '↕️',
  beats: '🥁',
  rhythm: '🪘',
  piano: '🎹',
  staff: '🎼',
  song: '🎶',
  freeze: '💃',
  orchestra: '🎺',
  letter: '🔤',
  syllable: '🅰️',
  firstLetter: '🐱',
  readWord: '📖',
  syllableCount: '👏',
  soundPlace: '👂',
  wordScheme: '🟥',
  pickWord: '🔎',
  readPhrase: '📜',
  numberHouse: '🏠',
  numberNeighbors: '🔢',
  compareSign: '🐊',
  wordProblem: '🧮',
  clock: '🕒',
  shop: '🛒',
  robot: '🤖',
  space: '🚀',
  fishing: '🎣',
  flight: '🦉',
  builder: '🧱',
  syllableWord: '🔤',
  riddle: '❓',
  sudoku: '🔲',
  dots: '✏️',
  tangram: '🔺',
  colorNumbers: '🔢',
  dive: '🐠',
  rocket: '🚀',
  race: '🏎️',
  differences: '🔍',
  paints: '🎨',
  train: '🚂',
  scales: '⚖️',
  gears: '⚙️',
  dress: '🧸',
  figure: '🔷',
  bot: '🤖',
  cuckoo: '🕰️',
  marble: '🎯',
  bubbles: '🫧',
  seek: '🙈',
  poem: '📖',
  book: '📚',
};

/** Глиняный значок игры (этап 35): квадратная картинка с прозрачным фоном, вписывается без растяжения. */
export function GameIcon({ kind, className }: { kind: GameKind; className?: string }) {
  return (
    <img
      className={className ?? 'game-icon-img'}
      src={`/games/icon-${kind}.webp`}
      alt=""
      draggable={false}
      data-icon={ICON[kind]}
    />
  );
}

/** Use assigned content; if it is unavailable, keep a recognisable activity instead of a broken image. */
function PreviewImage({ id, kind }: { id: string; kind: GameKind }) {
  return (
    <CachedImg
      src={mediaUrl(id)}
      className="preview-image"
      alt=""
      draggable={false}
      onError={(event) => {
        // Keep CachedImg mounted: its cached blob can arrive after the initial network error.
        const image = event.currentTarget;
        const fallback = `/games/icon-${kind}.webp`;
        if (image.getAttribute('src') !== fallback) image.src = fallback;
      }}
    />
  );
}

function PictureCard({ id, kind }: { id: string; kind: GameKind }) {
  return (
    <span className="preview-card">
      <PreviewImage id={id} kind={kind} />
    </span>
  );
}

/** A miniature of the activity: the same rabbit must not mean memory, counting and shadows. */
function ActivityScene({ spec }: { spec: GameSpec }) {
  if (spec.kind === 'coloring') {
    const picture = PICTURES[spec.picture];
    const fills = Object.fromEntries(
      picture.regions.map((r) => [r.id, PALETTE.find((p) => p.id === r.target)!.hex]),
    );
    return (
      <>
        <span className="preview-paper">
          <PictureSvg picture={picture} fills={fills} />
        </span>
        <GameIcon kind="coloring" className="preview-tool" />
      </>
    );
  }
  if (spec.kind === 'memory') {
    return (
      <span className="preview-pair">
        <PictureCard id={spec.imageIds[0]!} kind={spec.kind} />
        <PictureCard id={spec.imageIds[0]!} kind={spec.kind} />
      </span>
    );
  }
  if (spec.kind === 'puzzle') {
    return (
      <>
        <span className="preview-puzzle-board">
          <PreviewImage id={spec.imageIds[0]!} kind={spec.kind} />
          <svg viewBox="0 0 100 100" className="preview-seams">
            <path d="M50 0V34C30 24 30 60 50 50V100M0 50H34C24 70 60 70 50 50H100" />
          </svg>
        </span>
        <GameIcon kind="puzzle" className="preview-tool" />
      </>
    );
  }
  if (spec.kind === 'sorting') {
    return (
      <span className="preview-baskets">
        {spec.bins.slice(0, 2).map((bin, i) => (
          <span className="preview-basket" key={i}>
            <span className="preview-basket-picture">
              <PreviewImage id={bin.imageId} kind={spec.kind} />
            </span>
            <img src="/games/basket.webp" alt="" draggable={false} />
          </span>
        ))}
      </span>
    );
  }
  if (spec.kind === 'shadows') {
    return (
      <span className="preview-twins">
        <PreviewImage id={spec.imageIds[0]!} kind={spec.kind} />
        <span className="preview-shadow">
          <PreviewImage id={spec.imageIds[0]!} kind={spec.kind} />
        </span>
      </span>
    );
  }
  if (spec.kind === 'counting') {
    const count = Math.min(3, spec.max);
    return (
      <>
        <span className="preview-counted">
          {Array.from({ length: count }, (_, i) => (
            <span key={i}>
              <PreviewImage id={spec.imageIds[0]!} kind={spec.kind} />
            </span>
          ))}
        </span>
        <span className="preview-number">{count}</span>
      </>
    );
  }
  if (spec.kind === 'size') {
    return (
      <span className="preview-sizes">
        {[0, 1, 2].map((i) => (
          <PreviewImage key={i} id={spec.imageIds[0]!} kind={spec.kind} />
        ))}
      </span>
    );
  }
  if (spec.kind === 'arithmetic') {
    return (
      <>
        <span className="preview-sum">
          <PreviewImage id={spec.imageIds[0]!} kind={spec.kind} />
          <b>{spec.ops[0] === 'minus' ? '−' : '+'}</b>
          <PreviewImage id={spec.imageIds[0]!} kind={spec.kind} />
        </span>
        <span className="preview-answer">= ?</span>
      </>
    );
  }
  if (spec.kind === 'compare' && spec.mode === 'objects') {
    return (
      <span className="preview-compare">
        {[1, 2].map((count) => (
          <span className="preview-card" key={count}>
            {Array.from({ length: count }, (_, i) => (
              <PreviewImage key={i} id={spec.imageIds[0]!} kind={spec.kind} />
            ))}
          </span>
        ))}
      </span>
    );
  }
  if (spec.kind === 'maze') {
    return (
      <>
        <GameIcon kind="maze" className="preview-toy" />
        <span className="preview-maze-hero">
          <PreviewImage id={spec.heroId} kind={spec.kind} />
        </span>
        <span className="preview-maze-goal">
          <PreviewImage id={spec.goalId} kind={spec.kind} />
        </span>
      </>
    );
  }
  if (spec.kind === 'flashlight') {
    return (
      <>
        <span className="preview-light">
          <PreviewImage id={spec.items[0]!.imageId} kind={spec.kind} />
        </span>
        <GameIcon kind="flashlight" className="preview-tool" />
      </>
    );
  }
  if (spec.kind === 'moles') {
    return (
      <>
        <span className="preview-hole" />
        <span className="preview-peek">
          <PreviewImage id={spec.imageIds[spec.target ?? 0]!} kind={spec.kind} />
        </span>
      </>
    );
  }
  if (spec.kind === 'pattern' || spec.kind === 'sudoku' || spec.kind === 'odd') {
    const pattern = spec.kind === 'pattern' ? spec.patterns[0]! : '';
    const ids =
      spec.kind === 'pattern'
        ? [
            ...Array.from(
              { length: 3 },
              (_, i) => spec.imageIds[pattern.charCodeAt(i % pattern.length) - 65]!,
            ),
            null,
          ]
        : spec.kind === 'sudoku'
          ? [...spec.imageIds.slice(0, 3), null]
          : spec.rounds[0]!.imageIds;
    return (
      <span className="preview-grid">
        {ids.map((id, i) => (
          <span className="preview-card" key={i}>
            {id ? (
              <PreviewImage id={id} kind={spec.kind} />
            ) : (
              <span className="preview-question">?</span>
            )}
          </span>
        ))}
      </span>
    );
  }
  if (spec.kind === 'sequence') {
    return (
      <>
        <span className="preview-sequence">
          {spec.rounds[0]!.imageIds.slice(0, 3).map((id, i) => (
            <PictureCard key={i} id={id} kind={spec.kind} />
          ))}
        </span>
        <span className="preview-order">⟶</span>
      </>
    );
  }
  if (spec.kind === 'word' || spec.kind === 'syllableWord') {
    const word = spec.words[0]!;
    const letters = spec.kind === 'syllableWord' ? word.word.split('-') : [...word.word];
    return (
      <>
        <span className="preview-word-picture">
          <PreviewImage id={word.imageId} kind={spec.kind} />
        </span>
        <span
          className="preview-letters"
          style={{ '--letters': letters.length } as React.CSSProperties}
        >
          {letters.map((letter, i) => (
            <span key={i}>{letter}</span>
          ))}
        </span>
      </>
    );
  }
  if (spec.kind === 'riddle') {
    return (
      <>
        <span className="preview-riddle">
          <PreviewImage id={spec.riddles[0]!.imageId} kind={spec.kind} />
        </span>
        <span className="preview-question-bubble">?</span>
      </>
    );
  }
  if (spec.kind === 'tracing') {
    return (
      <>
        <svg viewBox="0 0 100 100" className="preview-trace">
          {TRACES[spec.shapes[0]!].strokes.map((points, i) => (
            <polyline key={i} points={points.map((p) => p.join(',')).join(' ')} />
          ))}
        </svg>
        <GameIcon kind="tracing" className="preview-tool" />
      </>
    );
  }
  return <GameIcon kind={spec.kind} className="preview-toy" />;
}

/** No navigation text is needed to recognise the activity; the button supplies its spoken name. */
export function GameTile({ spec }: { spec: GameSpec }) {
  if (spec.kind === 'book') {
    const state = shelfState(bookOf(spec.book), markOf(spec.book));
    return (
      <span
        className="game-tile activity-preview book-tile"
        data-preview="book"
        data-shelf={state}
        aria-hidden="true"
      >
        <BookScene code={spec.book} scene={bookOf(spec.book).cover} />
        {state === 'new' && <span className="book-new">новая</span>}
        {state === 'reading' && <span className="book-mark" data-testid="book-mark" />}
      </span>
    );
  }
  if (spec.kind === 'poem') {
    return (
      <span className="game-tile activity-preview poem-tile" data-preview="poem" aria-hidden="true">
        <span className="preview-story">
          <img
            src={`/poems/${poemOf(spec.poem).parts[0]!.picture}.webp`}
            alt=""
            draggable={false}
          />
        </span>
        <GameIcon kind="poem" className="preview-tool" />
      </span>
    );
  }
  return (
    <span className="game-tile activity-preview" data-preview={spec.kind} aria-hidden="true">
      <ActivityScene spec={spec} />
    </span>
  );
}
