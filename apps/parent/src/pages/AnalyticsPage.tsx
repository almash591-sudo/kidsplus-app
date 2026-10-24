import {
  rate,
  type ChildAnalytics,
  type MaterialStats,
  type WeeklyReport,
} from '@kidsplus/shared/analytics';
import {
  Accordion,
  Alert,
  Button,
  Card,
  List,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../api';
import { AccuracyBars, TimeChart } from '../components/Charts';
import { queryClient, useAnalytics, useReports } from '../queries';
import { KidSwitch } from '../components/KidSwitch';
import { useCurrentChild } from '../lib/currentChild';
import { CountUp } from '../components/Chrome';
import { Likes } from '../components/Likes';

const pct = (s: { answers: number; firstTry: number }) => `${Math.round((rate(s) ?? 0) * 100)} %`;

/** Крупная цветная цифра с подписью — как «Активность» на iPhone. */
function Stat({ value, label, color }: { value: string; label: string; color: string }) {
  return (
    <Card padding="sm">
      <Text fz={26} fw={800} lh={1.1} c={color}>
        <CountUp value={value} />
      </Text>
      <Text size="xs" c="dimmed" mt={2}>
        {label}
      </Text>
    </Card>
  );
}

/** Строка сгруппированного списка: подпись слева, значение справа. */
function Row({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="attention-row">
      <Text size="sm" style={{ flex: 1, minWidth: 0 }} truncate>
        {label}
      </Text>
      <Text size="sm" fw={700} c={color}>
        {value}
      </Text>
    </div>
  );
}

function Materials({
  title,
  hint,
  items,
  empty,
  color,
}: {
  title: string;
  hint: string;
  items: MaterialStats[];
  empty: string;
  color: string;
}) {
  return (
    <Stack gap={6}>
      <Text size="xs" fw={600} c="dimmed" tt="uppercase" px={16}>
        {title}
      </Text>
      <Card padding={0}>
        <Stack gap={0} className="grouped plain">
          {items.length ? (
            items.map((m) => (
              <Row
                key={m.id}
                label={`${m.kind === 'deck' ? '🃏' : '🎬'} ${m.title}`}
                value={`${pct(m)} из ${m.answers}`}
                color={color}
              />
            ))
          ) : (
            <div className="attention-row">
              <Text size="sm" c="dimmed">
                {empty}
              </Text>
            </div>
          )}
        </Stack>
      </Card>
      <Text size="xs" c="dimmed" px={16}>
        {hint}
      </Text>
    </Stack>
  );
}

/** Недоступные видео: в уроках они уже заменены другими по предмету; можно убрать у ребёнка. */
function UnavailableVideos({ childId, videos }: { childId: string; videos: { title: string }[] }) {
  const drop = useMutation({
    mutationFn: () =>
      api.delete<{ removed: number }>(`/parent/children/${childId}/items/unavailable`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['analytics', childId] });
      void queryClient.invalidateQueries({ queryKey: ['child-items'] });
    },
  });
  return (
    <Alert color="orange" p="xs">
      <Stack gap={6}>
        <Text size="sm">
          YouTube больше не показывает: {videos.map((v) => `«${v.title}»`).join(', ')}. В уроках
          вместо них идут другие видео того же предмета.
        </Text>
        <Button
          size="compact-sm"
          variant="light"
          color="orange"
          loading={drop.isPending}
          onClick={() => drop.mutate()}
          style={{ alignSelf: 'flex-start' }}
        >
          Убрать их из списка ребёнка
        </Button>
      </Stack>
    </Alert>
  );
}

