import {
  requiredSpeechLangs,
  type Child,
  type Device,
  type PairingCreated,
} from '@kidsplus/shared/api';
import type { AppErrorEntry } from '@kidsplus/shared/app-errors';
import {
  Alert,
  Badge,
  Button,
  Card,
  Center,
  Code,
  Group,
  Image,
  List,
  Modal,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { useMutation, useQuery } from '@tanstack/react-query';
import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import { api } from '../api';
import { LANGUAGE_LABELS, plural } from '../lib/child';
import { modals } from '../lib/modals';
import { phoneOf } from '../lib/names';
import { keys, queryClient, useChildren, useDecks, useDevices } from '../queries';

const dateTime = (iso: string) =>
  new Date(iso).toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

export function DevicesPage() {
  const children = useChildren();
  const decks = useDecks();
  const [pairingFor, setPairingFor] = useState<Child | null>(null);
  // Пока открыт диалог привязки, опрашиваем список устройств, чтобы увидеть новое.
  const devices = useDevices(pairingFor ? 3000 : undefined);

  const revoke = useMutation({
    mutationFn: (id: string) => api.delete(`/parent/devices/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.devices }),
  });

  return (
    <Stack>
      <Title order={2}>Устройства</Title>
      {children.data?.length === 0 && (
        <Text c="dimmed">Сначала добавьте ребёнка в разделе «Дети».</Text>
      )}

      {children.data?.map((child) => {
        const list = devices.data?.filter((d) => d.childId === child.id) ?? [];
        return (
          <Card key={child.id} withBorder>
            <Stack gap="sm">
              <Group justify="space-between">
                <Text fw={600}>{child.nickname}</Text>
                <Button size="xs" onClick={() => setPairingFor(child)}>
                  Привязать телефон
                </Button>
              </Group>
              {list.length === 0 && (
                <Text size="sm" c="dimmed">
                  Нет привязанных устройств
                </Text>
              )}
              {list.map((d) => (
                <DeviceRow
                  key={d.id}
                  device={d}
                  required={requiredSpeechLangs(
                    child.languages,
                    (decks.data ?? [])
                      .filter((x) => x.childIds.includes(child.id))
                      .map((x) => x.lang),
                  )}
                  onRevoke={() =>
                    modals.confirm({
                      title: `Отозвать доступ «${d.name}»?`,
                      message:
                        'Телефон сразу перестанет показывать видео. Привязать его можно будет заново.',
                      confirmLabel: 'Отозвать',
                      onConfirm: () => revoke.mutate(d.id),
                    })
                  }
                />
              ))}
            </Stack>
          </Card>
        );
      })}

      <Modal
        opened={pairingFor !== null}
        onClose={() => setPairingFor(null)}
        title="Привязка телефона"
        size="md"
      >
        {pairingFor && (
          <PairingFlow
            child={pairingFor}
            devices={devices.data ?? []}
            onDone={() => setPairingFor(null)}
          />
        )}
      </Modal>
    </Stack>
  );
}

function DeviceRow({
  device,
  required,
  onRevoke,
}: {
  device: Device;
  required: string[];
  onRevoke: () => void;
}) {
  return (
    <Stack gap={6}>
      <Group justify="space-between" wrap="nowrap">
        <div>
          <Group gap="xs">
            <Text>{device.name}</Text>
            {device.revokedAt && (
              <Badge color="gray" variant="light">
                отозвано
              </Badge>
            )}
          </Group>
          <Text size="xs" c="dimmed">
            {device.lastSeenAt
              ? `в сети: ${dateTime(device.lastSeenAt)}`
              : `привязано: ${dateTime(device.createdAt)}`}
          </Text>
        </div>
        {!device.revokedAt && (
          <Button size="xs" variant="subtle" color="red" onClick={onRevoke}>
            Отозвать
          </Button>
        )}
      </Group>
      {!device.revokedAt && <SpeechVoices device={device} required={required} />}
      {!device.revokedAt && <DeviceErrors device={device} />}
    </Stack>
  );
}

const ERROR_KINDS: Record<AppErrorEntry['kind'], string> = {
  error: 'ошибка',
  rejection: 'ошибка',
  screen: 'экран упал',
  audio: 'звук',
};

/**
 * Сбои детского приложения (этап 51): сколько за неделю и что именно — чтобы на приёмке
 * не описывать, что сломалось, а показать.
 */
function DeviceErrors({ device }: { device: Device }) {
  const [open, setOpen] = useState(false);
  const list = useQuery({
    queryKey: ['device-errors', device.id],
    queryFn: () => api.get<AppErrorEntry[]>(`/parent/devices/${device.id}/errors`),
    enabled: open,
  });
  if (!device.errors)
    return (
      <Text size="xs" c="dimmed" data-testid="device-errors">
        Сбоев за неделю нет
      </Text>
    );
  return (
    <Stack gap={4} data-testid="device-errors">
      <Button
        size="compact-xs"
        variant="subtle"
        color="orange"
        px={0}
        style={{ alignSelf: 'flex-start' }}
        onClick={() => setOpen((o) => !o)}
      >
        Сбоев за неделю: {device.errors} {open ? '▴' : '▾'}
      </Button>
      {open &&
        list.data?.map((e) => (
          <Card key={e.id} withBorder p="xs" data-testid="device-error">
            <Group gap={6} wrap="wrap">
              <Badge size="xs" color={e.kind === 'audio' ? 'gray' : 'orange'} variant="light">
                {ERROR_KINDS[e.kind]}
              </Badge>
              <Text size="xs" c="dimmed">
                {dateTime(e.lastAt)}
                {e.count > 1 ? ` · ${e.count} ${plural(e.count, 'раз', 'раза', 'раз')}` : ''}
                {e.screen ? ` · ${e.screen}` : ''}
              </Text>
            </Group>
            <Text size="xs" style={{ overflowWrap: 'anywhere' }}>
              {e.message}
            </Text>
            {e.stack && (
              <Code block fz={10} mt={4} style={{ maxHeight: 120, overflow: 'auto' }}>
                {e.stack}
              </Code>
            )}
            {e.build && (
              <Text size="xs" c="dimmed">
                сборка {e.build}
              </Text>
            )}
          </Card>
        ))}
    </Stack>
  );
}

const langName = (l: string) => LANGUAGE_LABELS[l] ?? l;

/** Голоса синтеза речи на телефоне: без голоса нужного языка озвучка звучит с акцентом. */
function SpeechVoices({ device, required }: { device: Device; required: string[] }) {
  if (!device.speechLangs) {
    return (
      <Text size="xs" c="dimmed">
        Голоса озвучки ещё не проверены — откройте детское приложение на этом телефоне.
      </Text>
    );
  }
  const have = new Set(device.speechLangs);
  const missing = required.filter((l) => !have.has(l));
  if (!missing.length) {
    return (
      <Text size="xs" c="green">
        Голоса озвучки есть: {required.map(langName).join(', ')}
      </Text>
    );
  }
  return (
    <Alert color="orange" p="xs" title={`Нет голоса: ${missing.map(langName).join(', ')}`}>
      <Text size="xs">
        Фразы на этом языке будут звучать с чужим акцентом. На телефоне: Настройки → Общие настройки
        → Язык и ввод → Синтез речи → ⚙️ у модуля → Установить голосовые данные. Затем закройте и
        откройте детское приложение. Проверить голоса: страница /voices в Chrome на телефоне.
      </Text>
    </Alert>
  );
}

function PairingFlow({
  child,
  devices,
  onDone,
}: {
  child: Child;
  devices: Device[];
  onDone: () => void;
}) {
  const [name, setName] = useState(phoneOf(child));
  const [pairing, setPairing] = useState<
    (PairingCreated & { qr: string; knownIds: Set<string> }) | null
  >(null);
  const [secondsLeft, setSecondsLeft] = useState(0);

  const create = useMutation({
    mutationFn: () =>
      api.post<PairingCreated>('/parent/pairings', { childId: child.id, deviceName: name }),
    onSuccess: async (p) => {
      const qr = await QRCode.toDataURL(p.url, { margin: 1, width: 280 });
      setPairing({ ...p, qr, knownIds: new Set(devices.map((d) => d.id)) });
    },
  });

  useEffect(() => {
    if (!pairing) return;
    const tick = () =>
      setSecondsLeft(Math.max(0, Math.round((Date.parse(pairing.expiresAt) - Date.now()) / 1000)));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [pairing]);

  const paired =
    pairing && devices.find((d) => d.childId === child.id && !pairing.knownIds.has(d.id));

  if (paired) {
    return (
      <Stack>
        <Alert color="green" title="Готово">
          «{paired.name}» привязан к профилю {child.nickname}.
        </Alert>
        <Button onClick={onDone}>Закрыть</Button>
      </Stack>
    );
  }

  if (!pairing) {
    return (
      <Stack>
        <TextInput
          label="Название устройства"
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
          maxLength={40}
        />
        <Button onClick={() => create.mutate()} loading={create.isPending} disabled={!name.trim()}>
          Получить QR-код
        </Button>
      </Stack>
    );
  }

  return (
    <Stack>
      {secondsLeft > 0 ? (
        <>
          <Center>
            <Image src={pairing.qr} alt="QR-код привязки" w={280} h={280} />
          </Center>
          <Text ta="center">
            Код для ручного ввода: <Code fz="lg">{pairing.code}</Code>
          </Text>
          <Text ta="center" size="sm" c="dimmed">
            Действует ещё {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, '0')}
          </Text>
          <List size="sm" type="ordered">
            <List.Item>На телефоне ребёнка откройте камеру и наведите на QR-код.</List.Item>
            <List.Item>Нажмите на появившуюся ссылку — откроется детское приложение.</List.Item>
            <List.Item>Это окно само сообщит, когда телефон будет привязан.</List.Item>
          </List>
          <Text size="xs" c="dimmed">
            Если камера не видит код — откройте детское приложение на телефоне и введите код
            вручную.
          </Text>
        </>
      ) : (
        <>
          <Alert color="orange">Код истёк.</Alert>
          <Button onClick={() => create.mutate()} loading={create.isPending}>
            Новый код
          </Button>
        </>
      )}
    </Stack>
  );
}
