// Главная кабинета (Кабинет 2.0): то, что родитель открывает много раз в день.
// «Нужно ваше внимание» — дела, которые ждут; карточка каждого ребёнка — чем занят, кольца
// предметов, заряд и быстрые действия; новые снимки.
import type { Child } from '@kidsplus/shared/api';
import type { ModerationItem } from '@kidsplus/shared/moderation';
import type { ParentCapture } from '@kidsplus/shared/captures';
import type { MonitorState } from '@kidsplus/shared/monitor';
import { childPeer } from '@kidsplus/shared/calls';
import type { ChildNow, ControlRequest } from '@kidsplus/shared/schedule';
import {
  ActionIcon,
  Avatar,
  Button,
  Card,
  Group,
  Skeleton,
  Stack,
  Text,
  UnstyledButton,
} from '@mantine/core';
import { useMutation, useQueries, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { api } from '../api';
import { parentCalls } from '../calls/CallLayer';
import { SUBJECT_LABELS } from '../lib/subjects';
import { keys, queryClient, useChildNow, useChildren, useMe, useSegments } from '../queries';
import { PreviewButton } from '../components/PreviewButton';
import { LibraryCard } from '../components/Library';
import { setCurrentChild, useCurrentChildRaw } from '../lib/currentChild';

/** Цвет ребёнка — по порядку: аватар, кольца. */
const KID_COLORS = ['#e5533f', '#c27c00', '#5856d6', '#1d8f3a'];
const RING: Record<string, string> = {
  english: '#ff6b5c',
  chinese: '#e8453c',
  math: '#ff9500',
  geography: '#2d9cff',
  nature: '#34c759',
  music: '#00a9bd',
  letters: '#e8590c',
  games: '#ff2d55',
  other: '#8e5cf6',
  video: '#5856d6',
};
const LESSON_SEC = 20 * 60;

const today = () =>
  new Date().toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });

