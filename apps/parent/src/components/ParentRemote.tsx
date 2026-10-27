// «Пульт родителя» (этап 29): время подробно, «выключить экран» с поводом, громкость, журнал
// действий ребёнка. Этап 47: всё это — прямо на вкладке «Пульт», «Позвать» — плиткой рядом со звонком.
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
  SimpleGrid,
  Slider,
  Stack,
  Text,
  Timeline,
  UnstyledButton,
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

/** Идёт перерыв для глаз (этап 50): до скольких и просит ли ребёнок ещё; null — не идёт. */
export function eyeBreakOf(now: ChildNow) {
  const cur = now.eyeBreak?.current;
  if (!now.eyeBreak || !cur || cur.secondsLeft <= 0) return null;
  const until = new Date(Date.now() + cur.secondsLeft * 1000).toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  });
  return { until, asked: cur.ask === 'asked', every: now.eyeBreak.every };
}

/**
 * Перерыв для глаз: ребёнок попросил ещё — «Разрешить» (ещё столько же минут) или «Пусть
 * отдохнёт» (совёнок скажет); не просил — «Снять перерыв».
 */
export function EyeBreakControls({
  now,
  act,
  busy,
}: {
  now: ChildNow;
  act: (body: ControlRequest) => void;
  busy: boolean;
}) {
  const b = eyeBreakOf(now);
  if (!b) return null;
  return (
    <Alert color={b.asked ? 'orange' : 'teal'} data-testid="eye-break-alert">
      <Stack gap="xs">
        <Text size="sm">
          👀 Перерыв для глаз — до <b>{b.until}</b>
          {b.asked && ', просит ещё посмотреть'}
        </Text>
        <Group gap="xs">
          {b.asked ? (
            <>
              <Button
                size="xs"
                onClick={() => act({ action: 'eyeBreak', allow: true })}
                loading={busy}
                data-testid="eye-break-allow"
              >
                Разрешить {b.every} мин
              </Button>
              <Button
                size="xs"
                variant="light"
                onClick={() => act({ action: 'eyeBreak', allow: false })}
                loading={busy}
                data-testid="eye-break-deny"
              >
                Пусть отдохнёт
              </Button>
            </>
          ) : (
            <Button
              size="xs"
              variant="light"
              onClick={() => act({ action: 'eyeBreak', allow: true })}
              loading={busy}
              data-testid="eye-break-allow"
            >
              Снять перерыв
            </Button>
          )}
        </Group>
      </Stack>
    </Alert>
  );
}

/** «Выключить экран» с поводом; экран выключен или ночь — «Включить». */
export function RestControls({
  now,
  act,
  busy,
}: {
  now: ChildNow;
  act: (body: ControlRequest) => void;
  busy: boolean;
}) {
  return (
    <Stack gap="xs" data-testid="screen-controls">
      {!now.rest && <EyeBreakControls now={now} act={act} busy={busy} />}
      {now.bedtime?.phase === 'night' && !now.rest && (
        <Alert color="indigo" data-testid="bedtime-night">
          <Group justify="space-between" wrap="wrap" gap="xs">
            <Text size="sm">🌙 Ночь по расписанию сна — на телефоне ночной экран</Text>
            <Button size="xs" onClick={() => act({ action: 'wake' })} loading={busy}>
              Разбудить
            </Button>
          </Group>
        </Alert>
      )}
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
          <Text size="sm" fw={600} mb={6}>
            Выключить экран — совёнок скажет почему
          </Text>
          <SimpleGrid cols={3} spacing={8}>
            {REST_REASONS.map((reason) => (
              <UnstyledButton
                key={reason}
                className="rest-tile"
                onClick={() => act({ action: 'rest', reason })}
                data-testid={`rest-${reason}`}
              >
                <span className="rest-tile-icon" aria-hidden="true">
                  {REST_ICON[reason]}
                </span>
                <span>{REST_LABELS[reason]}</span>
              </UnstyledButton>
            ))}
          </SimpleGrid>
        </div>
      )}
    </Stack>
  );
}

/** Громкость телефона ребёнка (киоск на Android). */
export function VolumeControl({
  now,
  act,
}: {
  now: ChildNow;
  act: (body: ControlRequest) => void;
}) {
  const [volume, setVolume] = useState(now.volume ?? 60);
  return (
    <Stack gap={4} data-testid="volume">
      <Group gap="sm" align="center" wrap="nowrap">
        <Text size="sm" fw={600}>
          🔊
        </Text>
        <Slider
          style={{ flex: 1 }}
          value={volume}
          onChange={setVolume}
          onChangeEnd={(level) => act({ action: 'volume', level })}
          step={10}
          label={(v) => `${v}%`}
          aria-label="Громкость телефона"
        />
        <Text size="sm" fw={700} className="tabular" w={42} ta="right">
          {volume}%
        </Text>
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
  habit: '⭐',
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
