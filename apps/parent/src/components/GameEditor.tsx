import {
  GAME_CATEGORIES,
  mediaUrl,
  type Game,
  type GameCategory,
  type GameInput,
  type MediaRef,
} from '@kidsplus/shared/api';
import {
  BALLOON_COLORS,
  COLORING_PICTURES,
  DIFF_SCENES,
  DOT_PICTURES,
  FISHING_LETTERS,
  FLASHLIGHT_SCENES,
  GAME_KINDS,
  MOLE_SPEEDS,
  NEIGHBOR_MODES,
  PATTERNS,
  PIANO_MODES,
  SORTER_SHAPES,
  TANGRAM_FIGURES,
  TRACE_SHAPES,
  type GameKind,
  type GameSpec,
  type NeighborMode,
} from '@kidsplus/shared/games';
import {
  BOOK_CODES,
  bookAnnounce,
  bookChars,
  bookOf,
  bookReads,
  BOOKS,
  type BookCode,
  type BookGenre,
} from '@kidsplus/shared/books';
import { RIDDLE_SETS, SUDOKU_SETS, SYLLABLE_WORD_SETS } from '@kidsplus/shared/game-presets';
import {
  POEM_CODES,
  poemAnnounce,
  poemOf,
  POEMS,
  type PoemCode,
  type PoemGenre,
} from '@kidsplus/shared/poems';
import { SONG_IDS, SONGS, type SongId } from '@kidsplus/shared/songs';
import {
  SOUND_LETTERS,
  soundProblem,
  syllablesIn,
  wordScheme,
  type SoundLetter,
} from '@kidsplus/shared/sounds';
import {
  ActionIcon,
  Alert,
  Button,
  Checkbox,
  Chip,
  Group,
  MultiSelect,
  NumberInput,
  SegmentedControl,
  Select,
  Spoiler,
  Stack,
  Switch,
  Text,
  Textarea,
  TextInput,
} from '@mantine/core';
import { useMutation } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api } from '../api';
import { keys, queryClient, useChildren } from '../queries';
import { problem, wordProblemOf } from '../lib/game';
import { ImageSlot } from './ImagePicker';
import { PIANO_MODE_LABELS } from '../pages/GamesPage';
import { SUBJECT_LABELS as GAME_CATEGORY_LABELS } from '../lib/subjects';

const SORTER_LABELS: Record<(typeof SORTER_SHAPES)[number], string> = {
  circle: 'круг',
  square: 'квадрат',
  triangle: 'треугольник',
  rectangle: 'прямоугольник',
  star: 'звезда',
  heart: 'сердце',
  hexagon: 'шестиугольник',
  oval: 'овал',
  rhombus: 'ромб',
  cross: 'крестик',
};

const SCENE_LABELS: Record<(typeof FLASHLIGHT_SCENES)[number], string> = {
  room: 'Комната',
  forest: 'Лес',
  sea: 'Море',
  space: 'Космос',
};

const SPEED_LABELS: Record<(typeof MOLE_SPEEDS)[number], string> = {
  slow: 'медленно (для малышей)',
  normal: 'обычно',
  fast: 'быстро',
};

const PATTERN_LABELS: Record<(typeof PATTERNS)[number], string> = {
  AB: '🍎🍌🍎🍌',
  AAB: '🍎🍎🍌🍎🍎🍌',
  ABB: '🍎🍌🍌🍎🍌🍌',
  ABC: '🍎🍌🍐🍎🍌🍐',
  AABB: '🍎🍎🍌🍌',
};

const PICTURE_LABELS: Record<(typeof COLORING_PICTURES)[number], string> = {
  sun: 'Солнышко',
  fish: 'Рыбка',
  house: 'Домик',
  flower: 'Цветок',
  car: 'Машинка',
  butterfly: 'Бабочка',
  rocket: 'Ракета',
};

const DOT_LABELS: Record<(typeof DOT_PICTURES)[number], string> = {
  star: 'Звёздочка',
  house: 'Домик',
  fish: 'Рыбка',
  heart: 'Сердечко',
  boat: 'Кораблик',
  fir: 'Ёлочка (15 точек)',
  rocket: 'Ракета',
};

const TANGRAM_LABELS: Record<(typeof TANGRAM_FIGURES)[number], string> = {
  house: 'Домик (3)',
  tree: 'Ёлочка (3)',
  rocket: 'Ракета (5)',
  car: 'Машинка (4)',
  boat: 'Кораблик (3)',
  snowman: 'Снеговик (3)',
  fish: 'Рыбка (3)',
  castle: 'Замок (6)',
};

/** Выбор нескольких картинок (этап 42): порядок — как в списке, не как нажимали. */
function PickChips<T extends string>(props: {
  label: string;
  all: readonly T[];
  labels: Record<T, string>;
  value: T[];
  onChange: (v: T[]) => void;
}) {
  return (
    <Stack gap={4}>
      <Text size="sm" fw={500}>
        {props.label}
      </Text>
      <Chip.Group
        multiple
        value={props.value}
        onChange={(v) => props.onChange(props.all.filter((s) => v.includes(s)))}
      >
        <Group gap={6}>
          {props.all.map((s) => (
            <Chip key={s} value={s} size="sm">
              {props.labels[s]}
            </Chip>
          ))}
        </Group>
      </Chip.Group>
    </Stack>
  );
}

const SHAPE_LABELS: Record<(typeof TRACE_SHAPES)[number], string> = {
  line: 'линия',
  wave: 'волна',
  zigzag: 'зигзаг',
  circle: 'круг',
  square: 'квадрат',
  triangle: 'треугольник',
  star: 'звезда',
  heart: 'сердце',
  '0': '0',
  '1': '1',
  '2': '2',
  '3': '3',
  '4': '4',
  '5': '5',
  '6': '6',
  '7': '7',
  '8': '8',
  '9': '9',
};

const BALLOON_LABELS: Record<(typeof BALLOON_COLORS)[number], string> = {
  red: 'только красные',
  yellow: 'только жёлтые',
  blue: 'только синие',
  green: 'только зелёные',
};

/** Параметры по умолчанию для нового вида игры (картинки родитель выбирает сам). */
const DEFAULTS: { [K in GameKind]: Extract<GameSpec, { kind: K }> } = {
  drawing: { kind: 'drawing', stickerIds: [] },
  coloring: { kind: 'coloring', picture: 'house', tasks: false },
  sorting: { kind: 'sorting', prompt: '', bins: [], items: [] },
  memory: { kind: 'memory', imageIds: [] },
  puzzle: { kind: 'puzzle', imageIds: [], cols: 2, rows: 2 },
  tracing: { kind: 'tracing', shapes: ['line', 'circle'] },
  balloons: { kind: 'balloons', count: 10, target: null },
  counting: { kind: 'counting', max: 5, rounds: 4, imageIds: [] },
  maze: { kind: 'maze', heroId: '', goalId: '', size: 4, rounds: 2 },
  shadows: { kind: 'shadows', imageIds: [], perRound: 3 },
  flashlight: { kind: 'flashlight', scene: 'forest', items: [] },
  moles: { kind: 'moles', imageIds: [], target: null, prompt: null, count: 8, speed: 'slow' },
  melody: { kind: 'melody', bells: 3, start: 2, goal: 5 },
  shapes: { kind: 'shapes', shapes: ['circle', 'square', 'triangle'], rotate: false },
  odd: { kind: 'odd', rounds: [{ imageIds: [], odd: 0, explain: null }] },
  pattern: { kind: 'pattern', imageIds: [], patterns: ['AB'], rounds: 4 },
  compare: { kind: 'compare', mode: 'objects', ask: 'more', max: 5, rounds: 4, imageIds: [] },
  arithmetic: { kind: 'arithmetic', ops: ['plus'], max: 5, rounds: 4, imageIds: [] },
  size: { kind: 'size', imageIds: [], count: 3 },
  sequence: { kind: 'sequence', rounds: [{ prompt: '', imageIds: [] }] },
  word: { kind: 'word', lang: 'ru', words: [], extra: 0 },
  pitch: { kind: 'pitch', gap: 24, rounds: 5 },
  loudness: { kind: 'loudness', rounds: 5 },
  tempo: { kind: 'tempo', rounds: 5 },
  duration: { kind: 'duration', rounds: 5 },
  direction: { kind: 'direction', notes: 4, rounds: 5 },
  beats: { kind: 'beats', max: 3, rounds: 5 },
  rhythm: { kind: 'rhythm', beats: 3, timing: false, rounds: 4 },
  piano: { kind: 'piano', mode: 'find', keys: 5, rounds: 5 },
  staff: { kind: 'staff', keys: 5, rounds: 5 },
  song: { kind: 'song', songs: ['zvezdochka'] },
  freeze: { kind: 'freeze', rounds: 4 },
  orchestra: { kind: 'orchestra', players: 4, rounds: 4 },
  letter: { kind: 'letter', letters: ['А', 'О', 'У'], choices: 3, rounds: 5 },
  syllable: { kind: 'syllable', syllables: ['МА', 'МО', 'МУ'], choices: 3, rounds: 5 },
  firstLetter: {
    kind: 'firstLetter',
    words: [
      { emoji: '🐱', word: 'КОТ' },
      { emoji: '🏠', word: 'ДОМ' },
    ],
    choices: 3,
    rounds: 5,
  },
  readWord: {
    kind: 'readWord',
    words: [
      { emoji: '🐱', word: 'КОТ' },
      { emoji: '🏠', word: 'ДОМ' },
    ],
    choices: 2,
    rounds: 5,
  },
  syllableCount: {
    kind: 'syllableCount',
    words: [
      { emoji: '🐱', word: 'КОТ' },
      { emoji: '🌙', word: 'ЛУНА' },
      { emoji: '🚀', word: 'РАКЕТА' },
    ],
    choices: 3,
    rounds: 5,
  },
  soundPlace: {
    kind: 'soundPlace',
    sound: 'С',
    words: [
      { emoji: '🧃', word: 'СОК' },
      { emoji: '🦊', word: 'ЛИСА' },
      { emoji: '👃', word: 'НОС' },
    ],
    rounds: 5,
  },
  wordScheme: {
    kind: 'wordScheme',
    words: [
      { emoji: '🐱', word: 'КОТ' },
      { emoji: '🦆', word: 'УТКА' },
      { emoji: '🌙', word: 'ЛУНА' },
    ],
    choices: 3,
    rounds: 5,
  },
  pickWord: {
    kind: 'pickWord',
    items: [
      { emoji: '🐱', word: 'КОТ', similar: ['КИТ', 'РОТ'] },
      { emoji: '🧃', word: 'СОК', similar: ['СОН', 'СОМ'] },
    ],
    choices: 3,
    rounds: 5,
  },
  readPhrase: {
    kind: 'readPhrase',
    items: [
      { text: 'ДВА ГРИБА', emoji: '🍄🍄', similar: ['🍄🍄🍄', '🍄'] },
      { text: 'КОТ И МЯЧ', emoji: '🐱⚽', similar: ['🐱🎈', '🐶⚽'] },
    ],
    choices: 3,
    rounds: 5,
  },
  numberHouse: { kind: 'numberHouse', numbers: [3, 4, 5], dots: true, choices: 3, rounds: 6 },
  numberNeighbors: {
    kind: 'numberNeighbors',
    from: 1,
    to: 10,
    modes: ['gap'],
    choices: 3,
    rounds: 6,
  },
  compareSign: { kind: 'compareSign', max: 5, equal: true, dots: true, rounds: 6 },
  wordProblem: {
    kind: 'wordProblem',
    problems: [
      {
        emoji: '🍎',
        a: 2,
        op: 'plus',
        b: 1,
        text: 'У ёжика два яблока. Ему дали ещё одно. Сколько стало?',
      },
      {
        emoji: '🎈',
        a: 3,
        op: 'minus',
        b: 1,
        text: 'Было три шарика. Один улетел. Сколько осталось?',
      },
    ],
    scene: true,
    choices: 3,
    rounds: 4,
  },
  clock: { kind: 'clock', half: false, choices: 3, rounds: 4 },
  shop: { kind: 'shop', imageIds: [], max: 5, coins: [1], rounds: 4 },
  robot: { kind: 'robot', size: 4, steps: 3, rocks: false, rounds: 3 },
  space: { kind: 'space', order: 'numbers', count: 5, step: 1, reverse: false, rounds: 2 },
  fishing: { kind: 'fishing', mode: 'numbers', max: 5, fish: 3, speed: 'slow', rounds: 4 },
  flight: { kind: 'flight', stars: 8, clouds: 'few', speed: 'slow' },
  builder: { kind: 'builder', height: 3, blocks: 3, hide: false, rounds: 3 },
  syllableWord: { kind: 'syllableWord', words: [], extra: 0 },
  riddle: { kind: 'riddle', riddles: [], choices: 3, rounds: 5 },
  sudoku: { kind: 'sudoku', imageIds: [], size: 3, blanks: 3, rounds: 2 },
  dots: { kind: 'dots', pictures: ['star', 'house', 'fish'], hint: true },
  tangram: { kind: 'tangram', figures: ['house', 'tree', 'boat'], outline: true },
  colorNumbers: { kind: 'colorNumbers', pictures: ['sun', 'house'], hint: true },
  dive: { kind: 'dive', task: 'colors', max: 5, jellies: 'few', speed: 'slow', rounds: 3 },
  rocket: {
    kind: 'rocket',
    parts: 3,
    memory: false,
    quiz: 'numbers',
    max: 5,
    asteroids: 'few',
    rounds: 2,
  },
  race: {
    kind: 'race',
    quiz: 'colors',
    max: 3,
    gates: 4,
    rivals: true,
    cones: 'few',
    speed: 'slow',
  },
  differences: {
    kind: 'differences',
    scenes: ['meadow', 'forest', 'sea', 'space'],
    count: 3,
    rounds: 2,
    hint: true,
  },
  poem: {
    kind: 'poem',
    poem: 'petushok',
    repeat: true,
    blanks: true,
    questions: true,
    choices: 3,
  },
  book: {
    kind: 'book',
    book: 'kotPetuh',
    autoTurn: false,
    questions: true,
    choices: 3,
    readSelf: false,
  },
};

