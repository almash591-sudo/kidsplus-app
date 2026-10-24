import type { GameCategory } from '@kidsplus/shared/api';
import {
  daySubjects,
  DEFAULT_SCHEDULE,
  planWeek,
  SUBJECTS,
  WEEKDAYS,
  type Curriculum,
  type CurriculumDraft,
  type CurriculumInput,
  type Schedule,
  type Subject,
  type TopicInput,
  type TopicItem,
  type Weekday,
} from '@kidsplus/shared/schedule';
import {
  Accordion,
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  Chip,
  Drawer,
  Group,
  MultiSelect,
  NumberInput,
  Select,
  Stack,
  Switch,
  Text,
  TextInput,
  Title,
  UnstyledButton,
} from '@mantine/core';
import type { CurriculumFillResult } from '@kidsplus/shared/plan-fill';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../api';
import { modals } from '../lib/modals';
import { SUBJECT_LABELS } from '../lib/subjects';
import {
  keys,
  queryClient,
  useCurricula,
  useDecks,
  useGames,
  useSchedule,
  useSegments,
} from '../queries';
import { KidSwitch } from '../components/KidSwitch';
import { useCurrentChild } from '../lib/currentChild';

const DAY_LABELS: Record<Weekday, string> = {
  mon: 'Понедельник',
  tue: 'Вторник',
  wed: 'Среда',
  thu: 'Четверг',
  fri: 'Пятница',
  sat: 'Суббота',
  sun: 'Воскресенье',
};

const TIMEZONES = [
  'Europe/Kaliningrad',
  'Europe/Moscow',
  'Europe/Samara',
  'Asia/Yekaterinburg',
  'Asia/Almaty',
  'Asia/Novosibirsk',
  'Asia/Krasnoyarsk',
  'Asia/Irkutsk',
  'Asia/Vladivostok',
  'Asia/Bishkek',
  'Asia/Tashkent',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
];

/** Сегодня в формате ГГГГ-ММ-ДД (по часам телефона родителя). */
const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// ─── Расписание ──────────────────────────────────────────────────────────────