function Overview({
  a,
  childId,
  advice,
}: {
  a: ChildAnalytics;
  childId: string;
  advice: string | null;
}) {
  const total = a.days.reduce(
    (n, d) => n + Object.values(d.seconds).reduce((x, y) => x + (y ?? 0), 0),
    0,
  );
  const active = a.days.filter((d) => Object.values(d.seconds).some((s) => (s ?? 0) > 0)).length;
  const answers = a.subjects.reduce(
    (acc, s) => ({ answers: acc.answers + s.answers, firstTry: acc.firstTry + s.firstTry }),
    { answers: 0, firstTry: 0 },
  );
  return (
    <Stack>
      <SimpleGrid cols={{ base: 3, sm: 4 }} spacing="xs">
        <Stat value={`${Math.round(total / 60)}`} label="минут занятий" color="ios" />
        <Stat
          value={answers.answers ? pct(answers) : '—'}
          label="верно с первой попытки"
          color="green"
        />
        <Stat value={`${active} из ${a.days.length}`} label="дней с занятиями" color="orange" />
      </SimpleGrid>

      {advice && (
        <Card padding="md">
          <Text size="xs" c="dimmed" mb={4}>
            Совет недели
          </Text>
          <Text size="sm">{advice}</Text>
        </Card>
      )}

      <Card padding="md">
        <TimeChart days={a.days} />
      </Card>

      <SimpleGrid cols={{ base: 1, md: 2 }}>
        <Card withBorder padding="md">
          <Stack gap="sm">
            <Text fw={600}>Верно с первой попытки</Text>
            <AccuracyBars subjects={a.subjects} />
          </Stack>
        </Card>
        <Stack gap={6}>
          <Text size="xs" fw={600} c="dimmed" tt="uppercase" px={16}>
            Пройдено
          </Text>
          <Card padding={0}>
            <Stack gap={0} className="grouped plain">
              <Row label="Наборов карточек" value={String(a.done.decks)} />
              <Row label="Игр" value={String(a.done.games)} />
              <Row label="Квизов к видео" value={String(a.done.quizzes)} />
              <Row label="Видео досмотрено" value={`${a.video.completed} из ${a.video.started}`} />
              {a.plan && (
                <Row
                  label={`План «${a.plan.title}»`}
                  value={`неделя ${a.plan.week} из ${a.plan.weeks}`}
                />
              )}
            </Stack>
          </Card>
          {a.video.unavailable.length > 0 && (
            <UnavailableVideos childId={childId} videos={a.video.unavailable} />
          )}
        </Stack>
      </SimpleGrid>

      <SimpleGrid cols={{ base: 1, md: 2 }}>
        <Materials
          title="Повторить"
          hint="Верно с первой попытки меньше 60 % — эти материалы сами встают в ближайшие уроки."
          items={a.weak}
          empty="Трудных тем нет."
          color="orange"
        />
        <Materials
          title="Слишком легко"
          hint="Почти всё верно и быстро — можно взять тему сложнее."
          items={a.easy}
          empty="Пока нет."
          color="green"
        />
      </SimpleGrid>
    </Stack>
  );
}

function Reports({ reports }: { reports: WeeklyReport[] }) {
  if (!reports.length)
    return (
      <Text size="sm" c="dimmed">
        Отчётов пока нет — первый придёт в воскресенье в 19:00.
      </Text>
    );
  return (
    <Accordion variant="separated" defaultValue={reports[0]!.id}>
      {reports.map((r) => {
        const total = r.stats.days.reduce(
          (n, d) => n + Object.values(d.seconds).reduce((x, y) => x + (y ?? 0), 0),
          0,
        );
        return (
          <Accordion.Item key={r.id} value={r.id}>
            <Accordion.Control>
              Неделя с {r.weekStart.split('-').reverse().join('.')} · {Math.round(total / 60)} мин
            </Accordion.Control>
            <Accordion.Panel>
              <Stack gap="sm">
                {r.advice && (
                  <Stack gap={4}>
                    <Text size="sm">{r.advice.summary}</Text>
                    {r.advice.tips.length > 0 && (
                      <List size="sm" spacing={2}>
                        {r.advice.tips.map((t) => (
                          <List.Item key={t}>{t}</List.Item>
                        ))}
                      </List>
                    )}
                    <Text size="xs" c="dimmed">
                      Советы составила языковая модель по обезличенным цифрам.
                    </Text>
                  </Stack>
                )}
                <List size="sm" spacing={2}>
                  {r.rules.map((t) => (
                    <List.Item key={t}>{t}</List.Item>
                  ))}
                </List>
              </Stack>
            </Accordion.Panel>
          </Accordion.Item>
        );
      })}
    </Accordion>
  );
}

/** «Аналитика» (п. 9 ТЗ): время, точность, что повторить, недельные отчёты. */
export function AnalyticsPage() {
  // Этап 33: выбранный ребёнок — общий на весь кабинет.
  const [childId] = useCurrentChild();
  const [days, setDays] = useState('7');
  const analytics = useAnalytics(childId, Number(days));
  const reports = useReports(childId);

  return (
    <Stack maw={980}>
      <h1 className="page-title">Прогресс</h1>
      <KidSwitch />
      <SegmentedControl
        fullWidth
        value={days}
        onChange={setDays}
        data={[
          { value: '7', label: 'Неделя' },
          { value: '30', label: '30 дней' },
        ]}
      />
      {analytics.data && (
        <Overview
          a={analytics.data}
          childId={childId!}
          advice={reports.data?.[0]?.advice?.summary ?? null}
        />
      )}
      {childId && <Likes childId={childId} days={Number(days)} />}
      <Title order={3}>Недельные отчёты</Title>
      {reports.data && <Reports reports={reports.data} />}
    </Stack>
  );
}