/** Библиотека стихов и сказок (этап 45) — по жанрам, с возрастом. */
const GENRES: [PoemGenre, string][] = [
  ['nursery', 'Потешки'],
  ['poem', 'Стихи'],
  ['fable', 'Басни'],
  ['tale', 'Сказки'],
  ['story', 'Рассказы'],
];
const POEM_OPTIONS = GENRES.map(([genre, group]) => ({
  group,
  items: POEM_CODES.filter((c) => poemOf(c).genre === genre).map((c) => {
    const p = poemOf(c);
    return {
      value: c,
      label: `${p.title}${p.author ? ` — ${p.author}` : ''} (с ${p.fromAge} лет)`,
    };
  }),
})).filter((g) => g.items.length);
const POEM_TITLES = new Set(Object.values(POEMS).map((p) => p.title));

/** Библиотека книжек (этап 52) — по жанрам, с возрастом. */
const BOOK_GENRES: [BookGenre, string][] = [
  ['folk', 'Народные сказки'],
  ['tale', 'Сказки писателей'],
  ['story', 'Рассказы'],
];
const BOOK_OPTIONS = BOOK_GENRES.map(([genre, group]) => ({
  group,
  items: BOOK_CODES.filter((c) => bookOf(c).genre === genre).map((c) => {
    const b = bookOf(c);
    return {
      value: c,
      label: `${b.title}${b.author ? ` — ${b.author}` : ''} (с ${b.fromAge} лет)`,
    };
  }),
})).filter((g) => g.items.length);
const BOOK_TITLES = new Set(Object.values(BOOKS).map((b) => b.title));

const DIFF_SCENE_LABELS: Record<(typeof DIFF_SCENES)[number], string> = {
  meadow: 'Полянка',
  forest: 'Лес',
  sea: 'Море',
  space: 'Космос',
};

/** Числа на крыше «Домика числа» (этап 49). */
const HOUSE_NUMBERS = ['2', '3', '4', '5', '6', '7', '8', '9', '10'] as const;
const HOUSE_LABELS = Object.fromEntries(HOUSE_NUMBERS.map((n) => [n, n])) as Record<
  (typeof HOUSE_NUMBERS)[number],
  string
>;
const NEIGHBOR_LABELS: Record<NeighborMode, string> = {
  gap: 'Пропуск в ряду (4 ▢ 6)',
  before: 'Число перед',
  after: 'Число после',
};

/** Число из NumberInput (пустое поле — минимум). */
const num = (v: string | number, min: number) => Number(v) || min;

/** Одна картинка: слот с подписью. */
function OneImage(props: { label: string; id: string; onChange: (id: string) => void }) {
  return (
    <Stack gap={2} align="center">
      <ImageSlot
        image={props.id ? ref(props.id) : null}
        onPick={(img) => props.onChange(img.id)}
        hint={props.label}
      />
      <Text size="xs" c="dimmed">
        {props.label}
      </Text>
    </Stack>
  );
}

/** Список раундов: у каждого свои поля, «убрать раунд» и «добавить раунд». */
function Rounds<T>(props: {
  rounds: T[];
  max: number;
  empty: T;
  onChange: (rounds: T[]) => void;
  render: (r: T, set: (r: T) => void) => React.ReactNode;
}) {
  return (
    <Stack gap="sm">
      {props.rounds.map((r, i) => (
        <Stack key={i} gap={4} p="xs" style={{ border: '1px solid #eee', borderRadius: 8 }}>
          <Group justify="space-between">
            <Text size="sm" fw={500}>
              Раунд {i + 1}
            </Text>
            {props.rounds.length > 1 && (
              <Button
                size="compact-xs"
                variant="subtle"
                color="red"
                onClick={() => props.onChange(props.rounds.filter((_, k) => k !== i))}
              >
                убрать раунд
              </Button>
            )}
          </Group>
          {props.render(r, (next) =>
            props.onChange(props.rounds.map((x, k) => (k === i ? next : x))),
          )}
        </Stack>
      ))}
      {props.rounds.length < props.max && (
        <Button
          variant="light"
          size="compact-sm"
          onClick={() => props.onChange([...props.rounds, props.empty])}
        >
          Добавить раунд
        </Button>
      )}
    </Stack>
  );
}

/** Картинка с подписью-словом (фонарик, «Собери слово»): список строк. */
function LabeledImages<T extends { imageId: string }>(props: {
  items: T[];
  max: number;
  placeholder: string;
  text: (it: T) => string;
  withText: (it: T, text: string) => T;
  make: (imageId: string) => T;
  onChange: (items: T[]) => void;
}) {
  const { items, onChange } = props;
  return (
    <Stack gap="xs">
      {items.map((it, i) => (
        <Group key={i} gap="xs" wrap="nowrap">
          <ImageSlot
            image={ref(it.imageId)}
            onPick={(img) =>
              onChange(items.map((x, k) => (k === i ? { ...x, imageId: img.id } : x)))
            }
          />
          <TextInput
            style={{ flex: 1 }}
            placeholder={props.placeholder}
            value={props.text(it)}
            maxLength={200}
            onChange={(e) =>
              onChange(
                items.map((x, k) => (k === i ? props.withText(x, e.currentTarget.value) : x)),
              )
            }
          />
          <ActionIcon
            variant="subtle"
            color="red"
            aria-label="Убрать"
            onClick={() => onChange(items.filter((_, k) => k !== i))}
          >
            ✕
          </ActionIcon>
        </Group>
      ))}
      {items.length < props.max && (
        <ImageSlot image={null} onPick={(img) => onChange([...items, props.make(img.id)])} />
      )}
    </Stack>
  );
}

const ref = (id: string): MediaRef => ({ id, url: mediaUrl(id), status: 'ready' });

/** Список картинок: превью с удалением и пустой слот для добавления. */
function ImageList(props: {
  ids: string[];
  onChange: (ids: string[]) => void;
  max: number;
  hint?: string;
}) {
  return (
    <Group gap="xs">
      {props.ids.map((id, i) => (
        <Stack key={`${id}-${i}`} gap={2} align="center">
          <ImageSlot
            image={ref(id)}
            onPick={(img) => props.onChange(props.ids.map((x, k) => (k === i ? img.id : x)))}
          />
          <Button
            size="compact-xs"
            variant="subtle"
            color="red"
            onClick={() => props.onChange(props.ids.filter((_, k) => k !== i))}
          >
            убрать
          </Button>
        </Stack>
      ))}
      {props.ids.length < props.max && (
        <ImageSlot
          image={null}
          onPick={(img) => props.onChange([...props.ids, img.id])}
          {...(props.hint ? { hint: props.hint } : {})}
        />
      )}
    </Group>
  );
}

