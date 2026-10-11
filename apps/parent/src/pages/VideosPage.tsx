import type { ChildItem, Deck, Game, Segment } from '@kidsplus/shared/api';
import { GAME_KINDS } from '@kidsplus/shared/games';
import { formatTime } from '@kidsplus/shared/time';
import {
  ActionIcon,
  Badge,
  Button,
  Card,
  Group,
  Image,
  SegmentedControl,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { useMutation } from '@tanstack/react-query';
import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { api } from '../api';
import { modals } from '../lib/modals';
import {
  keys,
  queryClient,
  useChildItems,
  useChildren,
  useDecks,
  useGames,
  useSegments,
} from '../queries';
import { gameSummary } from './GamesPage';

type Row = { item: ChildItem; segment?: Segment; deck?: Deck; game?: Game };

export function VideosPage() {
  const segments = useSegments();
  const decks = useDecks();
  const games = useGames();
  const children = useChildren();
  const [filter, setFilter] = useState<string>('all');
  const childId = filter === 'all' ? null : filter;
  const items = useChildItems(childId);

  const names = useMemo(
    () => new Map(children.data?.map((c) => [c.id, c.nickname]) ?? []),
    [children.data],
  );

  // Для конкретного ребёнка — его список (видео и карточки) в порядке показа.
  const rows = useMemo((): Row[] => {
    if (!childId) return [];
    const seg = new Map(segments.data?.map((s) => [s.id, s]));
    const dk = new Map(decks.data?.map((d) => [d.id, d]));
    const gm = new Map(games.data?.map((g) => [g.id, g]));
    return (items.data ?? []).map((item) =>
      item.kind === 'segment'
        ? { item, ...(seg.get(item.refId) ? { segment: seg.get(item.refId)! } : {}) }
        : item.kind === 'deck'
          ? { item, ...(dk.get(item.refId) ? { deck: dk.get(item.refId)! } : {}) }
          : { item, ...(gm.get(item.refId) ? { game: gm.get(item.refId)! } : {}) },
    );
  }, [childId, items.data, segments.data, decks.data, games.data]);

  const reorder = useMutation({
    mutationFn: (itemIds: string[]) => api.put(`/parent/children/${childId}/items`, { itemIds }),
    onMutate: (itemIds) =>
      queryClient.setQueryData<ChildItem[]>(keys.childItems(childId!), (old) =>
        itemIds.map((id) => old!.find((i) => i.id === id)!),
      ),
    onSettled: () => queryClient.invalidateQueries({ queryKey: keys.childItems(childId!) }),
  });

  const move = (index: number, delta: number) => {
    const ids = rows.map((r) => r.item.id);
    const target = index + delta;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target]!, ids[index]!];
    reorder.mutate(ids);
  };

  return (
    <Stack>
      <Group justify="space-between">
        <Title order={2}>Видео</Title>
        <Button component={Link} to="/videos/new">
          Добавить видео
        </Button>
      </Group>

      {(children.data?.length ?? 0) > 0 && (
        <SegmentedControl
          value={filter}
          onChange={setFilter}
          data={[
            { value: 'all', label: 'Все видео' },
            ...(children.data ?? []).map((c) => ({ value: c.id, label: `Список: ${c.nickname}` })),
          ]}
        />
      )}

      {childId ? (
        <>
          <Text size="sm" c="dimmed">
            Так ребёнок проходит свой список: видео → вопросы к нему → следующий пункт. Порядок
            меняйте стрелками; наборы карточек добавляются в разделе «Карточки».
          </Text>
          {items.data?.length === 0 && <Text c="dimmed">Список пока пуст.</Text>}
          {rows.map((r, i) => (
            <Ordered
              key={r.item.id}
              onUp={() => move(i, -1)}
              onDown={() => move(i, 1)}
              first={i === 0}
              last={i === rows.length - 1}
            >
              {r.segment && <SegmentCard segment={r.segment} names={names} />}
              {r.deck && <DeckRow deck={r.deck} />}
              {r.game && <GameRow game={r.game} />}
            </Ordered>
          ))}
        </>
      ) : (
        <>
          {segments.data?.length === 0 && <Text c="dimmed">Видео пока нет.</Text>}
          {segments.data?.map((s) => (
            <SegmentCard key={s.id} segment={s} names={names} />
          ))}
        </>
      )}
    </Stack>
  );
}