function ScheduleForm({
  childId,
  initial,
  onSaved,
}: {
  childId: string;
  initial: Schedule;
  onSaved?: () => void;
}) {
  const [v, setV] = useState<Schedule>(initial);
  const save = useMutation({
    mutationFn: () => api.put<Schedule>(`/parent/children/${childId}/schedule`, v),
    onSuccess: (data) => {
      queryClient.setQueryData(keys.schedule(childId), data);
      void queryClient.invalidateQueries({ queryKey: keys.now(childId) });
      onSaved?.();
    },
  });
  const setDay = (d: Weekday, w: Schedule['windows'][Weekday]) =>
    setV({ ...v, windows: { ...v.windows, [d]: w } });
  const total = v.subjectsPerDay * v.minutesPerSubject + v.freeMinutes;

  return (
    <Card withBorder padding="md">
      <Stack gap="sm">
        <Group justify="space-between">
          <Title order={3}>Расписание дня</Title>
          <Switch
            label="Включено"
            checked={v.enabled}
            onChange={(e) => setV({ ...v, enabled: e.currentTarget.checked })}
          />
        </Group>
        {!v.enabled && (
          <Text size="sm" c="dimmed">
            Пока выключено, ребёнок выбирает разделы сам и занимается без ограничений.
          </Text>
        )}
        <Group grow align="flex-end">
          <NumberInput
            label="Предметов в день"
            min={1}
            max={5}
            value={v.subjectsPerDay}
            onChange={(n) => setV({ ...v, subjectsPerDay: Number(n) || 1 })}
          />
          <NumberInput
            label="Минут на предмет"
            min={5}
            max={60}
            value={v.minutesPerSubject}
            onChange={(n) => setV({ ...v, minutesPerSubject: Number(n) || 5 })}
          />
          <NumberInput
            label="Свободное время, мин"
            min={0}
            max={120}
            value={v.freeMinutes}
            onChange={(n) => setV({ ...v, freeMinutes: Number(n) || 0 })}
          />
        </Group>
        <Text size="sm" c="dimmed">
          Всего в день — до {total} минут: уроки, потом свободное время (разделы на выбор).
        </Text>
        <Select
          label="Часовой пояс"
          allowDeselect={false}
          value={v.timezone}
          data={[
            ...new Set([
              v.timezone,
              Intl.DateTimeFormat().resolvedOptions().timeZone,
              ...TIMEZONES,
            ]),
          ]}
          onChange={(tz) => tz && setV({ ...v, timezone: tz })}
        />
        <Stack gap={6}>
          <Text size="sm" fw={500}>
            Когда можно заниматься
          </Text>
          {WEEKDAYS.map((d) => {
            const w = v.windows[d];
            return (
              <Group key={d} gap="xs" wrap="nowrap">
                <Checkbox
                  w={150}
                  label={DAY_LABELS[d]}
                  checked={w !== null}
                  onChange={(e) =>
                    setDay(
                      d,
                      e.currentTarget.checked
                        ? (DEFAULT_SCHEDULE.windows[d] ?? { from: '09:00', to: '21:00' })
                        : null,
                    )
                  }
                />
                {w ? (
                  <>
                    <TextInput
                      type="time"
                      aria-label="с"
                      value={w.from}
                      onChange={(e) => setDay(d, { ...w, from: e.currentTarget.value })}
                    />
                    <Text size="sm">—</Text>
                    <TextInput
                      type="time"
                      aria-label="до"
                      value={w.to}
                      onChange={(e) => setDay(d, { ...w, to: e.currentTarget.value })}
                    />
                  </>
                ) : (
                  <Text size="sm" c="dimmed">
                    выходной
                  </Text>
                )}
              </Group>
            );
          })}
        </Stack>
        <Group>
          <Button onClick={() => save.mutate()} loading={save.isPending}>
            Сохранить расписание
          </Button>
          {save.isSuccess && (
            <Text size="sm" c="green">
              Сохранено
            </Text>
          )}
        </Group>
      </Stack>
    </Card>
  );
}

// ─── Учебный план ────────────────────────────────────────────────────────────

/** Материалы раздела: карточки, игры и видео с этим предметом — для выбора в теме. */
function useMaterials() {
  const decks = useDecks();
  const games = useGames();
  const segments = useSegments();
  return (subject: GameCategory) => [
    ...(decks.data ?? [])
      .filter((d) => d.category === subject)
      .map((d) => ({ value: `deck:${d.id}`, label: `🃏 ${d.title}` })),
    ...(games.data ?? [])
      .filter((g) => g.category === subject)
      .map((g) => ({ value: `interactive:${g.id}`, label: `🎨 ${g.title}` })),
    ...(segments.data ?? [])
      .filter((s) => s.subject === subject)
      .map((s) => ({ value: `segment:${s.id}`, label: `🎬 ${s.title}` })),
  ];
}

const itemValue = (i: TopicItem) => `${i.kind}:${i.refId}`;
const toItem = (v: string): TopicItem => {
  const [kind, refId] = v.split(':') as [TopicItem['kind'], string];
  return { kind, refId };
};

/**
 * «Предложить темы»: черновик готовит языковая модель (в неё уходят только возраст ребёнка,
 * предметы и число недель). Готовые темы попадают в пустые клетки плана.
 */
