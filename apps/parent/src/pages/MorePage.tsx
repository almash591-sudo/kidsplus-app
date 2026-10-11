// «Ещё» (Кабинет 2.0): всё, что нужно реже, — сгруппированными списками, как «Настройки» iPhone.
import { Card, Stack, Text, UnstyledButton } from '@mantine/core';
import { Link } from 'react-router';

const GROUPS: {
  title: string;
  items: { to: string; label: string; color: string; icon: string }[];
}[] = [
  {
    title: 'Дети',
    items: [
      {
        to: '/now',
        label: 'Подробно сейчас',
        color: '#007aff',
        icon: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2',
      },
      {
        to: '/captures',
        label: 'Фото и видео',
        color: '#ff9500',
        icon: 'M3 5h18v14H3zM8 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM21 16l-5-5-9 8',
      },
      {
        to: '/calls',
        label: 'Звонки',
        color: '#34c759',
        icon: 'M6.5 4h3l1.6 4.2-2 1.3a11 11 0 0 0 5.4 5.4l1.3-2L20 14.5v3a2.5 2.5 0 0 1-2.5 2.5A14.5 14.5 0 0 1 4 6.5 2.5 2.5 0 0 1 6.5 4z',
      },
      {
        to: '/children',
        label: 'Профили детей',
        color: '#ff2d55',
        icon: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 20a8 8 0 0 1 16 0',
      },
    ],
  },
  {
    title: 'Телефоны и аккаунт',
    items: [
      { to: '/devices', label: 'Устройства', color: '#5856d6', icon: 'M7 3h10v18H7zM11 18h2' },
      {
        to: '/account',
        label: 'Аккаунт и оформление',
        color: '#8e8e93',
        icon: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
      },
    ],
  },
];

export function MorePage() {
  return (
    <Stack gap="md">
      <h1 className="page-title">Ещё</h1>
      {GROUPS.map((g) => (
        <Stack key={g.title} gap={6}>
          <Text size="xs" fw={600} c="dimmed" tt="uppercase" px={16}>
            {g.title}
          </Text>
          <Card padding={0}>
            <Stack gap={0} className="grouped">
              {g.items.map((it) => (
                <UnstyledButton key={it.to} component={Link} to={it.to} className="attention-row">
                  <span className="attention-icon" style={{ background: it.color }}>
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
                      <path d={it.icon} />
                    </svg>
                  </span>
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
