// «Аудио» (этап 20): общая аудиотека семьи. Любой родитель загружает mp3 с телефона или
// компьютера и слушает здесь же; отметка «Детям» — трек появляется в плеере на телефонах детей.
import { titleFromFile, type AudioTrack } from '@kidsplus/shared/audio';
import {
  ActionIcon,
  Alert,
  Button,
  Card,
  FileButton,
  Group,
  Progress,
  Stack,
  Switch,
  Text,
  TextInput,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api, errorMessage } from '../api';
import { modals } from '../lib/modals';
import { keys, queryClient } from '../queries';

const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} МБ`;

export function AudioPage() {
  const tracks = useQuery({
    queryKey: keys.audio,
    queryFn: () => api.get<AudioTrack[]>('/parent/audio'),
  });
  const [forKids, setForKids] = useState(true);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  // Файлы — по одному: каждый до 60 МБ, так загрузка не обрывается на слабой связи.
  const upload = useMutation({
    mutationFn: async (files: File[]) => {
      const failed: string[] = [];
      setProgress({ done: 0, total: files.length });
      for (const [i, f] of files.entries()) {
        const q = new URLSearchParams({
          title: titleFromFile(f.name),
          forKids: forKids ? '1' : '0',
        });
        // На некоторых телефонах тип файла пустой — сервер всё равно проверит содержимое.
        const blob = f.type ? f : new Blob([f], { type: 'audio/mpeg' });
        try {
          await api.upload(`/parent/audio?${q}`, blob);
        } catch (err) {
          failed.push(`${f.name}: ${errorMessage(err)}`);
        }
        setProgress({ done: i + 1, total: files.length });
      }
      return { ok: files.length - failed.length, failed };
    },
    onSuccess: ({ ok, failed }) => {
      if (ok) notifications.show({ color: 'green', message: `Загружено: ${ok}` });
      for (const f of failed) notifications.show({ color: 'red', message: f });
    },
    onSettled: () => {
      setProgress(null);
      void queryClient.invalidateQueries({ queryKey: keys.audio });
    },
  });

  return (
    <Stack>
      <h1 className="page-title">Аудио</h1>
      <Text size="sm" c="dimmed" px={4}>
        Общая аудиотека семьи: песни, сказки, колыбельные. Загружать и слушать можно с любого
        телефона родителя. Отмеченные «Детям» звучат в плеере 🎧 на телефонах детей.
      </Text>
      <Card padding="md">
        <Stack gap="sm">
          <Group>
            <FileButton onChange={(f) => f.length && upload.mutate(f)} accept="audio/*" multiple>
              {(props) => (
                <Button {...props} loading={upload.isPending}>
                  Добавить mp3
                </Button>
              )}
            </FileButton>
            <Switch
              label="Сразу детям"
              checked={forKids}
              onChange={(e) => setForKids(e.currentTarget.checked)}
            />
          </Group>
          {progress && (
            <Stack gap={4}>
              <Text size="sm" c="dimmed">
                Загружаю {progress.done} из {progress.total}…
              </Text>
              <Progress value={(progress.done / progress.total) * 100} />
            </Stack>
          )}
        </Stack>
      </Card>
      {tracks.error && <Alert color="red">{errorMessage(tracks.error)}</Alert>}
      <Card padding={0}>
        <Stack gap={0} className="grouped">
          {tracks.data?.length === 0 && (
            <div className="attention-row">
              <Text c="dimmed">Пока пусто — добавьте первые mp3.</Text>
            </div>
          )}
          {tracks.data?.map((t) => (
            <TrackRow key={t.id} track={t} />
          ))}
        </Stack>
      </Card>
    </Stack>
  );
}

function TrackRow({ track: t }: { track: AudioTrack }) {
  const [title, setTitle] = useState(t.title);
  const save = useMutation({
    mutationFn: (patch: Partial<Pick<AudioTrack, 'title' | 'forKids'>>) =>
      api.patch<AudioTrack>(`/parent/audio/${t.id}`, patch),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: keys.audio }),
  });
  const remove = useMutation({
    mutationFn: () => api.delete(`/parent/audio/${t.id}`),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: keys.audio }),
  });
  return (
    <div className="attention-row" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
      <Group gap="xs" wrap="nowrap">
        <TextInput
          variant="unstyled"
          aria-label="Название"
          value={title}
          maxLength={200}
          onChange={(e) => setTitle(e.currentTarget.value)}
          onBlur={() => title.trim() && title !== t.title && save.mutate({ title })}
          style={{ flex: 1 }}
          fw={600}
        />
        <Text size="xs" c="dimmed">
          {mb(t.bytes)}
        </Text>
        <ActionIcon
          variant="subtle"
          color="red"
          aria-label="Удалить"
          onClick={() =>
            modals.confirm({
              title: 'Удалить трек?',
              message: `«${t.title}» пропадёт у всех родителей и детей.`,
              confirmLabel: 'Удалить',
              onConfirm: () => remove.mutate(),
            })
          }
        >
          ✕
        </ActionIcon>
      </Group>
      <audio controls preload="none" src={t.url} style={{ width: '100%' }} />
      <Switch
        size="sm"
        label="Детям"
        checked={t.forKids}
        onChange={(e) => save.mutate({ forKids: e.currentTarget.checked })}
      />
    </div>
  );
}