function DraftButton(props: {
  childId: string;
  subjects: Subject[];
  weeks: number;
  onTopics: (topics: CurriculumDraft['topics']) => void;
}) {
  /** Создаёт черновик и ждёт, пока worker его подготовит (опрос раз в 3 с, до 3 минут). */
  const draft = useMutation({
    mutationFn: async () => {
      let d = await api.post<CurriculumDraft>(
        `/parent/children/${props.childId}/curriculum-drafts`,
        { subjects: props.subjects, weeks: Math.min(props.weeks, 26) },
      );
      for (let i = 0; i < 60 && (d.status === 'queued' || d.status === 'processing'); i++) {
        await new Promise((r) => setTimeout(r, 3000));
        d = await api.get<CurriculumDraft>(`/parent/curriculum-drafts/${d.id}`);
      }
      return d;
    },
    onSuccess: (d) => {
      if (d.status === 'ready') props.onTopics(d.topics);
    },
  });
  const d = draft.data;
  const waiting = draft.isPending;

  return (
    <Stack gap={4}>
      <Group>
        <Button
          variant="light"
          onClick={() => draft.mutate()}
          loading={waiting}
          disabled={!props.subjects.length}
        >
          Предложить темы (ИИ)
        </Button>
        <Text size="xs" c="dimmed">
          В модель уходят только возраст, предметы и число недель — без имени.
        </Text>
      </Group>
      {waiting && (
        <Text size="sm" c="dimmed">
          Модель составляет темы, обычно это меньше минуты…
        </Text>
      )}
      {d?.status === 'ready' && (
        <Text size="sm" c="green">
          Предложено тем: {d.topics.length}. Они вписаны в пустые недели — поправьте и сохраните.
        </Text>
      )}
      {d?.status === 'failed' && <Alert color="red">Не получилось: {d.error}</Alert>}
      {d && (d.status === 'queued' || d.status === 'processing') && (
        <Alert color="yellow">
          Модель пока не ответила (нет ключа, закончился баланс или лимит токенов). Попробуйте
          позже.
        </Alert>
      )}
    </Stack>
  );
}

