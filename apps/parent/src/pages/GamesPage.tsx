import type { Game } from '@kidsplus/shared/api';
import { GAME_KINDS, type GameKind, type GameSpec } from '@kidsplus/shared/games';
import {
  ActionIcon,
  Button,
  Card,
  Group,
  Menu,
  Modal,
  Stack,
  Text,
  UnstyledButton,
} from '@mantine/core';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../api';
import { GameEditor } from '../components/GameEditor';
import { modals } from '../lib/modals';
import { CATEGORY_LABELS } from './DecksPage';
import { keys, queryClient, useChildren, useGames } from '../queries';

/** Короткое описание параметров игры для родителя. */
export const PIANO_MODE_LABELS = {
  free: 'свободная игра',
  find: 'найди ноту',
  ear: 'узнай на слух',
} as const;

export function gameSummary(spec: GameSpec): string {
  switch (spec.kind) {
    case 'drawing':
      return spec.stickerIds.length ? `наклеек: ${spec.stickerIds.length}` : 'кисть и краски';
    case 'coloring':
      return spec.tasks ? 'с заданиями «раскрась … цветом»' : 'свободная';
    case 'sorting':
      return `«${spec.prompt}» · предметов: ${spec.items.length}`;
    case 'memory':
      return `пар: ${spec.imageIds.length}`;
    case 'puzzle':
      return `${spec.cols}×${spec.rows}, картинок: ${spec.imageIds.length}`;
    case 'tracing':
      return spec.shapes.length > 6 ? `${spec.shapes.length} фигур` : spec.shapes.join(', ');
    case 'balloons':
      return `шариков: ${spec.count}${spec.target ? ' · только одного цвета' : ''}`;
    case 'counting':
      return `до ${spec.max} · раундов: ${spec.rounds}`;
    case 'maze':
      return `${spec.size}×${spec.size} · лабиринтов: ${spec.rounds}`;
    case 'shadows':
      return `картинок: ${spec.imageIds.length}, по ${spec.perRound} за раз`;
    case 'flashlight':
      return `спрятано: ${spec.items.length}`;
    case 'moles':
      return `поймать: ${spec.count}${spec.target !== null ? ' · только одного' : ''}`;
    case 'melody':
      return `колокольчиков: ${spec.bells} · мелодия до ${spec.goal} нот`;
    case 'shapes':
      return `фигур: ${spec.shapes.length}${spec.rotate ? ' · с поворотом' : ''}`;
    case 'odd':
    case 'sequence':
      return `раундов: ${spec.rounds.length}`;
    case 'pattern':
      return `${spec.patterns.join(', ')} · раундов: ${spec.rounds}`;
    case 'compare':
      return `${spec.mode === 'numbers' ? 'числа' : 'предметы'} до ${spec.max} · раундов: ${spec.rounds}`;
    case 'arithmetic':
      return `${spec.ops.map((o) => (o === 'plus' ? '+' : '−')).join(' ')} до ${spec.max} · раундов: ${spec.rounds}`;
    case 'size':
      return `по ${spec.count} размера · картинок: ${spec.imageIds.length}`;
    case 'word':
      return spec.words.map((w) => w.word).join(', ');
    case 'pitch':
      return `разница ${spec.gap} полутонов · раундов: ${spec.rounds}`;
    case 'loudness':
    case 'tempo':
    case 'duration':
      return `раундов: ${spec.rounds}`;
    case 'direction':
      return `мелодия из ${spec.notes} нот · раундов: ${spec.rounds}`;
    case 'beats':
      return `до ${spec.max} ударов · раундов: ${spec.rounds}`;
    case 'rhythm':
      return `${spec.beats} ударов${spec.timing ? ' · «та» и «ти-ти»' : ''} · раундов: ${spec.rounds}`;
    case 'piano':
      return `${PIANO_MODE_LABELS[spec.mode]} · нот: ${spec.keys}`;
    case 'staff':
      return `нот: ${spec.keys} · раундов: ${spec.rounds}`;
    case 'letter':
      return `${spec.letters.join(' ')} · раундов: ${spec.rounds}`;
    case 'syllable':
      return `${spec.syllables.join(', ')} · раундов: ${spec.rounds}`;
    case 'firstLetter':
    case 'readWord':
      return `${spec.words.map((w) => w.word.toLowerCase()).join(', ')} · раундов: ${spec.rounds}`;
  }
}