function Ring({ part, color, label }: { part: number; color: string; label: string }) {
  const r = 22;
  const c = 2 * Math.PI * r;
  return (
    <Stack gap={4} align="center" style={{ flex: 1, minWidth: 0 }}>
      <svg width="54" height="54" viewBox="0 0 54 54" aria-hidden="true">
        <circle cx="27" cy="27" r={r} fill="none" stroke="var(--app-separator)" strokeWidth="6" />
        {part > 0 && (
          <circle
            cx="27"
            cy="27"
            r={r}
            fill="none"
            stroke={color}
            strokeWidth="6"
            strokeLinecap="round"
            // Дуга «дорисовывается» при появлении (этап 17б).
            className="ring-arc"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - part)}
            style={{ '--len': c } as React.CSSProperties}
            transform="rotate(-90 27 27)"
          />
        )}
      </svg>
      <Text size="xs" fw={600} truncate maw="100%">
        {label}
      </Text>
    </Stack>
  );
}

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
        text: `Телефон ${k.nickname}: ${b.level} %`,
        to: '/now',
      });
    const noise = monitors[i]?.lastNoiseAt;
    if (noise && clock - new Date(noise).getTime() < 30 * 60_000)
      rows.push({
        key: `noise-${k.id}`,
        color: '#5856d6',
        icon: 'M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z',
        text: `${k.nickname}: в комнате было шумно`,
        to: `/now?listen=${k.id}`,
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

function statusLine(d: ChildNow) {
  if (d.paused) return 'Пауза';
  if (d.closed) return 'На сегодня занятия закончены';
  if (!d.online) return 'Не в приложении';
  const activity =
    d.activity === 'free'
      ? 'Свободное время'
      : d.activity
        ? SUBJECT_LABELS[d.activity]
        : 'Выбирает';
  return d.item?.title ? `${activity} · «${d.item.title}»` : activity;
}

function KidCard({ child, color }: { child: Child; color: string }) {
  const now = useChildNow(child.id);
  const navigate = useNavigate();
  const monitor = useQuery({
    queryKey: ['monitor', child.id],
    queryFn: () => api.get<MonitorState>(`/parent/children/${child.id}/monitor`),
    refetchInterval: 30_000,
  });
  const control = useMutation({
    mutationFn: (body: ControlRequest) =>
      api.post<ChildNow>(`/parent/children/${child.id}/control`, body),
    onSuccess: (data) => queryClient.setQueryData(keys.now(child.id), data),
  });
  const toggleMonitor = useMutation({
    mutationFn: (on: boolean) =>
      api.put<MonitorState>(`/parent/children/${child.id}/monitor`, { on }),
    onSuccess: (data) => queryClient.setQueryData(['monitor', child.id], data),
  });
  const d = now.data;
  if (!d) return <Skeleton height={190} radius="xl" />;
  const b = d.battery;

  return (
    <Card padding="md" data-testid="kid-card">
      <Stack gap="sm">
        <Group wrap="nowrap" gap="sm">
          <UnstyledButton
            onClick={() => navigate(`/child/${child.id}`)}
            aria-label={`Открыть: ${child.nickname}`}
            style={{ display: 'flex', gap: 12, alignItems: 'center', flex: 1, minWidth: 0 }}
          >
            <Avatar
              radius="xl"
              size={46}
              styles={{
                placeholder: { background: `${color}22`, color, fontWeight: 800, fontSize: 20 },
              }}
            >
              {child.nickname.slice(0, 1)}
            </Avatar>
            <Stack gap={0} style={{ minWidth: 0 }}>
              <Text fw={700} size="lg">
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

        {d.mode === 'plan' && d.subjects.length > 0 && (
          <Group gap="xs" wrap="nowrap">
            {d.subjects.map((s) => (
              <Ring
                key={s.subject}
                label={SUBJECT_LABELS[s.subject].split(' ')[0]!}
                color={RING[s.subject] ?? '#007aff'}
                part={s.done ? 1 : 1 - s.secondsLeft / Math.max(LESSON_SEC, s.secondsLeft)}
              />
            ))}
          </Group>
        )}

        <Group gap={8} grow>
          {d.mode === 'plan' && (
            <Button
              px={6}
              variant="light"
              onClick={() => control.mutate({ action: d.paused ? 'resume' : 'pause' })}
              loading={control.isPending}
            >
              {d.paused ? 'Продолжить' : 'Пауза'}
            </Button>
          )}
          {d.mode === 'plan' && (
            <Button
              px={6}
              variant="light"
              onClick={() => control.mutate({ action: 'add', minutes: 10 })}
            >
              +10 мин
            </Button>
          )}
          <Button
            px={6}
            variant={monitor.data?.on ? 'filled' : 'light'}
            color="violet"
            onClick={() => toggleMonitor.mutate(!monitor.data?.on)}
            loading={toggleMonitor.isPending}
          >
            🌙 Няня
          </Button>
        </Group>
        <PreviewButton childId={child.id} fullWidth />
      </Stack>
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

/** Переключатель «Все / ребёнок» (этап 33): выбор общий на весь кабинет. */
function KidSwitch({ kids, value }: { kids: Child[]; value: string | null }) {
  return (
    <div className="kid-switch" role="tablist" aria-label="Ребёнок" data-testid="kid-switch">
      <button
        type="button"
        role="tab"
        aria-selected={!value}
        className={value ? 'all' : 'all on'}
        onClick={() => setCurrentChild(null)}
      >
        Все
      </button>
      {kids.map((k, i) => {
        const color = KID_COLORS[i % KID_COLORS.length]!;
        return (
          <button
            key={k.id}
            type="button"
            role="tab"
            aria-selected={value === k.id}
            className={value === k.id ? 'on' : ''}
            onClick={() => setCurrentChild(k.id)}
          >
            <span className="dot" style={{ color }}>
              {k.nickname.slice(0, 1)}
            </span>
            {k.nickname}
          </button>
        );
      })}
    </div>
  );
}

export function HomePage() {
  const children = useChildren();
  const kids = children.data ?? [];
  const raw = useCurrentChildRaw();
  const picked = kids.find((k) => k.id === raw) ?? null;
  const shown = picked ? [picked] : kids;
  return (
    <Stack gap="md">
      <Stack gap={0}>
        <Text size="xs" fw={600} c="dimmed" tt="uppercase">
          {today()}
        </Text>
        <h1 className="page-title">Главная</h1>
      </Stack>
      {kids.length > 1 && <KidSwitch kids={kids} value={picked?.id ?? null} />}
      {children.isPending && <Skeleton height={190} radius="xl" />}
      <Attention kids={kids} />
      {shown.map((k) => (
        <KidCard key={k.id} child={k} color={KID_COLORS[kids.indexOf(k) % KID_COLORS.length]!} />
      ))}
      {(picked ?? (kids.length === 1 ? kids[0] : null)) && (
        <LibraryCard child={(picked ?? kids[0])!} kids={kids} />
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
      <RecentPhotos />
    </Stack>
  );
}
