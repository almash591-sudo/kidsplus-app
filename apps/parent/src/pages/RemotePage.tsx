// «Пульт» (этап 47; раньше «Главная», этап 40) — то, что родитель открывает много раз в день.
// «Все»: «Нужно ваше внимание» — только когда есть что; по строке на ребёнка — чем занят, кольца
// уроков, заряд, звонок; касание строки — пульт этого ребёнка. Выбран ребёнок (или он один) — его
// пульт целиком, без шторки: время, звонок, «Позвать», «Слушать», «Глазами ребёнка», выключить
// экран, громкость, радионяня, лента дня и журнал.
import type { Child } from '@kidsplus/shared/api';
import type { ModerationItem } from '@kidsplus/shared/moderation';
import type { ParentCapture } from '@kidsplus/shared/captures';
import type { MonitorState } from '@kidsplus/shared/monitor';
import { childPeer } from '@kidsplus/shared/calls';
import type { ChildNow } from '@kidsplus/shared/schedule';
import {
  ActionIcon,
  Button,
  Card,
  Group,
  Skeleton,
  Stack,
  Text,
  UnstyledButton,
} from '@mantine/core';
import { useQueries, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { api } from '../api';
import { parentCalls } from '../calls/CallLayer';
import { keys, useChildNow, useChildren, useMe, useSegments } from '../queries';
import {
  KidAvatar,
  kidColor,
  RING,
  Ring,
  statusLine,
  subjectPart,
  useControl,
} from '../components/KidBits';
import { DayLine } from '../components/DayLine';
import { KidSwitch } from '../components/KidSwitch';
import { LibraryCard } from '../components/Library';
import { MonitorCard } from '../components/MonitorCard';
import { NowHero } from '../components/NowHero';
import {
  ActivityLog,
  EyeBreakControls,
  eyeBreakOf,
  RestControls,
  VolumeControl,
} from '../components/ParentRemote';
import { RemoteActions } from '../components/RemoteActions';
import { setCurrentChild, useCurrentChildRaw } from '../lib/currentChild';
import { SUBJECT_LABELS } from '../lib/subjects';
import { phoneOf } from '../lib/names';

const today = () =>
  new Date().toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });

/** Строка блока «Нужно ваше внимание». */
function AttentionRow({
  color,
  icon,
  text,
  to,
}: {
  color: string;
  icon: string;
  text: string;
  to: string;
}) {
  return (
    <UnstyledButton component={Link} to={to} className="attention-row">
      <span className="attention-icon" style={{ background: color }}>
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#fff"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d={icon} />
        </svg>
      </span>
      <Text fw={600} style={{ flex: 1 }}>
        {text}
      </Text>
      <span className="chevron" aria-hidden="true">
        ›
      </span>
    </UnstyledButton>
  );
}

/** Текущее время, раз в минуту. */
function useMinuteClock() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