/** Поля параметров для каждого вида игры. */
function SpecFields({ spec, onChange }: { spec: GameSpec; onChange: (s: GameSpec) => void }) {
  switch (spec.kind) {
    case 'drawing':
      return (
        <Stack gap={4}>
          <Text size="sm" fw={500}>
            Наклейки (необязательно, до 12)
          </Text>
          <ImageList
            ids={spec.stickerIds}
            max={12}
            onChange={(stickerIds) => onChange({ ...spec, stickerIds })}
          />
        </Stack>
      );
    case 'coloring':
      return (
        <Stack gap="xs">
          <Select
            label="Картинка"
            allowDeselect={false}
            value={spec.picture}
            data={COLORING_PICTURES.map((p) => ({ value: p, label: PICTURE_LABELS[p] }))}
            onChange={(v) => v && onChange({ ...spec, picture: v as typeof spec.picture })}
          />
          <Switch
            label="С заданиями: «Раскрась крышу красным» (для старших)"
            checked={spec.tasks}
            onChange={(e) => onChange({ ...spec, tasks: e.currentTarget.checked })}
          />
        </Stack>
      );
    case 'sorting':
      return (
        <Stack gap="xs">
          <TextInput
            label="Задание (озвучивается)"
            placeholder="Фрукты положи в корзинку, а овощи — в тележку!"
            value={spec.prompt}
            maxLength={200}
            onChange={(e) => onChange({ ...spec, prompt: e.currentTarget.value })}
          />
          <Text size="sm" fw={500}>
            Куда раскладывать (1–3)
          </Text>
          {spec.bins.map((b, i) => (
            <Group key={i} gap="xs" wrap="nowrap">
              <ImageSlot
                image={ref(b.imageId)}
                onPick={(img) =>
                  onChange({
                    ...spec,
                    bins: spec.bins.map((x, k) => (k === i ? { ...x, imageId: img.id } : x)),
                  })
                }
              />
              <TextInput
                style={{ flex: 1 }}
                placeholder="название (звучит при касании)"
                value={b.name}
                onChange={(e) =>
                  onChange({
                    ...spec,
                    bins: spec.bins.map((x, k) =>
                      k === i ? { ...x, name: e.currentTarget.value } : x,
                    ),
                  })
                }
              />
              <ActionIcon
                variant="subtle"
                color="red"
                aria-label="Убрать"
                onClick={() =>
                  onChange({
                    ...spec,
                    bins: spec.bins.filter((_, k) => k !== i),
                    items: spec.items
                      .filter((it) => it.bin !== i)
                      .map((it) => ({ ...it, bin: it.bin > i ? it.bin - 1 : it.bin })),
                  })
                }
              >
                ✕
              </ActionIcon>
            </Group>
          ))}
          {spec.bins.length < 3 && (
            <ImageSlot
              image={null}
              hint="корзина"
              onPick={(img) =>
                onChange({ ...spec, bins: [...spec.bins, { imageId: img.id, name: '' }] })
              }
            />
          )}
          {spec.bins.length > 0 && (
            <>
              <Text size="sm" fw={500}>
                Предметы (2–12) и куда их класть
              </Text>
              {spec.items.map((it, i) => (
                <Group key={i} gap="xs" wrap="nowrap">
                  <ImageSlot
                    image={ref(it.imageId)}
                    onPick={(img) =>
                      onChange({
                        ...spec,
                        items: spec.items.map((x, k) => (k === i ? { ...x, imageId: img.id } : x)),
                      })
                    }
                  />
                  <Select
                    style={{ flex: 1 }}
                    allowDeselect={false}
                    value={String(it.bin)}
                    data={spec.bins.map((b, k) => ({
                      value: String(k),
                      label: b.name || `место ${k + 1}`,
                    }))}
                    onChange={(v) =>
                      onChange({
                        ...spec,
                        items: spec.items.map((x, k) => (k === i ? { ...x, bin: Number(v) } : x)),
                      })
                    }
                  />
                  <ActionIcon
                    variant="subtle"
                    color="red"
                    aria-label="Убрать"
                    onClick={() =>
                      onChange({ ...spec, items: spec.items.filter((_, k) => k !== i) })
                    }
                  >
                    ✕
                  </ActionIcon>
                </Group>
              ))}
              {spec.items.length < 12 && (
                <ImageSlot
                  image={null}
                  onPick={(img) =>
                    onChange({ ...spec, items: [...spec.items, { imageId: img.id, bin: 0 }] })
                  }
                />
              )}
            </>
          )}
        </Stack>
      );
    case 'memory':
      return (
        <Stack gap={4}>
          <Text size="sm" fw={500}>
            Картинки — каждая станет парой (2–10)
          </Text>
          <ImageList
            ids={spec.imageIds}
            max={10}
            onChange={(imageIds) => onChange({ ...spec, imageIds })}
          />
        </Stack>
      );
    case 'puzzle':
      return (
        <Stack gap="xs">
          <Text size="sm" fw={500}>
            Картинки — пазлы по очереди (1–5)
          </Text>
          <ImageList
            ids={spec.imageIds}
            max={5}
            onChange={(imageIds) => onChange({ ...spec, imageIds })}
          />
          <Group grow>
            <NumberInput
              label="Частей по горизонтали"
              min={1}
              max={4}
              value={spec.cols}
              onChange={(v) => onChange({ ...spec, cols: Number(v) || 1 })}
            />
            <NumberInput
              label="по вертикали"
              min={1}
              max={4}
              value={spec.rows}
              onChange={(v) => onChange({ ...spec, rows: Number(v) || 1 })}
            />
          </Group>
        </Stack>
      );
    case 'tracing':
      return (
        <Stack gap={4}>
          <Text size="sm" fw={500}>
            Что обводить (по очереди, до 12)
          </Text>
          <Chip.Group
            multiple
            value={spec.shapes}
            onChange={(v) =>
              onChange({
                ...spec,
                // Порядок — как в списке фигур, а не как нажимали.
                shapes: TRACE_SHAPES.filter((s) => v.includes(s)),
              })
            }
          >
            <Group gap={6}>
              {TRACE_SHAPES.map((s) => (
                <Chip key={s} value={s} size="sm">
                  {SHAPE_LABELS[s]}
                </Chip>
              ))}
            </Group>
          </Chip.Group>
        </Stack>
      );
    case 'balloons':
      return (
        <Group grow align="flex-end">
          <NumberInput
            label="Сколько лопнуть"
            min={3}
            max={20}
            value={spec.count}
            onChange={(v) => onChange({ ...spec, count: Number(v) || 3 })}
          />
          <Select
            label="Какие шарики"
            allowDeselect={false}
            value={spec.target ?? 'any'}
            data={[
              { value: 'any', label: 'любые' },
              ...BALLOON_COLORS.map((c) => ({ value: c, label: BALLOON_LABELS[c] })),
            ]}
            onChange={(v) =>
              onChange({
                ...spec,
                target: v === 'any' || !v ? null : (v as (typeof BALLOON_COLORS)[number]),
              })
            }
          />
        </Group>
      );
    case 'counting':
      return (
        <Stack gap="xs">
          <Group grow>
            <NumberInput
              label="Считать до"
              min={2}
              max={10}
              value={spec.max}
              onChange={(v) => onChange({ ...spec, max: Number(v) || 2 })}
            />
            <NumberInput
              label="Раундов"
              min={1}
              max={10}
              value={spec.rounds}
              onChange={(v) => onChange({ ...spec, rounds: Number(v) || 1 })}
            />
          </Group>
          <Text size="sm" fw={500}>
            Что считать (1–10 картинок, по раунду на каждую)
          </Text>
          <ImageList
            ids={spec.imageIds}
            max={10}
            onChange={(imageIds) => onChange({ ...spec, imageIds })}
          />
        </Stack>
      );
    case 'maze':
      return (
        <Stack gap="xs">
          <Group>
            <OneImage
              label="кто идёт"
              id={spec.heroId}
              onChange={(heroId) => onChange({ ...spec, heroId })}
            />
            <OneImage
              label="куда"
              id={spec.goalId}
              onChange={(goalId) => onChange({ ...spec, goalId })}
            />
          </Group>
          <Group grow>
            <NumberInput
              label="Размер (3 — малышам, 6–9 — старшим)"
              min={3}
              max={9}
              value={spec.size}
              onChange={(v) => onChange({ ...spec, size: num(v, 3) })}
            />
            <NumberInput
              label="Лабиринтов подряд"
              min={1}
              max={5}
              value={spec.rounds}
              onChange={(v) => onChange({ ...spec, rounds: num(v, 1) })}
            />
          </Group>
        </Stack>
      );
    case 'shadows':
      return (
        <Stack gap="xs">
          <Text size="sm" fw={500}>
            Картинки (2–12) — у каждой будет тень
          </Text>
          <ImageList
            ids={spec.imageIds}
            max={12}
            onChange={(imageIds) => onChange({ ...spec, imageIds })}
          />
          <NumberInput
            label="Теней на экране за раз"
            min={2}
            max={4}
            value={spec.perRound}
            onChange={(v) => onChange({ ...spec, perRound: num(v, 2) })}
          />
        </Stack>
      );
    case 'flashlight':
      return (
        <Stack gap="xs">
          <Select
            label="Где прячутся"
            allowDeselect={false}
            value={spec.scene}
            data={FLASHLIGHT_SCENES.map((v) => ({ value: v, label: SCENE_LABELS[v] }))}
            onChange={(v) => v && onChange({ ...spec, scene: v as typeof spec.scene })}
          />
          <Text size="sm" fw={500}>
            Кто спрятался (1–8) и что сказать, когда найдут
          </Text>
          <LabeledImages
            items={spec.items}
            max={8}
            placeholder="Вот ёжик! (необязательно)"
            text={(it) => it.name ?? ''}
            withText={(it, name) => ({ ...it, name: name || null })}
            make={(imageId) => ({ imageId, name: null })}
            onChange={(items) => onChange({ ...spec, items })}
          />
        </Stack>
      );
    case 'moles':
      return (
        <Stack gap="xs">
          <Text size="sm" fw={500}>
            Зверьки (1–4)
          </Text>
          <ImageList
            ids={spec.imageIds}
            max={4}
            onChange={(imageIds) =>
              onChange({
                ...spec,
                imageIds,
                target: spec.target !== null && spec.target < imageIds.length ? spec.target : null,
              })
            }
          />
          <Select
            label="Кого ловить"
            allowDeselect={false}
            value={spec.target === null ? 'any' : String(spec.target)}
            data={[
              { value: 'any', label: 'всех' },
              ...spec.imageIds.map((_, i) => ({
                value: String(i),
                label: `только картинку ${i + 1}`,
              })),
            ]}
            onChange={(v) => onChange({ ...spec, target: !v || v === 'any' ? null : Number(v) })}
          />
          <TextInput
            label="Задание (озвучивается, необязательно)"
            placeholder="Лови только зайчиков!"
            value={spec.prompt ?? ''}
            maxLength={200}
            onChange={(e) => onChange({ ...spec, prompt: e.currentTarget.value || null })}
          />
          <Group grow>
            <NumberInput
              label="Сколько поймать"
              min={3}
              max={20}
              value={spec.count}
              onChange={(v) => onChange({ ...spec, count: num(v, 3) })}
            />
            <Select
              label="Скорость"
              allowDeselect={false}
              value={spec.speed}
              data={MOLE_SPEEDS.map((v) => ({ value: v, label: SPEED_LABELS[v] }))}
              onChange={(v) => v && onChange({ ...spec, speed: v as typeof spec.speed })}
            />
          </Group>
        </Stack>
      );
    case 'melody':
      return (
        <Group grow>
          <NumberInput
            label="Колокольчиков"
            min={3}
            max={5}
            value={spec.bells}
            onChange={(v) => onChange({ ...spec, bells: num(v, 3) })}
          />
          <NumberInput
            label="Начать с нот"
            min={1}
            max={4}
            value={spec.start}
            onChange={(v) => onChange({ ...spec, start: num(v, 1) })}
          />
          <NumberInput
            label="Дойти до нот"
            min={2}
            max={8}
            value={spec.goal}
            onChange={(v) => onChange({ ...spec, goal: num(v, 2) })}
          />
        </Group>
      );
    case 'shapes':
      return (
        <Stack gap="xs">
          <Text size="sm" fw={500}>
            Фигуры (2–8)
          </Text>
          <Chip.Group
            multiple
            value={spec.shapes}
            onChange={(v) =>
              onChange({ ...spec, shapes: SORTER_SHAPES.filter((s) => v.includes(s)) })
            }
          >
            <Group gap={6}>
              {SORTER_SHAPES.map((s) => (
                <Chip key={s} value={s} size="sm">
                  {SORTER_LABELS[s]}
                </Chip>
              ))}
            </Group>
          </Chip.Group>
          <Switch
            label="Фигуры повёрнуты — надо повернуть касанием (для старших)"
            checked={spec.rotate}
            onChange={(e) => onChange({ ...spec, rotate: e.currentTarget.checked })}
          />
        </Stack>
      );
    case 'odd':
      return (
        <Rounds
          rounds={spec.rounds}
          max={10}
          empty={{ imageIds: [], odd: 0, explain: null }}
          onChange={(rounds) => onChange({ ...spec, rounds })}
          render={(r, set) => (
            <>
              <ImageList
                ids={r.imageIds}
                max={4}
                onChange={(imageIds) =>
                  set({ ...r, imageIds, odd: r.odd < imageIds.length ? r.odd : 0 })
                }
              />
              <Select
                label="Лишняя"
                allowDeselect={false}
                value={String(r.odd)}
                data={r.imageIds.map((_, i) => ({ value: String(i), label: `картинка ${i + 1}` }))}
                onChange={(v) => set({ ...r, odd: Number(v) })}
              />
              <TextInput
                label="Объяснение (звучит после ответа, необязательно)"
                placeholder="Морковка — овощ, а остальные — фрукты."
                value={r.explain ?? ''}
                maxLength={200}
                onChange={(e) => set({ ...r, explain: e.currentTarget.value || null })}
              />
            </>
          )}
        />
      );
    case 'pattern':
      return (
        <Stack gap="xs">
          <Text size="sm" fw={500}>
            Картинки ряда (2–6)
          </Text>
          <ImageList
            ids={spec.imageIds}
            max={6}
            onChange={(imageIds) => onChange({ ...spec, imageIds })}
          />
          <Text size="sm" fw={500}>
            Закономерности
          </Text>
          <Chip.Group
            multiple
            value={spec.patterns}
            onChange={(v) => onChange({ ...spec, patterns: PATTERNS.filter((p) => v.includes(p)) })}
          >
            <Group gap={6}>
              {PATTERNS.map((p) => (
                <Chip key={p} value={p} size="sm">
                  {PATTERN_LABELS[p]}
                </Chip>
              ))}
            </Group>
          </Chip.Group>
          <NumberInput
            label="Раундов"
            min={1}
            max={10}
            value={spec.rounds}
            onChange={(v) => onChange({ ...spec, rounds: num(v, 1) })}
          />
        </Stack>
      );
    case 'compare':
      return (
        <Stack gap="xs">
          <Group grow>
            <Select
              label="Что сравнивать"
              allowDeselect={false}
              value={spec.mode}
              data={[
                { value: 'objects', label: 'группы предметов' },
                { value: 'numbers', label: 'числа' },
              ]}
              onChange={(v) => v && onChange({ ...spec, mode: v as typeof spec.mode })}
            />
            <Select
              label="Вопрос"
              allowDeselect={false}
              value={spec.ask}
              data={[
                { value: 'more', label: 'Где больше?' },
                { value: 'less', label: 'Где меньше?' },
                { value: 'mixed', label: 'вперемешку' },
              ]}
              onChange={(v) => v && onChange({ ...spec, ask: v as typeof spec.ask })}
            />
          </Group>
          <Group grow>
            <NumberInput
              label="Числа до"
              min={2}
              max={10}
              value={spec.max}
              onChange={(v) => onChange({ ...spec, max: num(v, 2) })}
            />
            <NumberInput
              label="Раундов"
              min={1}
              max={10}
              value={spec.rounds}
              onChange={(v) => onChange({ ...spec, rounds: num(v, 1) })}
            />
          </Group>
          {spec.mode === 'objects' && (
            <>
              <Text size="sm" fw={500}>
                Предметы (1–10; в раунде — одна из картинок)
              </Text>
              <ImageList
                ids={spec.imageIds}
                max={10}
                onChange={(imageIds) => onChange({ ...spec, imageIds })}
              />
            </>
          )}
        </Stack>
      );
    case 'arithmetic':
      return (
        <Stack gap="xs">
          <Chip.Group
            multiple
            value={spec.ops}
            onChange={(v) =>
              onChange({ ...spec, ops: (['plus', 'minus'] as const).filter((o) => v.includes(o)) })
            }
          >
            <Group gap={6}>
              <Chip value="plus">сложение</Chip>
              <Chip value="minus">вычитание</Chip>
            </Group>
          </Chip.Group>
          <Group grow>
            <NumberInput
              label="В пределах"
              min={2}
              max={10}
              value={spec.max}
              onChange={(v) => onChange({ ...spec, max: num(v, 2) })}
            />
            <NumberInput
              label="Примеров"
              min={1}
              max={10}
              value={spec.rounds}
              onChange={(v) => onChange({ ...spec, rounds: num(v, 1) })}
            />
          </Group>
          <Text size="sm" fw={500}>
            Предметы (1–10)
          </Text>
          <ImageList
            ids={spec.imageIds}
            max={10}
            onChange={(imageIds) => onChange({ ...spec, imageIds })}
          />
        </Stack>
      );
    case 'size':
      return (
        <Stack gap="xs">
          <Text size="sm" fw={500}>
            Картинки (1–5, по раунду на каждую)
          </Text>
          <ImageList
            ids={spec.imageIds}
            max={5}
            onChange={(imageIds) => onChange({ ...spec, imageIds })}
          />
          <NumberInput
            label="Сколько размеров"
            min={3}
            max={5}
            value={spec.count}
            onChange={(v) => onChange({ ...spec, count: num(v, 3) })}
          />
        </Stack>
      );
    case 'sequence':
      return (
        <Rounds
          rounds={spec.rounds}
          max={8}
          empty={{ prompt: '', imageIds: [] }}
          onChange={(rounds) => onChange({ ...spec, rounds })}
          render={(r, set) => (
            <>
              <TextInput
                placeholder="Как вырастает цветок? Разложи по порядку."
                value={r.prompt}
                maxLength={200}
                onChange={(e) => set({ ...r, prompt: e.currentTarget.value })}
              />
              <Text size="xs" c="dimmed">
                Картинки по порядку — что сначала, что потом (2–6)
              </Text>
              <ImageList
                ids={r.imageIds}
                max={6}
                onChange={(imageIds) => set({ ...r, imageIds })}
              />
            </>
          )}
        />
      );
    case 'word':
      return (
        <Stack gap="xs">
          <Group grow>
            <Select
              label="Язык"
              allowDeselect={false}
              value={spec.lang}
              data={[
                { value: 'ru', label: 'русский' },
                { value: 'en', label: 'английский' },
              ]}
              onChange={(v) => v && onChange({ ...spec, lang: v as typeof spec.lang })}
            />
            <NumberInput
              label="Лишних букв"
              min={0}
              max={3}
              value={spec.extra}
              onChange={(v) => onChange({ ...spec, extra: Number(v) || 0 })}
            />
          </Group>
          <Text size="sm" fw={500}>
            Слова с картинками (1–10)
          </Text>
          <LabeledImages
            items={spec.words}
            max={10}
            placeholder={spec.lang === 'ru' ? 'КОТ' : 'CAT'}
            text={(w) => w.word}
            withText={(w, word) => ({ ...w, word: word.toUpperCase() })}
            make={(imageId) => ({ imageId, word: '' })}
            onChange={(words) => onChange({ ...spec, words })}
          />
        </Stack>
      );
    case 'pitch':
      return (
        <Group grow>
          <NumberInput
            label="Разница, полутонов (больше — проще)"
            min={12}
            max={36}
            value={spec.gap}
            onChange={(v) => onChange({ ...spec, gap: num(v, 12) })}
          />
          <MusicRounds value={spec.rounds} onChange={(rounds) => onChange({ ...spec, rounds })} />
        </Group>
      );
    case 'loudness':
    case 'tempo':
    case 'duration':
      return (
        <MusicRounds value={spec.rounds} onChange={(rounds) => onChange({ ...spec, rounds })} />
      );
    case 'direction':
      return (
        <Group grow>
          <NumberInput
            label="Нот в мелодии"
            min={3}
            max={5}
            value={spec.notes}
            onChange={(v) => onChange({ ...spec, notes: num(v, 3) })}
          />
          <MusicRounds value={spec.rounds} onChange={(rounds) => onChange({ ...spec, rounds })} />
        </Group>
      );
    case 'beats':
      return (
        <Group grow>
          <NumberInput
            label="До скольки ударов"
            min={2}
            max={6}
            value={spec.max}
            onChange={(v) => onChange({ ...spec, max: num(v, 2) })}
          />
          <MusicRounds value={spec.rounds} onChange={(rounds) => onChange({ ...spec, rounds })} />
        </Group>
      );
    case 'rhythm':
      return (
        <Stack gap="xs">
          <Group grow>
            <NumberInput
              label="Ударов"
              min={2}
              max={6}
              value={spec.beats}
              onChange={(v) => onChange({ ...spec, beats: num(v, 2) })}
            />
            <MusicRounds value={spec.rounds} onChange={(rounds) => onChange({ ...spec, rounds })} />
          </Group>
          <Switch
            label="Проверять длительности («та» и «ти-ти»), а не только число ударов"
            checked={spec.timing}
            onChange={(e) => onChange({ ...spec, timing: e.currentTarget.checked })}
          />
        </Stack>
      );
    case 'piano':
      return (
        <Group grow>
          <Select
            label="Режим"
            allowDeselect={false}
            value={spec.mode}
            data={PIANO_MODES.map((m) => ({ value: m, label: PIANO_MODE_LABELS[m] }))}
            onChange={(m) => m && onChange({ ...spec, mode: m as typeof spec.mode })}
          />
          <NumberInput
            label="Нот (от «до»)"
            min={3}
            max={8}
            value={spec.keys}
            onChange={(v) => onChange({ ...spec, keys: num(v, 3) })}
          />
          <MusicRounds value={spec.rounds} onChange={(rounds) => onChange({ ...spec, rounds })} />
        </Group>
      );
    case 'staff':
      return (
        <Group grow>
          <NumberInput
            label="Нот (от «до»)"
            min={3}
            max={8}
            value={spec.keys}
            onChange={(v) => onChange({ ...spec, keys: num(v, 3) })}
          />
          <MusicRounds value={spec.rounds} onChange={(rounds) => onChange({ ...spec, rounds })} />
        </Group>
      );
    case 'song':
      return (
        <MultiSelect
          label="Песенки (по одной на раунд)"
          data={SONG_IDS.map((id) => ({ value: id, label: SONGS[id].title }))}
          value={spec.songs}
          maxValues={4}
          onChange={(v) => v.length && onChange({ ...spec, songs: v as [SongId, ...SongId[]] })}
        />
      );
    case 'freeze':
      return (
        <NumberInput
          label="Сколько раз замереть"
          min={2}
          max={8}
          value={spec.rounds}
          onChange={(v) => onChange({ ...spec, rounds: num(v, 2) })}
        />
      );
    case 'orchestra':
      return (
        <Group grow>
          <NumberInput
            label="Зверят в оркестре"
            min={3}
            max={6}
            value={spec.players}
            onChange={(v) => onChange({ ...spec, players: num(v, 3) })}
          />
          <NumberInput
            label="Раундов"
            min={2}
            max={8}
            value={spec.rounds}
            onChange={(v) => onChange({ ...spec, rounds: num(v, 2) })}
          />
        </Group>
      );
    case 'letter':
      return (
        <Stack gap="xs">
          <TextInput
            label="Буквы (подряд, заглавными)"
            value={spec.letters.join('')}
            onChange={(e) =>
              onChange({
                ...spec,
                letters: [
                  ...new Set(
                    [...e.currentTarget.value.toUpperCase()].filter((c) => /[А-ЯЁ]/u.test(c)),
                  ),
                ],
              })
            }
          />
          <Group grow>
            <Choices value={spec.choices} onChange={(choices) => onChange({ ...spec, choices })} />
            <MusicRounds value={spec.rounds} onChange={(rounds) => onChange({ ...spec, rounds })} />
          </Group>
        </Stack>
      );
    case 'syllable':
      return (
        <Stack gap="xs">
          <TextInput
            label="Слоги через пробел"
            value={spec.syllables.join(' ')}
            onChange={(e) =>
              onChange({
                ...spec,
                syllables: e.currentTarget.value
                  .toUpperCase()
                  .split(/[\s,]+/)
                  .filter((x) => /^[А-ЯЁ]{2,3}$/u.test(x)),
              })
            }
          />
          <Group grow>
            <Choices value={spec.choices} onChange={(choices) => onChange({ ...spec, choices })} />
            <MusicRounds value={spec.rounds} onChange={(rounds) => onChange({ ...spec, rounds })} />
          </Group>
        </Stack>
      );
    case 'firstLetter':
    case 'readWord':
      return (
        <Stack gap="xs">
          <Textarea
            label="Слова с картинкой — по одному в строке: эмодзи и слово («🐱 КОТ»)"
            autosize
            minRows={3}
            value={spec.words.map((w) => `${w.emoji} ${w.word}`).join('\n')}
            onChange={(e) =>
              onChange({
                ...spec,
                words: e.currentTarget.value
                  .split('\n')
                  .map((line) => line.trim().split(/\s+/))
                  .filter((p) => p.length === 2 && /^[А-ЯЁа-яё]{2,10}$/u.test(p[1]!))
                  .map(([emoji, word]) => ({ emoji: emoji!, word: word!.toUpperCase() })),
              })
            }
          />
          <Group grow>
            <Choices value={spec.choices} onChange={(choices) => onChange({ ...spec, choices })} />
            <MusicRounds value={spec.rounds} onChange={(rounds) => onChange({ ...spec, rounds })} />
          </Group>
        </Stack>
      );
    // ─── Этап 49: звуки и чтение ───
    case 'syllableCount':
      return (
        <Stack gap="xs">
          <LinesInput
            key={spec.kind}
            label="Слова с картинкой — по одному в строке: эмодзи и слово («🐱 КОТ»)"
            value={spec.words}
            format={(w) => `${w.emoji} ${w.word}`}
            parse={(line) => {
              const w = picWordOf(line);
              if (typeof w === 'string') return w;
              const n = syllablesIn(w.word);
              return n >= 1 && n <= 4 ? w : 'нужно слово из 1–4 слогов';
            }}
            onChange={(words) => onChange({ ...spec, words })}
          />
          <Group grow>
            <Choices value={spec.choices} onChange={(choices) => onChange({ ...spec, choices })} />
            <MusicRounds value={spec.rounds} onChange={(rounds) => onChange({ ...spec, rounds })} />
          </Group>
        </Stack>
      );
    case 'soundPlace':
      return (
        <Stack gap="xs">
          <Select
            label="Звук"
            description="Только звуки, которые можно протянуть: «ссс», «ммм»"
            data={[...SOUND_LETTERS]}
            value={spec.sound}
            allowDeselect={false}
            onChange={(v) => v && onChange({ ...spec, sound: v as SoundLetter })}
          />
          <LinesInput
            key={spec.kind}
            label="Слова с картинкой — эмодзи и слово; звук в начале, в середине или в конце"
            value={spec.words}
            format={(w) => `${w.emoji} ${w.word}`}
            parse={(line) => {
              const w = picWordOf(line);
              return typeof w === 'string' ? w : (soundProblem(w.word, spec.sound) ?? w);
            }}
            recheck={spec.sound}
            onChange={(words) => onChange({ ...spec, words })}
          />
          <MusicRounds value={spec.rounds} onChange={(rounds) => onChange({ ...spec, rounds })} />
        </Stack>
      );
    case 'wordScheme':
      return (
        <Stack gap="xs">
          <LinesInput
            key={spec.kind}
            label="Слова с картинкой — эмодзи и слово до 6 букв, только с твёрдыми согласными"
            value={spec.words}
            format={(w) => `${w.emoji} ${w.word}`}
            parse={(line) => {
              const w = picWordOf(line);
              if (typeof w === 'string') return w;
              return (wordScheme(w.word)?.length ?? 9) <= 6
                ? w
                : 'до 6 букв, без Е, Ё, Ю, Я, Й, Ь, Ч, Щ и мягких звуков';
            }}
            onChange={(words) => onChange({ ...spec, words })}
          />
          <Group grow>
            <Choices value={spec.choices} onChange={(choices) => onChange({ ...spec, choices })} />
            <MusicRounds value={spec.rounds} onChange={(rounds) => onChange({ ...spec, rounds })} />
          </Group>
        </Stack>
      );
    case 'pickWord':
      return (
        <Stack gap="xs">
          <LinesInput
            key={spec.kind}
            label="По одному в строке: эмодзи, слово и похожие слова («🐱 КОТ: КИТ, РОТ, КРОТ»)"
            value={spec.items}
            format={(i) => `${i.emoji} ${i.word}: ${i.similar.join(', ')}`}
            parse={(line) => {
              const m = /^(\S+)\s+([А-ЯЁа-яё]{2,10})\s*:\s*(.+)$/u.exec(line);
              if (!m || m[1]!.length > 16) return 'нужно «эмодзи СЛОВО: похожие слова»';
              const word = m[2]!.toUpperCase();
              const similar = [
                ...new Set(
                  m[3]!
                    .toUpperCase()
                    .split(/[\s,]+/)
                    .filter((x) => /^[А-ЯЁ]{2,10}$/u.test(x) && x !== word),
                ),
              ];
              if (similar.length < 1 || similar.length > 3) return 'похожих слов — от 1 до 3';
              return { emoji: m[1]!, word, similar };
            }}
            onChange={(items) => onChange({ ...spec, items })}
          />
          <Group grow>
            <Choices value={spec.choices} onChange={(choices) => onChange({ ...spec, choices })} />
            <MusicRounds value={spec.rounds} onChange={(rounds) => onChange({ ...spec, rounds })} />
          </Group>
        </Stack>
      );
    case 'readPhrase':
      return (
        <Stack gap="xs">
          <LinesInput
            key={spec.kind}
            label="По одной в строке: фраза = ответ | похожие картинки («ДВА ГРИБА = 🍄🍄 | 🍄🍄🍄, 🍄»)"
            value={spec.items}
            format={(i) => `${i.text} = ${i.emoji} | ${i.similar.join(', ')}`}
            parse={(line) => {
              const m = /^([^=]+)=([^|]+)\|(.+)$/u.exec(line);
              if (!m) return 'нужно «ФРАЗА = картинка | похожие, через запятую»';
              const text = m[1]!.trim().toUpperCase().replace(/\s+/g, ' ');
              if (!/^[А-ЯЁ]{1,10}( [А-ЯЁ]{1,10}){1,3}$/u.test(text) || text.length > 32)
                return 'фраза из 2–4 слов';
              const emoji = m[2]!.trim();
              const similar = [
                ...new Set(
                  m[3]!
                    .split(',')
                    .map((x) => x.trim())
                    .filter((x) => x && x !== emoji),
                ),
              ];
              if (!emoji || emoji.length > 24 || similar.some((x) => x.length > 24))
                return 'картинка — до 24 знаков';
              if (similar.length < 1 || similar.length > 3) return 'похожих картинок — от 1 до 3';
              return { text, emoji, similar };
            }}
            onChange={(items) => onChange({ ...spec, items })}
          />
          <Group grow>
            <Choices value={spec.choices} onChange={(choices) => onChange({ ...spec, choices })} />
            <MusicRounds value={spec.rounds} onChange={(rounds) => onChange({ ...spec, rounds })} />
          </Group>
        </Stack>
      );
    // ─── Этап 49: счёт к школе ───
    case 'numberHouse':
      return (
        <Stack gap="xs">
          <PickChips
            label="Числа на крыше — дети ищут их состав"
            all={HOUSE_NUMBERS}
            labels={HOUSE_LABELS}
            value={HOUSE_NUMBERS.filter((n) => spec.numbers.includes(Number(n)))}
            onChange={(v) => onChange({ ...spec, numbers: v.map(Number) })}
          />
          <Checkbox
            label="В окошках точки — можно посчитать"
            checked={spec.dots}
            onChange={(e) => onChange({ ...spec, dots: e.currentTarget.checked })}
          />
          <Group grow>
            <Choices value={spec.choices} onChange={(choices) => onChange({ ...spec, choices })} />
            <MusicRounds value={spec.rounds} onChange={(rounds) => onChange({ ...spec, rounds })} />
          </Group>
        </Stack>
      );
    case 'numberNeighbors':
      return (
        <Stack gap="xs">
          <Group grow>
            <NumberInput
              label="Числа от"
              min={1}
              max={18}
              value={spec.from}
              onChange={(v) => onChange({ ...spec, from: num(v, 1) })}
            />
            <NumberInput
              label="до"
              min={3}
              max={20}
              value={spec.to}
              onChange={(v) => onChange({ ...spec, to: num(v, 3) })}
            />
          </Group>
          <PickChips
            label="Что спрашивать"
            all={NEIGHBOR_MODES}
            labels={NEIGHBOR_LABELS}
            value={spec.modes}
            onChange={(modes) => onChange({ ...spec, modes })}
          />
          <Group grow>
            <Choices value={spec.choices} onChange={(choices) => onChange({ ...spec, choices })} />
            <MusicRounds value={spec.rounds} onChange={(rounds) => onChange({ ...spec, rounds })} />
          </Group>
        </Stack>
      );
    case 'compareSign':
      return (
        <Stack gap="xs">
          <NumberInput
            label="Числа до"
            min={3}
            max={20}
            value={spec.max}
            onChange={(v) => onChange({ ...spec, max: num(v, 3) })}
          />
          <Checkbox
            label="Бывают одинаковые числа — знак «=»"
            checked={spec.equal}
            onChange={(e) => onChange({ ...spec, equal: e.currentTarget.checked })}
          />
          <Checkbox
            label="Под числами точки (только до 10)"
            checked={spec.dots}
            disabled={spec.max > 10}
            onChange={(e) => onChange({ ...spec, dots: e.currentTarget.checked })}
          />
          <MusicRounds value={spec.rounds} onChange={(rounds) => onChange({ ...spec, rounds })} />
        </Stack>
      );
    case 'wordProblem':
      return (
        <Stack gap="xs">
          <LinesInput
            key={spec.kind}
            label="По одной в строке: эмодзи, пример и условие, числа словами («🍎 2 + 1: У ёжика два яблока. Ему дали ещё одно. Сколько стало?»)"
            value={spec.problems}
            format={(p) => `${p.emoji} ${p.a} ${p.op === 'plus' ? '+' : '-'} ${p.b}: ${p.text}`}
            parse={wordProblemOf}
            onChange={(problems) => onChange({ ...spec, problems })}
          />
          <Checkbox
            label="Показывать предметы (без них — только пример «2 + 1 = ?»)"
            checked={spec.scene}
            onChange={(e) => onChange({ ...spec, scene: e.currentTarget.checked })}
          />
          <Group grow>
            <Choices value={spec.choices} onChange={(choices) => onChange({ ...spec, choices })} />
            <MusicRounds value={spec.rounds} onChange={(rounds) => onChange({ ...spec, rounds })} />
          </Group>
        </Stack>
      );
    // ─── Этап 34 ───
    case 'clock':
      return (
        <Stack gap="xs">
          <Checkbox
            label="И половины («половина пятого»)"
            checked={spec.half}
            onChange={(e) => onChange({ ...spec, half: e.currentTarget.checked })}
          />
          <Group grow>
            <Choices value={spec.choices} onChange={(choices) => onChange({ ...spec, choices })} />
            <NumberInput
              label="Раундов"
              min={2}
              max={10}
              value={spec.rounds}
              onChange={(v) => onChange({ ...spec, rounds: num(v, 2) })}
            />
          </Group>
        </Stack>
      );
    case 'shop':
      return (
        <Stack gap="xs">
          <Group grow>
            <NumberInput
              label="Цены до"
              min={2}
              max={10}
              value={spec.max}
              onChange={(v) => onChange({ ...spec, max: num(v, 2) })}
            />
            <NumberInput
              label="Покупок"
              min={2}
              max={8}
              value={spec.rounds}
              onChange={(v) => onChange({ ...spec, rounds: num(v, 2) })}
            />
          </Group>
          <Checkbox.Group
            label="Монетки"
            value={spec.coins.map(String)}
            onChange={(v) =>
              onChange({
                ...spec,
                coins: [1, ...v.map(Number).filter((n) => n !== 1)].sort((a, b) => a - b) as (
                  1 | 2 | 5
                )[],
              })
            }
          >
            <Group mt={4}>
              <Checkbox value="1" label="по 1" disabled />
              <Checkbox value="2" label="по 2" />
              <Checkbox value="5" label="по 5" />
            </Group>
          </Checkbox.Group>
          <Text size="sm" fw={500}>
            Что покупаем (1–10 картинок)
          </Text>
          <ImageList
            ids={spec.imageIds}
            max={10}
            onChange={(imageIds) => onChange({ ...spec, imageIds })}
          />
        </Stack>
      );
    case 'robot':
      return (
        <Stack gap="xs">
          <Group grow>
            <NumberInput
              label="Поле, клеток"
              min={3}
              max={6}
              value={spec.size}
              onChange={(v) => onChange({ ...spec, size: num(v, 3) })}
            />
            <NumberInput
              label="Шагов до цели"
              min={2}
              max={8}
              value={spec.steps}
              onChange={(v) => onChange({ ...spec, steps: num(v, 2) })}
            />
            <NumberInput
              label="Раундов"
              min={1}
              max={6}
              value={spec.rounds}
              onChange={(v) => onChange({ ...spec, rounds: num(v, 1) })}
            />
          </Group>
          <Checkbox
            label="С камнями — их надо обходить"
            checked={spec.rocks}
            onChange={(e) => onChange({ ...spec, rocks: e.currentTarget.checked })}
          />
        </Stack>
      );
    case 'space':
      return (
        <Stack gap="xs">
          <SegmentedControl
            data={[
              { value: 'numbers', label: 'Цифры' },
              { value: 'letters', label: 'Буквы' },
            ]}
            value={spec.order}
            onChange={(v) => onChange({ ...spec, order: v as 'numbers' | 'letters' })}
          />
          <Group grow>
            <NumberInput
              label="Планет"
              min={3}
              max={10}
              value={spec.count}
              onChange={(v) => onChange({ ...spec, count: num(v, 3) })}
            />
            <NumberInput
              label="Раундов"
              min={1}
              max={5}
              value={spec.rounds}
              onChange={(v) => onChange({ ...spec, rounds: num(v, 1) })}
            />
          </Group>
          {spec.order === 'numbers' && (
            <Checkbox
              label="Через одну: 2, 4, 6…"
              checked={spec.step === 2}
              onChange={(e) => onChange({ ...spec, step: e.currentTarget.checked ? 2 : 1 })}
            />
          )}
          <Checkbox
            label="С конца"
            checked={spec.reverse}
            onChange={(e) => onChange({ ...spec, reverse: e.currentTarget.checked })}
          />
          <Text size="xs" c="dimmed">
            Сложность растёт сама: больше планет, через одну, с конца.
          </Text>
        </Stack>
      );
    case 'fishing':
      return (
        <Stack gap="xs">
          <SegmentedControl
            data={[
              { value: 'numbers', label: 'Цифры' },
              { value: 'letters', label: 'Буквы' },
              { value: 'sums', label: 'Примеры' },
            ]}
            value={spec.mode}
            onChange={(v) => onChange({ ...spec, mode: v as 'numbers' | 'letters' | 'sums' })}
          />
          <Group grow>
            <NumberInput
              label={
                spec.mode === 'letters' ? 'Букв' : spec.mode === 'sums' ? 'Ответ до' : 'Цифры до'
              }
              min={3}
              max={10}
              value={spec.max}
              onChange={(v) => onChange({ ...spec, max: num(v, 3) })}
            />
            <NumberInput
              label="Рыбок"
              min={3}
              max={6}
              value={spec.fish}
              onChange={(v) => onChange({ ...spec, fish: num(v, 3) })}
            />
            <NumberInput
              label="Раундов"
              min={2}
              max={10}
              value={spec.rounds}
              onChange={(v) => onChange({ ...spec, rounds: num(v, 2) })}
            />
          </Group>
          <SegmentedControl
            data={[
              { value: 'slow', label: 'Медленно' },
              { value: 'normal', label: 'Обычно' },
              { value: 'fast', label: 'Быстро' },
            ]}
            value={spec.speed}
            onChange={(v) => onChange({ ...spec, speed: v as 'slow' | 'normal' | 'fast' })}
          />
          {spec.mode === 'letters' && (
            <Text size="xs" c="dimmed">
              Буквы по порядку: {FISHING_LETTERS.slice(0, spec.max).join(' ')}
            </Text>
          )}
        </Stack>
      );
    case 'flight':
      return (
        <Stack gap="xs">
          <NumberInput
            label="Звёздочек собрать"
            min={5}
            max={20}
            value={spec.stars}
            onChange={(v) => onChange({ ...spec, stars: num(v, 5) })}
          />
          <Text size="sm">Тучки</Text>
          <SegmentedControl
            data={[
              { value: 'none', label: 'Нет' },
              { value: 'few', label: 'Немного' },
              { value: 'many', label: 'Много' },
            ]}
            value={spec.clouds}
            onChange={(v) => onChange({ ...spec, clouds: v as 'none' | 'few' | 'many' })}
          />
          <Text size="sm">Скорость</Text>
          <SegmentedControl
            data={[
              { value: 'slow', label: 'Медленно' },
              { value: 'normal', label: 'Обычно' },
              { value: 'fast', label: 'Быстро' },
            ]}
            value={spec.speed}
            onChange={(v) => onChange({ ...spec, speed: v as 'slow' | 'normal' | 'fast' })}
          />
          <Text size="xs" c="dimmed">
            Проиграть нельзя: тучка только мешает. Сложность растёт сама: больше звёзд, тучек,
            быстрее.
          </Text>
        </Stack>
      );
    case 'builder':
      return (
        <Stack gap="xs">
          <Group grow>
            <NumberInput
              label="Деталей в башне"
              min={2}
              max={6}
              value={spec.height}
              onChange={(v) => onChange({ ...spec, height: num(v, 2) })}
            />
            <NumberInput
              label="Разных деталей"
              min={3}
              max={5}
              value={spec.blocks}
              onChange={(v) => onChange({ ...spec, blocks: num(v, 3) })}
            />
            <NumberInput
              label="Башен"
              min={1}
              max={5}
              value={spec.rounds}
              onChange={(v) => onChange({ ...spec, rounds: num(v, 1) })}
            />
          </Group>
          <Checkbox
            label="По памяти: образец прячется (подсмотреть можно)"
            checked={spec.hide}
            onChange={(e) => onChange({ ...spec, hide: e.currentTarget.checked })}
          />
          <Text size="xs" c="dimmed">
            Детали: кубик, брусок, крыша, арка, цилиндр — по порядку. Сложность растёт сама.
          </Text>
        </Stack>
      );
    case 'syllableWord':
      return (
        <Stack gap="xs">
          <Presets
            label="Готовые слова (заменят список)"
            sets={SYLLABLE_WORD_SETS}
            title={(s) => s.title}
            apply={async (s) => {
              const ids = await emojiIds(s.words.map((w) => w.code));
              onChange({
                ...spec,
                words: s.words.map((w, i) => ({ imageId: ids[i]!, word: w.word })),
              });
            }}
          />
          <NumberInput
            label="Лишних слогов"
            min={0}
            max={2}
            value={spec.extra}
            onChange={(v) => onChange({ ...spec, extra: Number(v) || 0 })}
          />
          <Text size="sm" fw={500}>
            Слова с картинками (1–10), слоги через дефис
          </Text>
          <LabeledImages
            items={spec.words}
            max={10}
            placeholder="МА-ШИ-НА"
            text={(w) => w.word}
            withText={(w, word) => ({ ...w, word: word.toUpperCase() })}
            make={(imageId) => ({ imageId, word: '' })}
            onChange={(words) => onChange({ ...spec, words })}
          />
        </Stack>
      );
    case 'riddle':
      return (
        <Stack gap="xs">
          <Presets
            label="Готовые загадки (заменят список)"
            sets={RIDDLE_SETS}
            title={(s) => s.title}
            apply={async (s) => {
              const ids = await emojiIds(s.riddles.map((r) => r.code));
              onChange({
                ...spec,
                riddles: s.riddles.map((r, i) => ({
                  text: r.text,
                  name: r.name,
                  imageId: ids[i]!,
                })),
              });
            }}
          />
          <Group grow>
            <Choices value={spec.choices} onChange={(choices) => onChange({ ...spec, choices })} />
            <NumberInput
              label="Загадок за игру"
              min={1}
              max={12}
              value={spec.rounds}
              onChange={(v) => onChange({ ...spec, rounds: num(v, 1) })}
            />
          </Group>
          <Text size="sm" fw={500}>
            Загадки (2–12): картинка-отгадка, слово и текст
          </Text>
          {spec.riddles.map((r, i) => {
            const set = (next: typeof r) =>
              onChange({ ...spec, riddles: spec.riddles.map((x, k) => (k === i ? next : x)) });
            return (
              <Stack key={i} gap={4} p="xs" style={{ border: '1px solid #eee', borderRadius: 8 }}>
                <Group gap="xs" wrap="nowrap">
                  <ImageSlot
                    image={ref(r.imageId)}
                    onPick={(img) => set({ ...r, imageId: img.id })}
                  />
                  <TextInput
                    style={{ flex: 1 }}
                    placeholder="ёжик"
                    value={r.name}
                    maxLength={60}
                    onChange={(e) => set({ ...r, name: e.currentTarget.value })}
                  />
                  <ActionIcon
                    variant="subtle"
                    color="red"
                    aria-label="Убрать"
                    onClick={() =>
                      onChange({ ...spec, riddles: spec.riddles.filter((_, k) => k !== i) })
                    }
                  >
                    ✕
                  </ActionIcon>
                </Group>
                <Textarea
                  autosize
                  minRows={2}
                  placeholder="Хожу по лесу в колючей шубке. Кто я?"
                  value={r.text}
                  maxLength={300}
                  onChange={(e) => set({ ...r, text: e.currentTarget.value })}
                />
              </Stack>
            );
          })}
          {spec.riddles.length < 12 && (
            <ImageSlot
              image={null}
              hint="Добавить загадку"
              onPick={(img) =>
                onChange({
                  ...spec,
                  riddles: [...spec.riddles, { text: '', name: '', imageId: img.id }],
                })
              }
            />
          )}
          <Text size="xs" c="dimmed">
            Остальные варианты — отгадки других загадок. После ответа совёнок скажет «Это …!».
          </Text>
        </Stack>
      );
    case 'sudoku':
      return (
        <Stack gap="xs">
          <Presets
            label="Готовые картинки"
            sets={SUDOKU_SETS}
            title={(s) => s.title}
            apply={async (s) => onChange({ ...spec, imageIds: await emojiIds(s.codes) })}
          />
          <Text size="sm" fw={500}>
            Картинки (3–4, разные)
          </Text>
          <ImageList
            ids={spec.imageIds}
            max={4}
            onChange={(imageIds) =>
              onChange({ ...spec, imageIds, size: imageIds.length < 4 ? 3 : spec.size })
            }
          />
          <Group grow>
            <Select
              label="Поле"
              allowDeselect={false}
              value={String(spec.size)}
              data={[
                { value: '3', label: '3 × 3' },
                { value: '4', label: '4 × 4', disabled: new Set(spec.imageIds).size < 4 },
              ]}
              onChange={(v) => v && onChange({ ...spec, size: Number(v) as 3 | 4 })}
            />
            <NumberInput
              label="Пустых клеток"
              min={1}
              max={spec.size === 4 ? 12 : 6}
              value={spec.blanks}
              onChange={(v) => onChange({ ...spec, blanks: num(v, 1) })}
            />
            <NumberInput
              label="Полей"
              min={1}
              max={5}
              value={spec.rounds}
              onChange={(v) => onChange({ ...spec, rounds: num(v, 1) })}
            />
          </Group>
          <Text size="xs" c="dimmed">
            В каждой строке и столбце каждая картинка — по разу; решение всегда одно. Сложность
            растёт сама: поле 4 × 4 и больше пустых клеток.
          </Text>
        </Stack>
      );
    case 'dots':
      return (
        <Stack gap="xs">
          <PickChips
            label="Картинки (по очереди, до 10)"
            all={DOT_PICTURES}
            labels={DOT_LABELS}
            value={spec.pictures}
            onChange={(pictures) => onChange({ ...spec, pictures })}
          />
          <Switch
            label="Подсказка: следующая точка мигает"
            checked={spec.hint}
            onChange={(e) => onChange({ ...spec, hint: e.currentTarget.checked })}
          />
          <Text size="xs" c="dimmed">
            Ребёнок нажимает (или ведёт пальцем) по точкам 1, 2, 3… — получается картинка. Когда
            получается без ошибок, подсказка выключается сама.
          </Text>
        </Stack>
      );
    case 'tangram':
      return (
        <Stack gap="xs">
          <PickChips
            label="Фигуры (по очереди, до 10; в скобках — сколько деталей)"
            all={TANGRAM_FIGURES}
            labels={TANGRAM_LABELS}
            value={spec.figures}
            onChange={(figures) => onChange({ ...spec, figures })}
          />
          <Switch
            label="Видны контуры каждой детали (проще)"
            checked={spec.outline}
            onChange={(e) => onChange({ ...spec, outline: e.currentTarget.checked })}
          />
          <Text size="xs" c="dimmed">
            Детали перетаскивают в серый силуэт. Сложность растёт сама: остаётся только общий
            силуэт.
          </Text>
        </Stack>
      );
    case 'colorNumbers':
      return (
        <Stack gap="xs">
          <PickChips
            label="Картинки (по очереди)"
            all={COLORING_PICTURES}
            labels={PICTURE_LABELS}
            value={spec.pictures}
            onChange={(pictures) => onChange({ ...spec, pictures })}
          />
          <Switch
            label="Подсказка: области чуть подкрашены своим цветом"
            checked={spec.hint}
            onChange={(e) => onChange({ ...spec, hint: e.currentTarget.checked })}
          />
          <Text size="xs" c="dimmed">
            У каждой области — цифра, у краски — тоже. Цифры 1–7 ребёнок узнаёт по ходу игры.
          </Text>
        </Stack>
      );
    case 'dive':
      return (
        <Stack gap="xs">
          <Text size="sm">Задания</Text>
          <SegmentedControl
            data={[
              { value: 'colors', label: 'Цвета и счёт' },
              { value: 'numbers', label: 'Цифры' },
              { value: 'mixed', label: 'Вперемешку' },
            ]}
            value={spec.task}
            onChange={(v) => onChange({ ...spec, task: v as 'colors' | 'numbers' | 'mixed' })}
          />
          <Group grow>
            <NumberInput
              label="Цифры до"
              min={3}
              max={10}
              value={spec.max}
              onChange={(v) => onChange({ ...spec, max: num(v, 5) })}
            />
            <NumberInput
              label="Заданий"
              min={2}
              max={8}
              value={spec.rounds}
              onChange={(v) => onChange({ ...spec, rounds: num(v, 3) })}
            />
          </Group>
          <Text size="sm">Медузы</Text>
          <SegmentedControl
            data={[
              { value: 'none', label: 'Нет' },
              { value: 'few', label: 'Немного' },
              { value: 'many', label: 'Много' },
            ]}
            value={spec.jellies}
            onChange={(v) => onChange({ ...spec, jellies: v as 'none' | 'few' | 'many' })}
          />
          <Text size="sm">Скорость</Text>
          <SegmentedControl
            data={[
              { value: 'slow', label: 'Медленно' },
              { value: 'normal', label: 'Обычно' },
              { value: 'fast', label: 'Быстро' },
            ]}
            value={spec.speed}
            onChange={(v) => onChange({ ...spec, speed: v as 'slow' | 'normal' | 'fast' })}
          />
          <Text size="xs" c="dimmed">
            Ребёнок ведёт батискаф пальцем и ловит рыбок: «три жёлтые рыбки» (до пяти) или «рыбку с
            цифрой пять». Медуза только отталкивает. Сложность растёт сама: цифры больше, медуз
            больше, потом задания вперемешку.
          </Text>
        </Stack>
      );
    case 'rocket':
      return (
        <Stack gap="xs">
          <Group grow>
            <NumberInput
              label="Деталей ракеты"
              min={3}
              max={5}
              value={spec.parts}
              onChange={(v) => onChange({ ...spec, parts: num(v, 3) })}
            />
            <NumberInput
              label="Полётов"
              min={1}
              max={5}
              value={spec.rounds}
              onChange={(v) => onChange({ ...spec, rounds: num(v, 2) })}
            />
          </Group>
          <Switch
            label="По памяти: чертёж прячется (подсмотреть можно)"
            checked={spec.memory}
            onChange={(e) => onChange({ ...spec, memory: e.currentTarget.checked })}
          />
          <Text size="sm">На планетах</Text>
          <SegmentedControl
            data={[
              { value: 'numbers', label: 'Цифры' },
              { value: 'sums', label: 'Сложение' },
              { value: 'letters', label: 'Буквы' },
            ]}
            value={spec.quiz}
            onChange={(v) => onChange({ ...spec, quiz: v as 'numbers' | 'sums' | 'letters' })}
          />
          <NumberInput
            label={spec.quiz === 'letters' ? 'Сколько первых букв' : 'Ответы до'}
            min={3}
            max={10}
            value={spec.max}
            onChange={(v) => onChange({ ...spec, max: num(v, 5) })}
          />
          <Text size="sm">Камни в космосе</Text>
          <SegmentedControl
            data={[
              { value: 'none', label: 'Нет' },
              { value: 'few', label: 'Немного' },
              { value: 'many', label: 'Много' },
            ]}
            value={spec.asteroids}
            onChange={(v) => onChange({ ...spec, asteroids: v as 'none' | 'few' | 'many' })}
          />
          <Text size="xs" c="dimmed">
            Сначала ребёнок собирает ракету по цветному чертежу, потом летит и ведёт её пальцем к
            планете с ответом. Буквы: {FISHING_LETTERS.slice(0, spec.max).join(' ')}. Сложность
            растёт сама: больше деталей, по памяти, ответы до большего, больше камней.
          </Text>
        </Stack>
      );
    case 'race':
      return (
        <Stack gap="xs">
          <Text size="sm">На воротах</Text>
          <SegmentedControl
            data={[
              { value: 'colors', label: 'Цвета' },
              { value: 'numbers', label: 'Цифры' },
              { value: 'letters', label: 'Буквы' },
            ]}
            value={spec.quiz}
            onChange={(v) => onChange({ ...spec, quiz: v as 'colors' | 'numbers' | 'letters' })}
          />
          <Group grow>
            <NumberInput
              label={
                spec.quiz === 'letters'
                  ? 'Сколько первых букв'
                  : spec.quiz === 'colors'
                    ? 'Сколько цветов (до 6)'
                    : 'Цифры до'
              }
              min={3}
              max={10}
              value={spec.max}
              onChange={(v) => onChange({ ...spec, max: num(v, 3) })}
            />
            <NumberInput
              label="Ворот"
              min={3}
              max={10}
              value={spec.gates}
              onChange={(v) => onChange({ ...spec, gates: num(v, 4) })}
            />
          </Group>
          <Switch
            label="Машинки-соперники (обгонять)"
            checked={spec.rivals}
            onChange={(e) => onChange({ ...spec, rivals: e.currentTarget.checked })}
          />
          <Text size="sm">Конусы на дороге</Text>
          <SegmentedControl
            data={[
              { value: 'none', label: 'Нет' },
              { value: 'few', label: 'Немного' },
              { value: 'many', label: 'Много' },
            ]}
            value={spec.cones}
            onChange={(v) => onChange({ ...spec, cones: v as 'none' | 'few' | 'many' })}
          />
          <Text size="sm">Скорость</Text>
          <SegmentedControl
            data={[
              { value: 'slow', label: 'Медленно' },
              { value: 'normal', label: 'Средне' },
              { value: 'fast', label: 'Быстро' },
            ]}
            value={spec.speed}
            onChange={(v) => onChange({ ...spec, speed: v as 'slow' | 'normal' | 'fast' })}
          />
          <Text size="xs" c="dimmed">
            Ребёнок ведёт машинку пальцем и проезжает в ворота с ответом: «Проезжай в красные
            ворота!», «…с цифрой три!». Не те ворота — машинка притормаживает, и задание
            повторяется. Сложность растёт сама: ответы до большего, больше ворот и конусов, быстрее.
          </Text>
        </Stack>
      );
    case 'poem': {
      const p = poemOf(spec.poem);
      return (
        <Stack gap="xs">
          <Select
            label="Что учим"
            allowDeselect={false}
            value={spec.poem}
            data={POEM_OPTIONS}
            onChange={(v) => v && onChange({ ...spec, poem: v as PoemCode })}
          />
          <Text size="xs" c="dimmed">
            {poemAnnounce(p)} Картинок: {p.parts.length}
            {p.learn.length ? ` · наизусть — за ${p.learn.length} занят.` : ''}
          </Text>
          <Spoiler maxHeight={44} showLabel="Весь текст" hideLabel="Свернуть">
            <Text size="sm" style={{ whiteSpace: 'pre-line' }}>
              {p.parts.map((part) => part.lines.join('\n')).join('\n\n')}
            </Text>
          </Spoiler>
          <Switch
            label="Повторять за голосом — учим наизусть по частям"
            description={p.learn.length ? undefined : 'Это рассказ: наизусть не учим'}
            disabled={!p.learn.length}
            checked={spec.repeat && p.learn.length > 0}
            onChange={(e) => onChange({ ...spec, repeat: e.currentTarget.checked })}
          />
          <Switch
            label="«Договори словечко»"
            checked={spec.blanks}
            onChange={(e) => onChange({ ...spec, blanks: e.currentTarget.checked })}
          />
          <Switch
            label="Вопросы по смыслу"
            checked={spec.questions}
            onChange={(e) => onChange({ ...spec, questions: e.currentTarget.checked })}
          />
          <Choices value={spec.choices} onChange={(choices) => onChange({ ...spec, choices })} />
          <Text size="xs" c="dimmed">
            Ребёнок слушает под глиняные картинки, потом повторяет за голосом строчки — по части за
            занятие (телефон помнит, что уже выучено). «Договори словечко»: голос замолкает перед
            словом, ребёнок выбирает картинку. Выучено всё — «Расскажи вместе со мной»: голос
            начинает строку, ребёнок продолжает. Сложность растёт сама: больше вариантов ответа.
          </Text>
        </Stack>
      );
    }
    case 'book': {
      const b = bookOf(spec.book);
      const pages = b.chapters.reduce((n, c) => n + c.pages.length, 0);
      return (
        <Stack gap="xs">
          <Select
            label="Книжка"
            allowDeselect={false}
            value={spec.book}
            data={BOOK_OPTIONS}
            onChange={(v) =>
              v &&
              onChange({
                ...spec,
                book: v as BookCode,
                readSelf: spec.readSelf && bookReads(bookOf(v as BookCode)).length > 0,
              })
            }
          />
          <Text size="xs" c="dimmed">
            {bookAnnounce(b)}
            {b.translator ? ` Перевод: ${b.translator}.` : ''} Страниц: {pages}
            {b.chapters.length > 1 ? ` · глав: ${b.chapters.length}, по главе в день` : ''} · около{' '}
            {Math.max(1, Math.round(bookChars(b) / 900))} мин.
            {b.drawn ? '' : ' Картинки ещё рисуются — пока вместо них значки.'}
          </Text>
          <Spoiler maxHeight={44} showLabel="Весь текст" hideLabel="Свернуть">
            <Text size="sm" style={{ whiteSpace: 'pre-line' }}>
              {b.chapters
                .map((c) =>
                  [c.title ?? '', ...c.pages.map((page) => page.text.join(' '))]
                    .filter(Boolean)
                    .join('\n\n'),
                )
                .join('\n\n')}
            </Text>
          </Spoiler>
          <Text size="xs" c="dimmed">
            Источник: {b.source.note}
          </Text>
          <Switch
            label="Страницы листаются сами"
            description="Иначе ребёнок нажимает стрелку, когда дослушал страницу"
            checked={spec.autoTurn}
            onChange={(e) => onChange({ ...spec, autoTurn: e.currentTarget.checked })}
          />
          <Switch
            label="Вопросы в конце"
            checked={spec.questions}
            onChange={(e) => onChange({ ...spec, questions: e.currentTarget.checked })}
          />
          {spec.questions && (
            <Choices value={spec.choices} onChange={(choices) => onChange({ ...spec, choices })} />
          )}
          {bookReads(b).length > 0 && (
            <Switch
              label="Прочитай сам"
              description={`Продолжение «Букв»: перед страницей её слово крупно по слогам — ребёнок читает и нажимает, голос проверяет. Слов: ${bookReads(b).length}`}
              checked={spec.readSelf}
              onChange={(e) => onChange({ ...spec, readSelf: e.currentTarget.checked })}
            />
          )}
          <Text size="xs" c="dimmed">
            Голос читает страницу и подсвечивает предложение, которое звучит; нажал на предложение —
            прочитает ещё раз. Телефон помнит закладку: вышел посреди — продолжит с той же страницы.
            Длинная книжка — по главе в день.
          </Text>
        </Stack>
      );
    }
    case 'differences':
      return (
        <Stack gap="xs">
          <Chip.Group
            multiple
            value={spec.scenes}
            onChange={(v) =>
              v.length && onChange({ ...spec, scenes: v as (typeof DIFF_SCENES)[number][] })
            }
          >
            <Group gap="xs">
              {DIFF_SCENES.map((s) => (
                <Chip key={s} value={s}>
                  {DIFF_SCENE_LABELS[s]}
                </Chip>
              ))}
            </Group>
          </Chip.Group>
          <Group grow>
            <NumberInput
              label="Отличий на картинке"
              min={2}
              max={7}
              value={spec.count}
              onChange={(v) => onChange({ ...spec, count: num(v, 3) })}
            />
            <NumberInput
              label="Картинок"
              min={1}
              max={4}
              value={spec.rounds}
              onChange={(v) => onChange({ ...spec, rounds: num(v, 2) })}
            />
          </Group>
          <Switch
            label="Лупа подсказывает, если долго не находит"
            checked={spec.hint}
            onChange={(e) => onChange({ ...spec, hint: e.currentTarget.checked })}
          />
          <Text size="xs" c="dimmed">
            Две живые картинки — ребёнок нажимает, где по-другому: чего-то нет, другой цвет, другая
            картинка, смотрит в другую сторону, больше. Сложность растёт сама: больше отличий, потом
            без лупы и больше картинок.
          </Text>
        </Stack>
      );
  }
}

