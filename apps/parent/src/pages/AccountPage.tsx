import type { InviteCreated } from '@kidsplus/shared/api';
import {
  PUSH_KIND_LABELS,
  PUSH_KINDS,
  type PushKind,
  type PushSubscriptionInput,
} from '@kidsplus/shared/push';
import {
  Alert,
  Button,
  Card,
  Checkbox,
  CopyButton,
  Group,
  SegmentedControl,
  Stack,
  Text,
  TextInput,
  Title,
  useMantineColorScheme,
} from '@mantine/core';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { api } from '../api';
import { keys, queryClient, useMe, usePin } from '../queries';

/** Ключ VAPID из base64url — в формате, который ждёт pushManager.subscribe. */
function vapidKey(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4))
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const raw = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

const pushSupported = () =>
  typeof window !== 'undefined' &&
  'serviceWorker' in navigator &&
  'PushManager' in window &&
  'Notification' in window;

/** Push-уведомления на этом телефоне (п. 6.2 ТЗ): включить, выбрать виды, проверить. */
function PushCard() {
  const server = useQuery({
    queryKey: ['push-key'],
    queryFn: () => api.get<{ publicKey: string | null }>('/parent/push'),
  });
  /** Подписка этого браузера и включённые виды (null — не подписан). */
  const current = useQuery({
    queryKey: ['push-status'],
    enabled: pushSupported(),
    queryFn: async () => {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (!sub) return null;
      const { kinds } = await api.post<{ kinds: PushKind[] | null }>('/parent/push/status', {
        endpoint: sub.endpoint,
      });
      return kinds;
    },
  });
  const [kinds, setKinds] = useState<PushKind[] | null>(null);
  const chosen = kinds ?? current.data ?? [...PUSH_KINDS];

  const save = useMutation({
    mutationFn: async (want: PushKind[]) => {
      if ((await Notification.requestPermission()) !== 'granted')
        throw new Error('Уведомления запрещены в настройках браузера для этого сайта.');
      const reg = await navigator.serviceWorker.ready;
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: vapidKey(server.data!.publicKey!),
        }));
      const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
      return api.put<{ kinds: PushKind[] }>('/parent/push/subscription', {
        endpoint: json.endpoint,
        keys: json.keys,
        kinds: want,
      } satisfies PushSubscriptionInput);
    },
    onSuccess: (r) => queryClient.setQueryData(['push-status'], r.kinds),
  });
  const off = useMutation({
    mutationFn: async () => {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (!sub) return;
      await api.post('/parent/push/unsubscribe', { endpoint: sub.endpoint });
      await sub.unsubscribe();
    },
    onSuccess: () => queryClient.setQueryData(['push-status'], null),
  });
  const test = useMutation({ mutationFn: () => api.post<{ sent: number }>('/parent/push/test') });

  const on = Boolean(current.data);
  return (
    <Card withBorder>
      <Stack>
        <Text fw={600}>Уведомления на этом телефоне</Text>
        {!pushSupported() ? (
          <Text size="sm" c="dimmed">
            Этот браузер не поддерживает уведомления. На Android откройте кабинет в Chrome или
            установите его на экран «Домой».
          </Text>
        ) : !server.data?.publicKey ? (
          <Text size="sm" c="dimmed">
            Уведомления на сервере ещё не настроены (нужны ключи VAPID).
          </Text>
        ) : (
          <>
            <Checkbox.Group
              value={chosen}
              onChange={(v) => setKinds(PUSH_KINDS.filter((k) => v.includes(k)))}
            >
              <Stack gap={6}>
                {PUSH_KINDS.map((k) => (
                  <Checkbox key={k} value={k} label={PUSH_KIND_LABELS[k]} />
                ))}
              </Stack>
            </Checkbox.Group>
            <Group>
              <Button onClick={() => save.mutate(chosen)} loading={save.isPending}>
                {on ? 'Сохранить' : 'Включить уведомления'}
              </Button>
              {on && (
                <>
                  <Button variant="default" onClick={() => test.mutate()} loading={test.isPending}>
                    Проверить
                  </Button>
                  <Button
                    variant="subtle"
                    color="red"
                    onClick={() => off.mutate()}
                    loading={off.isPending}
                  >
                    Выключить
                  </Button>
                </>
              )}
            </Group>
            {save.error && <Alert color="red">{save.error.message}</Alert>}
            {test.data && (
              <Text size="sm" c={test.data.sent ? 'green' : 'dimmed'}>
                {test.data.sent
                  ? 'Отправлено — уведомление придёт через пару секунд.'
                  : 'Подписок нет.'}
              </Text>
            )}
          </>
        )}
      </Stack>
    </Card>
  );
}