function Attention({ kids }: { kids: Child[] }) {
  const clock = useMinuteClock();
  const me = useMe();
  const moderation = useQuery({
    queryKey: keys.moderation,
    queryFn: () => api.get<ModerationItem[]>('/parent/moderation'),
    // Проверку видео ведёт только семья-администратор (этап 23).
    enabled: me.data?.isAdmin === true,
    refetchInterval: 60_000,
  });
  const segments = useSegments();
  // Те же запросы, что у карточек детей (общий кэш) — блок обновляется вместе с ними.
  const nows = useQueries({
    queries: kids.map((k) => ({
      queryKey: keys.now(k.id),
      queryFn: () => api.get<ChildNow>(`/parent/children/${k.id}/now`),
    })),
  }).map((q) => q.data);
  const monitors = useQueries({
    queries: kids.map((k) => ({
      queryKey: ['monitor', k.id],
      queryFn: () => api.get<MonitorState>(`/parent/children/${k.id}/monitor`),
    })),
  }).map((q) => q.data);

  const rows: { key: string; color: string; icon: string; text: string; to: string }[] = [];
  const ready = moderation.data?.filter((m) => m.status === 'ready').length ?? 0;
  if (ready)
    rows.push({
      key: 'moderation',
      color: '#007aff',
      icon: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
      text: `${ready} ${ready === 1 ? 'видео ждёт' : 'видео ждут'} проверки`,
      to: '/content',
    });
  const broken = segments.data?.filter((s) => s.source.status === 'unavailable').length ?? 0;
  if (broken)
    rows.push({
      key: 'broken',
      color: '#ff9500',
      icon: 'M12 8v5M12 16.5h.01M10.3 4l-8 14a2 2 0 0 0 1.7 3h16a2 2 0 0 0 1.7-3l-8-14a2 2 0 0 0-3.4 0z',
      text: `${broken} видео больше не открывается`,
      to: '/videos',
    });
  kids.forEach((k, i) => {
    const b = nows[i]?.battery;
    if (b && !b.charging && b.level <= 20)
      rows.push({
        key: `battery-${k.id}`,
        color: '#ff3b30',
        icon: 'M3 7h16v10H3zM21 11v2M6 10v4',
        text: `${phoneOf(k)}: ${b.level} %`,
        to: `/remote?child=${k.id}`,
      });
    // Этап 34: телефон подряд не открывает видео — обычно нет связи с YouTube или выключен VPN.
    if (nows[i]?.videosDown)
      rows.push({
        key: `videos-${k.id}`,
        color: '#ff9500',
        icon: 'M4 5h16v14H4zM4 4l16 16',
        text: `${phoneOf(k)}: видео не открываются — проверьте интернет и VPN`,
        to: `/child/${k.id}`,
      });
    // Этап 50: на перерыве для глаз ребёнок просит ещё — ответить в его пульте.
    const now = nows[i];
    if (now && eyeBreakOf(now)?.asked)
      rows.push({
        key: `eye-${k.id}`,
        color: '#ff9500',
        icon: 'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
        text: `${k.nickname}: просит ещё посмотреть`,
        to: `/remote?child=${k.id}`,
      });
    const noise = monitors[i]?.lastNoiseAt;
    if (noise && clock - new Date(noise).getTime() < 30 * 60_000)
      rows.push({
        key: `noise-${k.id}`,
        color: '#5856d6',
        icon: 'M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z',
        text: `${k.nickname}: в комнате было шумно`,
        to: `/remote?listen=${k.id}`,
      });
  });

  if (!rows.length) return null;
  return (
    <Card padding="sm" data-testid="attention">
      <Text size="xs" fw={700} c="orange" tt="uppercase" px={6} pb={4}>
        Нужно ваше внимание
      </Text>
      <Stack gap={0} className="grouped">
        {rows.map((r) => (
          <AttentionRow key={r.key} color={r.color} icon={r.icon} text={r.text} to={r.to} />
        ))}
      </Stack>
    </Card>
  );
}

/**
 * Строка ребёнка (этап 40): аватар, что делает, кольца уроков, звонок. Касание — пульт этого
 * ребёнка. Пауза и «+10» прямо здесь — только пока ребёнок в приложении.
 */
