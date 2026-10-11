import type { ParentMe } from '@kidsplus/shared/api';
import {
  Alert,
  Button,
  Center,
  Paper,
  PasswordInput,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { useMutation } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router';
import { api } from '../api';
import { keys, queryClient } from '../queries';

const TEXT = {
  setup: {
    title: 'Первичная настройка',
    hint: 'Создайте первый родительский аккаунт. После этого ссылка перестанет работать.',
    endpoint: '/parent/setup',
  },
  invite: {
    title: 'Приглашение в KidsPlus',
    hint: 'Создайте свой родительский аккаунт. Ссылка одноразовая.',
    endpoint: '/parent/invites/accept',
  },
} as const;

/** Создание аккаунта: первичная настройка (/setup?token=…) или приглашение (/invite?token=…). */
export function AuthFormPage({ mode }: { mode: keyof typeof TEXT }) {
  const t = TEXT[mode];
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const navigate = useNavigate();

  const form = useForm({
    initialValues: { email: '', password: '', confirm: '' },
    validate: {
      password: (v) => (v.length < 10 ? 'минимум 10 символов' : null),
      confirm: (v, values) => (v !== values.password ? 'пароли не совпадают' : null),
    },
  });

  const create = useMutation({
    mutationFn: (v: typeof form.values) =>
      api.post<ParentMe>(t.endpoint, { token, email: v.email, password: v.password }),
    onSuccess: (user) => {
      queryClient.setQueryData(keys.me, user);
      navigate('/children', { replace: true });
    },
  });

  return (
    <Center mih="100vh" p="md">
      <Paper withBorder shadow="sm" p="xl" w="100%" maw={400}>
        <form onSubmit={form.onSubmit((v) => create.mutate(v))}>
          <Stack>
            <Title order={3}>{t.title}</Title>
            <Text size="sm" c="dimmed">
              {t.hint}
            </Text>
            {!token && <Alert color="red">В ссылке нет токена — откройте ссылку целиком.</Alert>}
            <TextInput
              label="Email"
              type="email"
              autoComplete="username"
              required
              {...form.getInputProps('email')}
            />
            <PasswordInput
              label="Пароль"
              autoComplete="new-password"
              required
              {...form.getInputProps('password')}
            />
            <PasswordInput
              label="Пароль ещё раз"
              autoComplete="new-password"
              required
              {...form.getInputProps('confirm')}
            />
            <Button type="submit" loading={create.isPending} disabled={!token}>
              Создать аккаунт
            </Button>
          </Stack>
        </form>
      </Paper>
    </Center>
  );
}
