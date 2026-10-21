import {
  LANGUAGES,
  type Language,
  type ExplanationDraft,
  type MediaRef,
  type Question,
  type QuestionInput,
} from '@kidsplus/shared/api';
import {
  ActionIcon,
  Badge,
  Button,
  Card,
  Group,
  Image,
  Radio,
  SegmentedControl,
  Stack,
  Text,
  Textarea,
  TextInput,
  Title,
} from '@mantine/core';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../api';
import { LANGUAGE_LABELS } from '../lib/child';
import { modals } from '../lib/modals';
import { keys, queryClient, useQuestions } from '../queries';
import { AudioStatus } from './AudioStatus';
import { ImageSlot } from './ImagePicker';

interface DraftOption {
  image: MediaRef | null;
  label: string;
}

interface Draft {
  prompt: string;
  lang: Language;
  options: DraftOption[];
  correct: number;
  explanation: string;
}

/** Сколько ждать предложения модели (worker опрашивает очередь раз в несколько секунд). */
const SUGGEST_WAIT_MS = 60_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * «Предложить пояснение» (этап 39): в очередь worker'у уходят вопрос и подписи вариантов,
 * кабинет ждёт ответа. Ребёнку звучит только то, что родитель сохранит.
 */
async function suggestExplanation(d: Draft): Promise<string> {
  const draft = await api.post<ExplanationDraft>('/parent/explanation-drafts', {
    prompt: d.prompt,
    correct: d.options[d.correct]!.label,
    wrong: d.options.filter((_, i) => i !== d.correct).map((o) => o.label),
  });
  for (const until = Date.now() + SUGGEST_WAIT_MS; Date.now() < until;) {
    await sleep(1500);
    const r = await api.get<ExplanationDraft>(`/parent/explanation-drafts/${draft.id}`);
    if (r.status === 'ready' && r.explanation) return r.explanation;
    if (r.status === 'failed') break;
  }
  throw new Error('Не получилось — напишите пояснение сами.');
}

const emptyDraft = (): Draft => ({
  prompt: '',
  lang: 'ru',
  options: [
    { image: null, label: '' },
    { image: null, label: '' },
  ],
  correct: 0,
  explanation: '',
});

const fromQuestion = (q: Question): Draft => ({
  prompt: q.prompt,
  lang: q.lang,
  options: q.options.map((o) => ({ image: o.image, label: o.label })),
  correct: Math.max(
    0,
    q.options.findIndex((o) => o.isCorrect),
  ),
  explanation: q.explanation ?? '',
});

