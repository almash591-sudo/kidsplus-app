// «Сегодня, по порядку» (этап 40) — лента дня ребёнка: уроки плана, дела утра/дня/вечера и отбой.
// Этап 47: на вкладке «Пульт»; касание строки — её настройка в «Распорядке».
import type { ParentSleep } from '@kidsplus/shared/bedtime';
import type { ParentHabits } from '@kidsplus/shared/habits';
import { localClock } from '@kidsplus/shared/schedule';
import { Card, Skeleton, Stack, Text, UnstyledButton } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { api } from '../api';
import { dayLine, type DayItem } from '../lib/dayline';
import { useChildNow, useSchedule } from '../queries';

const STATE = {
  done: { text: 'готово', color: 'teal' },
  now: { text: 'сейчас', color: 'blue' },
  later: { text: 'позже', color: 'dimmed' },
  // Этап 47: день закрыт или время прошло — сегодня этого уже не будет.
  missed: { text: 'не сегодня', color: 'dimmed' },
} as const;
const DOT: Record<DayItem['tab'], string> = {
  plan: '#ff9500',
  habits: '#ffcc00',
  sleep: '#5856d6',
};

export function DayLine({ childId }: { childId: string }) {
  const navigate = useNavigate();
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
          На сегодня пусто. Добавьте план, утренние и вечерние дела или время отбоя — в
          «Распорядке».
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
              onClick={() => void navigate(`/routine?tab=${it.tab}`)}
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
                {it.stateLabel ?? STATE[it.state].text}
              </Text>
            </UnstyledButton>
          ))}
        </Stack>
      </Card>
      <Text size="xs" c="dimmed" px={16}>
        Касание строки — изменить в «Распорядке».
      </Text>
    </Stack>
  );
}
