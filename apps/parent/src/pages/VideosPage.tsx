import type { ChildItem, Deck, Game, Segment } from '@kidsplus/shared/api';
import { GAME_KINDS } from '@kidsplus/shared/games';
import { formatTime } from '@kidsplus/shared/time';
import {
  ActionIcon,
  Card,
  Group,
  Menu,
  SegmentedControl,
  Stack,
  Text,
  TextInput,
  UnstyledButton,
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

/** Быстрые фильтры общего списка — то, что требует внимания родителя. */
const FILTERS = {
  all: { label: 'Все', test: () => true },
  noQuiz: { label: 'Без вопросов', test: (s: Segment) => !s.questionCount },
  nobody: { label: 'Никому', test: (s: Segment) => s.childIds.length === 0 },
  broken: { label: 'Недоступны', test: (s: Segment) => s.source.status === 'unavailable' },
} as const;
type FilterKey = keyof typeof FILTERS;

export function VideosPage() {
  const segments = useSegments();
  const decks = useDecks();
  const games = useGames();
  const children = useChildren();
  const [filter, setFilter] = useState<string>('all');
  const [query, setQuery] = useState('');
  const [quick, setQuick] = useState<FilterKey>('all');
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

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (segments.data ?? []).filter(
      (s) =>
        FILTERS[quick].test(s) &&
        (!q ||
          s.title.toLowerCase().includes(q) ||
          (s.source.channelTitle ?? '').toLowerCase().includes(q)),
    );
  }, [segments.data, query, quick]);

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
      <h1 className="page-title">Видео</h1>

      {(children.data?.length ?? 0) > 0 && (
        <SegmentedControl
          fullWidth
          value={filter}
          onChange={setFilter}
          data={[
            { value: 'all', label: 'Все видео' },
            ...(children.data ?? []).map((c) => ({ value: c.id, label: c.nickname })),
          ]}
        />
      )}

      {childId ? (
        <>
          <Text size="sm" c="dimmed" px={4}>
            Так ребёнок проходит свой список: видео → вопросы к нему → следующий пункт. Порядок —
            стрелками; карточки добавляются в разделе «Карточки».
          </Text>
          <Card padding={0}>
            <Stack gap={0} className="grouped thumbs">
              {items.data?.length === 0 && (
                <div className="attention-row">
                  <Text c="dimmed">Список пока пуст.</Text>
                </div>
              )}
              {rows.map((r, i) => (
                <Ordered
                  key={r.item.id}
                  onUp={() => move(i, -1)}
                  onDown={() => move(i, 1)}
                  first={i === 0}
                  last={i === rows.length - 1}
                >
                  {r.segment && <SegmentRow segment={r.segment} names={names} />}
                  {r.deck && <DeckRow deck={r.deck} />}
                  {r.game && <GameRow game={r.game} />}
                </Ordered>
              ))}
            </Stack>
          </Card>
        </>
      ) : (
        <>
          <Group gap="xs" wrap="nowrap">
            <TextInput
              placeholder="Поиск по названию или каналу"
              value={query}
              onChange={(e) => setQuery(e.currentTarget.value)}
              radius="xl"
              style={{ flex: 1 }}
            />
            <ActionIcon
              component={Link}
              to="/videos/new"
              size={36}
              radius="xl"
              aria-label="Добавить видео"
            >
              +
            </ActionIcon>
          </Group>
          <div className="chip-row">
            {(Object.keys(FILTERS) as FilterKey[]).map((k) => {
              const n = (segments.data ?? []).filter(FILTERS[k].test).length;
              if (k !== 'all' && !n) return null;
              return (
                <button
                  key={k}
                  type="button"
                  className={quick === k ? 'on' : ''}
                  onClick={() => setQuick(k)}
                >
                  {FILTERS[k].label} · {n}
                </button>
              );
            })}
          </div>
          <Card padding={0}>
            <Stack gap={0} className="grouped thumbs">
              {shown.length === 0 && (
                <div className="attention-row">
                  <Text c="dimmed">
                    {segments.data?.length === 0 ? 'Видео пока нет.' : 'Ничего не нашлось.'}
                  </Text>
                </div>
              )}
              {shown.map((s) => (
                <SegmentRow key={s.id} segment={s} names={names} />
              ))}
            </Stack>
          </Card>
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
    <div className="attention-row ordered">
      <div style={{ flex: 1, minWidth: 0 }}>{props.children}</div>
      <Stack gap={2}>
        <ActionIcon
          variant="subtle"
          size="sm"
          aria-label="Выше"
          disabled={props.first}
          onClick={props.onUp}
        >
          ↑
        </ActionIcon>
        <ActionIcon
          variant="subtle"
          size="sm"
          aria-label="Ниже"
          disabled={props.last}
          onClick={props.onDown}
        >
          ↓
        </ActionIcon>
      </Stack>
    </div>
  );
}