/** Картинки-эмодзи по кодам (этап 41) — для готовых наборов игр. */
const emojiIds = (codes: string[]) =>
  Promise.all(codes.map((code) => api.post<MediaRef>('/parent/media/emoji', { code }))).then(
    (refs) => refs.map((r) => r.id),
  );

/** Кнопки «готовый набор»: по нажатию картинки создаются на сервере и набор подставляется. */
function Presets<T>(props: {
  label: string;
  sets: T[];
  title: (s: T) => string;
  apply: (s: T) => Promise<void>;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <Stack gap={4}>
      <Text size="sm" fw={500}>
        {props.label}
      </Text>
      <Group gap={6}>
        {props.sets.map((s) => (
          <Button
            key={props.title(s)}
            size="compact-sm"
            variant="light"
            loading={busy === props.title(s)}
            onClick={() => {
              setBusy(props.title(s));
              setError(null);
              props
                .apply(s)
                .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
                .finally(() => setBusy(null));
            }}
          >
            {props.title(s)}
          </Button>
        ))}
      </Group>
      {error && (
        <Text size="xs" c="red">
          {error}
        </Text>
      )}
    </Stack>
  );
}

/** «🐱 КОТ» → слово с картинкой; строка — что не так. */
function picWordOf(line: string): { emoji: string; word: string } | string {
  const p = line.split(/\s+/);
  if (p.length !== 2 || !/^[А-ЯЁа-яё]{2,10}$/u.test(p[1]!)) return 'нужно «эмодзи СЛОВО»';
  return { emoji: p[0]!, word: p[1]!.toUpperCase() };
}

