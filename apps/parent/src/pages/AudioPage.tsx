// «Аудио» (этап 20): общая аудиотека семьи. Любой родитель загружает mp3 с телефона или
// компьютера и слушает здесь же; отметка «Детям» — трек появляется в плеере на телефонах детей.
import { isVideo, titleFromFile, type AudioTrack } from '@kidsplus/shared/audio';
import {
  ActionIcon,
  Alert,
  Button,
  Card,
  FileButton,
  Group,
  Portal,
  Progress,
  Stack,
  Switch,
  Text,
  TextInput,
  UnstyledButton,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { api, errorMessage } from '../api';
import { BulkFilters, SelectMark, useBulk } from '../components/Bulk';
import { modals } from '../lib/modals';
import { keys, queryClient } from '../queries';

const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} МБ`;

export function AudioPage() {
  const tracks = useQuery({
    queryKey: keys.audio,
    queryFn: () => api.get<AudioTrack[]>('/parent/audio'),
  });
  const [forKids, setUploadForKids] = useState(true);
  // Этап 33: поиск, «Детям / Только родителям», выбор многих сразу.
  const withGroup = useMemo(
    () =>
      tracks.data?.map((t) => ({
        ...t,
        childIds: [] as string[],
        subject: t.forKids ? 'kids' : 'parents',
      })),
    [tracks.data],
  );
  const b = useBulk(withGroup);
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
        const blob =
          f.type === 'video/mp4' || f.type.startsWith('audio/')
            ? f
            : new Blob([f], { type: /\.mp4$/i.test(f.name) ? 'video/mp4' : 'audio/mpeg' });
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
        Общая аудиотека семьи: песни, сказки, колыбельные и свои видео (MP4). Загружать и слушать
        можно с любого телефона родителя. Отмеченные «Детям» есть в плеере 🎧 на телефонах детей;
        видео открывается там на весь экран.
      </Text>
      <Card padding="md">
        <Stack gap="sm">
          <Group>
            <FileButton
              onChange={(f) => f.length && upload.mutate(f)}
              accept="audio/*,video/mp4"
              multiple
            >
              {(props) => (
                <Button {...props} loading={upload.isPending}>
                  Добавить mp3 или видео
                </Button>
              )}
            </FileButton>
            <Switch
              label="Сразу детям"
              checked={forKids}
              onChange={(e) => setUploadForKids(e.currentTarget.checked)}
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
      {!!tracks.data?.length && (
        <BulkFilters search owners={false} bulk={b} subjects={AUDIO_GROUPS} shown={b.filtered} />
      )}
      <Card padding={0}>
        <Stack gap={0} className="grouped">
          {tracks.data?.length === 0 && (
            <div className="attention-row">
              <Text c="dimmed">Пока пусто — добавьте первые mp3.</Text>
            </div>
          )}
          {b.filtered.map((t) =>
            b.selecting ? (
              <UnstyledButton
                key={t.id}
                className="attention-row"
                onClick={() => b.toggle(t.id)}
                aria-pressed={b.selected.has(t.id)}
                data-testid="select-row"
              >
                <SelectMark checked={b.selected.has(t.id)} />
                <Text fw={600} style={{ flex: 1 }} truncate>
                  {t.title}
                </Text>
                <Text size="xs" c={t.forKids ? 'teal' : 'dimmed'}>
                  {t.forKids ? 'детям' : 'родителям'}
                </Text>
              </UnstyledButton>
            ) : (
              <TrackRow key={t.id} track={t} />
            ),
          )}
        </Stack>
      </Card>
      {b.selecting && <div className="bulk-space" />}
      {b.selecting && (
        <Portal>
          <div className="bulk-bar" data-testid="bulk-bar">
            <Text size="sm" fw={600}>
              {b.selected.size ? `Треков: ${b.selected.size}` : 'Отметьте нужное'}
            </Text>
            <Group gap={6} justify="flex-end">
              <Button
                size="sm"
                radius="xl"
                disabled={!b.selected.size}
                onClick={() => void setForKids(tracks.data ?? [], [...b.selected], true, b.stop)}
              >
                Показать детям
              </Button>
              <Button
                size="sm"
                radius="xl"
                variant="light"
                disabled={!b.selected.size}
                onClick={() => void setForKids(tracks.data ?? [], [...b.selected], false, b.stop)}
              >
                Скрыть от детей
              </Button>
            </Group>
          </div>
        </Portal>
      )}
    </Stack>
  );
}

/** Группы аудио для чипов фильтра. */
const AUDIO_GROUPS = { kids: 'Детям', parents: 'Только родителям' };

/** Показать/скрыть от детей много треков сразу; уведомление с «Отменить» (этап 33). */
async function setForKids(all: AudioTrack[], ids: string[], forKids: boolean, done: () => void) {
  const changed = all.filter((t) => ids.includes(t.id) && t.forKids !== forKids);
  const patch = (list: AudioTrack[], value: boolean) =>
    Promise.all(list.map((t) => api.patch(`/parent/audio/${t.id}`, { forKids: value })));
  try {
    await patch(changed, forKids);
    done();
    void queryClient.invalidateQueries({ queryKey: keys.audio });
    const id = `audio-${Date.now()}`;
    notifications.show({
      id,
      autoClose: 7000,
      message: (
        <Group justify="space-between" wrap="nowrap">
          <Text size="sm">
            {changed.length
              ? `${forKids ? 'Детям' : 'Скрыто от детей'}: ${changed.length}`
              : 'Ничего не изменилось'}
          </Text>
          {changed.length > 0 && (
            <Button
              size="compact-sm"
              variant="subtle"
              onClick={() => {
                notifications.hide(id);
                void patch(changed, !forKids).then(() =>
                  queryClient.invalidateQueries({ queryKey: keys.audio }),
                );
              }}
            >
              Отменить
            </Button>
          )}
        </Group>
      ),
    });
  } catch (err) {
    notifications.show({ color: 'red', message: errorMessage(err) });
  }
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
      {isVideo(t.mimeType) ? (
        <video
          controls
          preload="metadata"
          src={t.url}
          style={{ width: '100%', borderRadius: 8, background: '#000' }}
        />
      ) : (
        <audio controls preload="none" src={t.url} style={{ width: '100%' }} />
      )}
      <Switch
        size="sm"
        label="Детям"
        checked={t.forKids}
        onChange={(e) => save.mutate({ forKids: e.currentTarget.checked })}
      />
    </div>
  );
}
