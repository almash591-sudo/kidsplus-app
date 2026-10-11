import {
  GAME_CATEGORIES,
  SEGMENT_MAX_SEC,
  SEGMENT_MIN_SEC,
  type GameCategory,
  type Segment,
  type SegmentCreateRequest,
  type VideoLookup,
} from '@kidsplus/shared/api';
import { formatTime, parseTime } from '@kidsplus/shared/time';
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Group,
  Loader,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useMutation } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { api } from '../api';
import { QuestionsEditor } from '../components/QuestionsEditor';
import { YouTubePreview, type YouTubePreviewHandle } from '../components/YouTubePreview';
import { SUBJECT_LABELS } from '../lib/subjects';
import { keys, queryClient, useChildren, useSegments } from '../queries';

const DEFAULT_LEN = 120;

export function SegmentEditorPage() {
  const { id } = useParams();
  const segments = useSegments();
  const existing = id ? segments.data?.find((s) => s.id === id) : undefined;

  if (id && segments.isPending) return <Loader />;
  if (id && !existing) return <Alert color="red">Фрагмент не найден.</Alert>;
  return <Editor key={id ?? 'new'} existing={existing ?? null} />;
}

function Editor({ existing }: { existing: Segment | null }) {
  const navigate = useNavigate();
  const children = useChildren();
  const preview = useRef<YouTubePreviewHandle>(null);

  const [url, setUrl] = useState(
    existing ? `https://www.youtube.com/watch?v=${existing.source.externalId}` : '',
  );
  const [video, setVideo] = useState<VideoLookup | null>(
    existing ? { ...existing.source, suggestedStartSec: null } : null,
  );
  const [title, setTitle] = useState(existing?.title ?? '');
  const [subject, setSubject] = useState<GameCategory | null>(existing?.subject ?? null);
  const [startText, setStartText] = useState(formatTime(existing?.startSec ?? 0));
  const [endText, setEndText] = useState(formatTime(existing?.endSec ?? DEFAULT_LEN));
  // null — родитель ещё не трогал выбор. Если ребёнок один, новый фрагмент сразу назначается ему.
  const [pickedChildIds, setChildIds] = useState<string[] | null>(existing?.childIds ?? null);
  const childIds = pickedChildIds ?? (children.data?.length === 1 ? [children.data[0]!.id] : []);

  const start = parseTime(startText);
  const end = parseTime(endText);
  const len = start !== null && end !== null ? end - start : null;
  const rangeError =
    start === null || end === null
      ? 'формат времени — м:сс'
      : len! < SEGMENT_MIN_SEC || len! > SEGMENT_MAX_SEC
        ? `длительность ${formatTime(Math.max(0, len!))} — нужно от 1 до 5 минут`
        : null;

  const lookup = useMutation({
    mutationFn: (u: string) =>
      api.get<VideoLookup>(`/parent/videos/lookup?url=${encodeURIComponent(u)}`),
    onSuccess: (v) => {
      setVideo(v);
      if (!title) setTitle(v.title);
      const s = v.suggestedStartSec ?? 0;
      setStartText(formatTime(s));
      setEndText(formatTime(s + DEFAULT_LEN));
    },
  });

  const save = useMutation({
    mutationFn: () => {
      const body = { title, startSec: start!, endSec: end!, childIds, subject };
      return existing
        ? api.put<Segment>(`/parent/segments/${existing.id}`, body)
        : api.post<Segment>('/parent/segments', { ...body, url } satisfies SegmentCreateRequest);
    },
    onSuccess: (saved) => {
      queryClient.setQueryData<Segment[]>(keys.segments, (old) => [
        saved,
        ...(old ?? []).filter((s) => s.id !== saved.id),
      ]);
      void queryClient.invalidateQueries({ queryKey: keys.segments });
      void queryClient.invalidateQueries({ queryKey: ['child-items'] });
      notifications.show({ color: 'green', message: 'Сохранено' });
      // Новый фрагмент — сразу на его страницу, чтобы добавить вопросы.
      navigate(existing ? '/videos' : `/videos/${saved.id}`, { replace: !existing });
    },
  });

  const setFromPlayer = (setter: (v: string) => void) => {
    const t = preview.current?.currentTime();
    if (t !== null && t !== undefined) setter(formatTime(t));
  };

  return (
    <Stack maw={760}>
      <Title order={2}>{existing ? 'Фрагмент' : 'Новое видео'}</Title>

      <Group align="flex-end" wrap="nowrap">
        <TextInput
          style={{ flex: 1 }}
          label="Ссылка на видео YouTube"
          placeholder="https://www.youtube.com/watch?v=…"
          value={url}
          onChange={(e) => setUrl(e.currentTarget.value)}
          disabled={Boolean(existing)}
          onKeyDown={(e) => e.key === 'Enter' && url && lookup.mutate(url)}
        />
        {!existing && (
          <Button
            onClick={() => lookup.mutate(url)}
            loading={lookup.isPending}
            disabled={!url.trim()}
          >
            Найти
          </Button>
        )}
      </Group>

      {video && (
        <>
          <Text size="sm" c="dimmed">
            {video.title} · {video.channelTitle ?? 'канал неизвестен'}
          </Text>
          <YouTubePreview ref={preview} videoId={video.externalId} startSec={start ?? 0} />

          <Card withBorder>
            <Stack>
              <Group grow align="flex-start">
                <Stack gap={4}>
                  <TextInput
                    label="Начало"
                    value={startText}
                    onChange={(e) => setStartText(e.currentTarget.value)}
                  />
                  <Button
                    size="compact-xs"
                    variant="light"
                    onClick={() => setFromPlayer(setStartText)}
                  >
                    = текущий момент
                  </Button>
                </Stack>
                <Stack gap={4}>
                  <TextInput
                    label="Конец"
                    value={endText}
                    onChange={(e) => setEndText(e.currentTarget.value)}
                    error={rangeError}
                  />
                  <Button
                    size="compact-xs"
                    variant="light"
                    onClick={() => setFromPlayer(setEndText)}
                  >
                    = текущий момент
                  </Button>
                </Stack>
              </Group>
              <Group>
                <Button
                  variant="default"
                  disabled={Boolean(rangeError)}
                  onClick={() => preview.current?.playRange(start!, end!)}
                >
                  ▶ Проверить фрагмент
                </Button>
                {len !== null && !rangeError && (
                  <Text size="sm">Длительность: {formatTime(len)}</Text>
                )}
              </Group>
            </Stack>
          </Card>

          <TextInput
            label="Название для себя"
            description="Ребёнок его не видит"
            value={title}
            onChange={(e) => setTitle(e.currentTarget.value)}
            maxLength={120}
          />

          <Select
            label="Предмет"
            description="Видео с предметом попадает в уроки по расписанию"
            clearable
            placeholder="без предмета — просто видео"
            value={subject}
            data={GAME_CATEGORIES.map((c) => ({ value: c, label: SUBJECT_LABELS[c] }))}
            onChange={(v) => setSubject((v as GameCategory | null) ?? null)}
          />

          <Checkbox.Group label="Кому показывать" value={childIds} onChange={setChildIds}>
            <Group mt={4}>
              {children.data?.map((c) => (
                <Checkbox key={c.id} value={c.id} label={c.nickname} />
              ))}
            </Group>
          </Checkbox.Group>

          <Group>
            <Button
              onClick={() => save.mutate()}
              loading={save.isPending}
              disabled={Boolean(rangeError) || !title.trim()}
            >
              Сохранить
            </Button>
            <Button variant="subtle" onClick={() => navigate('/videos')}>
              Отмена
            </Button>
          </Group>
        </>
      )}

      {existing && <QuestionsEditor segmentId={existing.id} />}
      {!existing && video && (
        <Text size="sm" c="dimmed">
          Вопросы к видео можно добавить после сохранения фрагмента.
        </Text>
      )}
    </Stack>
  );
}