function Ordered(props: {
  children: ReactNode;
  onUp: () => void;
  onDown: () => void;
  first: boolean;
  last: boolean;
}) {
  return (
    <Group wrap="nowrap" align="stretch" gap="xs">
      <div style={{ flex: 1, minWidth: 0 }}>{props.children}</div>
      <Stack gap={4} justify="center">
        <ActionIcon variant="default" aria-label="Выше" disabled={props.first} onClick={props.onUp}>
          ↑
        </ActionIcon>
        <ActionIcon
          variant="default"
          aria-label="Ниже"
          disabled={props.last}
          onClick={props.onDown}
        >
          ↓
        </ActionIcon>
      </Stack>
    </Group>
  );
}

function GameRow({ game }: { game: Game }) {
  return (
    <Card withBorder padding="sm">
      <Group wrap="nowrap">
        <Text fz={40} aria-hidden>
          🎨
        </Text>
        <Stack gap={4} style={{ flex: 1 }}>
          <Group gap="xs">
            <Badge variant="light" color="pink">
              {GAME_KINDS[game.spec.kind]}
            </Badge>
            <Text fw={600}>{game.title}</Text>
          </Group>
          <Text size="sm" c="dimmed">
            {gameSummary(game.spec)}
          </Text>
        </Stack>
        <Button size="compact-sm" variant="default" component={Link} to="/games">
          Открыть
        </Button>
      </Group>
    </Card>
  );
}

function DeckRow({ deck }: { deck: Deck }) {
  const cover = deck.cards[0]?.image.url;
  return (
    <Card withBorder padding="sm">
      <Group wrap="nowrap">
        {cover ? (
          <Image src={cover} alt="" w={72} h={72} fit="contain" />
        ) : (
          <Text fz={40} aria-hidden>
            🃏
          </Text>
        )}
        <Stack gap={4} style={{ flex: 1 }}>
          <Group gap="xs">
            <Badge variant="light" color="grape">
              карточки
            </Badge>
            <Text fw={600}>{deck.title}</Text>
          </Group>
          <Text size="sm" c="dimmed">
            {deck.cards.length} шт.
          </Text>
        </Stack>
        <Button size="compact-sm" variant="default" component={Link} to={`/decks/${deck.id}`}>
          Открыть
        </Button>
      </Group>
    </Card>
  );
}

function SegmentCard({ segment: s, names }: { segment: Segment; names: Map<string, string> }) {
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: keys.segments });
    void queryClient.invalidateQueries({ queryKey: ['child-items'] });
  };

  const remove = useMutation({
    mutationFn: () => api.delete(`/parent/segments/${s.id}`),
    onSuccess: invalidate,
  });
  const recheck = useMutation({
    mutationFn: () => api.post<Segment>(`/parent/segments/${s.id}/recheck`),
    onSuccess: invalidate,
  });

  return (
    <Card withBorder padding="sm">
      <Group wrap="nowrap" align="flex-start">
        {s.source.thumbnailUrl && (
          <Image src={s.source.thumbnailUrl} alt="" w={128} h={72} radius="sm" fit="cover" />
        )}
        <Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
          <Text fw={600} lineClamp={2}>
            {s.title}
          </Text>
          <Text size="sm" c="dimmed" lineClamp={1}>
            {s.source.channelTitle ?? '—'} · {formatTime(s.startSec)}–{formatTime(s.endSec)} (
            {formatTime(s.endSec - s.startSec)})
          </Text>
          <Group gap={4}>
            {s.source.status === 'unavailable' && (
              <Badge color="red" variant="light">
                недоступно
              </Badge>
            )}
            <Badge color={s.questionCount ? 'teal' : 'orange'} variant="light">
              {s.questionCount ? `вопросов: ${s.questionCount}` : 'без вопросов'}
            </Badge>
            {s.childIds.length === 0 && (
              <Badge color="gray" variant="light">
                никому не назначено
              </Badge>
            )}
            {s.childIds.map((id) => (
              <Badge key={id} variant="light">
                {names.get(id) ?? '?'}
              </Badge>
            ))}
          </Group>
          <Group gap="xs" mt={4}>
            <Button size="compact-sm" variant="default" component={Link} to={`/videos/${s.id}`}>
              Изменить и вопросы
            </Button>
            {s.source.status === 'unavailable' && (
              <Button
                size="compact-sm"
                variant="default"
                loading={recheck.isPending}
                onClick={() => recheck.mutate()}
              >
                Проверить снова
              </Button>
            )}
            <Button
              size="compact-sm"
              variant="subtle"
              color="red"
              onClick={() =>
                modals.confirm({
                  title: 'Удалить фрагмент?',
                  message: `«${s.title}» пропадёт у всех детей вместе с вопросами.`,
                  confirmLabel: 'Удалить',
                  onConfirm: () => remove.mutate(),
                })
              }
            >
              Удалить
            </Button>
          </Group>
        </Stack>
      </Group>
    </Card>
  );
}
