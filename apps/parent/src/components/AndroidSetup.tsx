import type { Child, Device, PairingCreated } from '@kidsplus/shared/api';
import {
  kioskSetupQrText,
  setupQrLevel,
  SETUP_VPN_MAX,
  type KioskSetupInput,
} from '@kidsplus/shared/kiosk-setup';
import type { KioskSetupInfo } from '@kidsplus/shared/kiosk-update';
import {
  Alert,
  Button,
  Center,
  Code,
  Image,
  List,
  Loader,
  PasswordInput,
  SegmentedControl,
  Stack,
  Text,
  Textarea,
  TextInput,
} from '@mantine/core';
import { useMutation, useQuery } from '@tanstack/react-query';
import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import { api } from '../api';
import { phoneOf } from '../lib/names';

type Built = PairingCreated & { qr: string; knownIds: Set<string> };

/**
 * Android без компьютера (этап 53): сброшенный телефон сканирует QR-код на экране приветствия,
 * сам ставит киоск и привязывается к ребёнку. QR-код собирается здесь, в браузере: пароль Wi-Fi
 * и VPN на сервер не уходят.
 */
export function AndroidSetupFlow({
  child,
  devices,
  onDone,
}: {
  child: Child;
  devices: Device[];
  onDone: () => void;
}) {
  const info = useQuery({
    queryKey: ['kiosk-setup'],
    queryFn: () => api.get<KioskSetupInfo>('/parent/kiosk/setup'),
  });
  const [name, setName] = useState(phoneOf(child));
  const [vpnMode, setVpnMode] = useState<'need' | 'none'>('need');
  const [vpn, setVpn] = useState('');
  const [ssid, setSsid] = useState('');
  const [password, setPassword] = useState('');
  const [built, setBuilt] = useState<Built | null>(null);
  const [tooLong, setTooLong] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const release = info.data?.release;
  const input = (pairCode: string): KioskSetupInput | null =>
    release
      ? {
          apkUrl: release.apkUrl,
          signatureChecksum: release.signatureChecksum,
          pairCode,
          ...(ssid.trim()
            ? {
                wifi: { ssid, password, security: password ? ('WPA' as const) : ('NONE' as const) },
              }
            : {}),
          ...(vpnMode === 'need' ? { vpn } : { noVpn: true }),
        }
      : null;

  const create = useMutation({
    mutationFn: async () => {
      // Сначала — влезет ли всё в QR-код (код привязки всегда одной длины).
      const probe = input('XXXX-XXXX');
      if (!probe || !setupQrLevel(kioskSetupQrText(probe))) return null;
      return api.post<PairingCreated>('/parent/pairings', {
        childId: child.id,
        deviceName: name,
        forSetup: true,
      });
    },
    onSuccess: async (p) => {
      const data = p && input(p.code);
      if (!p || !data) {
        setTooLong(true);
        return;
      }
      const text = kioskSetupQrText(data);
      const qr = await QRCode.toDataURL(text, {
        margin: 2,
        width: 640,
        errorCorrectionLevel: setupQrLevel(text) ?? 'L',
      });
      setNow(Date.now());
      setBuilt({ ...p, qr, knownIds: new Set(devices.map((d) => d.id)) });
    },
  });

  useEffect(() => {
    if (!built) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [built]);
  const secondsLeft = built
    ? Math.max(0, Math.round((Date.parse(built.expiresAt) - now) / 1000))
    : 0;

  const paired = built && devices.find((d) => d.childId === child.id && !built.knownIds.has(d.id));

  if (info.isPending)
    return (
      <Center p="lg">
        <Loader />
      </Center>
    );

  if (!release)
    return (
      <Alert color="orange" title="Нужна новая версия киоска">
        Чтобы телефон поставил киоск сам, на сервере должна быть версия с отпечатком подписи.
        Опубликуйте киоск с компьютера: scripts/publish-kiosk.ps1 (см. docs/kiosk.md).
      </Alert>
    );

  if (paired)
    return (
      <Stack>
        <Alert color="green" title="Готово">
          «{paired.name}» настроен и привязан к профилю {child.nickname}.
        </Alert>
        <Button onClick={onDone}>Закрыть</Button>
      </Stack>
    );

  if (built && secondsLeft > 0)
    return (
      <Stack>
        <Center>
          <Image
            src={built.qr}
            alt="QR-код настройки телефона"
            w="100%"
            maw={340}
            data-testid="setup-qr"
          />
        </Center>
        <Text ta="center" size="sm" c="dimmed">
          Действует ещё {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, '0')}
        </Text>
        <List size="sm" type="ordered" spacing={4}>
          <List.Item>
            Сбросьте телефон: Настройки → Общие настройки → Сброс → Сброс данных. Всё на телефоне
            сотрётся.
          </List.Item>
          <List.Item>
            На первом экране («Добро пожаловать», выбор языка) 6 раз быстро нажмите на пустое место
            — откроется камера.
          </List.Item>
          <List.Item>
            Наведите камеру на этот QR-код. Телефон{ssid.trim() ? ' подключится к Wi-Fi,' : ''}{' '}
            скачает KidsPlus (около {Math.max(1, Math.round(release.bytes / 1024 / 1024))} МБ) и
            попросит согласиться — нажмите «Принять» и «Далее».
          </List.Item>
          <List.Item>
            Откроются настройки киоска: задайте PIN родителя и нажмите «Разрешить работу в фоне».
            {vpnMode === 'need' && vpn.trim()
              ? ' VPN подключится сам.'
              : vpnMode === 'need'
                ? ' Вставьте ссылку VPN и нажмите «Подключить».'
                : ''}
          </List.Item>
          <List.Item>
            Детское приложение откроется и привяжется к профилю {child.nickname} — это окно само
            скажет «Готово».
          </List.Item>
        </List>
        <Text size="xs" c="dimmed">
          В QR-коде пароль Wi-Fi и VPN — не пересылайте его снимок. Если камера не открылась: на
          Android 9 сначала подключитесь к Wi-Fi — сканер скачивается. Код для ручного ввода в
          детском приложении: <Code>{built.code}</Code>
        </Text>
        <Button variant="default" onClick={() => setBuilt(null)}>
          Изменить данные
        </Button>
      </Stack>
    );

  return (
    <Stack>
      <Text size="sm">
        Сброшенный телефон Android сам скачает и поставит киоск KidsPlus по QR-коду — без кабеля и
        компьютера.
      </Text>
      <TextInput
        label="Название устройства"
        value={name}
        onChange={(e) => setName(e.currentTarget.value)}
        maxLength={40}
      />
      <div>
        <Text size="sm" fw={500} mb={4}>
          VPN
        </Text>
        <SegmentedControl
          fullWidth
          value={vpnMode}
          onChange={(v) => setVpnMode(v as 'need' | 'none')}
          data={[
            { value: 'need', label: 'Нужен (Россия)' },
            { value: 'none', label: 'Не нужен' },
          ]}
        />
      </div>
      {vpnMode === 'need' ? (
        <>
          <Textarea
            label="Ссылка VPN"
            description="Адрес подписки или ссылки vless://. Можно оставить пустым и вставить на телефоне."
            value={vpn}
            onChange={(e) => setVpn(e.currentTarget.value)}
            maxLength={SETUP_VPN_MAX}
            autosize
            minRows={2}
            maxRows={5}
          />
          {!release.mirrored && (
            <Alert color="orange" p="xs">
              <Text size="xs">
                Киоск скачается с сервера KidsPlus, а он в России без VPN не открывается. Нужен
                Wi-Fi с VPN на роутере, или настройте телефон с компьютера по кабелю.
              </Text>
            </Alert>
          )}
        </>
      ) : (
        <Text size="xs" c="dimmed">
          Только для семей не в России: телефон будет ходить в интернет напрямую.
        </Text>
      )}
      <TextInput
        label="Сеть Wi-Fi"
        description="Необязательно: иначе телефон попросит выбрать сеть сам."
        value={ssid}
        onChange={(e) => setSsid(e.currentTarget.value)}
        maxLength={32}
      />
      {ssid.trim() && (
        <PasswordInput
          label="Пароль Wi-Fi"
          value={password}
          onChange={(e) => setPassword(e.currentTarget.value)}
          maxLength={63}
        />
      )}
      <Text size="xs" c="dimmed">
        Пароль Wi-Fi и VPN не уходят на сервер KidsPlus — они попадают только в QR-код.
      </Text>
      {tooLong && (
        <Alert color="red" p="xs">
          <Text size="xs">
            Данные не помещаются в QR-код. Сократите ссылку VPN — лучше дать адрес подписки.
          </Text>
        </Alert>
      )}
      {built && secondsLeft === 0 && <Alert color="orange">Код истёк — получите новый.</Alert>}
      <Button
        onClick={() => {
          setTooLong(false);
          create.mutate();
        }}
        loading={create.isPending}
        disabled={!name.trim()}
      >
        Показать QR-код
      </Button>
    </Stack>
  );
}
