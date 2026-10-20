import type { KidPhrases } from '@kidsplus/shared/api';
import type { GameKind, GameSpec } from '@kidsplus/shared/games';
import { specAtLevel } from '@kidsplus/shared/levels';
import { useEffect, useMemo, useState, useSyncExternalStore, type ComponentType } from 'react';
import { sendEvent } from '../api';
import { stopAudio } from '../audio';
import { markDone, markTried } from '../progress';
import { Celebrate } from '../Celebrate';
import { Balloons } from './Balloons';
import { Coloring } from './Coloring';
import { gameLock, gameMistakes, repeatCurrentTask, say, setTask, type GameProps } from './common';
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
import { Beats } from './music/Beats';
import { LetterGame } from './letters/LetterGame';
import { MusicChoice } from './music/Choice';
import { Piano } from './music/Piano';
import { Rhythm } from './music/Rhythm';
import { Staff } from './music/Staff';
import { Song } from './music/Song';
import { Freeze } from './music/Freeze';
import { Orchestra } from './music/Orchestra';
import './games.css';
import './games-more.css';
import { GAME_INTRO } from '../phrases';
import { IdleHint } from '../ui/IdleHint';
import { Icon } from '../ui/icons';

/** Игры без своего задания: как играть — звучит при входе. */
const SILENT: readonly GameKind[] = ['drawing', 'memory', 'puzzle'];

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
  pitch: MusicChoice as ComponentType<GameProps<'pitch'>>,
  loudness: MusicChoice as ComponentType<GameProps<'loudness'>>,
  tempo: MusicChoice as ComponentType<GameProps<'tempo'>>,
  duration: MusicChoice as ComponentType<GameProps<'duration'>>,
  direction: MusicChoice as ComponentType<GameProps<'direction'>>,
  beats: Beats,
  rhythm: Rhythm,
  piano: Piano,
  staff: Staff,
  song: Song,
  freeze: Freeze,
  orchestra: Orchestra,
  letter: LetterGame as ComponentType<GameProps<'letter'>>,
  syllable: LetterGame as ComponentType<GameProps<'syllable'>>,
  firstLetter: LetterGame as ComponentType<GameProps<'firstLetter'>>,
  readWord: LetterGame as ComponentType<GameProps<'readWord'>>,
};

/** Экран игры: сама игра, кнопка «домой», в конце — звёздочка и следующий пункт. */
export function GameScreen(props: {
  id: string;
  spec: GameSpec;
  phrases: KidPhrases;
  /** Уровень сложности ребёнка для этого вида игры (этап 34); нет — как задал родитель. */
  level?: number | undefined;
  onDone: () => void;
  onExit: () => void;
}) {
  const { id, onDone } = props;
  const level = props.level ?? 1;
  const spec = useMemo(() => specAtLevel(props.spec, level), [props.spec, level]);
  const [finished, setFinished] = useState(false);
  const Game = GAMES[spec.kind] as ComponentType<GameProps<GameKind>>;

  useEffect(() => {
    gameMistakes.reset();
    return () => {
      stopAudio();
      gameLock.reset();
    };
  }, []);
  // После ошибки касания на миг закрыты, при «тыканье наугад» — пауза с совёнком (этап 30).
  const lock = useSyncExternalStore(gameLock.subscribe, gameLock.get);

  // Как играть — для игр без своего задания (игры с заданием говорят его сами).
  useEffect(() => {
    if (SILENT.includes(spec.kind) || (spec.kind === 'coloring' && !spec.tasks))
      void say(GAME_INTRO[spec.kind]);
    return () => setTask(null);
  }, [spec]);

  /** «Ушко» и подсказка при бездействии: повторить задание, а нет его — как играть. */
  const remind = () => {
    if (!repeatCurrentTask()) void say(GAME_INTRO[spec.kind]);
  };

  useEffect(() => {
    if (!finished) return;
    const t = setTimeout(onDone, 1800);
    return () => clearTimeout(t);
  }, [finished, onDone]);

  return (
    <div
      className={lock === 'none' ? 'game-screen' : `game-screen kp-${lock}`}
      data-testid="game"
      data-lock={lock}
      data-kind={spec.kind}
      data-level={level}
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
              payload: { kind: spec.kind, mistakes: gameMistakes.get(), level },
            });
            markDone(id);
            setFinished(true);
          }}
        />
      )}
      {lock === 'think' && (
        <div className="game-think" data-testid="game-think" aria-hidden="true">
          <img src="/owl/point.webp" alt="" draggable={false} />
        </div>
      )}
      {!finished && <Mascot />}
      {!finished && <IdleHint onIdle={remind} first={6000} />}
      {!finished && (
        <button
          type="button"
          className="corner-button ear"
          aria-label="Повторить задание"
          onClick={remind}
          data-testid="ear"
        >
          👂
        </button>
      )}
      <button
        type="button"
        className="corner-button home"
        aria-label="Домой"
        onClick={() => {
          // Ушёл, не пройдя, — дорожка уроков это запомнит и не будет звать сюда без конца.
          if (!finished) markTried(id);
          props.onExit();
        }}
        data-testid="go-home"
      >
        <Icon name="home" size={34} stroke={2.6} />
      </button>
    </div>
  );
}
