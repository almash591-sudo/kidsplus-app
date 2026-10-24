// Страница ребёнка (этап 33): всё про одного ребёнка в одном месте — сейчас, что доступно
// (и «добавить то, что есть у …»), распорядок, профиль. Разделы открываются на этом ребёнке.
import { Alert, Avatar, Card, Group, Loader, Stack, Text, UnstyledButton } from '@mantine/core';
import { useEffect } from 'react';
import { Link, useParams } from 'react-router';
import { copyFrom, LibraryCard, useAssignables } from '../components/Library';
import { ageText } from '../lib/child';
import { setCurrentChild } from '../lib/currentChild';
import { allOf } from '../lib/names';
import { useChildNow, useChildren } from '../queries';

type Row = {
  to?: string;
  onClick?: () => void;
  label: string;
  value?: string;
  color: string;
  icon: string;
};

function Group_({ title, rows }: { title: string; rows: Row[] }) {
  return (
    <Stack gap={6}>
      <Text size="xs" fw={600} c="dimmed" tt="uppercase" px={16}>
        {title}
      </Text>
      <Card padding={0}>
        <Stack gap={0} className="grouped">
          {rows.map((r) => {
            const inner = (
              <>
                <span className="attention-icon" style={{ background: r.color }}>
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#fff"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d={r.icon} />
                  </svg>
                </span>
                <Text fw={500} style={{ flex: 1 }}>
                  {r.label}
                </Text>
                {r.value && (
                  <Text size="sm" c="dimmed">
                    {r.value}
                  </Text>
                )}
                <span className="chevron" aria-hidden="true">
                  ›
                </span>
              </>
            );
            return r.to ? (
              <UnstyledButton key={r.label} component={Link} to={r.to} className="attention-row">
                {inner}
              </UnstyledButton>
            ) : (
              <UnstyledButton key={r.label} onClick={r.onClick} className="attention-row">
                {inner}
              </UnstyledButton>
            );
          })}
        </Stack>
      </Card>
    </Stack>
  );
}

export function ChildPage() {
  const { id } = useParams();
  const children = useChildren();
  const kids = children.data ?? [];
  const child = kids.find((k) => k.id === id);
  const now = useChildNow(id ?? '');
  const all = useAssignables();
  // Открыли ребёнка — разделы кабинета теперь про него.
  useEffect(() => {
    if (child) setCurrentChild(child.id);
  }, [child]);

  if (children.isPending) return <Loader />;
  if (!child) return <Alert color="red">Ребёнок не найден.</Alert>;
  const b = now.data?.battery;
  const others = kids.filter((k) => k.id !== child.id);

  return (
    <Stack gap="md" data-testid="child-page">
      <Group gap="md" wrap="nowrap">
        <Avatar radius="xl" size={60} color="ios">
          {child.nickname.slice(0, 1)}
        </Avatar>
        <Stack gap={0}>
          <h1 className="page-title" style={{ margin: 0 }}>
            {child.nickname}
          </h1>
          <Text size="sm" c="dimmed">
            {ageText(child)}
            {now.data ? ` · ${now.data.online ? 'в приложении' : 'не в приложении'}` : ''}
            {b ? ` · ${b.charging ? '⚡' : ''}${b.level} %` : ''}
          </Text>
        </Stack>
      </Group>

      <LibraryCard child={child} kids={kids} />
      {all && others.length > 0 && (
        <Group_
          title="Скопировать"
          rows={others.map((o) => ({
            label: allOf(o),
            value: 'чего нет',
            color: '#34c759',
            icon: 'M8 8h11v11H8zM5 16V5h11',
            onClick: () => void copyFrom(all, o, child),
          }))}
        />
      )}
      <Group_
        title="Распорядок"
        rows={[
          {
            to: `/routine?child=${child.id}`,
            label: 'Сейчас и пульт',
            color: '#007aff',
            icon: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2',
          },
          {
            to: '/routine?tab=plan',
            label: 'План дня',
            color: '#5856d6',
            icon: 'M4 6h16v14H4zM4 10h16M9 3v4M15 3v4',
          },
          {
            to: '/routine?tab=habits',
            label: 'Привычки и награды',
            color: '#ffcc00',
            icon: 'M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6-4.5-4.2 6.1-.7z',
          },
          {
            to: '/routine?tab=sleep',
            label: 'Сон и сказки',
            color: '#5856d6',
            icon: 'M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z',
          },
        ]}
      />
      <Group_
        title="Профиль"
        rows={[
          {
            to: '/progress',
            label: 'Прогресс',
            color: '#34c759',
            icon: 'M5 19V11M12 19V5M19 19v-6',
          },
          {
            to: '/children',
            label: 'Возраст, языки, вопросы',
            color: '#ff2d55',
            icon: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 20a8 8 0 0 1 16 0',
          },
          { to: '/devices', label: 'Телефон', color: '#8e8e93', icon: 'M7 3h10v18H7zM11 18h2' },
        ]}
      />
    </Stack>
  );
}
