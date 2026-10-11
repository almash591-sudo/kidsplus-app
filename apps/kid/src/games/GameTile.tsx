import { mediaUrl } from '@kidsplus/shared/api';
import type { GameKind, GameSpec } from '@kidsplus/shared/games';
import { PictureSvg } from './Coloring';
import { PALETTE } from './common';
import { PICTURES } from './pictures';

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
  letter: '🔤',
  syllable: '🅰️',
  firstLetter: '🐱',
  readWord: '📖',
};

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
        <img src={mediaUrl(spec.imageIds[0]!)} alt="" draggable={false} />
        <span className="game-badge">{ICON.puzzle}</span>
      </span>
    );
  }
  const image = tileImage(spec);
  return (
    <span className="game-tile">
      {image ? (
        <img src={mediaUrl(image)} alt="" draggable={false} />
      ) : (
        <span className="game-icon">
          {spec.kind === 'tracing'
            ? /^\d$/.test(spec.shapes[0]!)
              ? spec.shapes[0]
              : '✏️'
            : ICON[spec.kind]}
        </span>
      )}
      {image && <span className="game-badge">{ICON[spec.kind]}</span>}
    </span>
  );
}
