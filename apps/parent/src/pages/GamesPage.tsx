import type { Game } from '@kidsplus/shared/api';
import { GAME_KINDS, type GameSpec } from '@kidsplus/shared/games';
import {
  Badge,
  Button,
  Card,
  Checkbox,
  Group,
  Modal,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../api';
import { GameEditor } from '../components/GameEditor';
import { modals } from '../lib/modals';
import { CATEGORY_LABELS } from './DecksPage';
import { keys, queryClient, useChildren, useGames } from '../queries';

/** Короткое описание параметров игры для родителя. */
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
  }
}

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
      <Group justify="space-between">
        <Title order={2}>Игры</Title>
        <Button onClick={() => setEditing('new')}>Новая игра</Button>
      </Group>
      <Text size="sm" c="dimmed">
        Рисование, раскраски, пазлы, лабиринты, «найди пару» и другие игры. У ребёнка они — в
        разделе «Игры» на главном экране (или в разделе, который выбран у игры, например «Природа»).
        Отметьте, кому какую показывать; новую игру можно собрать из своих картинок.
      </Text>
      {games.data?.length === 0 && <Text c="dimmed">Игр пока нет.</Text>}
      <SimpleGrid cols={{ base: 1, sm: 2 }}>
        {games.data?.map((g) => (
          <Card key={g.id} withBorder padding="sm">
            <Stack gap={6}>
              <Group gap="xs">
                <Badge variant="light" color="pink">
                  {GAME_KINDS[g.spec.kind]}
                </Badge>
                <Text fw={600}>{g.title}</Text>
                {g.category !== 'games' && (
                  <Badge variant="outline" color="gray">
                    {CATEGORY_LABELS[g.category]}
                  </Badge>
                )}
              </Group>
              <Text size="sm" c="dimmed">
                {gameSummary(g.spec)}
              </Text>
              <Checkbox.Group
                value={g.childIds}
                onChange={(childIds) => assign.mutate({ game: g, childIds })}
              >
                <Group>
                  {children.data?.map((c) => (
                    <Checkbox key={c.id} value={c.id} label={c.nickname} />
                  ))}
                </Group>
              </Checkbox.Group>
              <Group gap="xs">
                <Button size="compact-sm" variant="default" onClick={() => setEditing(g)}>
                  Изменить
                </Button>
                <Button
                  size="compact-sm"
                  variant="subtle"
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
                </Button>
              </Group>
            </Stack>
          </Card>
        ))}
      </SimpleGrid>
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