function PlanEditor({
  childId,
  plan,
  onDone,
}: {
  childId: string;
  plan: Curriculum | null;
  onDone: () => void;
}) {
  const [v, setV] = useState<CurriculumInput>(
    plan
      ? {
          ...plan,
          topics: plan.topics.map(({ subject, week, title, items }) => ({
            subject,
            week,
            title,
            items,
          })),
        }
      : {
          title: 'Учебный план',
          startsOn: todayIso(),
          weeks: 13,
          subjects: ['math', 'english', 'nature'],
          topics: [],
        },
  );
  const materials = useMaterials();
  const save = useMutation({
    mutationFn: () =>
      plan
        ? api.put<Curriculum>(`/parent/curricula/${plan.id}`, v)
        : api.post<Curriculum>(`/parent/children/${childId}/curricula`, v),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: keys.curricula(childId) });
      void queryClient.invalidateQueries({ queryKey: keys.now(childId) });
      onDone();
    },
  });
  const topics = v.topics ?? [];
  const topic = (week: number, subject: Subject) =>
    topics.find((t) => t.week === week && t.subject === subject);
  const setTopic = (week: number, subject: Subject, patch: Partial<TopicInput>) => {
    const rest = topics.filter((t) => !(t.week === week && t.subject === subject));
    const cur = topic(week, subject) ?? { week, subject, title: '', items: [] };
    const next = { ...cur, ...patch };
    // Пустая тема без материалов не сохраняется.
    const keep = next.title.trim() || (next.items ?? []).length;
    setV({ ...v, topics: keep ? [...rest, next] : rest });
  };
  // «Заполнить материалами»: сервер раскладывает видео, карточки и игры ребёнка по пустым темам.
  const fill = useMutation({
    mutationFn: (plan: CurriculumInput) =>
      api.post<CurriculumFillResult>(`/parent/children/${childId}/curriculum-fill`, plan),
    onSuccess: (r, plan) => setV({ ...plan, topics: r.topics }),
  });
  const empty = topics.filter((t) => !(t.items ?? []).length).length;
  const current = Math.max(1, planWeek(v.startsOn, todayIso()));
  const incomplete = topics.some((t) => !t.title.trim());

  return (
    <Stack gap="sm">
      <TextInput
        label="Название"
        value={v.title}
        maxLength={120}
        onChange={(e) => setV({ ...v, title: e.currentTarget.value })}
      />
      <Group grow>
        <TextInput
          type="date"
          label="Начало"
          value={v.startsOn}
          onChange={(e) => setV({ ...v, startsOn: e.currentTarget.value })}
        />
        <NumberInput
          label="Недель"
          min={1}
          max={52}
          value={v.weeks}
          onChange={(n) => setV({ ...v, weeks: Number(n) || 1 })}
        />
      </Group>
      <Stack gap={4}>
        <Text size="sm" fw={500}>
          Предметы (каждый день — несколько из них по очереди)
        </Text>
        <Chip.Group
          multiple
          value={v.subjects}
          onChange={(s) => setV({ ...v, subjects: SUBJECTS.filter((x) => s.includes(x)) })}
        >
          <Group gap={6}>
            {SUBJECTS.map((s) => (
              <Chip key={s} value={s} size="sm">
                {SUBJECT_LABELS[s]}
              </Chip>
            ))}
          </Group>
        </Chip.Group>
      </Stack>
      <Text size="sm" c="dimmed">
        Темы по неделям: урок собирается из материалов темы (видео, карточки, игры вперемешку), плюс
        повторение прошлой недели. Неделя без темы — урок из всех материалов раздела ребёнка.
      </Text>
      <DraftButton
        childId={childId}
        subjects={v.subjects}
        weeks={v.weeks}
        onTopics={(drafted) => {
          // Предложения модели заполняют только пустые темы — правки родителя не теряются.
          const have = new Set(topics.map((t) => `${t.week}:${t.subject}`));
          const add = drafted
            .filter((t) => !have.has(`${t.week}:${t.subject}`))
            .map((t) => ({ ...t, items: [] }));
          const next = { ...v, topics: [...topics, ...add] };
          setV(next);
          // Темы сразу с материалами — видео, карточки и задачи вперемешку.
          fill.mutate(next);
        }}
      />
      <Stack gap={4}>
        <Group>
          <Button
            variant="light"
            onClick={() => fill.mutate(v)}
            loading={fill.isPending}
            disabled={!empty}
          >
            Заполнить материалами
          </Button>
          <Text size="xs" c="dimmed">
            {empty
              ? `Пустых тем: ${empty}. Видео, карточки и игры ребёнка разойдутся по неделям.`
              : 'Пустых тем нет.'}
          </Text>
        </Group>
        {fill.isSuccess && (
          <Text size="sm" c={fill.data.added ? 'green' : 'dimmed'}>
            {fill.data.added
              ? `Добавлено материалов: ${fill.data.added}. Проверьте и сохраните план.`
              : 'Подходящих материалов нет — сначала назначьте ребёнку видео, карточки или игры.'}
          </Text>
        )}
        {fill.error && <Alert color="red">{fill.error.message}</Alert>}
      </Stack>
      <Accordion defaultValue={String(Math.min(current, v.weeks))} variant="separated">
        {Array.from({ length: v.weeks }, (_, i) => i + 1).map((week) => {
          const filled = v.subjects.filter((s) => topic(week, s)).length;
          return (
            <Accordion.Item key={week} value={String(week)}>
              <Accordion.Control>
                <Group gap="xs">
                  <Text>Неделя {week}</Text>
                  {week === current && <Badge size="sm">сейчас</Badge>}
                  {filled > 0 && (
                    <Text size="sm" c="dimmed">
                      тем: {filled}
                    </Text>
                  )}
                </Group>
              </Accordion.Control>
              <Accordion.Panel>
                <Stack gap="sm">
                  {v.subjects.map((s) => {
                    const t = topic(week, s);
                    return (
                      <Stack key={s} gap={4}>
                        <Text size="sm" fw={500}>
                          {SUBJECT_LABELS[s]}
                        </Text>
                        <TextInput
                          placeholder="Тема, например «Счёт до 5»"
                          value={t?.title ?? ''}
                          maxLength={120}
                          onChange={(e) => setTopic(week, s, { title: e.currentTarget.value })}
                        />
                        <MultiSelect
                          placeholder="Материалы темы"
                          searchable
                          data={materials(s)}
                          value={(t?.items ?? []).map(itemValue)}
                          onChange={(vals) => setTopic(week, s, { items: vals.map(toItem) })}
                          nothingFoundMessage="В этом разделе пока нет материалов"
                        />
                      </Stack>
                    );
                  })}
                </Stack>
              </Accordion.Panel>
            </Accordion.Item>
          );
        })}
      </Accordion>
      {incomplete && (
        <Text size="sm" c="dimmed">
          У каждой темы с материалами должно быть название.
        </Text>
      )}
      <Group>
        <Button
          onClick={() => save.mutate()}
          loading={save.isPending}
          disabled={incomplete || !v.subjects.length}
        >
          Сохранить план
        </Button>
        <Button variant="subtle" onClick={onDone}>
          Отмена
        </Button>
      </Group>
    </Stack>
  );
}