/** Значок вида игры в списке. */
const GAME_ICONS: Record<GameKind, string> = {
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
  moles: '🐹',
  melody: '🎵',
  shapes: '🔷',
  odd: '❓',
  pattern: '🔁',
  compare: '⚖️',
  arithmetic: '➕',
  size: '📏',
  sequence: '🔢',
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

/** Игры (п. 5.6 ТЗ): кому какую показывать. У ребёнка они — в разделе «Игры». */
export function GamesPage() {
  const games = useGames();
  const children = useChildren();
  /** Открытый редактор: null — закрыт, 'new' — новая игра. */
  const [editing, setEditing] = useState<Game | 'new' | null>(null);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: keys.games });
    void queryClient.invalidateQueries({ queryKey: ['child-items'] });
  };
  const assign = useMutation({
    mutationFn: (v: { game: Game; childIds: string[] }) =>
      api.put<Game>(`/parent/games/${v.game.id}`, {
        title: v.game.title,
        category: v.game.category,
        spec: v.game.spec,
        childIds: v.childIds,
      }),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/parent/games/${id}`),
    onSuccess: refresh,
  });

  return (
    <Stack>
      <h1 className="page-title">Игры</h1>
      <Group gap="xs" wrap="nowrap" align="center">
        <Text size="sm" c="dimmed" style={{ flex: 1 }}>
          Касание имени — показать или скрыть игру у ребёнка.
        </Text>
        <Button radius="xl" onClick={() => setEditing('new')}>
          + Игра
        </Button>
      </Group>
      <Card padding={0}>
        <Stack gap={0} className="grouped decks">
          {games.data?.length === 0 && (
            <div className="attention-row">
              <Text c="dimmed">Игр пока нет.</Text>
            </div>
          )}
          {games.data?.map((g) => (
            <div key={g.id} className="attention-row">
              <span className="deck-thumb" aria-hidden>
                {GAME_ICONS[g.spec.kind]}
              </span>
              <Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
                <UnstyledButton onClick={() => setEditing(g)} style={{ minWidth: 0 }}>
                  <Text fw={600} truncate>
                    {g.title}
                  </Text>
                  <Text size="xs" c="dimmed" truncate>
                    {GAME_KINDS[g.spec.kind]}
                    {g.category !== 'games' ? ` · ${CATEGORY_LABELS[g.category]}` : ''} ·{' '}
                    {gameSummary(g.spec)}
                  </Text>
                </UnstyledButton>
                <div className="kid-pills">
                  {children.data?.map((c) => {
                    const on = g.childIds.includes(c.id);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        className={on ? 'on' : ''}
                        aria-pressed={on}
                        onClick={() =>
                          assign.mutate({
                            game: g,
                            childIds: on
                              ? g.childIds.filter((id) => id !== c.id)
                              : [...g.childIds, c.id],
                          })
                        }
                      >
                        {on ? '✓ ' : ''}
                        {c.nickname}
                      </button>
                    );
                  })}
                </div>
              </Stack>
              <Menu position="bottom-end" withinPortal>
                <Menu.Target>
                  <ActionIcon variant="subtle" color="gray" aria-label="Действия">
                    ⋯
                  </ActionIcon>
                </Menu.Target>
                <Menu.Dropdown>
                  <Menu.Item onClick={() => setEditing(g)}>Изменить</Menu.Item>
                  <Menu.Item
                    color="red"
                    onClick={() =>
                      modals.confirm({
                        title: 'Удалить игру?',
                        message: `«${g.title}» пропадёт у детей.`,
                        confirmLabel: 'Удалить',
                        onConfirm: () => remove.mutate(g.id),
                      })
                    }
                  >
                    Удалить
                  </Menu.Item>
                </Menu.Dropdown>
              </Menu>
            </div>
          ))}
        </Stack>
      </Card>
      <Modal
        opened={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? 'Новая игра' : 'Игра'}
        size="lg"
      >
        {editing !== null && (
          <GameEditor game={editing === 'new' ? null : editing} onDone={() => setEditing(null)} />
        )}
      </Modal>
    </Stack>
  );
}
