// Радионяня (этап 11) на карточке ребёнка: включить, чувствительность, «Слушать».
// Звук комнаты передаётся только когда родитель нажал «Слушать»; шум телефон определяет сам.
import type { CallInfo } from '@kidsplus/shared/calls';
import {
  MONITOR_SENSITIVITIES,
  SENSITIVITY_LABELS,
  type MonitorSensitivity,
  type MonitorState,
} from '@kidsplus/shared/monitor';
import { Alert, Button, Group, Select, Stack, Switch, Text } from '@mantine/core';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router';
import { api, errorMessage } from '../api';
import { parentCalls } from '../calls/CallLayer';
import { queryClient } from '../queries';

/** Радионяня ребёнка: состояние, включить/выключить, «Слушать» — общий кэш для плитки и карточки. */
export function useMonitor(childId: string) {
  const key = ['monitor', childId];
  const state = useQuery({
    queryKey: key,
    queryFn: () => api.get<MonitorState>(`/parent/children/${childId}/monitor`),
    refetchInterval: 15_000,
  });
  const update = useMutation({
    mutationFn: (body: { on: boolean; sensitivity?: MonitorSensitivity }) =>
      api.put<MonitorState>(`/parent/children/${childId}/monitor`, body),
    onSuccess: (data) => queryClient.setQueryData(key, data),
  });
  const listen = useMutation({
    mutationFn: () => api.post<CallInfo>(`/parent/children/${childId}/monitor/listen`),
    onSuccess: (call) => {
      void parentCalls()?.attach(call);
      void queryClient.invalidateQueries({ queryKey: key });
    },
  });
  return { state, update, listen };
}

/** listenButton — своя кнопка «Слушать» (в «Пульте» она плиткой рядом с «Позвонить»). */
export function MonitorCard({
  childId,
  listenButton = true,
}: {
  childId: string;
  listenButton?: boolean;
}) {
  const [params] = useSearchParams();
  // Из push «шумно»: эта карточка подсвечена.
  const fromPush = params.get('listen') === childId;
  const { state, update, listen } = useMonitor(childId);
  const s = state.data;
  if (!s) return null;

  return (
    <Stack gap="xs" p="xs" bg={fromPush ? 'yellow.0' : undefined} style={{ borderRadius: 8 }}>
      <Group justify="space-between">
        <Switch
          label="🌙 Радионяня"
          checked={s.on}
          onChange={(e) => update.mutate({ on: e.currentTarget.checked })}
          data-testid="monitor-switch"
        />
        {listenButton && (
          <Button
            size="xs"
            color={fromPush ? 'orange' : undefined}
            onClick={() => listen.mutate()}
            loading={listen.isPending}
            disabled={Boolean(s.listening)}
            data-testid="monitor-listen"
          >
            {s.listening ? 'Слушаю' : 'Слушать'}
          </Button>
        )}
      </Group>
      {s.on && (
        <>
          <Select
            size="xs"
            label="Чувствительность к шуму"
            value={s.sensitivity}
            allowDeselect={false}
            data={MONITOR_SENSITIVITIES.map((v) => ({ value: v, label: SENSITIVITY_LABELS[v] }))}
            onChange={(v) => v && update.mutate({ on: true, sensitivity: v as MonitorSensitivity })}
          />
          <Text size="xs" c="dimmed">
            На телефоне — ночной экран со значком микрофона. При шуме придёт уведомление
            {s.lastNoiseAt
              ? `; последний раз шумно: ${new Date(s.lastNoiseAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`
              : ''}
            . Телефон лучше поставить на зарядку.
          </Text>
        </>
      )}
      {(update.error || listen.error) && (
        <Alert color="red">{errorMessage(update.error ?? listen.error)}</Alert>
      )}
    </Stack>
  );
}
