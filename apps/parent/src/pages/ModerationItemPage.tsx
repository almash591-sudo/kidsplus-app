import type { MediaRef } from '@kidsplus/shared/api';
import type { ModerationApproveRequest, ModerationItem } from '@kidsplus/shared/moderation';
import { formatTime, parseTime } from '@kidsplus/shared/time';
import {
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  Group,
  Loader,
  Radio,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { api } from '../api';
import { ImageSlot } from '../components/ImagePicker';
import { YouTubePreview, type YouTubePreviewHandle } from '../components/YouTubePreview';
import { buildApproval, draftToEdit, type EditSegment } from '../lib/moderation';
import { modals } from '../lib/modals';
import { keys, queryClient, useChildren } from '../queries';
import { RECOMMENDATION, STATUS_LABELS } from './ModerationPage';

const FIT = { good: '✅ подходит', ok: '🟡 с оговорками', bad: '⛔ не подходит' } as const;
const FLAG_LABELS: Record<string, string> = {
  scary: 'пугающее',
  violence: 'насилие',
  bad_language: 'грубая лексика',
  ads_unboxing: 'реклама / распаковки',
  clickbait: 'кликбейт',
  overstimulation: 'гиперстимуляция',
  factual_error: 'ошибка в материале',
  bad_pronunciation: 'произношение',
  other: 'другое',
};

const toEdit = draftToEdit;

export function ModerationItemPage() {
  const { id } = useParams();
  const item = useQuery({
    queryKey: [...keys.moderation, id],
    queryFn: () => api.get<ModerationItem>(`/parent/moderation/${id}`),
    refetchInterval: (q) =>
      q.state.data?.status === 'queued' || q.state.data?.status === 'processing' ? 10_000 : false,
  });
  if (item.isPending) return <Loader />;
  if (!item.data) return <Alert color="red">Видео не найдено.</Alert>;
  return <Review key={`${item.data.id}-${item.data.status}`} item={item.data} />;
}

function Review({ item }: { item: ModerationItem }) {
  const children = useChildren();
  const navigate = useNavigate();
  const preview = useRef<YouTubePreviewHandle>(null);
  const r = item.report;
  const [segments, setSegments] = useState<EditSegment[]>(() => r?.segments.map(toEdit) ?? []);
  const [childIds, setChildIds] = useState<string[]>([]);
  const decided = item.status === 'approved' || item.status === 'rejected';
  const busy = item.status === 'queued' || item.status === 'processing';

  const done = (message: string) => {
    void queryClient.invalidateQueries({ queryKey: keys.moderation });
    void queryClient.invalidateQueries({ queryKey: ['child-items'] });
    void queryClient.invalidateQueries({ queryKey: keys.segments });
    notifications.show({ color: 'green', message });
  };
  const approval = buildApproval(segments, childIds);
  const approve = useMutation({
    mutationFn: (body: ModerationApproveRequest) =>
      api.post(`/parent/moderation/${item.id}/approve`, body),
    onSuccess: () => {
      done('Одобрено: фрагменты и вопросы добавлены');
      navigate('/moderation');
    },
  });
  const action = useMutation({
    mutationFn: (kind: 'reject' | 'retry') => api.post(`/parent/moderation/${item.id}/${kind}`, {}),
    onSuccess: (_d, kind) => done(kind === 'reject' ? 'Отклонено' : 'Отправлено на анализ'),
  });

  const update = (i: number, s: Partial<EditSegment>) =>
    setSegments((all) => all.map((x, k) => (k === i ? { ...x, ...s } : x)));

  return (
    <Stack maw={900}>
      <div>
        <Title order={2}>{item.title ?? 'Видео'}</Title>
        <Text c="dimmed" size="sm">
          {[
            item.channelTitle,
            item.durationSec ? formatTime(item.durationSec) : null,
            STATUS_LABELS[item.status],
          ]
            .filter(Boolean)
            .join(' · ')}
          {item.topic ? ` · тема: ${item.topic}` : ''}
        </Text>
      </div>
      <YouTubePreview ref={preview} videoId={item.externalId} startSec={0} />
      {busy && <Alert color="blue">ИИ смотрит видео — отчёт появится через несколько минут.</Alert>}
      {item.skipReason && <Alert color="gray">Отсеяно: {item.skipReason}</Alert>}
      {item.error && <Alert color="red">Ошибка анализа: {item.error}</Alert>}

      {r && (
        <Card withBorder>
          <Stack gap="xs">
            <Group gap="xs">
              <Badge color={RECOMMENDATION[r.recommendation]!.color} size="lg">
                {RECOMMENDATION[r.recommendation]!.label}
              </Badge>
              <Badge variant="outline">польза: {r.educationalValue.score} из 5</Badge>
            </Group>
            <Text>{r.summary}</Text>
            <Text size="sm" c="dimmed">
              {r.educationalValue.note}
            </Text>
            <Table>
              <Table.Tbody>
                {r.ages.map((a) => (
                  <Table.Tr key={a.age}>
                    <Table.Td w={90}>{a.age} лет</Table.Td>
                    <Table.Td w={150}>{FIT[a.fit]}</Table.Td>
                    <Table.Td>{a.note}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
            <Text fw={600}>Тревожные моменты</Text>
            {r.redFlags.length === 0 && (
              <Text size="sm">ИИ ничего не нашёл. Видеоряд всё равно проверьте сами.</Text>
            )}
            {r.redFlags.map((f, i) => {
              const at = f.at ? parseTime(f.at) : null;
              return (
                <Group key={i} gap="xs" align="flex-start">
                  <Badge
                    color={
                      f.severity === 'high' ? 'red' : f.severity === 'medium' ? 'orange' : 'yellow'
                    }
                  >
                    {FLAG_LABELS[f.type] ?? f.type}
                  </Badge>
                  {at !== null && (
                    <Button
                      size="compact-xs"
                      variant="light"
                      onClick={() => preview.current?.playRange(Math.max(0, at - 3), at + 15)}
                    >
                      {f.at}
                    </Button>
                  )}
                  <Text size="sm">{f.note}</Text>
                </Group>
              );
            })}
          </Stack>
        </Card>
      )}

      {!decided && !busy && (
        <>
          <Title order={3}>Фрагменты и вопросы</Title>
          <Text size="sm" c="dimmed">
            Проверьте каждый фрагмент в плеере, поправьте время и вопросы. Вариант без картинки в
            квиз не попадёт — выберите картинку сами.
          </Text>
          {segments.map((s, i) => (
            <SegmentEditor
              key={i}
              segment={s}
              durationSec={item.durationSec}
              onChange={(v) => update(i, v)}
              onPlay={(a, b) => preview.current?.playRange(a, b)}
              onTakeTime={() => preview.current?.currentTime() ?? null}
            />
          ))}
          <Button
            variant="default"
            w="fit-content"
            onClick={() =>
              setSegments((all) => [
                ...all,
                {
                  include: true,
                  title: 'Фрагмент',
                  startText: '0:00',
                  endText: '2:00',
                  note: '',
                  questions: [],
                },
              ])
            }
          >
            + Фрагмент вручную
          </Button>

          <Checkbox.Group label="Кому показывать" value={childIds} onChange={setChildIds}>
            <Group mt={4}>
              {children.data?.map((c) => (
                <Checkbox key={c.id} value={c.id} label={c.nickname} />
              ))}
            </Group>
          </Checkbox.Group>
          {approval.problem && (
            <Text c="dimmed" size="sm">
              {approval.problem}
            </Text>
          )}
          {approve.error && <Alert color="red">{approve.error.message}</Alert>}
          <Group>
            <Button
              color="green"
              disabled={!approval.body}
              loading={approve.isPending}
              onClick={() => approval.body && approve.mutate(approval.body)}
            >
              Одобрить
            </Button>
            <Button
              variant="subtle"
              color="red"
              onClick={() =>
                modals.confirm({
                  title: 'Отклонить видео?',
                  message: 'Оно не попадёт к детям. Позже его можно вернуть в очередь.',
                  confirmLabel: 'Отклонить',
                  onConfirm: () => action.mutate('reject'),
                })
              }
            >
              Отклонить
            </Button>
            {(item.status === 'failed' || item.status === 'skipped' || item.status === 'ready') && (
              <Button
                variant="default"
                onClick={() => action.mutate('retry')}
                loading={action.isPending}
              >
                Проанализировать заново
              </Button>
            )}
          </Group>
        </>
      )}
      {item.status === 'rejected' && (
        <Button variant="default" w="fit-content" onClick={() => action.mutate('retry')}>
          Вернуть в очередь
        </Button>
      )}
    </Stack>
  );
}

function SegmentEditor(props: {
  segment: EditSegment;
  durationSec: number | null;
  onChange: (s: Partial<EditSegment>) => void;
  onPlay: (start: number, end: number) => void;
  onTakeTime: () => number | null;
}) {
  const { segment: s, onChange } = props;
  const start = parseTime(s.startText);
  const end = parseTime(s.endText);
  const take = (field: 'startText' | 'endText') => {
    const t = props.onTakeTime();
    if (t !== null) onChange({ [field]: formatTime(Math.floor(t)) });
  };
  const setQuestion = (qi: number, q: Partial<EditSegment['questions'][number]>) =>
    onChange({ questions: s.questions.map((x, k) => (k === qi ? { ...x, ...q } : x)) });

  return (
    <Card withBorder opacity={s.include ? 1 : 0.55}>
      <Stack gap="xs">
        <Group justify="space-between">
          <Checkbox
            label={<Text fw={600}>Взять фрагмент</Text>}
            checked={s.include}
            onChange={(e) => onChange({ include: e.currentTarget.checked })}
          />
          <Button
            size="compact-sm"
            variant="light"
            disabled={start === null || end === null}
            onClick={() => start !== null && end !== null && props.onPlay(start, end)}
          >
            ▶ Проверить в плеере
          </Button>
        </Group>
        {s.note && (
          <Text size="sm" c="dimmed">
            {s.note}
          </Text>
        )}
        <TextInput
          label="Название (видите только вы)"
          value={s.title}
          maxLength={120}
          onChange={(e) => onChange({ title: e.currentTarget.value })}
        />
        <Group align="flex-end">
          <TextInput
            label="Начало"
            w={110}
            value={s.startText}
            onChange={(e) => onChange({ startText: e.currentTarget.value })}
          />
          <Button size="compact-sm" variant="subtle" onClick={() => take('startText')}>
            ← из плеера
          </Button>
          <TextInput
            label="Конец"
            w={110}
            value={s.endText}
            onChange={(e) => onChange({ endText: e.currentTarget.value })}
          />
          <Button size="compact-sm" variant="subtle" onClick={() => take('endText')}>
            ← из плеера
          </Button>
        </Group>

        {s.questions.map((q, qi) => (
          <Card key={qi} withBorder padding="xs" opacity={q.include ? 1 : 0.55}>
            <Stack gap={6}>
              <Group wrap="nowrap">
                <Checkbox
                  checked={q.include}
                  onChange={(e) => setQuestion(qi, { include: e.currentTarget.checked })}
                  aria-label="Взять вопрос"
                />
                <TextInput
                  style={{ flex: 1 }}
                  value={q.prompt}
                  maxLength={200}
                  onChange={(e) => setQuestion(qi, { prompt: e.currentTarget.value })}
                />
                <Badge variant="outline">{q.lang}</Badge>
              </Group>
              <Radio.Group
                value={String(q.options.findIndex((o) => o.correct))}
                onChange={(v) =>
                  setQuestion(qi, {
                    options: q.options.map((o, k) => ({ ...o, correct: String(k) === v })),
                  })
                }
              >
                <Group gap="sm" align="flex-start">
                  {q.options.map((o, oi) => (
                    <Stack key={oi} gap={2} align="center" w={110}>
                      <ImageSlot
                        image={o.image}
                        hint={o.label}
                        size={72}
                        onPick={(img: MediaRef) =>
                          setQuestion(qi, {
                            options: q.options.map((x, k) => (k === oi ? { ...x, image: img } : x)),
                          })
                        }
                      />
                      <Text size="xs" ta="center" lineClamp={2} title={o.picture}>
                        {o.label}
                      </Text>
                      <Radio value={String(oi)} label="верный" size="xs" />
                    </Stack>
                  ))}
                </Group>
              </Radio.Group>
            </Stack>
          </Card>
        ))}
        {props.durationSec && end !== null && end > props.durationSec && (
          <Text c="red" size="sm">
            Конец позже конца видео ({formatTime(props.durationSec)}).
          </Text>
        )}
      </Stack>
    </Card>
  );
}
