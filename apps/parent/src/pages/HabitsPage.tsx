// Привычки (этап 30): дела ребёнка утром, днём и вечером, неделя отметок, звёздная копилка
// и награды за звёзды.
import {
  HABIT_PRESET_CODES,
  HABIT_PRESETS,
  HABIT_SLOT_LABELS,
  HABIT_SLOTS,
  type Habit,
  type HabitPreset,
  type HabitSlot,
  type ParentHabits,
  type RewardInput,
} from '@kidsplus/shared/habits';
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Card,
  Group,
  NumberInput,
  SegmentedControl,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
  UnstyledButton,
} from '@mantine/core';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api, errorMessage } from '../api';
import { queryClient, useChildren } from '../queries';

const PRESET_ICON: Record<HabitPreset, string> = {
  teeth: '🦷',
  wash: '💦',
  dress: '👕',
  bed: '🛏️',
  hands: '🙌',
  toys: '🧸',
  pajama: '🌙',
  clothes: '👚',
  flower: '🌷',
  pet: '🐱',
  potty: '🚽',
};
const icon = (h: Pick<Habit, 'preset'>) => (h.preset ? PRESET_ICON[h.preset] : '✅');

/** Готовые награды — нажать, и награда добавлена. */
const REWARD_IDEAS: RewardInput[] = [
  { title: 'Мультик', price: 5, bonusMinutes: 10 },
  { title: 'Новая наклейка', price: 3, bonusMinutes: null },
  { title: 'Выбрать десерт', price: 7, bonusMinutes: null },
  { title: 'Поход в парк', price: 10, bonusMinutes: null },
];

const weekday = (date: string) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString('ru-RU', { weekday: 'short', timeZone: 'UTC' });

export function HabitsPage() {
  const children = useChildren();
  const [picked, setPicked] = useState<string | null>(null);
  const childId = picked ?? children.data?.[0]?.id ?? null;

  return (
    <Stack>
      <Title order={2}>Привычки</Title>
      <Text size="sm" c="dimmed">
        Дела ребёнка утром, днём и вечером. Сделал — нажал на картинку в «Моих делах» на телефоне,
        звёздочка — в копилку. За звёзды — награды, которые вы задаёте.
      </Text>
      {children.data && children.data.length > 1 && (
        <SegmentedControl
          value={childId ?? ''}
          onChange={setPicked}
          data={children.data.map((c) => ({ value: c.id, label: c.nickname }))}
        />
      )}
      {childId && <ChildHabits key={childId} childId={childId} />}
    </Stack>
  );
}

