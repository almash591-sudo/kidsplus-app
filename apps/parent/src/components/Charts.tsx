// Графики аналитики — свой SVG без библиотек. Цвет предмета постоянный (по порядку предметов),
// а не по месту в списке; значения и подписи — цветом текста; таблица — всегда рядом.
import type { ChildAnalytics } from '@kidsplus/shared/analytics';
import { SUBJECT_LABELS, SUBJECTS, type Subject } from '@kidsplus/shared/schedule';
import { Group, Paper, SegmentedControl, Stack, Table, Text } from '@mantine/core';
import { useState } from 'react';
import './charts.css';

/** Цвет предмета — фиксированный слот категориальной палитры (проверена валидатором). */
const SLOT: Record<Subject | 'free', number> = {
  english: 1,
  chinese: 2,
  math: 3,
  geography: 4,
  nature: 5,
  games: 6,
  other: 7,
  free: 8,
  music: 9,
  letters: 10,
  poems: 11,
  books: 12,
};
const SERIES: (Subject | 'free')[] = [...SUBJECTS, 'free'];
const label = (s: Subject | 'free') => (s === 'free' ? 'Свободное время' : SUBJECT_LABELS[s]);
const minutes = (sec: number) => Math.round(sec / 60);
const dayLabel = (date: string, long: boolean) => {
  const d = new Date(`${date}T12:00:00Z`);
  return long
    ? d.toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'long' })
    : d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'numeric' });
};