/**
 * Список по строкам (этап 49): текст правится свободно, в игру идут подходящие строки,
 * а под полем — какие строки не подошли и почему. recheck — от чего ещё зависит проверка.
 */
function LinesInput<T>(props: {
  label: string;
  value: T[];
  format: (x: T) => string;
  parse: (line: string) => T | string;
  recheck?: unknown;
  onChange: (xs: T[]) => void;
}) {
  const [text, setText] = useState(() => props.value.map(props.format).join('\n'));
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const parsed = lines.map((line) => ({ line, r: props.parse(line) }));
  const good = parsed.flatMap(({ r }) => (typeof r === 'string' ? [] : [r]));
  const bad = parsed.filter(({ r }) => typeof r === 'string');
  const emit = (t: string) =>
    props.onChange(
      t
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .flatMap((l) => {
          const r = props.parse(l);
          return typeof r === 'string' ? [] : [r];
        }),
    );
  useEffect(() => {
    if (props.recheck !== undefined) emit(text);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- проверить заново, когда сменилось условие
  }, [props.recheck]);
  return (
    <Textarea
      label={props.label}
      description={`В игре: ${good.length}`}
      autosize
      minRows={3}
      value={text}
      error={
        bad.length > 0 &&
        bad
          .slice(0, 3)
          .map(({ line, r }) => `«${line}» — ${r as string}`)
          .join('; ') + (bad.length > 3 ? ` и ещё ${bad.length - 3}` : '')
      }
      onChange={(e) => {
        setText(e.currentTarget.value);
        emit(e.currentTarget.value);
      }}
    />
  );
}

