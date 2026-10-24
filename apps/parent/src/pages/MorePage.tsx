// «Ещё» (Кабинет 2.0): всё, что нужно реже, — сгруппированными списками, как «Настройки» iPhone.
// Группы — ребёнок, связь, телефоны и аккаунт; этап 47: те же, что в боковом меню (`nav.ts`).
import { Card, Stack, Text, UnstyledButton } from '@mantine/core';
import { Link } from 'react-router';
import { TileIcon } from '../components/NavIcon';
import { moreFor } from '../nav';
import { useMe } from '../queries';

export function MorePage() {
  const admin = useMe().data?.isAdmin === true;
  return (
    <Stack gap="md">
      <h1 className="page-title">Ещё</h1>
      {moreFor(admin).map((g) => (
        <Stack key={g.title} gap={6}>
          <Text size="xs" fw={600} c="dimmed" tt="uppercase" px={16}>
            {g.title}
          </Text>
          <Card padding={0}>
            <Stack gap={0} className="grouped">
              {g.items.map((it) => (
                <UnstyledButton key={it.to} component={Link} to={it.to} className="attention-row">
                  <TileIcon d={it.icon} color={it.color} />
                  <Text fw={500} style={{ flex: 1 }}>
                    {it.label}
                  </Text>
                  <span className="chevron" aria-hidden="true">
                    ›
                  </span>
                </UnstyledButton>
              ))}
            </Stack>
          </Card>
        </Stack>
      ))}
    </Stack>
  );
}
