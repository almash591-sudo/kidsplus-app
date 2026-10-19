import type { ChildItem, Segment } from '@kidsplus/shared/api';
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
import { BulkBar, BulkFilters, KidPills, SelectMark, useBulk } from '../components/Bulk';
import { modals } from '../lib/modals';
import { SUBJECT_LABELS } from '../lib/subjects';
import { keys, queryClient, useChildItems, useChildren, useSegments } from '../queries';

type Row = { item: ChildItem; segment: Segment };

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

  // Для конкретного ребёнка — только его видео в порядке показа (карточки и игры — в своих
  // вкладках; в «Сегодня» уроки собираются по предметам, вперемешку).
  const rows = useMemo((): Row[] => {
    if (!childId) return [];
    const seg = new Map(segments.data?.map((s) => [s.id, s]));
    return (items.data ?? [])
      .filter((item) => item.kind === 'segment' && seg.has(item.refId))
      .map((item) => ({ item, segment: seg.get(item.refId)! }));
  }, [childId, items.data, segments.data]);

  // Этап 33: «Нет у …», предмет, выбор многих сразу.
  const b = useBulk(segments.data);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return b.filtered.filter(
      (s) =>
        FILTERS[quick].test(s) &&
        (!q ||
          s.title.toLowerCase().includes(q) ||
          (s.source.channelTitle ?? '').toLowerCase().includes(q)),
    );
  }, [b.filtered, query, quick]);

  const reorder = useMutation({
    mutationFn: (itemIds: string[]) => api.put(`/parent/children/${childId}/items`, { itemIds }),
    onMutate: (itemIds) =>
      queryClient.setQueryData<ChildItem[]>(keys.childItems(childId!), (old) =>
        itemIds.map((id) => old!.find((i) => i.id === id)!),
      ),
    onSettled: () => queryClient.invalidateQueries({ queryKey: keys.childItems(childId!) }),
  });

  /** Видео меняются местами в общем списке ребёнка — карточки и игры остаются на своих местах. */
  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= rows.length) return;
    const ids = (items.data ?? []).map((i) => i.id);
    const a = ids.indexOf(rows[index]!.item.id);
    const b = ids.indexOf(rows[target]!.item.id);
    [ids[a], ids[b]] = [ids[b]!, ids[a]!];
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
            Видео ребёнка в порядке показа, порядок — стрелками. В уроках «Сегодня» видео идут
            вперемешку с карточками и играми своего предмета.
          </Text>
          <Card padding={0}>
            <Stack gap={0} className="grouped thumbs">
              {items.data && rows.length === 0 && (
                <div className="attention-row">
                  <Text c="dimmed">Видео пока не назначены.</Text>
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
                  <SegmentRow segment={r.segment} names={names} />
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
          <BulkFilters bulk={b} subjects={SUBJECT_LABELS} shown={shown} />
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
                <SegmentRow
                  key={s.id}
                  segment={s}
                  names={names}
                  select={
                    b.selecting
                      ? { checked: b.selected.has(s.id), toggle: () => b.toggle(s.id) }
                      : undefined
                  }
                />
              ))}
            </Stack>
          </Card>
          {b.selecting && <div className="bulk-space" />}
          <BulkBar bulk={b} kind="segment" />
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

function SegmentRow({
  segment: s,
  names,
  select,
}: {
  segment: Segment;
  names: Map<string, string>;
  /** Режим выбора: касание строки отмечает её, а не открывает. */
  select?: { checked: boolean; toggle: () => void } | undefined;
}) {
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
  const rowStyle = { display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 };

  const body = (
    <>
      {select && <SelectMark checked={select.checked} />}
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
          {select && (
            <Text span c={s.childIds.length ? 'dimmed' : 'orange'} inherit>
              {' · '}
              {who}
            </Text>
          )}
        </Text>
      </Stack>
    </>
  );

  if (select)
    return (
      <UnstyledButton
        className="attention-row"
        onClick={select.toggle}
        aria-pressed={select.checked}
        data-testid="select-row"
        style={{ width: '100%' }}
      >
        <span style={rowStyle}>{body}</span>
      </UnstyledButton>
    );

  return (
    <div className="attention-row" style={{ flexWrap: 'wrap' }}>
      <UnstyledButton component={Link} to={`/videos/${s.id}`} style={rowStyle}>
        {body}
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
      <div className="row-pills">
        <KidPills kind="segment" item={s} />
      </div>
    </div>
  );
}
