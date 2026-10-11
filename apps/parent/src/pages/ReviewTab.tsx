// «Контент → Проверка» (Кабинет 2.0): добавить видео ссылкой и проверить отчёты модели.
// Готовые отчёты — карточками: «Отклонить», «Посмотреть» (подробная правка), «Одобрить» одним
// касанием — фрагменты и вопросы как предложила модель, детям по возрасту.
import type {
  LlmUsageSummary,
  ModerationAddResult,
  ModerationItem,
} from '@kidsplus/shared/moderation';
import { formatTime } from '@kidsplus/shared/time';
import { Alert, Button, Card, Group, Progress, Stack, Text, TextInput } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import { api, errorMessage } from '../api';
import { quickApproval } from '../lib/moderation';
import { keys, queryClient, useChildren } from '../queries';

const AGE_TEXT: Record<string, string> = { '2-3': '2–3 лет', '4-5': '4–5 лет', '6': '6 лет' };

function verdict(item: ModerationItem) {
  const r = item.report;
  if (!r) return null;
  const good = r.ages.filter((a) => a.fit !== 'bad').map((a) => AGE_TEXT[a.age] ?? a.age);
  const flags = r.redFlags.filter((f) => f.severity !== 'low').length;
  if (r.recommendation === 'reject') return { ok: false, text: 'Модель советует отклонить' };
  if (flags) return { ok: false, text: `Тревожных моментов: ${flags} — посмотрите` };
  return {
    ok: r.recommendation === 'approve',
    text: good.length ? `Подходит для ${good.join(', ')}` : 'Возраст не подходит',
  };
}