function KidRow({ child, color }: { child: Child; color: string }) {
  const now = useChildNow(child.id);
  const control = useControl(child.id);
  const d = now.data;
  if (!d) return <Skeleton height={76} radius="xl" />;
  const b = d.battery;
  const live = d.online && d.mode === 'plan' && !d.closed && !d.rest;

  return (
    <Card padding="sm" className="kid-row" data-testid="kid-card">
      <Group wrap="nowrap" gap="sm">
        <UnstyledButton
          onClick={() => {
            setCurrentChild(child.id);
            window.scrollTo({ top: 0 });
          }}
          aria-label={`Открыть: ${child.nickname}`}
          className="kid-row-main"
        >
          <span className="kid-row-avatar">
            <KidAvatar child={child} color={color} />
            {d.online && <span className="live-dot on" aria-hidden="true" />}
          </span>
          <Stack gap={0} style={{ minWidth: 0, flex: 1 }}>
            <Text fw={700} size="lg" lh={1.25}>
              {child.nickname}
            </Text>
            <Text size="sm" c="dimmed" truncate>
              {statusLine(d)}
              {b ? ` · ${b.charging ? '⚡' : ''}${b.level} %` : ''}
            </Text>
          </Stack>
        </UnstyledButton>
        <ActionIcon
          size={40}
          radius="xl"
          variant="light"
          color="green"
          aria-label={`Позвонить: ${child.nickname}`}
          onClick={() => void parentCalls()?.start([childPeer(child.id)], true)}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M6.5 4h3l1.6 4.2-2 1.3a11 11 0 0 0 5.4 5.4l1.3-2L20 14.5v3a2.5 2.5 0 0 1-2.5 2.5A14.5 14.5 0 0 1 4 6.5 2.5 2.5 0 0 1 6.5 4z" />
          </svg>
        </ActionIcon>
      </Group>
      {/* Этап 47: кольца с подписями — строкой под именем (без подписей было непонятно, что это). */}
      {d.mode === 'plan' && d.subjects.length > 0 && (
        <div className="kid-lessons" data-testid="kid-lessons">
          {d.subjects.map((s) => (
            <span key={s.subject} className="kid-lesson">
              <Ring size={18} color={RING[s.subject] ?? '#007aff'} part={subjectPart(s)} />
              <span>{SUBJECT_LABELS[s.subject].split(' ')[0]}</span>
              <span className="kid-lesson-left">
                {/* День закрыт — «осталось N мин» уже неправда; почему — в строке выше. */}
                {s.done ? '✓' : d.closed ? '' : `${Math.ceil(s.secondsLeft / 60)} мин`}
              </span>
            </span>
          ))}
        </div>
      )}
      {eyeBreakOf(d)?.asked && (
        <div style={{ marginTop: 'var(--mantine-spacing-sm)' }}>
          <EyeBreakControls now={d} act={(b) => control.mutate(b)} busy={control.isPending} />
        </div>
      )}
      {(live || d.paused) && (
        <Group gap={8} grow mt="sm" data-testid="kid-quick">
          <Button
            size="xs"
            variant={d.paused ? 'filled' : 'light'}
            onClick={() => control.mutate({ action: d.paused ? 'resume' : 'pause' })}
            loading={control.isPending}
          >
            {d.paused ? 'Дальше' : 'Пауза'}
          </Button>
          <Button
            size="xs"
            variant="light"
            onClick={() => control.mutate({ action: 'add', minutes: 10 })}
          >
            +10 мин
          </Button>
        </Group>
      )}
    </Card>
  );
}

function RecentPhotos() {
  const list = useQuery({
    queryKey: ['captures', 'all'],
    queryFn: () => api.get<ParentCapture[]>('/parent/captures'),
  });
  const shots = list.data?.slice(0, 10) ?? [];
  if (!shots.length) return null;
  return (
    <Stack gap={6}>
      <Group justify="space-between" px={4}>
        <Text fw={700}>Новые снимки</Text>
        <Text component={Link} to="/captures" c="ios" size="sm" fw={600}>
          Все
        </Text>
      </Group>
      <div className="photo-strip">
        {shots.map((c) => (
          <Link key={c.id} to="/captures" className="photo-strip-item">
            {c.kind === 'photo' ? (
              <img src={`/api/parent/captures/${c.id}/file`} alt="" loading="lazy" />
            ) : (
              <video src={`/api/parent/captures/${c.id}/file`} preload="metadata" muted />
            )}
          </Link>
        ))}
      </div>
    </Stack>
  );
}

/** Строки «Распорядка» и профиля — настройки, к которым идут из пульта. */
const SETTINGS = [
  {
    to: '/routine?tab=plan',
    label: 'План дня',
    color: '#5856d6',
    icon: 'M4 6h16v14H4zM4 10h16M9 3v4M15 3v4',
  },
  {
    to: '/routine?tab=habits',
    label: 'Привычки и награды',
    color: '#ffcc00',
    icon: 'M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6-4.5-4.2 6.1-.7z',
  },
  {
    to: '/routine?tab=sleep',
    label: 'Сон и сказки',
    color: '#5856d6',
    icon: 'M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z',
  },
];

