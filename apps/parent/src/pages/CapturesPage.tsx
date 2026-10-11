// Снимки детей (этап 9): копии фото и видео с телефонов. Просмотр, скачивание, удаление.
// Файлы хранятся на сервере KidsPlus и открываются только после входа родителя.
import type { CaptureUsage, ParentCapture } from '@kidsplus/shared/captures';
import {
  Alert,
  Button,
  Card,
  Group,
  Modal,
  Progress,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api, errorMessage } from '../api';
import { queryClient, useChildren } from '../queries';

const fileUrl = (c: ParentCapture) => `/api/parent/captures/${c.id}/file`;
const mb = (b: number) => `${(b / 1024 / 1024).toFixed(1)} МБ`;
const when = (iso: string) =>
  new Date(iso).toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  });

export function CapturesPage() {
  const children = useChildren();
  const [childId, setChildId] = useState('all');
  const [open, setOpen] = useState<ParentCapture | null>(null);
  const query = childId === 'all' ? '' : `?childId=${childId}`;
  const list = useQuery({
    queryKey: ['captures', childId],
    queryFn: () => api.get<ParentCapture[]>(`/parent/captures${query}`),
  });
  const usage = useQuery({
    queryKey: ['captures-usage'],
    queryFn: () => api.get<CaptureUsage>('/parent/captures/usage'),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/parent/captures/${id}`),
    onSuccess: () => {
      setOpen(null);
      void queryClient.invalidateQueries({ queryKey: ['captures'] });
      void queryClient.invalidateQueries({ queryKey: ['captures-usage'] });
    },
  });
  const name = (id: string) => children.data?.find((c) => c.id === id)?.nickname ?? '';

  return (
    <Stack>
      <Title order={2}>Фото и видео</Title>
      <Text size="sm" c="dimmed">
        Копии снимков с телефонов детей. Хранятся только на сервере KidsPlus; при нехватке места
        самые старые копии удаляются (на телефоне они остаются).
      </Text>
      {usage.data && (
        <Stack gap={4}>
          <Progress value={(usage.data.bytes / usage.data.quotaBytes) * 100} />
          <Text size="xs" c="dimmed">
            {mb(usage.data.bytes)} из {mb(usage.data.quotaBytes)}
          </Text>
        </Stack>
      )}
      <SegmentedControl
        value={childId}
        onChange={setChildId}
        data={[
          { value: 'all', label: 'Все' },
          ...(children.data ?? []).map((c) => ({ value: c.id, label: c.nickname })),
        ]}
      />
      {list.error && <Alert color="red">{errorMessage(list.error)}</Alert>}
      {list.data && !list.data.length && <Text c="dimmed">Снимков пока нет.</Text>}
      <SimpleGrid cols={{ base: 2, sm: 3, md: 4 }}>
        {list.data?.map((c) => (
          <Card
            key={c.id}
            padding={0}
            withBorder
            style={{ cursor: 'pointer', overflow: 'hidden' }}
            onClick={() => setOpen(c)}
            data-testid="capture"
          >
            {c.kind === 'photo' ? (
              <img
                src={fileUrl(c)}
                alt=""
                loading="lazy"
                style={{ width: '100%', aspectRatio: '1', objectFit: 'cover' }}
              />
            ) : (
              <video
                src={fileUrl(c)}
                preload="metadata"
                muted
                style={{ width: '100%', aspectRatio: '1', objectFit: 'cover' }}
              />
            )}
            <Group justify="space-between" p={6}>
              <Text size="xs">
                {c.kind === 'video' ? '🎥' : '📷'} {name(c.childId)}
              </Text>
              <Text size="xs" c="dimmed">
                {when(c.takenAt)}
              </Text>
            </Group>
          </Card>
        ))}
      </SimpleGrid>

      <Modal
        opened={open !== null}
        onClose={() => setOpen(null)}
        size="xl"
        title={open ? `${name(open.childId)} · ${when(open.takenAt)}` : ''}
      >
        {open && (
          <Stack>
            {open.kind === 'photo' ? (
              <img src={fileUrl(open)} alt="" style={{ width: '100%' }} />
            ) : (
              <video src={fileUrl(open)} controls autoPlay style={{ width: '100%' }} />
            )}
            <Group justify="space-between">
              <Button component="a" href={fileUrl(open)} download variant="light">
                Скачать
              </Button>
              <Button
                color="red"
                variant="subtle"
                loading={remove.isPending}
                onClick={() => {
                  if (window.confirm('Удалить снимок из кабинета?')) remove.mutate(open.id);
                }}
              >
                Удалить
              </Button>
            </Group>
            {remove.error && <Alert color="red">{errorMessage(remove.error)}</Alert>}
          </Stack>
        )}
      </Modal>
    </Stack>
  );
}
