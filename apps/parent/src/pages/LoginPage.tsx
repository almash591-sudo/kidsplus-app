import type { ParentMe } from '@kidsplus/shared/api';
import {
  Alert,
  Button,
  Center,
  Paper,
  PasswordInput,
  Stack,
  TextInput,
  Title,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { api } from '../api';
import { keys, queryClient, useMe } from '../queries';

export function LoginPage() {
  const me = useMe();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/';
  const setup = useQuery({
    queryKey: ['setup'],
    queryFn: () => api.get<{ available: boolean }>('/parent/setup'),
  });

  const form = useForm({ initialValues: { email: '', password: '' } });
  const login = useMutation({
    mutationFn: (v: typeof form.values) => api.post<ParentMe>('/parent/login', v),
    onSuccess: (user) => {
      queryClient.setQueryData(keys.me, user);
      navigate(from, { replace: true });
    },
  });

  if (me.data) return <Navigate to={from} replace />;

  return (
    <Center mih="100dvh" p="md" className="auth-screen">
      <Paper withBorder shadow="sm" p="xl" w="100%" maw={380}>
        <form onSubmit={form.onSubmit((v) => login.mutate(v))}>
          <Stack>
            <Title order={3}>KidsPlus — вход</Title>
            {setup.data?.available && (
              <Alert color="blue">
                Аккаунта ещё нет. Откройте ссылку первичной настройки из инструкции по
                развёртыванию.
              </Alert>
            )}
            <TextInput
              label="Email"
              type="email"
              autoComplete="username"
              required
              {...form.getInputProps('email')}
            />
            <PasswordInput
              label="Пароль"
              autoComplete="current-password"
              required
              {...form.getInputProps('password')}
            />
            <Button type="submit" loading={login.isPending}>
              Войти
            </Button>
          </Stack>
        </form>
      </Paper>
    </Center>
  );
}
