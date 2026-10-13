import { formatTime } from '@kidsplus/shared/time';
import type {
  LlmUsageSummary,
  ModerationAddResult,
  ModerationItem,
  ModerationStatus,
} from '@kidsplus/shared/moderation';
import {
  Alert,
  Badge,
  Button,
  Card,
  Group,
  Image,
  Progress,
  SegmentedControl,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import { api } from '../api';
import { keys, queryClient } from '../queries';

export const STATUS_LABELS: Record<ModerationStatus, string> = {
  queued: 'в очереди',
  processing: 'анализируется',
  ready: 'на проверку',
  skipped: 'отсеяно',
  failed: 'ошибка',
  approved: 'одобрено',
  rejected: 'отклонено',
};
const STATUS_COLORS: Record<ModerationStatus, string> = {
  queued: 'gray',
  processing: 'blue',
  ready: 'orange',
  skipped: 'gray',
  failed: 'red',
  approved: 'green',
  rejected: 'dark',
};
export const RECOMMENDATION: Record<string, { label: string; color: string }> = {
  approve: { label: 'ИИ: подходит', color: 'green' },
  review: { label: 'ИИ: посмотрите сами', color: 'yellow' },
  reject: { label: 'ИИ: не подходит', color: 'red' },
};

const TABS: { value: string; label: string; statuses: ModerationStatus[] }[] = [
  { value: 'review', label: 'На проверку', statuses: ['ready'] },
  { value: 'work', label: 'В работе', statuses: ['queued', 'processing'] },
  { value: 'skipped', label: 'Отсеяно и ошибки', statuses: ['skipped', 'failed'] },
  { value: 'done', label: 'Решено', statuses: ['approved', 'rejected'] },
];

export const useModeration = () =>
  useQuery({
    queryKey: keys.moderation,
    queryFn: () => api.get<ModerationItem[]>('/parent/moderation'),
    // Пока что-то анализируется — обновляем.
    refetchInterval: (q) =>
      q.state.data?.some((i) => i.status === 'queued' || i.status === 'processing')
        ? 10_000
        : false,
  });

const PAUSED: Record<NonNullable<LlmUsageSummary['paused']>, string> = {
  no_key: 'Анализ ждёт ключа Gemini API (задаётся в Railway у worker’а).',
  no_credits:
    'Анализ на паузе: закончились кредиты Gemini. Пополните счёт в AI Studio — очередь продолжится сама.',
  daily_limit: 'Суточный лимит токенов исчерпан — анализ продолжится завтра.',
  total_limit: 'Общий лимит токенов исчерпан — анализ остановлен.',
};

function Usage() {
  const usage = useQuery({
    queryKey: keys.llmUsage,
    queryFn: () => api.get<LlmUsageSummary>('/parent/llm-usage'),
    refetchInterval: 30_000,
  });
  const u = usage.data;
  if (!u) return null;
  const fmt = (n: number) => n.toLocaleString('ru-RU');
  return (
    <Stack gap={4}>
      {u.paused && <Alert color="yellow">{PAUSED[u.paused]}</Alert>}
      <Text size="sm" c="dimmed">
        Токены модели за сутки: {fmt(u.todayTokens)} из {fmt(u.dailyLimit)} · всего:{' '}
        {fmt(u.totalTokens)} из {fmt(u.totalLimit)}
      </Text>
      <Progress
        value={Math.min(100, (u.todayTokens / Math.max(1, u.dailyLimit)) * 100)}
        size="sm"
      />
    </Stack>
  );
}

/** Очередь модерации (п. 6.1.5 ТЗ): добавление ссылок, отчёты ИИ, решения родителя. */
export function ModerationPage() {
  const items = useModeration();
  const [url, setUrl] = useState('');
  const [topic, setTopic] = useState('');
  const [tab, setTab] = useState('review');

  const add = useMutation({
    mutationFn: () =>
      api.post<ModerationAddResult>('/parent/moderation', {
        url,
        ...(topic.trim() ? { topic } : {}),
      }),
    onSuccess: (r) => {
      setUrl('');
      void queryClient.invalidateQueries({ queryKey: keys.moderation });
      notifications.show({
        color: r.added ? 'green' : 'gray',
        message: r.added
          ? `Добавлено видео: ${r.added}${r.existing ? `, уже были: ${r.existing}` : ''}`
          : 'Эти видео уже в очереди',
      });
      if (r.added) setTab('work');
    },
  });

  const counts = Object.fromEntries(
    TABS.map((t) => [
      t.value,
      items.data?.filter((i) => t.statuses.includes(i.status)).length ?? 0,
    ]),
  );
  const shown = items.data?.filter((i) =>
    TABS.find((t) => t.value === tab)!.statuses.includes(i.status),
  );

  return (
    <Stack>
      <Title order={2}>Модерация</Title>
      <Text size="sm" c="dimmed">
        Вставьте ссылку на видео, плейлист или канал YouTube. ИИ (Gemini) посмотрит видео и
        подготовит отчёт: подходит ли по возрасту, есть ли тревожные моменты, какие фрагменты взять
        и черновик вопросов. Ребёнок увидит видео только после вашего одобрения.
      </Text>
      <Card withBorder>
        <Stack gap="xs">
          <TextInput
            label="Ссылка"
            placeholder="https://www.youtube.com/watch?v=… или https://www.youtube.com/@канал"
            value={url}
            onChange={(e) => setUrl(e.currentTarget.value)}
            onKeyDown={(e) => e.key === 'Enter' && url.trim() && add.mutate()}
          />
          <Group align="flex-end">
            <TextInput
              style={{ flex: 1 }}
              label="Тема (необязательно)"
              description="Подсказка для ИИ: что вы ищете в видео"
              placeholder="цвета, счёт до пяти, животные по-английски"
              value={topic}
              maxLength={120}
              onChange={(e) => setTopic(e.currentTarget.value)}
            />
            <Button onClick={() => add.mutate()} loading={add.isPending} disabled={!url.trim()}>
              Добавить
            </Button>
          </Group>
          {add.error && <Alert color="red">{add.error.message}</Alert>}
        </Stack>
      </Card>
      <Usage />

      <SegmentedControl
        value={tab}
        onChange={setTab}
        data={TABS.map((t) => ({ value: t.value, label: `${t.label} · ${counts[t.value]}` }))}
      />
      {shown?.length === 0 && <Text c="dimmed">Здесь пусто.</Text>}
      {shown?.map((i) => (
        <ItemRow key={i.id} item={i} />
      ))}
    </Stack>
  );
}

function ItemRow({ item }: { item: ModerationItem }) {
  const r = item.report;
  const flags = r?.redFlags.length ?? 0;
  return (
    <Card withBorder padding="sm" component={Link} to={`/moderation/${item.id}`}>
      <Group wrap="nowrap" align="flex-start">
        {item.thumbnailUrl ? (
          <Image src={item.thumbnailUrl} alt="" w={128} h={72} radius="sm" fit="cover" />
        ) : (
          <Text fz={40} aria-hidden>
            🎬
          </Text>
        )}
        <Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
          <Text fw={600} lineClamp={2}>
            {item.title ?? item.url}
          </Text>
          <Text size="sm" c="dimmed">
            {[item.channelTitle, item.durationSec ? formatTime(item.durationSec) : null]
              .filter(Boolean)
              .join(' · ')}
          </Text>
          <Group gap={6}>
            <Badge color={STATUS_COLORS[item.status]} variant="light">
              {STATUS_LABELS[item.status]}
            </Badge>
            {r && (
              <Badge color={RECOMMENDATION[r.recommendation]!.color} variant="light">
                {RECOMMENDATION[r.recommendation]!.label}
              </Badge>
            )}
            {r && (
              <Badge color={flags ? 'red' : 'green'} variant="outline">
                {flags ? `тревожных моментов: ${flags}` : 'без тревожных моментов'}
              </Badge>
            )}
            {r && <Badge variant="outline">фрагментов: {r.segments.length}</Badge>}
          </Group>
          {(item.skipReason || item.error) && (
            <Text size="sm" c={item.error ? 'red' : 'dimmed'}>
              {item.skipReason ?? item.error}
            </Text>
          )}
        </Stack>
      </Group>
    </Card>
  );
}
