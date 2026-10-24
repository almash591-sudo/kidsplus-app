// «Что доступно» ребёнку (этап 33): сколько видео, наборов карточек и игр; если у брата или
// сестры чего-то заметно больше — подсказка «добавить то, что есть у …» одним касанием.
import type { Child } from '@kidsplus/shared/api';
import { Card, Stack, Text, UnstyledButton } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { Link } from 'react-router';
import { api, errorMessage } from '../api';
import { copiedText, hasMore } from '../lib/names';
import { queryClient, useDecks, useGames, useSegments } from '../queries';
import { ownerLink, type ItemKind } from './Bulk';

type Tab = 'videos' | 'decks' | 'games';
const KINDS: { tab: Tab; kind: ItemKind; label: string; color: string; icon: string }[] = [
  {
    tab: 'videos',
    kind: 'segment',
    label: 'Видео',
    color: '#ff3b30',
    icon: 'M4 5h16v14H4zM9 9.5v5l4.5-2.5z',
  },
  {
    tab: 'decks',
    kind: 'deck',
    label: 'Карточки',
    color: '#007aff',
    icon: 'M5 4h11v16H5zM16 7l3 1-3 12',
  },
  {
    tab: 'games',
    kind: 'interactive',
    label: 'Игры',
    color: '#af52de',
    icon: 'M6 9h12a3 3 0 0 1 3 3v3a2 2 0 0 1-3.6 1.2L16 15H8l-1.4 1.2A2 2 0 0 1 3 15v-3a3 3 0 0 1 3-3z',
  },
];
/** «Мало»: меньше этого и при этом у другого ребёнка вдвое больше. */
const FEW = 10;

/** Всё назначаемое по видам: id и кому назначено. */
export function useAssignables() {
  const segments = useSegments().data;
  const decks = useDecks().data;
  const games = useGames().data;
  if (!segments || !decks || !games) return null;
  return { videos: segments, decks, games } as Record<Tab, { id: string; childIds: string[] }[]>;
}
export type Assignables = NonNullable<ReturnType<typeof useAssignables>>;

const ids = (list: { id: string; childIds: string[] }[], childId: string, has: boolean) =>
  list.filter((x) => x.childIds.includes(childId) === has).map((x) => x.id);

/** Дать ребёнку всё, что есть у другого и чего нет у него (по одному виду или по всем). */
export async function copyFrom(
  all: Assignables,
  from: Child,
  to: Child,
  tabs: Tab[] = ['videos', 'decks', 'games'],
) {
  const add = KINDS.filter((k) => tabs.includes(k.tab)).flatMap((k) =>
    all[k.tab]
      .filter((x) => x.childIds.includes(from.id) && !x.childIds.includes(to.id))
      .map((x) => ({ kind: k.kind, refId: x.id })),
  );
  try {
    const r = await api.post<{ added: number }>(`/parent/children/${to.id}/items/bulk`, { add });
    for (const key of ['segments', 'decks', 'games', 'child-items'])
      void queryClient.invalidateQueries({ queryKey: [key] });
    notifications.show({
      message: copiedText(from, to, r.added),
    });
  } catch (err) {
    notifications.show({ color: 'red', message: errorMessage(err) });
  }
}

/** Сколько у ребёнка по видам и подсказки «мало — добавить у …». */
export function libraryOf(all: Assignables, child: Child, kids: Child[]) {
  return KINDS.map((k) => {
    const have = ids(all[k.tab], child.id, true).length;
    const richer = kids
      .filter((o) => o.id !== child.id)
      .map((o) => ({
        from: o,
        missing: all[k.tab].filter(
          (x) => x.childIds.includes(o.id) && !x.childIds.includes(child.id),
        ).length,
      }))
      .filter((r) => have < FEW && r.missing >= Math.max(3, have))
      .sort((a, b) => b.missing - a.missing)[0];
    return { ...k, have, richer: richer ?? null };
  });
}

/** Карточка «Что доступно …» на «Главной» и на странице ребёнка. */
export function LibraryCard({ child, kids }: { child: Child; kids: Child[] }) {
  const all = useAssignables();
  if (!all) return null;
  const rows = libraryOf(all, child, kids);
  return (
    <Card padding="sm" data-testid="library">
      <Text size="xs" fw={700} c="dimmed" tt="uppercase" px={6} pb={4}>
        Что доступно: {child.nickname}
      </Text>
      <Stack gap={0} className="grouped">
        {rows.map((r) => (
          <UnstyledButton
            key={r.tab}
            component={Link}
            to={ownerLink(r.tab, child.id, true)}
            className="attention-row"
          >
            <span className="attention-icon" style={{ background: r.color }}>
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#fff"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d={r.icon} />
              </svg>
            </span>
            <Text fw={600} style={{ flex: 1 }}>
              {r.label}
            </Text>
            <Text fw={700} c={r.richer ? 'orange' : undefined} data-testid={`library-${r.tab}`}>
              {r.have}
            </Text>
            <span className="chevron" aria-hidden="true">
              ›
            </span>
          </UnstyledButton>
        ))}
      </Stack>
      {rows
        .filter((r) => r.richer)
        .map((r) => (
          <UnstyledButton
            key={`hint-${r.tab}`}
            className="library-hint"
            data-testid="library-hint"
            onClick={() => void copyFrom(all, r.richer!.from, child, [r.tab])}
          >
            <span style={{ flex: 1 }}>
              {r.label}: мало. {hasMore(r.richer!.from)} {r.richer!.missing}.
            </span>
            <b>Добавить</b>
          </UnstyledButton>
        ))}
    </Card>
  );
}
