// «Пульт родителя» (этап 29): время подробно, «выключить экран» с поводом, «позвать», громкость,
// журнал действий ребёнка.
import {
  REST_LABELS,
  REST_REASONS,
  type ActivityEntry,
  type ActivityKind,
  type ChildNow,
  type ControlRequest,
  type RestReason,
} from '@kidsplus/shared/schedule';
import {
  Alert,
  Button,
  Group,
  SegmentedControl,
  Slider,
  Stack,
  Text,
  Timeline,
} from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../api';

const minutes = (s: number) => `${Math.ceil(s / 60)} мин`;

/** Сколько занимался сегодня и сколько ещё можно. */
export function TimeSummary({ now }: { now: ChildNow }) {
  return (
    <Group gap="lg" data-testid="time-summary">
      <Text size="sm">
        Занимался сегодня: <b>{minutes(now.usedSeconds)}</b>
      </Text>
      {now.windowSecondsLeft !== null && (
        <Text size="sm">
          До конца разрешённого времени: <b>{minutes(now.windowSecondsLeft)}</b>
        </Text>
      )}
    </Group>
  );
}

const REST_ICON: Record<RestReason, string> = {
  sleep: '😴',
  eat: '🍲',
  walk: '🌳',
  bath: '🛁',
  book: '📖',
  rest: '👀',
};

/** «Выключить экран» с поводом, «позвать», громкость. */
export function ScreenControls({
  now,
  act,
  busy,
}: {
  now: ChildNow;
  act: (body: ControlRequest) => void;
  busy: boolean;
}) {
  const [volume, setVolume] = useState(now.volume ?? 60);
  return (
    <Stack gap="xs" data-testid="screen-controls">
      {now.rest ? (
        <Alert color="indigo" data-testid="rest-on">
          <Group justify="space-between" wrap="wrap" gap="xs">
            <Text size="sm">
              Экран выключен: <b>{REST_LABELS[now.rest]}</b>
            </Text>
            <Button size="xs" onClick={() => act({ action: 'wake' })} loading={busy}>
              Включить экран
            </Button>
          </Group>
        </Alert>
      ) : (
        <div>
          <Text size="sm" fw={500} mb={4}>
            Выключить экран — совёнок скажет почему
          </Text>
          <Group gap={6}>
            {REST_REASONS.map((reason) => (
              <Button
                key={reason}
                size="xs"
                variant="light"
                color="indigo"
                onClick={() => act({ action: 'rest', reason })}
                data-testid={`rest-${reason}`}
              >
                {REST_ICON[reason]} {REST_LABELS[reason]}
              </Button>
            ))}
          </Group>
        </div>
      )}
      <Group gap="xs" align="center" wrap="wrap">
        <Button
          size="xs"
          variant="light"
          color="orange"
          onClick={() => act({ action: 'call' })}
          data-testid="call-kid"
        >
          📣 Позвать
        </Button>
        <Text size="sm" ml="sm">
          Громкость
        </Text>
        <Slider
          value={volume}
          onChange={setVolume}
          onChangeEnd={(level) => act({ action: 'volume', level })}
          w={160}
          step={10}
          label={(v) => `${v}%`}
          aria-label="Громкость телефона"
        />
      </Group>
      <Text size="xs" c="dimmed">
        Громкость меняется на Android-телефоне с киоском KidsPlus; на iPhone — кнопками телефона.
      </Text>
    </Stack>
  );
}

const KIND_ICON: Record<ActivityKind, string> = {
  video: '🎬',
  quiz: '❓',
  deck: '🃏',
  game: '🎮',
  app: '📱',
  call: '📞',
  capture: '📷',
};

/** Журнал действий за сегодня или вчера. */
export function ActivityLog({ childId }: { childId: string }) {
  const [day, setDay] = useState<'today' | 'yesterday'>('today');
  const log = useQuery({
    queryKey: ['activity', childId, day],
    queryFn: async () => {
      const today = await api.get<{ date: string; entries: ActivityEntry[] }>(
        `/parent/children/${childId}/activity`,
      );
      if (day === 'today') return today;
      const d = new Date(`${today.date}T12:00:00Z`);
      d.setUTCDate(d.getUTCDate() - 1);
      return api.get<{ date: string; entries: ActivityEntry[] }>(
        `/parent/children/${childId}/activity?date=${d.toISOString().slice(0, 10)}`,
      );
    },
    refetchInterval: 30_000,
  });
  const [more, setMore] = useState(false);
  const entries = log.data?.entries ?? [];
  const shown = more ? entries : entries.slice(0, 8);
  return (
    <Stack gap="xs" data-testid="activity-log">
      <Group justify="space-between">
        <Text size="sm" fw={600}>
          Журнал
        </Text>
        <SegmentedControl
          size="xs"
          value={day}
          onChange={(v) => setDay(v as 'today' | 'yesterday')}
          data={[
            { value: 'today', label: 'Сегодня' },
            { value: 'yesterday', label: 'Вчера' },
          ]}
        />
      </Group>
      {entries.length === 0 ? (
        <Text size="sm" c="dimmed">
          {log.isLoading ? 'Загружаем…' : 'Пока ничего — ребёнок сегодня не занимался.'}
        </Text>
      ) : (
        <Timeline bulletSize={22} lineWidth={2}>
          {shown.map((e, i) => (
            <Timeline.Item key={`${e.at}-${i}`} bullet={<span>{KIND_ICON[e.kind]}</span>}>
              <Text size="sm">{e.text}</Text>
              <Text size="xs" c="dimmed">
                {new Date(e.at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
              </Text>
            </Timeline.Item>
          ))}
        </Timeline>
      )}
      {entries.length > 8 && (
        <Button size="xs" variant="subtle" onClick={() => setMore((m) => !m)}>
          {more ? 'Свернуть' : `Показать всё (${entries.length})`}
        </Button>
      )}
    </Stack>
  );
}
