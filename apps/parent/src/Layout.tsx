import {
  AppShell,
  Burger,
  Center,
  Group,
  Loader,
  NavLink,
  ScrollArea,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { useDisclosure, useMediaQuery } from '@mantine/hooks';
import { Navigate, NavLink as RouterLink, Outlet, useLocation } from 'react-router';
import { CallLayer } from './calls/CallLayer';
import { useMe } from './queries';
import { CompactTitle, FetchBar, PageTransition } from './components/Chrome';
import { LineIcon, TileIcon } from './components/NavIcon';
import { isActive, MAIN, MORE, moreFor, type NavItem } from './nav';

/** «Ещё» на телефоне подсвечен на любой странице из своих групп. */
const MORE_TAB = {
  to: '/more',
  label: 'Ещё',
  icon: 'M5 12h.01M12 12h.01M19 12h.01',
  also: MORE.flatMap((g) => g.items.map((it) => it.to)),
};

function TabBar() {
  const { pathname } = useLocation();
  return (
    <nav className="tabbar" aria-label="Разделы кабинета">
      {[...MAIN, MORE_TAB].map((t) => {
        // Вложенные страницы подсвечивают свою вкладку: «Фото» — «Ещё», «Модерация» — «Контент».
        const active = isActive(pathname, t);
        return (
          <RouterLink key={t.to} to={t.to} aria-current={active ? 'page' : undefined}>
            <LineIcon d={t.icon} />
            <span>{t.label}</span>
          </RouterLink>
        );
      })}
    </nav>
  );
}

/** Боковое меню на компьютере: главные разделы и группы «Ещё» — те же, что на телефоне. */
function SideNav({ admin, onPick }: { admin: boolean; onPick: () => void }) {
  const { pathname } = useLocation();
  const link = (it: NavItem) => (
    <NavLink
      key={it.to}
      component={RouterLink}
      to={it.to}
      label={it.label}
      leftSection={<TileIcon d={it.icon} color={it.color} />}
      active={isActive(pathname, it)}
      onClick={onPick}
      className="side-link"
    />
  );
  return (
    <ScrollArea type="never" data-testid="side-nav">
      <Stack gap={2}>{MAIN.map(link)}</Stack>
      {moreFor(admin).map((g) => (
        <Stack key={g.title} gap={2} mt="md">
          <Text size="xs" fw={600} c="dimmed" tt="uppercase" px="sm" mb={2}>
            {g.title}
          </Text>
          {g.items.map(link)}
        </Stack>
      ))}
    </ScrollArea>
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
      <Center h="100dvh">
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
        <SideNav admin={me.data.isAdmin === true} onPick={close} />
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
