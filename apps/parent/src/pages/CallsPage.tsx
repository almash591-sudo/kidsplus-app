// Звонки (этап 10): позвонить детям или второму родителю; журнал звонков.
// Звук и видео идут напрямую между телефонами, на сервере — только журнал.
import type { Contact } from '@kidsplus/shared/calls';
import {
  ActionIcon,
  Alert,
  Avatar,
  Card,
  Divider,
  Group,
  Stack,
  Text,
  Title,
  UnstyledButton,
} from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api, errorMessage } from '../api';
import { useCallEngine } from '../calls/CallLayer';

interface LogEntry {
  id: string;
  video: boolean;
  monitor?: boolean;
  from: string;
  members: { name: string; state: string }[];
  createdAt: string;
  seconds: number;
}

const STATE: Record<string, string> = {
  left: 'говорил',
  joined: 'говорит',
  declined: 'отклонил',
  missed: 'пропустил',
  ringing: 'звонит',
};

const PhoneIcon = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M6.5 4h3l1.6 4.2-2 1.3a11 11 0 0 0 5.4 5.4l1.3-2L20 14.5v3a2.5 2.5 0 0 1-2.5 2.5A14.5 14.5 0 0 1 4 6.5 2.5 2.5 0 0 1 6.5 4z" />
  </svg>
);
const VideoIcon = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M3 7h12v10H3zM15 10.5l6-3.5v10l-6-3.5" />
  </svg>
);

const duration = (s: number) =>
  s ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : '—';

export function CallsPage() {
  const engine = useCallEngine();
  const [error, setError] = useState<string | null>(null);
  const contacts = useQuery({
    queryKey: ['call-contacts'],
    queryFn: () => api.get<Contact[]>('/calls/contacts'),
  });
  const log = useQuery({
    queryKey: ['call-log'],
    queryFn: () => api.get<LogEntry[]>('/parent/calls'),
    refetchInterval: 30_000,
  });

  const call = (to: Contact[], video: boolean) => {
    setError(null);
    engine
      ?.start(
        to.map((c) => c.id),
        video,
      )
      .catch((e: unknown) => setError(errorMessage(e)));
  };

  return (
    <Stack>
      <Title order={2}>Звонки</Title>
      <Text size="sm" c="dimmed">
        Звонки внутри семьи. Звук и видео идут напрямую между телефонами; на сервере остаётся только
        журнал. На телефоне родителя должен быть включён VPN — как и для всего кабинета.
      </Text>
      {error && <Alert color="red">{error}</Alert>}
      <Card padding={0}>
        {contacts.data?.map((c, i) => (
          <div key={c.id}>
            {i > 0 && <Divider ml={68} />}
            <Group justify="space-between" wrap="nowrap" px="md" py="sm">
              <Group gap="sm" wrap="nowrap">
                <Avatar color={c.kind === 'child' ? 'pink' : 'ios'} radius="xl">
                  {c.name.slice(0, 1)}
                </Avatar>
                <Text fw={600}>{c.name}</Text>
              </Group>
              <Group gap={6} wrap="nowrap">
                <ActionIcon
                  size="lg"
                  radius="xl"
                  variant="light"
                  aria-label={`Звонок голосом: ${c.name}`}
                  onClick={() => call([c], false)}
                  disabled={!engine}
                >
                  <PhoneIcon />
                </ActionIcon>
                <ActionIcon
                  size="lg"
                  radius="xl"
                  aria-label={`Видеозвонок: ${c.name}`}
                  onClick={() => call([c], true)}
                  disabled={!engine}
                >
                  <VideoIcon />
                </ActionIcon>
              </Group>
            </Group>
          </div>
        ))}
        {contacts.data && contacts.data.length > 1 && (
          <>
            <Divider ml={68} />
            <UnstyledButton
              w="100%"
              px="md"
              py="sm"
              onClick={() => call(contacts.data.slice(0, 3), true)}
              disabled={!engine}
            >
              <Group gap="sm">
                <Avatar color="grape" radius="xl">
                  <VideoIcon />
                </Avatar>
                <Text fw={600} c="ios">
                  Видеозвонок всей семьёй
                </Text>
              </Group>
            </UnstyledButton>
          </>
        )}
      </Card>

      <Title order={4} mt="md">
        Журнал
      </Title>
      {log.data && !log.data.length && <Text c="dimmed">Звонков пока не было.</Text>}
      {log.data && log.data.length > 0 && (
        <Card padding={0}>
          {log.data.map((r, i) => (
            <div key={r.id}>
              {i > 0 && <Divider ml="md" />}
              <Group justify="space-between" wrap="nowrap" px="md" py="sm" align="flex-start">
                <Stack gap={2} style={{ minWidth: 0 }}>
                  <Text fw={600}>
                    {r.monitor ? '🌙 ' : ''}
                    {r.from} → {r.members.map((m) => m.name).join(', ')}
                  </Text>
                  <Text size="sm" c="dimmed">
                    {r.members.map((m) => `${m.name}: ${STATE[m.state] ?? m.state}`).join(' · ')}
                  </Text>
                </Stack>
                <Stack gap={2} align="flex-end" style={{ flex: 'none' }}>
                  <Text size="sm" c="dimmed">
                    {new Date(r.createdAt).toLocaleString('ru-RU', {
                      day: 'numeric',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </Text>
                  <Text size="sm" fw={600} c={r.seconds ? undefined : 'red'}>
                    {r.seconds ? duration(r.seconds) : 'нет ответа'}
                  </Text>
                </Stack>
              </Group>
            </div>
          ))}
        </Card>
      )}
    </Stack>
  );
}