function ChildHabits({ childId }: { childId: string }) {
  const base = `/parent/children/${childId}`;
  const key = ['habits', childId];
  const data = useQuery({
    queryKey: key,
    queryFn: () => api.get<ParentHabits>(`${base}/habits`),
    refetchInterval: 30_000,
  });
  const refresh = () => void queryClient.invalidateQueries({ queryKey: key });
  const run = useMutation({
    mutationFn: (f: () => Promise<unknown>) => f(),
    onSuccess: refresh,
  });

  if (!data.data) return <Text c="dimmed">{data.isLoading ? 'Загружаем…' : ''}</Text>;
  const d = data.data;
  const toggle = (h: Habit, date: string, on: boolean) =>
    run.mutate(() =>
      on
        ? api.delete(`${base}/habits/${h.id}/marks/${date}`)
        : api.put(`${base}/habits/${h.id}/marks/${date}`, {}),
    );

  return (
    <Stack>
      {run.error && <Alert color="red">{errorMessage(run.error)}</Alert>}
      <Card withBorder>
        <Group justify="space-between">
          <div>
            <Text size="xl" fw={800} data-testid="stars">
              ⭐ {d.stars}
            </Text>
            <Text size="sm" c="dimmed">
              в копилке
            </Text>
          </div>
          {d.streakDays > 0 && (
            <Badge size="lg" color="orange" variant="light" data-testid="streak">
              🔥 {d.streakDays} {daysWord(d.streakDays)} подряд всё сделано
            </Badge>
          )}
        </Group>
      </Card>

      <Card withBorder>
        <Title order={4} mb="xs">
          Дела
        </Title>
        {d.habits.length === 0 ? (
          <Text size="sm" c="dimmed">
            Пока дел нет — выберите ниже. Кнопка-копилка появится на телефоне с первым делом.
          </Text>
        ) : (
          <Stack gap="sm" data-testid="habits-week">
            {HABIT_SLOTS.flatMap((slot) =>
              d.habits
                .filter((h) => h.slot === slot)
                .map((h) => (
                  <Stack key={h.id} gap={6} data-testid="habit-row" className="habit-row">
                    <Group justify="space-between" wrap="nowrap" align="start">
                      <HabitCell
                        habit={h}
                        onSave={(patch) =>
                          run.mutate(() => api.patch(`${base}/habits/${h.id}`, patch))
                        }
                      />
                      <ActionIcon
                        variant="subtle"
                        color="red"
                        aria-label="Удалить дело"
                        onClick={() => run.mutate(() => api.delete(`${base}/habits/${h.id}`))}
                      >
                        ✕
                      </ActionIcon>
                    </Group>
                    <Group gap={4} wrap="nowrap" justify="space-between">
                      {d.dates.map((date) => {
                        const on = d.marks[h.id]?.includes(date) ?? false;
                        return (
                          <UnstyledButton
                            key={date}
                            onClick={() => toggle(h, date, on)}
                            aria-label={`${h.title}, ${date}: ${on ? 'сделано' : 'не сделано'}`}
                            data-testid="mark"
                            data-on={on ? '1' : '0'}
                            className={date === d.today ? 'habit-day today' : 'habit-day'}
                          >
                            <span className="habit-day-name">{weekday(date)}</span>
                            <span className="habit-day-mark">{on ? '⭐' : ''}</span>
                          </UnstyledButton>
                        );
                      })}
                    </Group>
                  </Stack>
                )),
            )}
          </Stack>
        )}
        <Text size="xs" c="dimmed" mt="xs">
          Нажмите на день, чтобы снять отметку (ребёнок слукавил) или поставить (сделал, но забыл
          нажать).
        </Text>
      </Card>

      <AddHabit
        existing={d.habits}
        onAdd={(body) => run.mutate(() => api.post(`${base}/habits`, body))}
      />

      <Rewards
        data={d}
        onAdd={(body) => run.mutate(() => api.post(`${base}/rewards`, body))}
        onDelete={(id) => run.mutate(() => api.delete(`${base}/rewards/${id}`))}
        onGrant={(id) => run.mutate(() => api.post(`${base}/rewards/${id}/grant`))}
      />
    </Stack>
  );
}

const daysWord = (n: number) =>
  n % 10 === 1 && n % 100 !== 11
    ? 'день'
    : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100)
      ? 'дня'
      : 'дней';

/** Дело в таблице: значок, название, время дня и напоминание (меняются на месте). */
function HabitCell({
  habit,
  onSave,
}: {
  habit: Habit;
  onSave: (patch: Partial<Pick<Habit, 'slot' | 'remindAt'>>) => void;
}) {
  return (
    <Group gap={6} wrap="nowrap">
      <Text fz={22} aria-hidden="true">
        {icon(habit)}
      </Text>
      <Stack gap={2}>
        <Text size="sm" fw={600}>
          {habit.title}
        </Text>
        <Group gap={4} wrap="nowrap">
          <Select
            size="xs"
            w={90}
            value={habit.slot}
            allowDeselect={false}
            data={HABIT_SLOTS.map((s) => ({ value: s, label: HABIT_SLOT_LABELS[s] }))}
            onChange={(v) => v && onSave({ slot: v as HabitSlot })}
            aria-label="Время дня"
          />
          <TextInput
            size="xs"
            type="time"
            w={96}
            defaultValue={habit.remindAt ?? ''}
            aria-label="Напомнить в"
            title="Напомнить на телефоне в это время"
            onBlur={(e) => {
              const v = e.currentTarget.value || null;
              if (v !== habit.remindAt) onSave({ remindAt: v });
            }}
          />
        </Group>
      </Stack>
    </Group>
  );
}

