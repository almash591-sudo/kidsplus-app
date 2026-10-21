// Карточка «Сейчас» (этап 40) — пульт одного ребёнка вверху «Распорядка»: что делает, большое
// кольцо с минутами на сегодня, пауза и минуты одной кнопкой. Остальное (выключить экран с поводом,
// «Позвать», громкость, радионяня) — в шторке «Пульт», чтобы карточка оставалась спокойной.
import type { Child } from '@kidsplus/shared/api';
import type { ChildNow } from '@kidsplus/shared/schedule';
import { REST_LABELS } from '@kidsplus/shared/schedule';
import { Button, Card, Drawer, Group, Skeleton, Stack, Text } from '@mantine/core';
import { useState } from 'react';
import { Link } from 'react-router';
import { SUBJECT_LABELS } from '../lib/subjects';
import { useChildNow } from '../queries';
import { RING, Ring, secondsLeftToday, statusLine, subjectPart, useControl } from './KidBits';
import { MonitorCard } from './MonitorCard';
import { ScreenControls } from './ParentRemote';

const CLOSED: Record<NonNullable<ChildNow['closed']>, string> = {
  limit: 'Время на сегодня вышло',
  window: 'Вне разрешённого времени',
  day_off: 'Сегодня занятий нет',
  ended: 'День завершён вами',
};

/** «1 ч 05 мин» / «25 мин». */
export const duration = (s: number) => {
  const m = Math.ceil(s / 60);
  return m >= 60 ? `${Math.floor(m / 60)} ч ${String(m % 60).padStart(2, '0')} мин` : `${m} мин`;
};

export function NowHero({
  child,
  color,
  sheet = false,
}: {
  child: Child;
  color: string;
  /** Открыть шторку сразу (из push радионяни). */
  sheet?: boolean;
}) {
  const now = useChildNow(child.id);
  const control = useControl(child.id);
  // Шторка из push открывается при монтировании: «Распорядок» пересоздаёт карточку по ключу.
  const [open, setOpen] = useState(sheet);
  const d = now.data;
  if (!d) return <Skeleton height={300} radius="xl" />;

  const left = secondsLeftToday(d);
  const part = d.closed ? 1 : d.usedSeconds / Math.max(1, d.usedSeconds + left);
  const act = control.mutate;
  // Минуты помогают, пока день открыт или кончился лимит (не окно, не выходной).
  const canAdd = d.mode === 'plan' && (!d.closed || d.closed === 'limit');
  const b = d.battery;
  const banner = d.rest
    ? { text: `Экран выключен: ${REST_LABELS[d.rest]}`, action: 'Включить' }
    : d.bedtime?.phase === 'night'
      ? { text: '🌙 Ночь по расписанию сна', action: 'Разбудить' }
      : null;

  return (
    <Card padding="lg" className="now-hero" data-testid="now-hero" data-child={child.id}>
      <Stack gap="md">
        <Group justify="space-between" wrap="nowrap" gap="xs">
          <Group gap={8} wrap="nowrap" style={{ minWidth: 0 }}>
            <span className={d.online ? 'live-dot on' : 'live-dot'} aria-hidden="true" />
            <Text size="sm" fw={600} c="dimmed" truncate>
              {d.online ? 'В приложении' : 'Не в приложении'}
              {b ? ` · ${b.charging ? '⚡' : '🔋'} ${b.level} %` : ''}
            </Text>
          </Group>
          <Text component={Link} to={`/child/${child.id}`} size="sm" fw={600} c="ios">
            Профиль ›
          </Text>
        </Group>

        <Group wrap="nowrap" gap="lg" align="center">
          <div className="hero-ring">
            <Ring part={d.mode === 'plan' ? part : 0} color={color} size={128} />
            <div className="hero-ring-label">
              {d.mode === 'plan' ? (
                <>
                  <span className="hero-minutes tabular" data-testid="hero-minutes">
                    {Math.ceil(left / 60)}
                  </span>
                  <span>мин осталось</span>
                </>
              ) : (
                <span>без лимита</span>
              )}
            </div>
          </div>
          <Stack gap={4} style={{ minWidth: 0, flex: 1 }}>
            <Text fw={800} size="xl" lh={1.2} data-testid="hero-status">
              {statusLine(d)}
            </Text>
            <Text size="sm" c="dimmed">
              Сегодня: {duration(d.usedSeconds)}
            </Text>
            {d.windowSecondsLeft !== null && !d.closed && (
              <Text size="sm" c="dimmed">
                До конца окна: {duration(d.windowSecondsLeft)}
              </Text>
            )}
            {d.extraMinutes > 0 && (
              <Text size="sm" c="teal" fw={600}>
                +{d.extraMinutes} мин от вас
              </Text>
            )}
            {d.closed && (
              <Text size="sm" c="blue" fw={600}>
                {CLOSED[d.closed]}
              </Text>
            )}
          </Stack>
        </Group>

        {d.mode === 'plan' && d.subjects.length > 0 && (
          <Group gap="xs" wrap="nowrap" data-testid="hero-rings">
            {d.subjects.map((s) => (
              <Ring
                key={s.subject}
                size={44}
                label={SUBJECT_LABELS[s.subject].split(' ')[0]!}
                color={RING[s.subject] ?? '#007aff'}
                part={subjectPart(s)}
              />
            ))}
          </Group>
        )}

        {banner && (
          <Group className="hero-banner" justify="space-between" wrap="nowrap" gap="xs">
            <Text size="sm" fw={600}>
              {banner.text}
            </Text>
            <Button size="xs" onClick={() => act({ action: 'wake' })} loading={control.isPending}>
              {banner.action}
            </Button>
          </Group>
        )}

        <Group gap={8} grow wrap="nowrap">
          {d.mode === 'plan' && !d.closed && (
            <Button
              px={4}
              size="md"
              variant={d.paused ? 'filled' : 'light'}
              onClick={() => act({ action: d.paused ? 'resume' : 'pause' })}
              loading={control.isPending}
              data-testid="hero-pause"
            >
              {d.paused ? 'Дальше' : 'Пауза'}
            </Button>
          )}
          {canAdd && (
            <Button
              px={4}
              size="md"
              variant="light"
              onClick={() => act({ action: 'add', minutes: 10 })}
            >
              +10
            </Button>
          )}
          {canAdd && (
            <Button
              px={4}
              size="md"
              variant="light"
              onClick={() => act({ action: 'add', minutes: 30 })}
            >
              +30
            </Button>
          )}
          <Button
            px={4}
            size="md"
            variant="default"
            onClick={() => setOpen(true)}
            data-testid="open-remote"
          >
            ⋯ Пульт
          </Button>
        </Group>
      </Stack>

      <Drawer
        opened={open}
        onClose={() => setOpen(false)}
        position="bottom"
        size="auto"
        title={`Пульт · ${child.nickname}`}
        classNames={{ content: 'sheet', title: 'sheet-title' }}
      >
        <Stack gap="lg" pb="md" data-testid="remote-sheet">
          <ScreenControls now={d} act={act} busy={control.isPending} />
          <MonitorCard childId={child.id} />
        </Stack>
      </Drawer>
    </Card>
  );
}