/** Значок вместо превью: того же размера, что превью видео. */
function Tile({ emoji, color }: { emoji: string; color: string }) {
  return (
    <span className="video-thumb" style={{ background: color }} aria-hidden>
      <Text fz={28}>{emoji}</Text>
    </span>
  );
}

function GameRow({ game }: { game: Game }) {
  return (
    <UnstyledButton component={Link} to="/games" className="attention-row">
      <Tile emoji="🎨" color="var(--mantine-color-pink-light)" />
      <Stack gap={0} style={{ flex: 1, minWidth: 0 }}>
        <Text fw={600} truncate>
          {game.title}
        </Text>
        <Text size="sm" c="dimmed" truncate>
          {GAME_KINDS[game.spec.kind]} · {gameSummary(game.spec)}
        </Text>
      </Stack>
      <span className="chevron" aria-hidden="true">
        ›
      </span>
    </UnstyledButton>
  );
}

function DeckRow({ deck }: { deck: Deck }) {
  const cover = deck.cards[0]?.image.url;
  return (
    <UnstyledButton component={Link} to={`/decks/${deck.id}`} className="attention-row">
      {cover ? (
        <img className="video-thumb contain" src={cover} alt="" />
      ) : (
        <Tile emoji="🃏" color="var(--mantine-color-grape-light)" />
      )}
      <Stack gap={0} style={{ flex: 1, minWidth: 0 }}>
        <Text fw={600} truncate>
          {deck.title}
        </Text>
        <Text size="sm" c="dimmed">
          Карточки · {deck.cards.length} шт.
        </Text>
      </Stack>
      <span className="chevron" aria-hidden="true">
        ›
      </span>
    </UnstyledButton>
  );
}

function SegmentRow({ segment: s, names }: { segment: Segment; names: Map<string, string> }) {
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
  const broken = s.source.status === 'unavailable';
  const who = s.childIds.length
    ? s.childIds.map((id) => names.get(id) ?? '?').join(', ')
    : 'никому';

  return (
    <div className="attention-row">
      <UnstyledButton
        component={Link}
        to={`/videos/${s.id}`}
        style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}
      >
        <span className="video-thumb">
          {s.source.thumbnailUrl && <img src={s.source.thumbnailUrl} alt="" />}
          <span className="video-len">{formatTime(s.endSec - s.startSec)}</span>
        </span>
        <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
          <Text fw={600} size="sm" lineClamp={2} lh={1.3}>
            {s.title}
          </Text>
          <Text size="xs" c="dimmed" truncate>
            {s.source.channelTitle ?? '—'}
          </Text>
          <Text size="xs" truncate>
            {broken ? (
              <Text span c="red" fw={600} inherit>
                Недоступно ·{' '}
              </Text>
            ) : null}
            <Text span c={s.questionCount ? 'teal' : 'orange'} inherit>
              {s.questionCount ? `${s.questionCount} вопр.` : 'без вопросов'}
            </Text>
            <Text span c={s.childIds.length ? 'dimmed' : 'orange'} inherit>
              {' · '}
              {who}
            </Text>
          </Text>
        </Stack>
      </UnstyledButton>
      <Menu position="bottom-end" withinPortal>
        <Menu.Target>
          <ActionIcon
            variant="subtle"
            color="gray"
            aria-label="Действия"
            loading={recheck.isPending}
          >
            ⋯
          </ActionIcon>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Item component={Link} to={`/videos/${s.id}`}>
            Изменить и вопросы
          </Menu.Item>
          {broken && <Menu.Item onClick={() => recheck.mutate()}>Проверить снова</Menu.Item>}
          <Menu.Item
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
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
    </div>
  );
}
