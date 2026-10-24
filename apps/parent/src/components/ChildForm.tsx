// Профиль ребёнка — форма и окно (этап 47: открываются и из «Детей», и со страницы ребёнка).
import {
  LANGUAGES,
  quizDefaults,
  type Child,
  type ChildInput,
  type RepeatMode,
} from '@kidsplus/shared/api';
import {
  Button,
  Checkbox,
  Group,
  Modal,
  NumberInput,
  SegmentedControl,
  Select,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { useMutation } from '@tanstack/react-query';
import { api } from '../api';
import { LANGUAGE_LABELS, MONTHS } from '../lib/child';
import { modals } from '../lib/modals';
import { keys, queryClient } from '../queries';

const invalidate = () => {
  void queryClient.invalidateQueries({ queryKey: keys.children });
  void queryClient.invalidateQueries({ queryKey: keys.segments });
  void queryClient.invalidateQueries({ queryKey: keys.devices });
};

/** Окно профиля: 'new' — новый ребёнок, null — закрыто. */
export function ChildFormModal({
  editing,
  onClose,
}: {
  editing: Child | 'new' | null;
  onClose: () => void;
}) {
  return (
    <Modal
      opened={editing !== null}
      onClose={onClose}
      title={editing === 'new' ? 'Новый профиль' : 'Профиль ребёнка'}
    >
      {editing !== null && (
        <ChildForm child={editing === 'new' ? null : editing} onDone={onClose} />
      )}
    </Modal>
  );
}

/** «Удалить профиль?» — после удаления onDone (например, вернуться к списку детей). */
export function useRemoveChild(onDone?: () => void) {
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/parent/children/${id}`),
    onSuccess: () => {
      invalidate();
      onDone?.();
    },
  });
  return (child: Child) =>
    modals.confirm({
      title: `Удалить профиль «${child.nickname}»?`,
      message: 'Удалятся привязанные устройства, список видео и вся статистика этого ребёнка.',
      confirmLabel: 'Удалить',
      onConfirm: () => remove.mutate(child.id),
    });
}

export function ChildForm({ child, onDone }: { child: Child | null; onDone: () => void }) {
  const now = new Date();
  const form = useForm<ChildInput>({
    initialValues: child
      ? {
          nickname: child.nickname,
          birthYear: child.birthYear,
          birthMonth: child.birthMonth,
          gender: child.gender,
          languages: child.languages,
          quizOptions: child.quizOptions,
          quizQuestions: child.quizQuestions,
          foreignImmersion: child.foreignImmersion,
          illustrations: child.illustrations,
          repeatMode: child.repeatMode,
        }
      : {
          nickname: '',
          birthYear: now.getFullYear() - 3,
          birthMonth: 1,
          gender: 'f',
          languages: ['ru'],
          quizOptions: null,
          quizQuestions: null,
          foreignImmersion: false,
          illustrations: true,
          repeatMode: 'weekly',
        },
    validate: {
      nickname: (v) => (v.trim() ? null : 'укажите прозвище'),
      languages: (v) => (v.length ? null : 'выберите хотя бы один язык'),
    },
  });

  const save = useMutation({
    mutationFn: (v: ChildInput) =>
      child
        ? api.put<Child>(`/parent/children/${child.id}`, v)
        : api.post<Child>('/parent/children', v),
    onSuccess: () => {
      invalidate();
      onDone();
    },
  });

  return (
    <form onSubmit={form.onSubmit((v) => save.mutate(v))}>
      <Stack>
        <TextInput
          label="Прозвище"
          description="Не настоящее имя: оно не хранится в системе"
          maxLength={30}
          required
          {...form.getInputProps('nickname')}
        />
        <Group grow>
          <Select
            label="Месяц рождения"
            data={MONTHS.map((m, i) => ({ value: String(i + 1), label: m }))}
            value={String(form.values.birthMonth)}
            onChange={(v) => form.setFieldValue('birthMonth', Number(v ?? 1))}
            allowDeselect={false}
          />
          <NumberInput
            label="Год"
            min={2015}
            max={now.getFullYear()}
            {...form.getInputProps('birthYear')}
          />
        </Group>
        <div>
          <Text size="sm" fw={500} mb={4}>
            Как обращаться в озвучке
          </Text>
          <SegmentedControl
            fullWidth
            data={[
              { value: 'f', label: '«ты справилась»' },
              { value: 'm', label: '«ты справился»' },
            ]}
            {...form.getInputProps('gender')}
          />
        </div>
        <Checkbox.Group label="Языки" {...form.getInputProps('languages')}>
          <Group mt={4}>
            {LANGUAGES.map((l) => (
              <Checkbox key={l} value={l} label={LANGUAGE_LABELS[l]} />
            ))}
          </Group>
        </Checkbox.Group>
        <Checkbox
          label="Карточки на иностранном — без перевода (погружение)"
          description="Слово, проверочные вопросы и похвала звучат только на языке набора"
          checked={form.values.foreignImmersion ?? false}
          onChange={(e) => form.setFieldValue('foreignImmersion', e.currentTarget.checked)}
        />
        <Checkbox
          label="Объёмные картинки вместо эмодзи"
          description="Авторские иллюстрации KidsPlus в карточках и вопросах — там, где они готовы"
          checked={form.values.illustrations ?? false}
          onChange={(e) => form.setFieldValue('illustrations', e.currentTarget.checked)}
        />
        <IllustrationSample />
        <Select
          label="Повторять пройденное"
          description="Пройденное сегодня отдыхает до завтра; пройденное 3 раза — «выучено»"
          value={form.values.repeatMode ?? 'weekly'}
          allowDeselect={false}
          onChange={(v) => form.setFieldValue('repeatMode', (v ?? 'weekly') as RepeatMode)}
          data={[
            { value: 'weekly', label: 'Выученное — раз в неделю' },
            { value: 'never', label: 'Выученное — больше не предлагать' },
            { value: 'free', label: 'Без ограничений' },
          ]}
        />
        <QuizSettingsFields
          birthYear={form.values.birthYear}
          birthMonth={form.values.birthMonth}
          options={form.values.quizOptions ?? null}
          questions={form.values.quizQuestions ?? null}
          onOptions={(v) => form.setFieldValue('quizOptions', v)}
          onQuestions={(v) => form.setFieldValue('quizQuestions', v)}
        />
        <Button type="submit" loading={save.isPending}>
          Сохранить
        </Button>
      </Stack>
    </form>
  );
}

/** Настройки квиза: «авто» — по возрасту (п. 5.4 ТЗ), иначе явное значение. */
function QuizSettingsFields(p: {
  birthYear: number;
  birthMonth: number;
  options: number | null;
  questions: number | null;
  onOptions: (v: number | null) => void;
  onQuestions: (v: number | null) => void;
}) {
  const auto = quizDefaults({ birthYear: p.birthYear, birthMonth: p.birthMonth });
  return (
    <Stack gap="xs">
      <Text size="sm" fw={500}>
        Квиз
      </Text>
      <div>
        <Text size="xs" c="dimmed" mb={4}>
          Картинок на экране
        </Text>
        <SegmentedControl
          fullWidth
          value={p.options === null ? 'auto' : String(p.options)}
          onChange={(v) => p.onOptions(v === 'auto' ? null : Number(v))}
          data={[
            { value: 'auto', label: `авто (${auto.options})` },
            { value: '2', label: '2' },
            { value: '3', label: '3' },
            { value: '4', label: '4' },
          ]}
        />
      </div>
      <div>
        <Text size="xs" c="dimmed" mb={4}>
          Верных ответов до следующего видео
        </Text>
        <Group gap="xs" wrap="nowrap">
          <Checkbox
            label={`авто (${auto.questions})`}
            checked={p.questions === null}
            onChange={(e) => p.onQuestions(e.currentTarget.checked ? null : auto.questions)}
          />
          <NumberInput
            min={1}
            max={10}
            w={80}
            disabled={p.questions === null}
            value={p.questions ?? auto.questions}
            onChange={(v) => p.onQuestions(typeof v === 'number' ? v : auto.questions)}
          />
        </Group>
      </div>
    </Stack>
  );
}

/** Как выглядят авторские картинки (файлы — public/illustrations). */
function IllustrationSample() {
  return (
    <Group gap={6} wrap="nowrap" aria-hidden="true">
      {[1, 2, 3, 4].map((n) => (
        <img
          key={n}
          src={`/illustrations/sample-${n}.webp`}
          alt=""
          width={56}
          height={56}
          style={{ borderRadius: 12, background: 'var(--mantine-color-default-hover)' }}
        />
      ))}
    </Group>
  );
}
