import type { KidPhrases } from '@kidsplus/shared/api';
import type { GameKind, GameSpec } from '@kidsplus/shared/games';
import { useEffect, useState, type ComponentType } from 'react';
import { sendEvent } from '../api';
import { stopAudio } from '../audio';
import { Celebrate } from '../Celebrate';
import { Balloons } from './Balloons';
import { Coloring } from './Coloring';
import type { GameProps } from './common';
import { Counting } from './Counting';
import { Drawing } from './Drawing';
import { Memory } from './Memory';
import { Puzzle } from './Puzzle';
import { Sorting } from './Sorting';
import { Tracing } from './Tracing';
import { Arithmetic } from './Arithmetic';
import { Compare } from './Compare';
import { Flashlight } from './Flashlight';
import { trail } from './juice';
import { Mascot } from './Mascot';
import { Maze } from './Maze';
import { Melody } from './Melody';
import { Moles } from './Moles';
import { Odd } from './Odd';
import { Pattern } from './Pattern';
import { Sequence } from './Sequence';
import { Shadows } from './Shadows';
import { Shapes } from './Shapes';
import { Size } from './Size';
import { Word } from './Word';
import './games.css';
import './games-more.css';
import { Icon } from '../ui/icons';

/** Плагины игр: вид → компонент (параметры проверены схемой gameSpec на сервере). */
const GAMES: { [K in GameKind]: ComponentType<GameProps<K>> } = {
  drawing: Drawing,
  coloring: Coloring,
  sorting: Sorting,
  memory: Memory,
  puzzle: Puzzle,
  tracing: Tracing,
  balloons: Balloons,
  counting: Counting,
  maze: Maze,
  shadows: Shadows,
  flashlight: Flashlight,
  moles: Moles,
  melody: Melody,
  shapes: Shapes,
  odd: Odd,
  pattern: Pattern,
  compare: Compare,
  arithmetic: Arithmetic,
  size: Size,
  sequence: Sequence,
  word: Word,
};

/** Экран игры: сама игра, кнопка «домой», в конце — звёздочка и следующий пункт. */
export function GameScreen(props: {
  id: string;
  spec: GameSpec;
  phrases: KidPhrases;
  onDone: () => void;
  onExit: () => void;
}) {
  const { id, spec, onDone } = props;
  const [finished, setFinished] = useState(false);
  const Game = GAMES[spec.kind] as ComponentType<GameProps<GameKind>>;

  useEffect(() => () => stopAudio(), []);

  useEffect(() => {
    if (!finished) return;
    const t = setTimeout(onDone, 1800);
    return () => clearTimeout(t);
  }, [finished, onDone]);

  return (
    <div
      className="game-screen"
      data-testid="game"
      data-kind={spec.kind}
      // След пальца — в любой игре, пока палец на экране.
      onPointerMoveCapture={(e) => e.buttons && trail(e.clientX, e.clientY)}
    >
      {finished ? (
        <Celebrate testId="game-finished" />
      ) : (
        <Game
          spec={spec}
          phrases={props.phrases}
          onFinish={() => {
            sendEvent({
              type: 'interactive_complete',
              interactiveId: id,
              payload: { kind: spec.kind },
            });
            setFinished(true);
          }}
        />
      )}
      {!finished && <Mascot />}
      <button
        type="button"
        className="corner-button home"
        aria-label="Домой"
        onClick={props.onExit}
        data-testid="go-home"
      >
        <Icon name="home" size={34} stroke={2.6} />
      </button>
    </div>
  );
}