function ReportCard({ item }: { item: ModerationItem }) {
  const children = useChildren();
  const quick = quickApproval(item, children.data ?? []);
  const names = (children.data ?? [])
    .filter((c) => quick.kids.includes(c.id))
    .map((c) => c.nickname)
    .join(' и ');
  const r = item.report!;
  const v = verdict(item);
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: keys.moderation });
    void queryClient.invalidateQueries({ queryKey: keys.segments });
    void queryClient.invalidateQueries({ queryKey: ['child-items'] });
  };
  const approve = useMutation({
    mutationFn: () => api.post(`/parent/moderation/${item.id}/approve`, quick.body),
    onSuccess: () => {
      notifications.show({ color: 'green', message: `Одобрено${names ? ` — для ${names}` : ''}` });
      refresh();
    },
  });
  const reject = useMutation({
    mutationFn: () => api.post(`/parent/moderation/${item.id}/reject`, {}),
    onSuccess: () => {
      notifications.show({ message: 'Отклонено' });
      refresh();
    },
  });
  const questions = r.segments.reduce((n, s) => n + s.questions.length, 0);

  return (
    <Card padding={0} data-testid="review-card">
      <Group gap="sm" wrap="nowrap" align="flex-start" p="sm">
        <div className="review-thumb">
          {item.thumbnailUrl && <img src={item.thumbnailUrl} alt="" loading="lazy" />}
          {item.durationSec ? <span>{formatTime(item.durationSec)}</span> : null}
        </div>
        <Stack gap={2} style={{ minWidth: 0, flex: 1 }}>
          <Text fw={700} lineClamp={2} lh={1.25}>
            {item.title ?? 'Видео'}
          </Text>
          <Text size="xs" c="dimmed" truncate>
            {[
              item.channelTitle,
              `${r.segments.length} фрагм.`,
              questions ? `${questions} вопр.` : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </Text>
          {v && (
            <Text size="xs" fw={700} c={v.ok ? 'green' : 'orange'}>
              {v.ok ? '✓ ' : '! '}
              {v.text}
            </Text>
          )}
        </Stack>
      </Group>
      <Text size="sm" c="dimmed" px="sm" pb="sm" lineClamp={3}>
        {r.summary}
      </Text>
      {(approve.error || reject.error) && (
        <Alert color="red" mx="sm" mb="sm">
          {errorMessage(approve.error ?? reject.error)}
        </Alert>
      )}
      <div className="review-actions">
        <button
          type="button"
          className="danger"
          onClick={() => reject.mutate()}
          disabled={reject.isPending}
        >
          Отклонить
        </button>
        <Link to={`/moderation/${item.id}`}>Посмотреть</Link>
        <button
          type="button"
          className="ok"
          onClick={() => approve.mutate()}
          disabled={!quick.body || approve.isPending}
          title={quick.problem ?? (names ? `Для ${names}` : undefined)}
          data-testid="quick-approve"
        >
          Одобрить
        </button>
      </div>
      {!quick.body && quick.problem && (
        <Text size="xs" c="dimmed" px="sm" pb="xs" ta="right">
          {quick.problem}
        </Text>
      )}
    </Card>
  );
}

export function ReviewTab() {
  const [url, setUrl] = useState('');
  const list = useQuery({
    queryKey: keys.moderation,
    queryFn: () => api.get<ModerationItem[]>('/parent/moderation'),
    refetchInterval: 20_000,
  });
  const usage = useQuery({
    queryKey: keys.llmUsage,
    queryFn: () => api.get<LlmUsageSummary>('/parent/llm-usage'),
  });
  const add = useMutation({
    mutationFn: () => api.post<ModerationAddResult>('/parent/moderation', { url: url.trim() }),
    onSuccess: (r) => {
      setUrl('');
      notifications.show({
        color: 'green',
        message: r.added
          ? `Добавлено: ${r.added}. ИИ посмотрит видео за несколько минут.`
          : 'Это видео уже в очереди или одобрено.',
      });
      void queryClient.invalidateQueries({ queryKey: keys.moderation });
    },
  });
  const retry = useMutation({
    mutationFn: (id: string) => api.post(`/parent/moderation/${id}/retry`, {}),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: keys.moderation }),
  });

  const items = list.data ?? [];
  const ready = items.filter((i) => i.status === 'ready');
  const working = items.filter((i) => i.status === 'queued' || i.status === 'processing');
  const failed = items.filter((i) => i.status === 'failed' || i.status === 'skipped');

  return (
    <Stack gap="md">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (url.trim()) add.mutate();
        }}
      >
        <Group gap="xs" wrap="nowrap">
          <TextInput
            style={{ flex: 1 }}
            placeholder="Ссылка на видео, плейлист или канал YouTube"
            value={url}
            onChange={(e) => setUrl(e.currentTarget.value)}
            aria-label="Ссылка YouTube"
          />
          <Button type="submit" loading={add.isPending} disabled={!url.trim()}>
            Добавить
          </Button>
        </Group>
      </form>
      {add.error && <Alert color="red">{errorMessage(add.error)}</Alert>}
      {usage.data?.paused && (
        <Alert color="orange">
          Анализ на паузе:{' '}
          {usage.data.paused === 'no_key' ? 'нет ключа модели' : 'достигнут лимит токенов'}.
        </Alert>
      )}

      <Text fw={700}>Готовы к проверке{ready.length ? ` · ${ready.length}` : ''}</Text>
      {list.data && !ready.length && (
        <Text c="dimmed" size="sm">
          Новых отчётов нет. Вставьте ссылку — ИИ посмотрит видео и предложит фрагменты и вопросы.
        </Text>
      )}
      {ready.map((i) => (
        <ReportCard key={i.id} item={i} />
      ))}

      {working.length > 0 && (
        <Card padding="sm">
          <Text fw={600}>ИИ смотрит видео · {working.length}</Text>
          <Text size="sm" c="dimmed" lineClamp={2}>
            {working.map((w) => w.title ?? w.externalId).join(' · ')}
          </Text>
        </Card>
      )}

      {failed.length > 0 && (
        <Card padding={0}>
          <Text fw={600} p="sm" pb={4}>
            Отсеяно или ошибка · {failed.length}
          </Text>
          <Stack gap={0} className="grouped">
            {failed.slice(0, 20).map((f) => (
              <div key={f.id} className="attention-row">
                <Stack gap={0} style={{ flex: 1, minWidth: 0 }}>
                  <Text size="sm" fw={600} truncate>
                    {f.title ?? f.externalId}
                  </Text>
                  <Text size="xs" c="dimmed" truncate>
                    {f.skipReason ?? f.error}
                  </Text>
                </Stack>
                {f.status === 'failed' && (
                  <Button size="compact-sm" variant="light" onClick={() => retry.mutate(f.id)}>
                    Ещё раз
                  </Button>
                )}
              </div>
            ))}
          </Stack>
        </Card>
      )}

      {usage.data && (
        <Stack gap={4}>
          <Progress value={(usage.data.todayTokens / usage.data.dailyLimit) * 100} size="sm" />
          <Text size="xs" c="dimmed">
            Модель сегодня: {usage.data.todayTokens.toLocaleString('ru-RU')} из{' '}
            {usage.data.dailyLimit.toLocaleString('ru-RU')} токенов
          </Text>
        </Stack>
      )}
    </Stack>
  );
}
