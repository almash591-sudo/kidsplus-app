import { mediaUrl } from '@kidsplus/shared/api';
import type { GameKind, GameSpec } from '@kidsplus/shared/games';
import { PictureSvg } from './Coloring';
import { PALETTE } from './common';
import { PICTURES } from './pictures';
import { CachedImg } from '../ui/CachedImg';

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

/** Картинка для плитки игры (если у игры есть картинки). */
export function tileImage(spec: GameSpec): string | null {
  switch (spec.kind) {
    case 'sorting':
      return spec.bins[0]!.imageId;
    case 'memory':
    case 'counting':
    case 'shadows':
    case 'moles':
    case 'pattern':
    case 'arithmetic':
    case 'size':
    case 'shop':
    case 'sudoku':
      return spec.imageIds[0]!;
    case 'compare':
      return spec.imageIds[0] ?? null;
    case 'maze':
      return spec.heroId;
    case 'flashlight':
      return spec.items[0]!.imageId;
    case 'odd':
    case 'sequence':
      return spec.rounds[0]!.imageIds[0]!;
    case 'word':
    case 'syllableWord':
      return spec.words[0]!.imageId;
    default:
      return null;
  }
}

/** Плитка игры на главном экране: раскраска — своей картинкой, пазл — своей, остальные — значком. */
export function GameTile({ spec }: { spec: GameSpec }) {
  if (spec.kind === 'coloring') {
    const picture = PICTURES[spec.picture];
    // Превью раскрашено «как надо» — ребёнок узнаёт картинку.
    const fills = Object.fromEntries(
      picture.regions.map((r) => [r.id, PALETTE.find((p) => p.id === r.target)!.hex]),
    );
    return <PictureSvg picture={picture} fills={fills} />;
  }
  if (spec.kind === 'puzzle') {
    return (
      <span className="game-tile">
        <CachedImg src={mediaUrl(spec.imageIds[0]!)} alt="" draggable={false} />
        <span className="game-badge">
          <GameIcon kind="puzzle" />
        </span>
      </span>
    );
  }
  const image = tileImage(spec);
  return (
    <span className="game-tile">
      {image ? (
        <CachedImg src={mediaUrl(image)} alt="" draggable={false} />
      ) : (
        <span className="game-icon">
          {spec.kind === 'tracing' && /^\d$/.test(spec.shapes[0]!) ? (
            spec.shapes[0]
          ) : (
            <GameIcon kind={spec.kind} />
          )}
        </span>
      )}
      {image && (
        <span className="game-badge">
          <GameIcon kind={spec.kind} />
        </span>
      )}
    </span>
  );
}