/** PIN детского режима: удержание угла экрана 3 с на телефоне ребёнка → ввод PIN. */
function PinCard() {
  const status = usePin();
  const [pin, setPin] = useState('');
  const save = useMutation({
    mutationFn: () => api.put<{ pinSet: boolean }>('/parent/settings/pin', { pin }),
    onSuccess: (data) => {
      queryClient.setQueryData(keys.pin, data);
      setPin('');
    },
  });
  const valid = /^\d{4,6}$/.test(pin);
  return (
    <Card withBorder>
      <Stack>
        <Text fw={600}>PIN детского режима</Text>
        <Text size="sm" c="dimmed">
          Чтобы открыть меню родителя на телефоне ребёнка, удержите правый верхний угол экрана 3
          секунды и введите PIN. {status.data?.pinSet ? 'PIN задан.' : 'PIN ещё не задан.'}
        </Text>
        <Group wrap="nowrap" align="flex-end">
          <TextInput
            style={{ flex: 1 }}
            label={status.data?.pinSet ? 'Новый PIN (4–6 цифр)' : 'PIN (4–6 цифр)'}
            inputMode="numeric"
            maxLength={6}
            value={pin}
            onChange={(e) => setPin(e.currentTarget.value.replace(/\D/g, ''))}
          />
          <Button onClick={() => save.mutate()} disabled={!valid} loading={save.isPending}>
            Сохранить
          </Button>
        </Group>
        {save.isSuccess && (
          <Text size="sm" c="green">
            PIN сохранён
          </Text>
        )}
      </Stack>
    </Card>
  );
}

/** Оформление кабинета: как в системе (днём светлое, ночью тёмное), светлое или тёмное. */
function AppearanceCard() {
  const { colorScheme, setColorScheme } = useMantineColorScheme();
  return (
    <Card withBorder>
      <Stack gap="xs">
        <Text fw={600}>Оформление</Text>
        <SegmentedControl
          value={colorScheme}
          onChange={(v) => setColorScheme(v as 'auto' | 'light' | 'dark')}
          data={[
            { value: 'auto', label: 'Как в системе' },
            { value: 'light', label: 'Светлое' },
            { value: 'dark', label: 'Тёмное' },
          ]}
          fullWidth
        />
      </Stack>
    </Card>
  );
}

/** Как дети видят родителя в звонках. */
function NameCard() {
  const me = useMe();
  const [name, setName] = useState<string | null>(null);
  const value = name ?? me.data?.displayName ?? '';
  const save = useMutation({
    mutationFn: () => api.put('/parent/me/name', { displayName: value }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: keys.me }),
  });
  return (
    <Card withBorder>
      <Stack>
        <Text fw={600}>Как вас зовут дети</Text>
        <Text size="sm" c="dimmed">
          Это имя ребёнок видит в звонках: «Мама», «Папа».
        </Text>
        <Group>
          <TextInput
            value={value}
            onChange={(e) => setName(e.currentTarget.value)}
            placeholder="Мама"
            maxLength={30}
            aria-label="Имя для детей"
          />
          <Button onClick={() => save.mutate()} loading={save.isPending} disabled={!value.trim()}>
            Сохранить
          </Button>
        </Group>
        {save.isSuccess && (
          <Text size="sm" c="green">
            Сохранено
          </Text>
        )}
      </Stack>
    </Card>
  );
}

export function AccountPage() {
  const me = useMe();
  const navigate = useNavigate();

  const invite = useMutation({ mutationFn: () => api.post<InviteCreated>('/parent/invites') });
  const logout = useMutation({
    mutationFn: () => api.post('/parent/logout'),
    onSuccess: () => {
      queryClient.setQueryData(keys.me, null);
      queryClient.clear();
      navigate('/login', { replace: true });
    },
  });

  const link = invite.data ? `${window.location.origin}/invite?token=${invite.data.token}` : null;

  return (
    <Stack maw={560}>
      <Title order={2}>Аккаунт</Title>
      <Text>
        Вы вошли как <b>{me.data?.email}</b>
      </Text>

      <NameCard />
      <AppearanceCard />

      <Card withBorder>
        <Stack>
          <Text fw={600}>Второй родитель</Text>
          <Text size="sm" c="dimmed">
            Одноразовая ссылка на 24 часа. По ней второй родитель создаст свой аккаунт с собственным
            паролем. Всего можно два родительских аккаунта.
          </Text>
          {link ? (
            <>
              <Group wrap="nowrap" align="flex-end">
                <TextInput style={{ flex: 1 }} value={link} readOnly label="Ссылка-приглашение" />
                <CopyButton value={link}>
                  {({ copied, copy }) => (
                    <Button color={copied ? 'teal' : undefined} onClick={copy}>
                      {copied ? 'Скопировано' : 'Копировать'}
                    </Button>
                  )}
                </CopyButton>
              </Group>
              <Alert color="yellow">
                Отправьте ссылку только второму родителю — по ней можно создать аккаунт.
              </Alert>
            </>
          ) : (
            <Button
              variant="default"
              onClick={() => invite.mutate()}
              loading={invite.isPending}
              w="fit-content"
            >
              Создать приглашение
            </Button>
          )}
        </Stack>
      </Card>

      <PushCard />

      <PinCard />

      <Button
        variant="subtle"
        color="red"
        w="fit-content"
        onClick={() => logout.mutate()}
        loading={logout.isPending}
      >
        Выйти
      </Button>
    </Stack>
  );
}
