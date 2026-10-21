// Общее для «Главной» и «Распорядка» (этап 40): цвет ребёнка, кольца предметов, строка статуса,
// аватар и управление «сейчас» (пауза, минуты, экран).
import type { Child } from '@kidsplus/shared/api';
import type { ChildNow, ControlRequest } from '@kidsplus/shared/schedule';
import { Avatar, Stack, Text } from '@mantine/core';
import { useMutation } from '@tanstack/react-query';
import { api } from '../api';
import { SUBJECT_LABELS } from '../lib/subjects';
import { keys, queryClient } from '../queries';

/** Цвет ребёнка — по порядку: аватар, кольца. */
export const KID_COLORS = ['#e5533f', '#c27c00', '#5856d6', '#1d8f3a'];
export const kidColor = (kids: Child[], id: string) =>
  KID_COLORS[
    Math.max(
      0,
      kids.findIndex((k) => k.id === id),
    ) % KID_COLORS.length
  ]!;

export const RING: Record<string, string> = {
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

/** Доля пройденного урока для кольца. */
export const subjectPart = (s: ChildNow['subjects'][number]) =>
  s.done ? 1 : 1 - s.secondsLeft / Math.max(LESSON_SEC, s.secondsLeft);

export function Ring({
  part,
  color,
  label,
  size = 54,
}: {
  part: number;
  color: string;
  label?: string;
  size?: number;
}) {
  const stroke = size > 40 ? 6 : 4;
  const r = size / 2 - stroke / 2 - 1;
  const c = 2 * Math.PI * r;
  const mid = size / 2;
  const svg = (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <circle
        cx={mid}
        cy={mid}
        r={r}
        fill="none"
        stroke="var(--app-separator)"
        strokeWidth={stroke}
      />
      {part > 0 && (
        <circle
          cx={mid}
          cy={mid}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          // Дуга «дорисовывается» при появлении (этап 17б).
          className="ring-arc"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - Math.min(1, part))}
          style={{ '--len': c } as React.CSSProperties}
          transform={`rotate(-90 ${mid} ${mid})`}
        />
      )}
    </svg>
  );
  if (!label) return svg;
  return (
    <Stack gap={4} align="center" style={{ flex: 1, minWidth: 0 }}>
      {svg}
      <Text size="xs" fw={600} truncate maw="100%">
        {label}
      </Text>
    </Stack>
  );
}

export function KidAvatar({
  child,
  color,
  size = 46,
}: {
  child: Child;
  color: string;
  size?: number;
}) {
  return (
    <Avatar
      radius="xl"
      size={size}
      styles={{
        placeholder: {
          background: `${color}22`,
          color,
          fontWeight: 800,
          fontSize: Math.round(size * 0.43),
        },
      }}
    >
      {child.nickname.slice(0, 1)}
    </Avatar>
  );
}

/** Что сейчас с ребёнком — одной строкой. */
export function statusLine(d: ChildNow) {
  if (d.rest) return 'Экран выключен';
  if (d.bedtime?.phase === 'night') return 'Ночь — спит';
  if (d.paused) return 'Пауза';
  if (d.closed) return 'На сегодня всё';
  if (!d.online) return 'Не в приложении';
  const activity =
    d.activity === 'free'
      ? 'Свободное время'
      : d.activity
        ? SUBJECT_LABELS[d.activity]
        : 'Выбирает';
  return d.item?.title ? `${activity} · «${d.item.title}»` : activity;
}

/** Сколько ещё можно сегодня: несделанные уроки и свободное время, секунд. */
export const secondsLeftToday = (d: ChildNow) =>
  d.closed
    ? 0
    : d.subjects.reduce((sum, s) => sum + (s.done ? 0 : s.secondsLeft), 0) + d.free.secondsLeft;

/** Управление «сейчас»: ответ сервера сразу кладётся в кэш. */
export function useControl(childId: string) {
  return useMutation({
    mutationFn: (body: ControlRequest) =>
      api.post<ChildNow>(`/parent/children/${childId}/control`, body),
    onSuccess: (data) => queryClient.setQueryData(keys.now(childId), data),
  });
}
