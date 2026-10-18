// «Пора спать» (этап 31): время отбоя и подъёма, предупреждение, сказки на ночь — готовые и
// придуманные моделью (ребёнок слышит только одобренные).
import {
  BEDTIME_COMPANION_LABELS,
  BEDTIME_COMPANIONS,
  readingMinutes,
  type BedtimeCompanion,
  type BedtimeSettings,
  type ParentSleep,
  type Story,
} from '@kidsplus/shared/bedtime';
import { WEEKDAYS, type Weekday } from '@kidsplus/shared/schedule';
import {
  Alert,
  Badge,
  Button,
  Card,
  Chip,
  Collapse,
  Group,
  SegmentedControl,
  Select,
  Stack,
  Switch,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api, errorMessage } from '../api';
import { queryClient, useChildren } from '../queries';

const DAY_LABELS: Record<Weekday, string> = {
  mon: 'Пн',
  tue: 'Вт',
  wed: 'Ср',
  thu: 'Чт',
  fri: 'Пт',
  sat: 'Сб',
  sun: 'Вс',
};

/** Идеи тем — нажать, и тема в поле. */
const THEME_IDEAS = [
  'про котёнка, который ищет маму',
  'про динозаврика, который учится летать',
  'про машинку, которая устала',
  'про дождик и лягушат',
  'про первый снег',
  'про принцессу и доброго дракона',
];

const STATUS: Record<Story['status'], { label: string; color: string }> = {
  queued: { label: 'Пишется…', color: 'gray' },
  processing: { label: 'Пишется…', color: 'gray' },
  draft: { label: 'Ждёт вашего одобрения', color: 'orange' },
  approved: { label: 'Звучит на ночь', color: 'green' },
  failed: { label: 'Не получилось', color: 'red' },
};

export function SleepPage() {
  const children = useChildren();
  const [picked, setPicked] = useState<string | null>(null);
  const childId = picked ?? children.data?.[0]?.id ?? null;

  return (
    <Stack>
      <Title order={2}>Сон</Title>
      <Text size="sm" c="dimmed">
        За несколько минут до отбоя совёнок зовёт ребёнка делать вечерние дела. В отбой занятия
        заканчиваются: тёмный экран, сказка и колыбельная, потом экран гаснет. Утром — «Доброе
        утро!». Снять ночь можно кнопкой «Разбудить» на странице «Сейчас».
      </Text>
      {children.data && children.data.length > 1 && (
        <SegmentedControl
          value={childId ?? ''}
          onChange={setPicked}
          data={children.data.map((c) => ({ value: c.id, label: c.nickname }))}
        />
      )}
      {childId && <ChildSleep key={childId} childId={childId} />}
    </Stack>
  );
}

function ChildSleep({ childId }: { childId: string }) {
  const base = `/parent/children/${childId}`;
  const key = ['sleep', childId];
  const data = useQuery({
    queryKey: key,
    queryFn: () => api.get<ParentSleep>(`${base}/sleep`),
    // Пока модель пишет сказку — проверяем чаще.
    refetchInterval: (q) =>
      q.state.data?.stories.some((s) => s.status === 'queued' || s.status === 'processing')
        ? 5000
        : 60_000,
  });
  const refresh = () => void queryClient.invalidateQueries({ queryKey: key });
  const run = useMutation({ mutationFn: (f: () => Promise<unknown>) => f(), onSuccess: refresh });

  if (!data.data) return <Text c="dimmed">{data.isLoading ? 'Загружаем…' : ''}</Text>;
  const d = data.data;
  return (
    <Stack>
      {run.error && <Alert color="red">{errorMessage(run.error)}</Alert>}
      <Settings
        key={JSON.stringify(d.settings)}
        initial={d.settings}
        tracks={d.tracks}
        nowText={nowText(d)}
        saving={run.isPending}
        onSave={(s) => run.mutate(() => api.put(`${base}/sleep`, s))}
      />
      <Stories d={d} base={base} run={(f) => run.mutate(f)} busy={run.isPending} />
    </Stack>
  );
}

function nowText(d: ParentSleep) {
  if (!d.settings.enabled) return null;
  if (d.now?.phase === 'night') return '🌙 Сейчас ночь — на телефоне ночной экран';
  if (d.now?.phase === 'soon') return `⏰ До отбоя ${d.now.minutesLeft} мин`;
  return null;
}

