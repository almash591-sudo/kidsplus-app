// «Распорядок» (этап 33): весь день ребёнка — лента «День» (дела, уроки, отбой по времени) и
// вкладки «План», «Привычки», «Сон» с прежними страницами. Ребёнок — общий выбор кабинета.
import type { ParentSleep } from '@kidsplus/shared/bedtime';
import type { ParentHabits } from '@kidsplus/shared/habits';
import { localClock } from '@kidsplus/shared/schedule';
import { Card, SegmentedControl, Skeleton, Stack, Text, UnstyledButton } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router';
import { api } from '../api';
import { dayLine, type DayItem } from '../lib/dayline';
import { setCurrentChild, useCurrentChild } from '../lib/currentChild';
import { useChildNow, useChildren, useSchedule } from '../queries';
import { HabitsPage } from './HabitsPage';
import { PlanPage } from './PlanPage';
import { SleepPage } from './SleepPage';

const TABS = [
  { value: 'day', label: 'День' },
  { value: 'plan', label: 'План' },
  { value: 'habits', label: 'Привычки' },
  { value: 'sleep', label: 'Сон' },
] as const;
type Tab = (typeof TABS)[number]['value'];

const STATE = {
  done: { text: 'готово', color: 'teal' },
  now: { text: 'сейчас', color: 'blue' },
  later: { text: 'позже', color: 'dimmed' },
} as const;
const DOT: Record<DayItem['tab'], string> = {
  plan: '#ff9500',
  habits: '#ffcc00',
  sleep: '#5856d6',
};

function DayTab({ childId, open }: { childId: string; open: (t: Tab) => void }) {
  const now = useChildNow(childId);
  const schedule = useSchedule(childId);
  const habits = useQuery({
    queryKey: ['habits', childId],
    queryFn: () => api.get<ParentHabits>(`/parent/children/${childId}/habits`),
  });
  const sleep = useQuery({
    queryKey: ['sleep', childId],
    queryFn: () => api.get<ParentSleep>(`/parent/children/${childId}/sleep`),
  });
  if (now.isPending || habits.isPending || sleep.isPending)
    return <Skeleton height={260} radius="xl" />;
  const clock = localClock(new Date(), schedule.data?.timezone ?? 'Europe/Moscow');
  const items = dayLine({
    now: now.data,
    schedule: schedule.data,
    habits: habits.data,
    sleep: sleep.data,
    weekday: clock.weekday,
    minute: clock.minute,
  });

  if (!items.length)
    return (
      <Card>
        <Text c="dimmed">
          На сегодня пусто. Добавьте план, утренние и вечерние дела или время отбоя — во вкладках
          выше.
        </Text>
      </Card>
    );
  return (
    <Stack gap={6}>
      <Text size="xs" fw={600} c="dimmed" tt="uppercase" px={16}>
        Сегодня, по порядку
      </Text>
      <Card padding={0}>
        <Stack gap={0} className="grouped" data-testid="dayline">
          {items.map((it) => (
            <UnstyledButton
              key={it.key}
              className="attention-row"
              onClick={() => open(it.tab)}
              data-state={it.state}
            >
              <Text size="sm" fw={700} c="dimmed" w={46}>
                {it.time ?? ''}
              </Text>
              <span className="day-dot" style={{ background: DOT[it.tab] }} aria-hidden="true" />
              <Stack gap={0} style={{ flex: 1, minWidth: 0 }}>
                <Text fw={600}>{it.label}</Text>
                <Text size="xs" c="dimmed" truncate>
                  {it.note}
                </Text>
              </Stack>
              <Text size="xs" fw={700} c={STATE[it.state].color}>
                {STATE[it.state].text}
              </Text>
            </UnstyledButton>
          ))}
        </Stack>
      </Card>
      <Text size="xs" c="dimmed" px={16}>
        Касание строки — изменить.
      </Text>
    </Stack>
  );
}

export function RoutinePage() {
  const [params, setParams] = useSearchParams();
  const children = useChildren();
  const [childId] = useCurrentChild();
  const tab = (TABS.some((t) => t.value === params.get('tab')) ? params.get('tab') : 'day') as Tab;
  const open = (t: Tab) => setParams({ tab: t }, { replace: true });

  return (
    <Stack gap="md">
      <h1 className="page-title">Распорядок</h1>
      {(children.data?.length ?? 0) > 1 && (
        <div className="kid-switch" role="tablist" aria-label="Ребёнок">
          {children.data!.map((k) => (
            <button
              key={k.id}
              type="button"
              role="tab"
              aria-selected={k.id === childId}
              className={k.id === childId ? 'all on' : 'all'}
              onClick={() => setCurrentChild(k.id)}
            >
              {k.nickname}
            </button>
          ))}
        </div>
      )}
      <SegmentedControl
        fullWidth
        value={tab}
        onChange={(v) => open(v as Tab)}
        data={TABS.map((t) => ({ value: t.value, label: t.label }))}
      />
      {childId && tab === 'day' && <DayTab childId={childId} open={open} />}
      <div className="embedded-page">
        {tab === 'plan' && <PlanPage />}
        {tab === 'habits' && <HabitsPage />}
        {tab === 'sleep' && <SleepPage />}
      </div>
    </Stack>
  );
}
