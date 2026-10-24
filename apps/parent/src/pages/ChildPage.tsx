// Страница ребёнка (этап 33): всё про одного ребёнка в одном месте — сейчас, что доступно
// (и «добавить то, что есть у …»), распорядок, профиль. Разделы открываются на этом ребёнке.
// Этап 47: «Глазами ребёнка» — крупной кнопкой здесь же; «Изменить», телефон и «Удалить» — тоже
// здесь (раньше — только в списке «Дети»).
import type { Child } from '@kidsplus/shared/api';
import { Alert, Button, Card, Group, Loader, Stack, Text, UnstyledButton } from '@mantine/core';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { ChildFormModal, useRemoveChild } from '../components/ChildForm';
import { KidAvatar, kidColor } from '../components/KidBits';
import { copyFrom, LibraryCard, useAssignables } from '../components/Library';
import { TileIcon } from '../components/NavIcon';
import { PreviewButton } from '../components/PreviewButton';
import { ageText, LANGUAGE_LABELS } from '../lib/child';
import { setCurrentChild } from '../lib/currentChild';
import { allOf } from '../lib/names';
import { MAIN } from '../nav';
import { useChildNow, useChildren, useDevices } from '../queries';

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
                <TileIcon d={r.icon} color={r.color} />
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
  const devices = useDevices();
  const navigate = useNavigate();
  const [editing, setEditing] = useState<Child | null>(null);
  const remove = useRemoveChild(() => void navigate('/children', { replace: true }));
  // Открыли ребёнка — разделы кабинета теперь про него.
  useEffect(() => {
    if (child) setCurrentChild(child.id);
  }, [child]);

  if (children.isPending) return <Loader />;
  if (!child) return <Alert color="red">Ребёнок не найден.</Alert>;
  const b = now.data?.battery;
  const others = kids.filter((k) => k.id !== child.id);
  const phones = devices.data?.filter((d) => d.childId === child.id && !d.revokedAt).length ?? 0;

  return (
    <Stack gap="md" data-testid="child-page">
      <Group gap="md" wrap="nowrap">
        <KidAvatar child={child} color={kidColor(kids, child.id)} size={60} />
        <Stack gap={0} style={{ flex: 1, minWidth: 0 }}>
          <h1 className="page-title" style={{ margin: 0 }}>
            {child.nickname}
          </h1>
          <Text size="sm" c="dimmed">
            {ageText(child)}
            {now.data ? ` · ${now.data.online ? 'в приложении' : 'не в приложении'}` : ''}
            {b ? ` · ${b.charging ? '⚡' : ''}${b.level} %` : ''}
          </Text>
        </Stack>
        <Button variant="light" size="xs" onClick={() => setEditing(child)}>
          Изменить
        </Button>
      </Group>

      <PreviewButton childId={child.id} fullWidth />
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
            to: `/remote?child=${child.id}`,
            label: 'Пульт',
            color: MAIN[0]!.color,
            icon: MAIN[0]!.icon,
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
            onClick: () => setEditing(child),
            label: 'Возраст, языки, вопросы',
            value: child.languages.map((l) => LANGUAGE_LABELS[l] ?? l).join(', '),
            color: '#ff2d55',
            icon: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 20a8 8 0 0 1 16 0',
          },
          {
            to: '/devices',
            label: 'Телефон',
            value: devices.data ? (phones ? 'привязан' : 'не привязан') : undefined,
            color: '#8e8e93',
            icon: 'M7 3h10v18H7zM11 18h2',
          },
        ]}
      />
      <Button variant="subtle" color="red" onClick={() => remove(child)} data-testid="child-delete">
        Удалить профиль
      </Button>
      <ChildFormModal editing={editing} onClose={() => setEditing(null)} />
    </Stack>
  );
}