/** Пульт одного ребёнка целиком (этап 47). */
function KidRemote({ child, kids, listen }: { child: Child; kids: Child[]; listen: boolean }) {
  const now = useChildNow(child.id);
  const control = useControl(child.id);
  const d = now.data;
  const loaded = d !== undefined;
  // Из push «шумно» — сразу к плиткам, «Слушать» подсвечена.
  useEffect(() => {
    if (listen && loaded)
      document
        .querySelector('[data-testid=remote-actions]')
        ?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [listen, loaded]);
  return (
    <Stack gap="md" data-testid="kid-remote" data-child={child.id}>
      <NowHero child={child} color={kidColor(kids, child.id)} />
      <RemoteActions child={child} listenAccent={listen} />
      {d && (
        <Card>
          <Stack gap="md">
            <RestControls now={d} act={(b) => control.mutate(b)} busy={control.isPending} />
            <VolumeControl key={child.id} now={d} act={(b) => control.mutate(b)} />
          </Stack>
        </Card>
      )}
      <Card padding="xs">
        <MonitorCard childId={child.id} listenButton={false} />
      </Card>
      <DayLine childId={child.id} />
      <Card>
        <ActivityLog childId={child.id} />
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
      <Stack gap={6}>
        <Text size="xs" fw={600} c="dimmed" tt="uppercase" px={16}>
          Настроить
        </Text>
        <Card padding={0}>
          <Stack gap={0} className="grouped" data-testid="remote-settings">
            {[
              ...SETTINGS,
              {
                to: `/child/${child.id}`,
                label: `Профиль: ${child.nickname}`,
                color: '#ff2d55',
                icon: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 20a8 8 0 0 1 16 0',
              },
            ].map((r) => (
              <AttentionRow key={r.to} color={r.color} icon={r.icon} text={r.label} to={r.to} />
            ))}
          </Stack>
        </Card>
      </Stack>
      <LibraryCard child={child} kids={kids} />
    </Stack>
  );
}

export function RemotePage() {
  const children = useChildren();
  const kids = children.data ?? [];
  const raw = useCurrentChildRaw();
  const [params] = useSearchParams();
  // Ссылки из push и «Нужно ваше внимание»: ?child=… — пульт этого ребёнка, ?listen=… — и «Слушать».
  const linked = params.get('listen') ?? params.get('child');
  useEffect(() => {
    if (linked && children.data?.some((k) => k.id === linked)) setCurrentChild(linked);
  }, [linked, children.data]);
  const picked = kids.find((k) => k.id === raw) ?? (kids.length === 1 ? kids[0]! : null);
  const shown = picked ? [picked] : kids;
  return (
    <Stack gap="md">
      <Stack gap={0}>
        <Text size="xs" fw={600} c="dimmed" tt="uppercase">
          {today()}
        </Text>
        <h1 className="page-title">Пульт</h1>
      </Stack>
      <KidSwitch all />
      {children.isPending && <Skeleton height={76} radius="xl" />}
      <Attention kids={shown} />
      {picked ? (
        <KidRemote
          key={picked.id}
          child={picked}
          kids={kids}
          listen={params.get('listen') === picked.id}
        />
      ) : (
        shown.length > 0 && (
          <Stack gap={8}>
            {shown.map((k) => (
              <KidRow key={k.id} child={k} color={kidColor(kids, k.id)} />
            ))}
          </Stack>
        )
      )}
      {children.data && !kids.length && (
        <Card>
          <Stack gap="xs" align="flex-start">
            <Text fw={700}>Добавьте ребёнка</Text>
            <Text size="sm" c="dimmed">
              Профиль ребёнка — прозвище и возраст. Настоящее имя не нужно.
            </Text>
            <Button component={Link} to="/children">
              Добавить
            </Button>
          </Stack>
        </Card>
      )}
      {!picked && <RecentPhotos />}
    </Stack>
  );
}
