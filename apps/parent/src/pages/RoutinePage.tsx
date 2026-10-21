// «Распорядок» (этап 33) — пульт одного ребёнка (этап 40): вверху карточка «Сейчас» (пауза, минуты,
// шторка «Пульт»), во вкладке «Сегодня» — лента дня, журнал и «Завершить на сегодня»; вкладки
// «План», «Привычки», «Сон» — прежние страницы. Ребёнок — общий выбор кабинета.
import type { ParentSleep } from '@kidsplus/shared/bedtime';
import type { ParentHabits } from '@kidsplus/shared/habits';
import { localClock } from '@kidsplus/shared/schedule';
import {
  Button,
  Card,
  Group,
  SegmentedControl,
  Skeleton,
  Stack,
  Text,
  UnstyledButton,
} from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useSearchParams } from 'react-router';
import { api } from '../api';
import { KidAvatar, kidColor, useControl } from '../components/KidBits';
import { NowHero } from '../components/NowHero';
import { ActivityLog } from '../components/ParentRemote';
import { PreviewButton } from '../components/PreviewButton';
import { dayLine, type DayItem } from '../lib/dayline';
import { setCurrentChild, useCurrentChild } from '../lib/currentChild';
import { useChildNow, useChildren, useSchedule } from '../queries';
import { HabitsPage } from './HabitsPage';
import { PlanPage } from './PlanPage';
import { SleepPage } from './SleepPage';

const TABS = [
  { value: 'day', label: 'Сегодня' },
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

function DayLine({ childId, open }: { childId: string; open: (t: Tab) => void }) {
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

/** «Сегодня»: лента дня, журнал, «Завершить на сегодня». */
function TodayTab({ childId, open }: { childId: string; open: (t: Tab) => void }) {
  const now = useChildNow(childId);
  const control = useControl(childId);
  const d = now.data;
  return (
    <Stack gap="md">
      <DayLine childId={childId} open={open} />
      <Card>
        <ActivityLog childId={childId} />
      </Card>
      {d?.mode === 'plan' &&
        (d.closed === 'ended' ? (
          <Button
            variant="light"
            onClick={() => control.mutate({ action: 'reopen' })}
            loading={control.isPending}
          >
            Снова открыть день
          </Button>
        ) : (
          <Button
            variant="subtle"
            color="red"
            onClick={() => control.mutate({ action: 'end' })}
            loading={control.isPending}
            data-testid="end-day"
          >
            Завершить на сегодня
          </Button>
        ))}
    </Stack>
  );
}

export function RoutinePage() {
  const [params, setParams] = useSearchParams();
  const children = useChildren();
  const kids = children.data ?? [];
  const [childId] = useCurrentChild();
  const tab = (TABS.some((t) => t.value === params.get('tab')) ? params.get('tab') : 'day') as Tab;
  const open = (t: Tab) => setParams({ tab: t }, { replace: true });
  // Ссылки с «Главной» и из push: ?child=… — открыть этого ребёнка, ?listen=… — и сразу пульт.
  const linked = params.get('listen') ?? params.get('child');
  useEffect(() => {
    if (linked && children.data?.some((k) => k.id === linked)) setCurrentChild(linked);
  }, [linked, children.data]);
  const child = kids.find((k) => k.id === childId);

  return (
    <Stack gap="md">
      <Group justify="space-between" wrap="nowrap">
        <h1 className="page-title">Распорядок</h1>
        {childId && <PreviewButton childId={childId} icon />}
      </Group>
      {kids.length > 1 && (
        <div className="kid-switch sticky" role="tablist" aria-label="Ребёнок">
          {kids.map((k) => (
            <button
              key={k.id}
              type="button"
              role="tab"
              aria-selected={k.id === childId}
              className={k.id === childId ? 'on' : ''}
              onClick={() => setCurrentChild(k.id)}
            >
              <KidAvatar child={k} color={kidColor(kids, k.id)} size={26} />
              {k.nickname}
            </button>
          ))}
        </div>
      )}
      {children.isPending && <Skeleton height={300} radius="xl" />}
      {child && tab === 'day' && (
        <NowHero
          key={`${child.id}:${params.get('listen') ?? ''}`}
          child={child}
          color={kidColor(kids, child.id)}
          sheet={params.get('listen') === child.id}
        />
      )}
      <SegmentedControl
        fullWidth
        value={tab}
        onChange={(v) => open(v as Tab)}
        data={TABS.map((t) => ({ value: t.value, label: t.label }))}
      />
      {childId && tab === 'day' && <TodayTab childId={childId} open={open} />}
      <div className="embedded-page">
        {tab === 'plan' && <PlanPage />}
        {tab === 'habits' && <HabitsPage />}
        {tab === 'sleep' && <SleepPage />}
      </div>
    </Stack>
  );
}