/** Минуты по дням: столбцы по предметам друг на друге; наведение — разбивка дня. */
export function TimeChart({ days }: { days: ChildAnalytics['days'] }) {
  const [view, setView] = useState<'chart' | 'table'>('chart');
  const [hover, setHover] = useState<number | null>(null);
  const present = SERIES.filter((s) => days.some((d) => (d.seconds[s] ?? 0) > 0));
  const totals = days.map((d) => present.reduce((n, s) => n + (d.seconds[s] ?? 0), 0));
  const max = Math.max(60 * 10, ...totals);
  // Шкала: круглые минуты.
  const stepMin = max / 60 > 60 ? 30 : max / 60 > 20 ? 10 : 5;
  const top = Math.ceil(max / 60 / stepMin) * stepMin;
  // Поле — под ширину телефона: подписи не сжимаются.
  const W = 400;
  const H = 200;
  const pad = { l: 36, r: 8, t: 8, b: 24 };
  const band = (W - pad.l - pad.r) / days.length;
  const barW = Math.max(4, Math.min(36, band * 0.6));
  const y = (min: number) => pad.t + (H - pad.t - pad.b) * (1 - min / top);
  const ticks = Array.from({ length: top / stepMin + 1 }, (_, i) => i * stepMin);

  return (
    <Stack gap="xs" className="viz-root">
      <Group justify="space-between">
        <Text fw={600}>Время занятий, минут</Text>
        <SegmentedControl
          size="xs"
          value={view}
          onChange={(v) => setView(v as 'chart' | 'table')}
          data={[
            { value: 'chart', label: 'График' },
            { value: 'table', label: 'Таблицей' },
          ]}
        />
      </Group>
      {present.length > 0 && (
        <Group gap="md" className="viz-legend">
          {present.map((s) => (
            <Group key={s} gap={6} wrap="nowrap">
              <span className="viz-swatch" style={{ background: `var(--series-${SLOT[s]})` }} />
              <Text size="xs">{label(s)}</Text>
            </Group>
          ))}
        </Group>
      )}
      {view === 'table' || !present.length ? (
        present.length ? (
          <Table striped withTableBorder fz="xs">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>День</Table.Th>
                {present.map((s) => (
                  <Table.Th key={s}>{label(s)}</Table.Th>
                ))}
                <Table.Th>Всего</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {days.map((d, i) => (
                <Table.Tr key={d.date}>
                  <Table.Td>{dayLabel(d.date, true)}</Table.Td>
                  {present.map((s) => (
                    <Table.Td key={s}>{minutes(d.seconds[s] ?? 0)}</Table.Td>
                  ))}
                  <Table.Td>{minutes(totals[i]!)}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        ) : (
          <Text size="sm" c="dimmed">
            За этот период занятий по расписанию не было.
          </Text>
        )
      ) : (
        <div className="viz-plot" onPointerLeave={() => setHover(null)}>
          <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Минуты занятий по дням">
            {ticks.map((m) => (
              <g key={m}>
                <line x1={pad.l} x2={W - pad.r} y1={y(m)} y2={y(m)} className="viz-grid" />
                <text x={pad.l - 6} y={y(m)} className="viz-axis" textAnchor="end" dy="0.32em">
                  {m}
                </text>
              </g>
            ))}
            {days.map((d, i) => {
              const cx = pad.l + band * (i + 0.5);
              let acc = 0;
              const parts = present
                .map((s) => ({ s, min: (d.seconds[s] ?? 0) / 60 }))
                .filter((p) => p.min > 0);
              return (
                <g key={d.date}>
                  {parts.map((p, k) => {
                    const y0 = y(acc);
                    acc += p.min;
                    const y1 = y(acc);
                    const last = k === parts.length - 1;
                    // 2 пикселя фона между сегментами; верх столбца скруглён.
                    const h = Math.max(0, y0 - y1 - (k > 0 ? 2 : 0));
                    return (
                      <rect
                        key={p.s}
                        x={cx - barW / 2}
                        y={y1}
                        width={barW}
                        height={h}
                        rx={last ? 4 : 0}
                        style={{ fill: `var(--series-${SLOT[p.s]})` }}
                        opacity={hover === null || hover === i ? 1 : 0.45}
                      />
                    );
                  })}
                  {(days.length <= 10 || i % Math.ceil(days.length / 8) === 0) && (
                    <text x={cx} y={H - 6} className="viz-axis" textAnchor="middle">
                      {dayLabel(d.date, false)}
                    </text>
                  )}
                  {/* Зона наведения — шире столбца. */}
                  <rect
                    x={cx - band / 2}
                    y={pad.t}
                    width={band}
                    height={H - pad.t - pad.b}
                    fill="transparent"
                    onPointerEnter={() => setHover(i)}
                    onPointerDown={() => setHover(i)}
                  />
                </g>
              );
            })}
          </svg>
          {hover !== null && (
            <Paper
              className="viz-tooltip"
              shadow="sm"
              p="xs"
              withBorder
              // У краёв подсказка не вылезает за график.
              style={{
                left: `${Math.min(80, Math.max(20, ((pad.l + band * (hover + 0.5)) / W) * 100))}%`,
              }}
            >
              <Text size="xs" c="dimmed">
                {dayLabel(days[hover]!.date, true)}
              </Text>
              <Text size="sm" fw={700}>
                {minutes(totals[hover]!)} мин
              </Text>
              {present
                .filter((s) => (days[hover]!.seconds[s] ?? 0) > 0)
                .map((s) => (
                  <Group key={s} gap={6} wrap="nowrap">
                    <span
                      className="viz-swatch"
                      style={{ background: `var(--series-${SLOT[s]})` }}
                    />
                    <Text size="xs">
                      <b>{minutes(days[hover]!.seconds[s] ?? 0)}</b> {label(s)}
                    </Text>
                  </Group>
                ))}
            </Paper>
          )}
        </div>
      )}
    </Stack>
  );
}

/** Точность с первой попытки по предметам: полосы одного цвета, процент — текстом. */
export function AccuracyBars({ subjects }: { subjects: ChildAnalytics['subjects'] }) {
  const rows = subjects.filter((s) => s.answers > 0);
  if (!rows.length)
    return (
      <Text size="sm" c="dimmed">
        Ответов на вопросы за этот период нет.
      </Text>
    );
  return (
    <Stack gap={8} className="viz-root">
      {rows.map((s) => {
        const pct = Math.round((s.firstTry / s.answers) * 100);
        return (
          <div key={s.subject} className="viz-hbar">
            <Group justify="space-between" gap={4}>
              <Text size="sm">{SUBJECT_LABELS[s.subject]}</Text>
              <Text size="sm">
                <b>{pct} %</b>{' '}
                <Text span size="xs" c="dimmed">
                  · ответов {s.answers}
                  {s.avgMs ? ` · ~${Math.round(s.avgMs / 1000)} с` : ''}
                </Text>
              </Text>
            </Group>
            <div className="viz-hbar-track">
              <div className="viz-hbar-fill" style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
    </Stack>
  );
}
