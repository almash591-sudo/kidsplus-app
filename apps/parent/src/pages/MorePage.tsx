// «Ещё» (Кабинет 2.0): всё, что нужно реже, — сгруппированными списками, как «Настройки» iPhone.
import { Card, Stack, Text, UnstyledButton } from '@mantine/core';
import { Link } from 'react-router';
import { useMe } from '../queries';

const GROUPS: {
  title: string;
  /** admin — только семье-администратору (этап 23). */
  items: { to: string; label: string; color: string; icon: string; admin?: boolean }[];
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
        to: '/habits',
        label: 'Привычки и награды',
        color: '#ffcc00',
        icon: 'M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6-4.5-4.2 6.1-.7z',
      },
      {
        to: '/sleep',
        label: 'Сон и сказки',
        color: '#5856d6',
        icon: 'M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z',
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
        to: '/mom-voice',
        label: 'Мамин голос',
        color: '#ff375f',
        icon: 'M12 21s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 5.6-7 10-7 10z',
      },
      {
        to: '/voice',
        admin: true,
        label: 'Голос озвучки',
        color: '#af52de',
        icon: 'M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5 11a7 7 0 0 0 14 0M12 18v3',
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
        to: '/families',
        admin: true,
        label: 'Семьи',
        color: '#ff9f0a',
        icon: 'M3 21V10l9-6 9 6v11M9 21v-6h6v6',
      },
      {
        to: '/backup',
        admin: true,
        label: 'Резервные копии',
        color: '#30b0c7',
        icon: 'M4 7c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3zM4 7v10c0 1.7 3.6 3 8 3s8-1.3 8-3V7M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3',
      },
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
  const admin = useMe().data?.isAdmin === true;
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
              {g.items
                .filter((it) => admin || !it.admin)
                .map((it) => (
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