function AddHabit({
  existing,
  onAdd,
}: {
  existing: Habit[];
  onAdd: (body: {
    preset: HabitPreset | null;
    title: string;
    slot: HabitSlot;
    remindAt: string | null;
  }) => void;
}) {
  const [title, setTitle] = useState('');
  const [slot, setSlot] = useState<HabitSlot>('morning');
  const [remindAt, setRemindAt] = useState('');
  const free = HABIT_PRESET_CODES.filter((p) => !existing.some((h) => h.preset === p));
  return (
    <Card withBorder>
      <Title order={4} mb="xs">
        Добавить дело
      </Title>
      {free.length > 0 && (
        <Group gap={6} mb="sm">
          {free.map((p) => (
            <Button
              key={p}
              size="xs"
              variant="light"
              data-testid={`preset-${p}`}
              onClick={() =>
                onAdd({
                  preset: p,
                  title: HABIT_PRESETS[p].title,
                  slot: HABIT_PRESETS[p].slot,
                  remindAt: null,
                })
              }
            >
              {PRESET_ICON[p]} {HABIT_PRESETS[p].title}
            </Button>
          ))}
        </Group>
      )}
      <Text size="sm" c="dimmed" mb={4}>
        Или своё дело (озвучит совёнок; имена детей лучше не писать):
      </Text>
      <Group gap="xs" align="end" wrap="wrap">
        <TextInput
          label="Что сделать"
          placeholder="Покормить рыбок"
          value={title}
          maxLength={40}
          onChange={(e) => setTitle(e.currentTarget.value)}
          data-testid="habit-title"
        />
        <Select
          label="Когда"
          w={110}
          value={slot}
          allowDeselect={false}
          data={HABIT_SLOTS.map((s) => ({ value: s, label: HABIT_SLOT_LABELS[s] }))}
          onChange={(v) => v && setSlot(v as HabitSlot)}
        />
        <TextInput
          label="Напомнить в"
          type="time"
          w={110}
          value={remindAt}
          onChange={(e) => setRemindAt(e.currentTarget.value)}
        />
        <Button
          disabled={!title.trim()}
          onClick={() => {
            onAdd({ preset: null, title: title.trim(), slot, remindAt: remindAt || null });
            setTitle('');
            setRemindAt('');
          }}
          data-testid="habit-add"
        >
          Добавить
        </Button>
      </Group>
    </Card>
  );
}

function Rewards({
  data,
  onAdd,
  onDelete,
  onGrant,
}: {
  data: ParentHabits;
  onAdd: (body: RewardInput) => void;
  onDelete: (id: string) => void;
  onGrant: (id: string) => void;
}) {
  const [title, setTitle] = useState('');
  const [price, setPrice] = useState<number | string>(5);
  const [bonus, setBonus] = useState<number | string>('');
  const ideas = REWARD_IDEAS.filter((i) => !data.rewards.some((r) => r.title === i.title));
  return (
    <Card withBorder>
      <Title order={4} mb="xs">
        Награды за звёзды
      </Title>
      <Stack gap="xs">
        {data.rewards.map((r) => (
          <Group key={r.id} justify="space-between" wrap="nowrap" data-testid="reward">
            <div>
              <Text fw={600}>
                🎁 {r.title}
                {r.bonusMinutes ? ` (+${r.bonusMinutes} мин)` : ''}
              </Text>
              <Text size="xs" c="dimmed">
                {r.price} ⭐
              </Text>
            </div>
            <Group gap={4} wrap="nowrap">
              <Button
                size="xs"
                disabled={data.stars < r.price}
                onClick={() => onGrant(r.id)}
                data-testid="grant"
              >
                Выдать
              </Button>
              <ActionIcon
                variant="subtle"
                color="red"
                aria-label="Удалить награду"
                onClick={() => onDelete(r.id)}
              >
                ✕
              </ActionIcon>
            </Group>
          </Group>
        ))}
        {ideas.length > 0 && (
          <Group gap={6}>
            {ideas.map((i) => (
              <Button
                key={i.title}
                size="xs"
                variant="light"
                color="grape"
                onClick={() => onAdd(i)}
              >
                + {i.title} — {i.price} ⭐{i.bonusMinutes ? `, +${i.bonusMinutes} мин` : ''}
              </Button>
            ))}
          </Group>
        )}
        <Group gap="xs" align="end" wrap="wrap">
          <TextInput
            label="Своя награда"
            placeholder="Поход в кафе"
            value={title}
            maxLength={60}
            onChange={(e) => setTitle(e.currentTarget.value)}
            data-testid="reward-title"
          />
          <NumberInput label="Звёзд" w={80} min={1} max={100} value={price} onChange={setPrice} />
          <NumberInput
            label="+ минут к экрану"
            w={130}
            min={1}
            max={120}
            value={bonus}
            onChange={setBonus}
            placeholder="нет"
          />
          <Button
            disabled={!title.trim() || !Number(price)}
            onClick={() => {
              onAdd({
                title: title.trim(),
                price: Number(price),
                bonusMinutes: Number(bonus) || null,
              });
              setTitle('');
              setBonus('');
            }}
            data-testid="reward-add"
          >
            Добавить
          </Button>
        </Group>
        {data.grants.length > 0 && (
          <>
            <Text size="sm" fw={600} mt="xs">
              Выдано
            </Text>
            {data.grants.map((g) => (
              <Text key={g.id} size="sm" c="dimmed">
                {new Date(g.at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })} —{' '}
                {g.title} (−{g.price} ⭐)
              </Text>
            ))}
          </>
        )}
      </Stack>
    </Card>
  );
}
