// «Дети» — список профилей. Этап 47: касание — страница ребёнка, где всё про него: пульт,
// «Глазами ребёнка», что доступно, распорядок, «Изменить», телефон и «Удалить» (раньше
// «Изменить» и «Удалить» были только здесь, а страница ребёнка — отдельно).
import type { Child } from '@kidsplus/shared/api';
import { Button, Card, Group, Stack, Text, UnstyledButton } from '@mantine/core';
import { useState } from 'react';
import { Link } from 'react-router';
import { ChildFormModal } from '../components/ChildForm';
import { KidAvatar, kidColor } from '../components/KidBits';
import { ageText, LANGUAGE_LABELS } from '../lib/child';
import { useChildren } from '../queries';

export function ChildrenPage() {
  const children = useChildren();
  const kids = children.data ?? [];
  const [editing, setEditing] = useState<Child | 'new' | null>(null);

  return (
    <Stack gap="md">
      <Group justify="space-between" wrap="nowrap">
        <h1 className="page-title">Дети</h1>
        <Button onClick={() => setEditing('new')}>Добавить ребёнка</Button>
      </Group>

      {children.data?.length === 0 && (
        <Text c="dimmed">Профилей пока нет. Добавьте ребёнка, затем привяжите к нему телефон.</Text>
      )}

      {kids.length > 0 && (
        <Card padding={0}>
          <Stack gap={0} className="grouped" data-testid="children-list">
            {kids.map((c) => (
              <UnstyledButton
                key={c.id}
                component={Link}
                to={`/child/${c.id}`}
                className="attention-row"
              >
                <KidAvatar child={c} color={kidColor(kids, c.id)} size={40} />
                <Stack gap={0} style={{ flex: 1, minWidth: 0 }}>
                  <Text fw={600}>{c.nickname}</Text>
                  <Text size="xs" c="dimmed" truncate>
                    {[ageText(c), ...c.languages.map((l) => LANGUAGE_LABELS[l] ?? l)].join(' · ')}
                  </Text>
                </Stack>
                <span className="chevron" aria-hidden="true">
                  ›
                </span>
              </UnstyledButton>
            ))}
          </Stack>
        </Card>
      )}

      <ChildFormModal editing={editing} onClose={() => setEditing(null)} />
    </Stack>
  );
}