function Settings({
  initial,
  tracks,
  nowText,
  saving,
  onSave,
}: {
  initial: BedtimeSettings;
  tracks: ParentSleep['tracks'];
  nowText: string | null;
  saving: boolean;
  onSave: (s: BedtimeSettings) => void;
}) {
  const [s, setS] = useState(initial);
  const set = (patch: Partial<BedtimeSettings>) => setS((x) => ({ ...x, ...patch }));
  const changed = JSON.stringify(s) !== JSON.stringify(initial);
  const companions = BEDTIME_COMPANIONS.filter((c) => c !== 'track' || tracks.length);

  return (
    <Card withBorder>
      <Stack gap="sm">
        <Group justify="space-between">
          <Title order={4}>Отбой</Title>
          <Switch
            checked={s.enabled}
            onChange={(e) => set({ enabled: e.currentTarget.checked })}
            label={s.enabled ? 'Включён' : 'Выключен'}
            data-testid="sleep-enabled"
          />
        </Group>
        {nowText && (
          <Badge size="lg" variant="light" color="indigo" data-testid="sleep-now">
            {nowText}
          </Badge>
        )}
        <Group grow>
          <TextInput
            type="time"
            label="Отбой"
            value={s.at}
            onChange={(e) => set({ at: e.currentTarget.value })}
            data-testid="sleep-at"
          />
          <TextInput
            type="time"
            label="Подъём"
            value={s.wakeAt}
            onChange={(e) => set({ wakeAt: e.currentTarget.value })}
            data-testid="sleep-wake"
          />
        </Group>
        <div>
          <Text size="sm" fw={500} mb={4}>
            Дни
          </Text>
          <Chip.Group
            multiple
            value={s.days}
            onChange={(v) => set({ days: WEEKDAYS.filter((d) => v.includes(d)) })}
          >
            <Group gap={6}>
              {WEEKDAYS.map((d) => (
                <Chip key={d} value={d} size="sm">
                  {DAY_LABELS[d]}
                </Chip>
              ))}
            </Group>
          </Chip.Group>
        </div>
        <Select
          label="Предупредить заранее"
          value={String(s.warnMinutes)}
          onChange={(v) => v && set({ warnMinutes: Number(v) })}
          data={[5, 10, 15, 20, 30].map((m) => ({ value: String(m), label: `за ${m} минут` }))}
          allowDeselect={false}
        />
        <Select
          label="Перед сном"
          value={s.companion}
          onChange={(v) => v && set({ companion: v as BedtimeCompanion })}
          data={companions.map((c) => ({ value: c, label: BEDTIME_COMPANION_LABELS[c] }))}
          allowDeselect={false}
          data-testid="sleep-companion"
        />
        {s.companion === 'track' && (
          <Select
            label="Запись"
            placeholder="Выберите"
            value={s.trackId}
            onChange={(v) => set({ trackId: v })}
            data={tracks.map((t) => ({ value: t.id, label: t.title }))}
          />
        )}
        <Button
          onClick={() => onSave(s)}
          disabled={!changed || (s.companion === 'track' && !s.trackId)}
          loading={saving}
          data-testid="sleep-save"
        >
          Сохранить
        </Button>
      </Stack>
    </Card>
  );
}

function Stories({
  d,
  base,
  run,
  busy,
}: {
  d: ParentSleep;
  base: string;
  run: (f: () => Promise<unknown>) => void;
  busy: boolean;
}) {
  const [theme, setTheme] = useState('');
  const order = () => {
    run(() => api.post(`${base}/stories`, { theme }));
    setTheme('');
  };
  return (
    <>
      <Card withBorder>
        <Stack gap="sm">
          <Title order={4}>Сказки на ночь</Title>
          <Text size="sm" c="dimmed">
            Каждую ночь — следующая по очереди. Звучат только сказки с зелёной меткой.
          </Text>
          {d.stories.length === 0 && (
            <Text size="sm" c="dimmed">
              Пока сказок нет — добавьте готовые ниже или придумайте свою.
            </Text>
          )}
          {d.stories.map((s) => (
            <StoryRow key={s.id} s={s} base={base} run={run} busy={busy} />
          ))}
        </Stack>
      </Card>

      <Card withBorder>
        <Stack gap="sm">
          <Title order={4}>Придумать сказку</Title>
          <Text size="sm" c="dimmed">
            Модель напишет добрую сказку на 2–4 минуты по вашей теме. Имя ребёнка не пишите — в
            модель уходят только тема и возраст. Вы прочитаете сказку и решите, звучать ли ей.
          </Text>
          <Group gap={6}>
            {THEME_IDEAS.map((t) => (
              <Chip key={t} checked={theme === t} onChange={() => setTheme(t)} size="xs">
                {t}
              </Chip>
            ))}
          </Group>
          <TextInput
            placeholder="Например: про ёжика, который боится темноты"
            value={theme}
            onChange={(e) => setTheme(e.currentTarget.value)}
            maxLength={120}
            data-testid="story-theme"
          />
          <Button
            onClick={order}
            disabled={theme.trim().length < 3}
            loading={busy}
            data-testid="story-order"
          >
            Придумать
          </Button>
        </Stack>
      </Card>

      {d.library.length > 0 && (
        <Card withBorder>
          <Stack gap="sm">
            <Title order={4}>Готовые сказки</Title>
            {d.library.map((l) => (
              <LibraryRow
                key={l.code}
                title={l.title}
                meta={`${l.theme} · ${l.minutes} мин`}
                onAdd={() => run(() => api.post(`${base}/stories/library/${l.code}`, {}))}
                busy={busy}
                code={l.code}
              />
            ))}
          </Stack>
        </Card>
      )}
    </>
  );
}