function CurriculumCard({ childId }: { childId: string }) {
  const plans = useCurricula(childId);
  const [editing, setEditing] = useState<Curriculum | 'new' | null>(null);
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/parent/curricula/${id}`),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: keys.curricula(childId) }),
  });
  const plan = plans.data?.[0] ?? null;

  return (
    <Card withBorder padding="md">
      <Stack gap="sm">
        <Group justify="space-between">
          <Title order={3}>Учебный план</Title>
          {!editing && (
            <Button variant="light" onClick={() => setEditing('new')}>
              Новый план
            </Button>
          )}
        </Group>
        {editing ? (
          <PlanEditor
            key={editing === 'new' ? 'new' : editing.id}
            childId={childId}
            plan={editing === 'new' ? null : editing}
            onDone={() => setEditing(null)}
          />
        ) : plan ? (
          <Stack gap={6}>
            <Text>
              <b>{plan.title}</b> · с {plan.startsOn.split('-').reverse().join('.')} · {plan.weeks}{' '}
              нед.
            </Text>
            <Text size="sm">
              Предметы: {plan.subjects.map((s) => SUBJECT_LABELS[s]).join(', ')}
            </Text>
            <Text size="sm" c="dimmed">
              Тем: {plan.topics.length}. Сейчас неделя{' '}
              {Math.max(0, planWeek(plan.startsOn, todayIso()))} из {plan.weeks}.
            </Text>
            <Group gap="xs">
              <Button size="compact-sm" variant="default" onClick={() => setEditing(plan)}>
                Изменить
              </Button>
              <Button
                size="compact-sm"
                variant="subtle"
                color="red"
                onClick={() =>
                  modals.confirm({
                    title: 'Удалить план?',
                    message: `«${plan.title}» и все его темы будут удалены.`,
                    confirmLabel: 'Удалить',
                    onConfirm: () => remove.mutate(plan.id),
                  })
                }
              >
                Удалить
              </Button>
            </Group>
          </Stack>
        ) : (
          <Alert color="gray">
            Плана нет — предметы дня берутся из разделов, назначенных ребёнку (карточки и игры).
          </Alert>
        )}
      </Stack>
    </Card>
  );
}

// ─── Кабинет 2.0: неделя, уроки дня, правила строками ────────────────────────

const SUBJECT_COLORS: Record<Subject, string> = {
  english: '#ff6b5c',
  chinese: '#e8453c',
  math: '#f5a000',
  geography: '#2d9cff',
  nature: '#2fb67c',
  music: '#00a9bd',
  letters: '#e8590c',
  poems: '#a3348f',
  games: '#ff5fa2',
  other: '#8e5cf6',
};
const SHORT_DAYS: Record<Weekday, string> = {
  mon: 'Пн',
  tue: 'Вт',
  wed: 'Ср',
  thu: 'Чт',
  fri: 'Пт',
  sat: 'Сб',
  sun: 'Вс',
};

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Дни текущей недели, с понедельника. */
function thisWeek(): { date: string; day: Weekday; n: number }[] {
  const now = new Date();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  return WEEKDAYS.map((day, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return { date: iso(d), day, n: d.getDate() };
  });
}

/** Окна занятий одной строкой: «Пн–Пт 9–21 · Сб–Вс 10–22». */
function windowsSummary(w: Schedule['windows']): string {
  const fmt = (x: { from: string; to: string } | null) =>
    x ? `${Number(x.from.slice(0, 2))}–${Number(x.to.slice(0, 2))}` : 'выходной';
  const groups: { from: Weekday; to: Weekday; text: string }[] = [];
  for (const d of WEEKDAYS) {
    const text = fmt(w[d]);
    const last = groups.at(-1);
    if (last && last.text === text) last.to = d;
    else groups.push({ from: d, to: d, text });
  }
  return groups
    .map((g) => `${SHORT_DAYS[g.from]}${g.from !== g.to ? `–${SHORT_DAYS[g.to]}` : ''} ${g.text}`)
    .join(' · ');
}

function SettingRow({
  label,
  value,
  onClick,
}: {
  label: string;
  value: string;
  onClick: () => void;
}) {
  return (
    <UnstyledButton className="attention-row" onClick={onClick}>
      <Text style={{ flex: 1 }}>{label}</Text>
      <Text c="dimmed" size="sm" ta="right" style={{ maxWidth: '60%' }}>
        {value}
      </Text>
      <span className="chevron" aria-hidden="true">
        ›
      </span>
    </UnstyledButton>
  );
}

function ScheduleOverview({ childId }: { childId: string }) {
  const schedule = useSchedule(childId);
  const plans = useCurricula(childId);
  const week = thisWeek();
  const [picked, setPicked] = useState(todayIso());
  const [editing, setEditing] = useState(false);
  const toggle = useMutation({
    mutationFn: (enabled: boolean) =>
      api.put<Schedule>(`/parent/children/${childId}/schedule`, { ...schedule.data!, enabled }),
    onSuccess: (data) => {
      queryClient.setQueryData(keys.schedule(childId), data);
      void queryClient.invalidateQueries({ queryKey: keys.now(childId) });
    },
  });
  const v = schedule.data;
  if (!v) return null;
  const plan = plans.data?.[0] ?? null;
  const day = week.find((d) => d.date === picked) ?? week[0]!;
  const window = v.windows[day.day];
  const subjects = plan ? daySubjects(plan.subjects, v.subjectsPerDay, day.date) : [];
  const weekNo = plan ? planWeek(plan.startsOn, day.date) : 0;
  const topicOf = (s: Subject) =>
    plan?.topics.find((t) => t.subject === s && t.week === weekNo)?.title ?? null;
  const dayTitle = new Date(`${day.date}T12:00:00`).toLocaleDateString('ru-RU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  return (
    <Stack gap="md">
      <div className="week-strip">
        {week.map((d) => (
          <button
            key={d.date}
            type="button"
            className={d.date === picked ? 'on' : v.windows[d.day] ? '' : 'off'}
            onClick={() => setPicked(d.date)}
          >
            <span>{SHORT_DAYS[d.day]}</span>
            <b>{d.n}</b>
          </button>
        ))}
      </div>

      <Stack gap={6}>
        <Text size="xs" fw={600} c="dimmed" tt="uppercase" px={16}>
          {dayTitle} · {window ? `${window.from} – ${window.to}` : 'выходной'}
        </Text>
        <Card padding={0}>
          {!v.enabled ? (
            <Text p="md" size="sm" c="dimmed">
              Расписание выключено — ребёнок сам выбирает разделы, без ограничений.
            </Text>
          ) : !window ? (
            <Text p="md" size="sm" c="dimmed">
              В этот день занятий нет.
            </Text>
          ) : (
            <Stack gap={0} className="grouped">
              {plan ? (
                subjects.map((s) => (
                  <div key={s} className="attention-row">
                    <span className="attention-icon" style={{ background: SUBJECT_COLORS[s] }}>
                      <Text c="white" fw={800} size="xs">
                        {SUBJECT_LABELS[s].slice(0, 2)}
                      </Text>
                    </span>
                    <Stack gap={0} style={{ flex: 1, minWidth: 0 }}>
                      <Text fw={600}>{SUBJECT_LABELS[s]}</Text>
                      <Text size="sm" c="dimmed" truncate>
                        {topicOf(s) ?? 'Повторение пройденного'}
                      </Text>
                    </Stack>
                    <Text size="sm" c="dimmed">
                      {v.minutesPerSubject} мин
                    </Text>
                  </div>
                ))
              ) : (
                <div className="attention-row">
                  <Text size="sm" c="dimmed" style={{ flex: 1 }}>
                    {v.subjectsPerDay} предм. по {v.minutesPerSubject} мин — из разделов ребёнка
                    (учебного плана нет).
                  </Text>
                </div>
              )}
              {v.freeMinutes > 0 && (
                <div className="attention-row">
                  <span className="attention-icon" style={{ background: '#8e8e93' }}>
                    <Text c="white" fw={800} size="xs">
                      ★
                    </Text>
                  </span>
                  <Stack gap={0} style={{ flex: 1 }}>
                    <Text fw={600}>Свободное время</Text>
                    <Text size="sm" c="dimmed">
                      Видео, игры, камера — на выбор
                    </Text>
                  </Stack>
                  <Text size="sm" c="dimmed">
                    {v.freeMinutes} мин
                  </Text>
                </div>
              )}
            </Stack>
          )}
        </Card>
      </Stack>

      <Stack gap={6}>
        <Text size="xs" fw={600} c="dimmed" tt="uppercase" px={16}>
          Правила дня
        </Text>
        <Card padding={0}>
          <Stack gap={0} className="grouped plain">
            <div className="attention-row">
              <Text style={{ flex: 1 }}>Расписание</Text>
              <Switch
                checked={v.enabled}
                onChange={(e) => toggle.mutate(e.currentTarget.checked)}
                aria-label="Расписание включено"
              />
            </div>
            <SettingRow
              label="Предметов в день"
              value={String(v.subjectsPerDay)}
              onClick={() => setEditing(true)}
            />
            <SettingRow
              label="Минут на предмет"
              value={`${v.minutesPerSubject} мин`}
              onClick={() => setEditing(true)}
            />
            <SettingRow
              label="Свободное время"
              value={v.freeMinutes ? `${v.freeMinutes} мин` : 'нет'}
              onClick={() => setEditing(true)}
            />
            <SettingRow
              label="Когда можно заниматься"
              value={windowsSummary(v.windows)}
              onClick={() => setEditing(true)}
            />
            <SettingRow
              label="Часовой пояс"
              value={v.timezone.split('/').pop()!.replace('_', ' ')}
              onClick={() => setEditing(true)}
            />
          </Stack>
        </Card>
      </Stack>

      <Drawer
        opened={editing}
        onClose={() => setEditing(false)}
        position="bottom"
        size="auto"
        title="Правила дня"
        radius="xl"
      >
        <ScheduleForm childId={childId} initial={v} onSaved={() => setEditing(false)} />
      </Drawer>
    </Stack>
  );
}

/** «Учебный план» (п. 6.1 ТЗ): расписание дня и план на период для каждого ребёнка. */
export function PlanPage() {
  // Этап 33: выбранный ребёнок — общий на весь кабинет.
  const [childId] = useCurrentChild();
  return (
    <Stack maw={820}>
      <h1 className="page-title">План</h1>
      <KidSwitch />
      {childId && (
        <>
          <ScheduleOverview key={`s-${childId}`} childId={childId} />
          <CurriculumCard key={`c-${childId}`} childId={childId} />
        </>
      )}
    </Stack>
  );
}