/** Сколько вариантов ответа показать. */
function Choices({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <NumberInput
      label="Вариантов"
      min={2}
      max={4}
      value={value}
      onChange={(v) => onChange(num(v, 2))}
    />
  );
}

/** Число раундов музыкальной игры. */
function MusicRounds({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <NumberInput
      label="Раундов"
      min={2}
      max={12}
      value={value}
      onChange={(v) => onChange(num(v, 2))}
    />
  );
}

/** Создание и изменение игры. */
export function GameEditor({ game, onDone }: { game: Game | null; onDone: () => void }) {
  const children = useChildren();
  const [v, setV] = useState<GameInput>(
    game
      ? { title: game.title, category: game.category, spec: game.spec, childIds: game.childIds }
      : { title: '', category: 'games', spec: DEFAULTS.coloring, childIds: [] },
  );
  const save = useMutation({
    mutationFn: () =>
      game ? api.put<Game>(`/parent/games/${game.id}`, v) : api.post<Game>('/parent/games', v),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: keys.games });
      void queryClient.invalidateQueries({ queryKey: ['child-items'] });
      onDone();
    },
  });
  const why = problem(v);
  const spec = v.spec as GameSpec;
  /**
   * Стих (этап 45) и книжка (этап 52): раздел «Стихи и сказки» или «Книжки» и название по
   * произведению, если родитель не задал своё.
   */
  const setSpec = (s: GameSpec) =>
    setV((old) => {
      const was = (old.spec as GameSpec).kind;
      const generic = !old.title.trim() || POEM_TITLES.has(old.title) || BOOK_TITLES.has(old.title);
      if (s.kind === 'poem') {
        const title = generic ? poemOf(s.poem).title : old.title;
        return { ...old, spec: s, title, category: was === 'poem' ? old.category : 'poems' };
      }
      if (s.kind === 'book') {
        const title = generic ? bookOf(s.book).title : old.title;
        return { ...old, spec: s, title, category: was === 'book' ? old.category : 'books' };
      }
      return { ...old, spec: s };
    });

  return (
    <Stack>
      <TextInput
        label="Название (видите только вы)"
        placeholder="Покорми зайчика"
        value={v.title}
        maxLength={120}
        onChange={(e) => setV({ ...v, title: e.currentTarget.value })}
      />
      <Select
        label="Вид игры"
        allowDeselect={false}
        value={spec.kind}
        data={(Object.keys(GAME_KINDS) as GameKind[]).map((k) => ({
          value: k,
          label: GAME_KINDS[k],
        }))}
        onChange={(k) => k && k !== spec.kind && setSpec(DEFAULTS[k as GameKind])}
      />
      <Select
        label="Раздел у ребёнка"
        allowDeselect={false}
        value={v.category ?? 'games'}
        data={GAME_CATEGORIES.map((c) => ({ value: c, label: GAME_CATEGORY_LABELS[c] }))}
        onChange={(c) => c && setV({ ...v, category: c as GameCategory })}
      />
      <SpecFields spec={spec} onChange={setSpec} />
      <Checkbox.Group
        label="Кому показывать"
        value={v.childIds}
        onChange={(childIds) => setV({ ...v, childIds })}
      >
        <Group mt={4}>
          {children.data?.map((c) => (
            <Checkbox key={c.id} value={c.id} label={c.nickname} />
          ))}
        </Group>
      </Checkbox.Group>
      {save.error && <Alert color="red">{save.error.message}</Alert>}
      {why && (
        <Text size="sm" c="dimmed">
          {why}
        </Text>
      )}
      <Button onClick={() => save.mutate()} loading={save.isPending} disabled={Boolean(why)}>
        Сохранить
      </Button>
    </Stack>
  );
}