function StoryRow({
  s,
  base,
  run,
  busy,
}: {
  s: Story;
  base: string;
  run: (f: () => Promise<unknown>) => void;
  busy: boolean;
}) {
  const [open, setOpen] = useState(s.status === 'draft');
  const st = STATUS[s.status];
  const ready = s.paragraphs.length > 0;
  return (
    <Card withBorder padding="sm" data-testid="story" data-status={s.status}>
      <Stack gap={6}>
        <Group justify="space-between" wrap="nowrap" align="flex-start">
          <div style={{ minWidth: 0 }}>
            <Text fw={700}>{s.title || s.theme}</Text>
            <Text size="xs" c="dimmed">
              {s.libraryCode ? 'Готовая' : `Тема: ${s.theme}`}
              {ready ? ` · ${readingMinutes(s.paragraphs)} мин` : ''}
            </Text>
          </div>
          <Badge color={st.color} variant="light" style={{ flexShrink: 0 }}>
            {st.label}
          </Badge>
        </Group>
        {s.status === 'failed' && s.error && (
          <Text size="xs" c="red">
            Модель не ответила. Попробуйте ещё раз позже.
          </Text>
        )}
        {ready && (
          <>
            <Button variant="subtle" size="compact-sm" onClick={() => setOpen((o) => !o)}>
              {open ? 'Скрыть текст' : 'Читать'}
            </Button>
            <Collapse expanded={open}>
              <Stack gap={6} className="story-text">
                {s.paragraphs.map((p, i) => (
                  <Text key={i} size="sm">
                    {p}
                  </Text>
                ))}
              </Stack>
            </Collapse>
          </>
        )}
        <Group gap="xs">
          {s.status === 'draft' && (
            <Button
              size="xs"
              color="green"
              loading={busy}
              onClick={() => run(() => api.post(`${base}/stories/${s.id}/approve`, {}))}
              data-testid="story-approve"
            >
              Одобрить
            </Button>
          )}
          {(s.status === 'draft' || s.status === 'failed') && (
            <Button
              size="xs"
              variant="light"
              loading={busy}
              onClick={() => run(() => api.post(`${base}/stories/${s.id}/retry`, {}))}
            >
              Написать заново
            </Button>
          )}
          <Button
            size="xs"
            variant="subtle"
            color="red"
            loading={busy}
            onClick={() => run(() => api.delete(`${base}/stories/${s.id}`))}
            data-testid="story-delete"
          >
            Удалить
          </Button>
        </Group>
      </Stack>
    </Card>
  );
}

function LibraryRow({
  code,
  title,
  meta,
  onAdd,
  busy,
}: {
  code: string;
  title: string;
  meta: string;
  onAdd: () => void;
  busy: boolean;
}) {
  return (
    <Group justify="space-between" wrap="nowrap" data-testid={`library-${code}`}>
      <div style={{ minWidth: 0 }}>
        <Text fw={600}>{title}</Text>
        <Text size="xs" c="dimmed">
          {meta}
        </Text>
      </div>
      <Button size="xs" variant="light" onClick={onAdd} loading={busy} style={{ flexShrink: 0 }}>
        Добавить
      </Button>
    </Group>
  );
}
