import type { Child } from '@kidsplus/shared/api';
import type { ChildNow, ControlRequest } from '@kidsplus/shared/schedule';
import { Alert, Badge, Button, Card, Group, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { ActivityLog, ScreenControls, TimeSummary } from '../components/ParentRemote';
import { useMutation } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api } from '../api';
import { MonitorCard } from '../components/MonitorCard';
import { keys, queryClient, useChildNow, useChildren } from '../queries';
import { SUBJECT_LABELS } from '../lib/subjects';

const CLOSED: Record<NonNullable<ChildNow['closed']>, string> = {
  limit: 'время на сегодня вышло',
  window: 'вне разрешённого времени',
  day_off: 'сегодня занятий нет',
  ended: 'день завершён родителем',
};

const ITEM_KIND: Record<string, string> = {
  segment: 'видео',
  deck: 'карточки',
  interactive: 'игра',
  quiz: 'вопросы',
};

const minutes = (s: number) => `${Math.ceil(s / 60)} мин`;

/** Текущее время с точностью до минуты — для «N мин назад». */
function useMinuteClock() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

/** Заряд телефона: процент, зарядка и давность показания (старше часа — серым). */
function BatteryInfo({ battery }: { battery: ChildNow['battery'] }) {
  const now = useMinuteClock();
  if (!battery) return null;
  const ageMin = Math.round((now - new Date(battery.at).getTime()) / 60000);
  const stale = ageMin > 60;
  const color = stale
    ? 'gray'
    : battery.charging || battery.level > 20
      ? 'green'
      : battery.level > 10
        ? 'yellow'
        : 'red';
  const when =
    ageMin < 2
      ? 'сейчас'
      : ageMin < 60
        ? `${ageMin} мин назад`
        : new Date(battery.at).toLocaleString('ru-RU', {
            day: 'numeric',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
          });
  return (
    <Badge color={color} variant="light" data-testid="battery" title={`Показание: ${when}`}>
      {battery.charging ? '⚡ ' : '🔋 '}
      {battery.level} %{stale ? ` · ${when}` : ''}
    </Badge>
  );
}

/** Карточка ребёнка: что делает сейчас, сколько осталось, кнопки управления. */
function ChildCard({ child }: { child: Child }) {
  const now = useChildNow(child.id);
  const control = useMutation({
    mutationFn: (body: ControlRequest) =>
      api.post<ChildNow>(`/parent/children/${child.id}/control`, body),
    onSuccess: (data) => queryClient.setQueryData(keys.now(child.id), data),
  });
  const d = now.data;
  if (!d) return <Card withBorder>{child.nickname}…</Card>;

  const activity =
    d.activity === 'free' ? 'свободное время' : d.activity ? SUBJECT_LABELS[d.activity] : null;
  const act = (body: ControlRequest) => control.mutate(body);
  return (
    <Card withBorder padding="md">
      <Stack gap="sm">
        <Group justify="space-between">
          <Title order={3}>{child.nickname}</Title>
          <Group gap="xs">
            <BatteryInfo battery={d.battery} />
            <Badge color={d.online ? 'green' : 'gray'} variant="light">
              {d.online ? 'на связи' : 'не в приложении'}
            </Badge>
          </Group>
        </Group>

        <MonitorCard childId={child.id} />

        <ScreenControls now={d} act={act} busy={control.isPending} />

        {d.mode === 'off' ? (
          <Alert color="gray">Расписание выключено — ребёнок занимается без лимитов.</Alert>
        ) : (
          <>
            {d.online && (
              <Text size="sm">
                Сейчас: <b>{activity ?? 'выбирает занятие'}</b>
                {d.item && (
                  <>
                    {' '}
                    · {ITEM_KIND[d.item.kind] ?? d.item.kind}
                    {d.item.title ? ` «${d.item.title}»` : ''}
                  </>
                )}
              </Text>
            )}
            {d.paused && <Alert color="yellow">Пауза</Alert>}
            {d.closed && <Alert color="blue">На сегодня всё: {CLOSED[d.closed]}</Alert>}
            {d.subjects.map((s) => (
              <Group key={s.subject} justify="space-between">
                <Text size="sm">{SUBJECT_LABELS[s.subject]}</Text>
                <Text size="sm" c="dimmed">
                  {s.done ? 'пройдено ⭐' : `осталось ${minutes(s.secondsLeft)}`}
                </Text>
              </Group>
            ))}
            <TimeSummary now={d} />
            <Text size="sm" c="dimmed">
              Свободное время:{' '}
              {d.free.open
                ? `открыто, осталось ${minutes(d.free.secondsLeft)}`
                : `${minutes(d.free.secondsLeft)} после уроков`}
              {d.extraMinutes ? ` · добавлено ${d.extraMinutes} мин` : ''}
            </Text>
            <Group gap="xs">
              {d.paused ? (
                <Button onClick={() => act({ action: 'resume' })} loading={control.isPending}>
                  Продолжить
                </Button>
              ) : (
                <Button
                  variant="light"
                  onClick={() => act({ action: 'pause' })}
                  loading={control.isPending}
                >
                  Пауза
                </Button>
              )}
              <Button variant="light" onClick={() => act({ action: 'add', minutes: 10 })}>
                +10 минут
              </Button>
              <Button variant="light" onClick={() => act({ action: 'add', minutes: 30 })}>
                +30 минут
              </Button>
              {d.closed === 'ended' ? (
                <Button variant="subtle" onClick={() => act({ action: 'reopen' })}>
                  Снова открыть день
                </Button>
              ) : (
                <Button variant="subtle" color="red" onClick={() => act({ action: 'end' })}>
                  Завершить на сегодня
                </Button>
              )}
            </Group>
          </>
        )}
        <ActivityLog childId={child.id} />
      </Stack>
    </Card>
  );
}

/** «Управление сейчас» (п. 6.1 ТЗ): что делает ребёнок, пауза, завершить, +минуты. */
export function NowPage() {
  const children = useChildren();
  return (
    <Stack>
      <Title order={2}>Сейчас</Title>
      <Text size="sm" c="dimmed">
        Что дети делают прямо сейчас. Пауза, «Завершить», «Выключить экран» и «Позвать» срабатывают
        на телефоне сразу; добавленные минуты продлевают и занятия, и разрешённое время.
      </Text>
      <SimpleGrid cols={{ base: 1, md: 2 }}>
        {children.data?.map((c) => (
          <ChildCard key={c.id} child={c} />
        ))}
      </SimpleGrid>
    </Stack>
  );
}