/** Вопросы квиза к фрагменту: озвучиваемый текст и 2–4 картинки, одна верная. */
export function QuestionsEditor({ segmentId }: { segmentId: string }) {
  const questions = useQuestions(segmentId);
  const [editing, setEditing] = useState<{ id: string | null; draft: Draft } | null>(null);
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: keys.questions(segmentId) });
    void queryClient.invalidateQueries({ queryKey: keys.segments });
  };

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/parent/questions/${id}`),
    onSuccess: invalidate,
  });

  return (
    <Stack>
      <Group justify="space-between">
        <Title order={3}>Вопросы после видео</Title>
        {!editing && (
          <Button variant="light" onClick={() => setEditing({ id: null, draft: emptyDraft() })}>
            Добавить вопрос
          </Button>
        )}
      </Group>
      <Text size="sm" c="dimmed">
        После фрагмента ребёнок отвечает на вопросы: слушает вопрос и нажимает на верную картинку.
        Малышам показывается 2 варианта, старшим — до 4 (настраивается в профиле ребёнка).
      </Text>

      {questions.data?.length === 0 && !editing && <Text c="dimmed">Вопросов пока нет.</Text>}

      {questions.data?.map((q) =>
        editing?.id === q.id ? null : (
          <Card key={q.id} withBorder padding="sm">
            <Group justify="space-between" wrap="nowrap" align="flex-start">
              <Stack gap={6} style={{ flex: 1 }}>
                <Group gap="xs">
                  <Text fw={600}>{q.prompt}</Text>
                  {q.lang !== 'ru' && <Badge variant="light">{LANGUAGE_LABELS[q.lang]}</Badge>}
                  <AudioStatus audio={q.audio} text={q.prompt} lang={q.lang} />
                </Group>
                <Group gap="xs">
                  {q.options.map((o) => (
                    <Stack key={o.id} gap={2} align="center">
                      <Image
                        src={o.image.url}
                        alt={o.label}
                        w={48}
                        h={48}
                        fit="contain"
                        style={{
                          outline: o.isCorrect
                            ? '3px solid var(--mantine-color-green-6)'
                            : undefined,
                          borderRadius: 6,
                        }}
                      />
                      <Text size="xs" c={o.isCorrect ? 'green' : 'dimmed'}>
                        {o.label}
                      </Text>
                    </Stack>
                  ))}
                </Group>
                {q.explanation && (
                  <Text size="sm" c="dimmed" data-testid="question-explanation">
                    Пояснение: {q.explanation}
                  </Text>
                )}
              </Stack>
              <Group gap={4}>
                <Button
                  size="compact-sm"
                  variant="default"
                  onClick={() => setEditing({ id: q.id, draft: fromQuestion(q) })}
                >
                  Изменить
                </Button>
                <Button
                  size="compact-sm"
                  variant="subtle"
                  color="red"
                  onClick={() =>
                    modals.confirm({
                      title: 'Удалить вопрос?',
                      message: q.prompt,
                      confirmLabel: 'Удалить',
                      onConfirm: () => remove.mutate(q.id),
                    })
                  }
                >
                  Удалить
                </Button>
              </Group>
            </Group>
          </Card>
        ),
      )}

      {editing && (
        <QuestionForm
          segmentId={segmentId}
          questionId={editing.id}
          initial={editing.draft}
          onDone={() => {
            setEditing(null);
            invalidate();
          }}
          onCancel={() => setEditing(null)}
        />
      )}
    </Stack>
  );
}

function QuestionForm(props: {
  segmentId: string;
  questionId: string | null;
  initial: Draft;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [d, setD] = useState<Draft>(props.initial);
  const setOption = (i: number, patch: Partial<DraftOption>) =>
    setD((s) => ({ ...s, options: s.options.map((o, j) => (j === i ? { ...o, ...patch } : o)) }));

  const ready = d.prompt.trim() && d.options.every((o) => o.image && o.label.trim());
  const canSuggest = Boolean(d.prompt.trim() && d.options.every((o) => o.label.trim()));
  const suggest = useMutation({
    mutationFn: () => suggestExplanation(d),
    onSuccess: (explanation) => setD((s) => ({ ...s, explanation })),
  });

  const save = useMutation({
    mutationFn: () => {
      const body: QuestionInput = {
        prompt: d.prompt,
        lang: d.lang,
        options: d.options.map((o, i) => ({
          imageId: o.image!.id,
          label: o.label,
          isCorrect: i === d.correct,
        })),
        explanation: d.explanation,
      };
      return props.questionId
        ? api.put<Question>(`/parent/questions/${props.questionId}`, body)
        : api.post<Question>(`/parent/segments/${props.segmentId}/questions`, body);
    },
    onSuccess: props.onDone,
  });

  return (
    <Card withBorder>
      <Stack>
        <TextInput
          label="Вопрос (будет озвучен)"
          placeholder="Где кошка?"
          value={d.prompt}
          maxLength={200}
          onChange={(e) => setD({ ...d, prompt: e.currentTarget.value })}
        />
        <SegmentedControl
          value={d.lang}
          onChange={(v) => setD({ ...d, lang: v as Language })}
          data={LANGUAGES.map((l) => ({ value: l, label: LANGUAGE_LABELS[l]! }))}
        />
        <Radio.Group
          label="Варианты: отметьте верный"
          value={String(d.correct)}
          onChange={(v) => setD({ ...d, correct: Number(v) })}
        >
          <Stack gap="sm" mt="xs">
            {d.options.map((o, i) => (
              <Group key={i} wrap="nowrap">
                <Radio value={String(i)} aria-label="верный вариант" />
                <ImageSlot
                  image={o.image}
                  hint={o.label}
                  onPick={(image) => setOption(i, { image })}
                  size={64}
                />
                <TextInput
                  style={{ flex: 1 }}
                  placeholder="подпись: кошка"
                  value={o.label}
                  maxLength={60}
                  onChange={(e) => setOption(i, { label: e.currentTarget.value })}
                />
                {d.options.length > 2 && (
                  <ActionIcon
                    variant="subtle"
                    color="red"
                    aria-label="Убрать вариант"
                    onClick={() =>
                      setD((s) => ({
                        ...s,
                        options: s.options.filter((_, j) => j !== i),
                        correct: s.correct === i ? 0 : s.correct > i ? s.correct - 1 : s.correct,
                      }))
                    }
                  >
                    ✕
                  </ActionIcon>
                )}
              </Group>
            ))}
          </Stack>
        </Radio.Group>
        {d.options.length < 4 && (
          <Button
            variant="subtle"
            w="fit-content"
            onClick={() =>
              setD((s) => ({ ...s, options: [...s.options, { image: null, label: '' }] }))
            }
          >
            + вариант
          </Button>
        )}
        <Textarea
          label="Пояснение (необязательно)"
          description={
            d.lang === 'ru'
              ? 'После верного ответа совёнок скажет «Это <подпись верного варианта>» и это пояснение.'
              : 'После верного ответа совёнок скажет это пояснение.'
          }
          placeholder="Кошка говорит «мяу» и ловит мышей."
          autosize
          minRows={2}
          maxLength={200}
          value={d.explanation}
          onChange={(e) => setD({ ...d, explanation: e.currentTarget.value })}
          error={suggest.error?.message}
        />
        <Button
          variant="light"
          w="fit-content"
          size="compact-sm"
          leftSection="✨"
          onClick={() => suggest.mutate()}
          loading={suggest.isPending}
          disabled={!canSuggest}
          title={canSuggest ? undefined : 'Сначала вопрос и подписи вариантов'}
        >
          Предложить пояснение
        </Button>
        <Text size="xs" c="dimmed">
          Если в профиле ребёнка 2 варианта, а здесь 4, — ребёнку покажется верный и один случайный
          неверный.
        </Text>
        <Group>
          <Button onClick={() => save.mutate()} loading={save.isPending} disabled={!ready}>
            Сохранить вопрос
          </Button>
          <Button variant="subtle" onClick={props.onCancel}>
            Отмена
          </Button>
        </Group>
      </Stack>
    </Card>
  );
}
