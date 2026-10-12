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
  FLASHLIGHT_SCENES,
  GAME_KINDS,
  MOLE_SPEEDS,
  PATTERNS,
  PIANO_MODES,
  SORTER_SHAPES,
  TRACE_SHAPES,
  type GameKind,
  type GameSpec,
} from '@kidsplus/shared/games';
import { SONG_IDS, SONGS, type SongId } from '@kidsplus/shared/songs';
import {
  ActionIcon,
  Alert,
  Button,
  Checkbox,
  Chip,
  Group,
  MultiSelect,
  NumberInput,
  Select,
  Stack,
  Switch,
  Text,
  Textarea,
  TextInput,
} from '@mantine/core';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../api';
import { keys, queryClient, useChildren } from '../queries';
import { problem } from '../lib/game';
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
  }
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
        onChange={(k) => k && k !== spec.kind && setV({ ...v, spec: DEFAULTS[k as GameKind] })}
      />
      <Select
        label="Раздел у ребёнка"
        allowDeselect={false}
        value={v.category ?? 'games'}
        data={GAME_CATEGORIES.map((c) => ({ value: c, label: GAME_CATEGORY_LABELS[c] }))}
        onChange={(c) => c && setV({ ...v, category: c as GameCategory })}
      />
      <SpecFields spec={spec} onChange={(s) => setV({ ...v, spec: s })} />
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
