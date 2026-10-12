import { AppShell, Burger, Center, Group, Loader, NavLink, Title } from '@mantine/core';
import { useDisclosure, useMediaQuery } from '@mantine/hooks';
import { Navigate, NavLink as RouterLink, Outlet, useLocation } from 'react-router';
import { CallLayer } from './calls/CallLayer';
import { useMe } from './queries';
import { CompactTitle, FetchBar, PageTransition } from './components/Chrome';

/** Боковое меню (компьютер): главные разделы и всё из «Ещё». */
const NAV = [
  { to: '/home', label: 'Главная', icon: '🏠' },
  { to: '/content', label: 'Контент', icon: '🎬' },
  { to: '/plan', label: 'План', icon: '📅' },
  { to: '/progress', label: 'Прогресс', icon: '📊' },
  { to: '/now', label: 'Подробно сейчас', icon: '⏱️' },
  { to: '/captures', label: 'Фото и видео', icon: '📷' },
  { to: '/calls', label: 'Звонки', icon: '📞' },
  { to: '/children', label: 'Дети', icon: '👧' },
  { to: '/devices', label: 'Устройства', icon: '📱' },
  { to: '/account', label: 'Аккаунт', icon: '⚙️' },
];

/** Вкладки внизу на телефоне — как в приложениях iPhone; остальное — в «Ещё» (меню). */
const TABS = [
  { to: '/home', label: 'Главная', icon: 'M4 11.5L12 5l8 6.5M6.5 10v9.5h11V10', also: ['/now'] },
  {
    to: '/content',
    label: 'Контент',
    icon: 'M4 5h16v14H4zM9 9.5v5l4.5-2.5z',
    also: ['/moderation', '/videos', '/decks', '/games'],
  },
  { to: '/plan', label: 'План', icon: 'M4 6h16v14H4zM4 10h16M9 3v4M15 3v4', also: [] },
  { to: '/progress', label: 'Прогресс', icon: 'M5 19V11M12 19V5M19 19v-6', also: ['/analytics'] },
  {
    to: '/more',
    label: 'Ещё',
    icon: 'M5 12h.01M12 12h.01M19 12h.01',
    also: ['/captures', '/calls', '/children', '/devices', '/account'],
  },
];

function TabIcon({ d }: { d: string }) {
  return (
    <svg
      width="26"
      height="26"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  );
}

function TabBar() {
  const { pathname } = useLocation();
  return (
    <nav className="tabbar" aria-label="Разделы кабинета">
      {TABS.map((t) => {
        // Вложенные страницы подсвечивают свою вкладку: «Фото» — «Ещё», «Модерация» — «Контент».
        const active = [t.to, ...t.also].some((p) => pathname.startsWith(p));
        return (
          <RouterLink key={t.to} to={t.to} aria-current={active ? 'page' : undefined}>
            <TabIcon d={t.icon} />
            <span>{t.label}</span>
          </RouterLink>
        );
      })}
    </nav>
  );
}

/** Оболочка кабинета; без входа отправляет на /login. */
export function Layout() {
  const me = useMe();
  const [opened, { toggle, close }] = useDisclosure();
  const location = useLocation();
  const mobile = useMediaQuery('(max-width: 47.99em)') ?? false;

  if (me.isPending) {
    return (
      <Center h="100vh">
        <Loader />
      </Center>
    );
  }
  if (!me.data) return <Navigate to="/login" replace state={{ from: location.pathname }} />;

  return (
    <AppShell
      // Телефон: без шапки и бокового меню — внизу вкладки, как в приложениях iPhone.
      header={{ height: 56, collapsed: mobile }}
      navbar={{ width: 220, breakpoint: 'sm', collapsed: { mobile: true } }}
      padding="md"
    >
      <AppShell.Header>
        <Group h="100%" px="md">
          <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" aria-label="Меню" />
          <Title order={4}>KidsPlus</Title>
        </Group>
      </AppShell.Header>
      <AppShell.Navbar p="xs">
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            component={RouterLink}
            to={item.to}
            label={item.label}
            leftSection={<span aria-hidden>{item.icon}</span>}
            active={location.pathname.startsWith(item.to)}
            onClick={close}
          />
        ))}
      </AppShell.Navbar>
      <AppShell.Main>
        <PageTransition>
          <Outlet />
        </PageTransition>
      </AppShell.Main>
      <CompactTitle />
      <FetchBar />
      <TabBar />
      <CallLayer />
    </AppShell>
  );
}
