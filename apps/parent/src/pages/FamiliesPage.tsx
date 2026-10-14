// «Семьи» (этап 23): семья-администратор приглашает родственников. У каждой семьи свой
// закрытый кабинет — свои дети, телефоны и звонки; видео, карточки и игры общие.
import type { FamiliesOverview, InviteCreated } from '@kidsplus/shared/api';
import { Badge, Button, Card, CopyButton, Group, Stack, Text, TextInput } from '@mantine/core';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api, errorMessage } from '../api';
import { queryClient } from '../queries';

const KEY = ['families'] as const;
const date = (iso: string) => new Date(iso).toLocaleDateString('ru-RU');

export function FamiliesPage() {
  const [name, setName] = useState('');
  const [link, setLink] = useState<{ name: string; url: string; until: string } | null>(null);
  const overview = useQuery({
    queryKey: KEY,
    queryFn: () => api.get<FamiliesOverview>('/parent/families'),
  });
  const invite = useMutation({
    mutationFn: () => api.post<InviteCreated>('/parent/families/invites', { name: name.trim() }),
    onSuccess: (r) => {
      const url = new URL('/invite', window.location.origin);
      url.searchParams.set('token', r.token);
      setLink({ name: name.trim(), url: url.toString(), until: date(r.expiresAt) });
      setName('');
      void queryClient.invalidateQueries({ queryKey: KEY });
    },
  });

  return (
    <Stack gap="md">
      <h1 className="page-title">Семьи</h1>
      <Text size="sm" c="dimmed">
        У каждой семьи свой закрытый кабинет: свои дети, телефоны, звонки и «мамин голос». Видео,
        карточки и игры общие — их добавляете и проверяете вы, а другие семьи только выбирают, что
        показать своим детям.
      </Text>

      <Card>
        <Stack gap="sm">
          <Text fw={600}>Пригласить семью</Text>
          <TextInput
            label="Как назвать семью"
            placeholder="Например: Семья Айгуль"
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
            maxLength={60}
          />
          <Button
            onClick={() => invite.mutate()}
            loading={invite.isPending}
            disabled={!name.trim()}
          >
            Создать ссылку
          </Button>
          {invite.isError && (
            <Text c="red" size="sm">
              {errorMessage(invite.error)}
            </Text>
          )}
          {link && (
            <Stack gap={6}>
              <Text size="sm">
                Ссылка для «{link.name}» — одноразовая, действует до {link.until}. По ней создаётся
                аккаунт родителя новой семьи.
              </Text>
              <TextInput value={link.url} readOnly onFocus={(e) => e.currentTarget.select()} />
              <CopyButton value={link.url}>
                {({ copied, copy }) => (
                  <Button variant="light" onClick={copy}>
                    {copied ? 'Скопировано' : 'Скопировать ссылку'}
                  </Button>
                )}
              </CopyButton>
            </Stack>
          )}
        </Stack>
      </Card>

      <Card>
        <Stack gap="xs">
          <Text fw={600}>Все семьи</Text>
          {overview.isError && <Text c="red">{errorMessage(overview.error)}</Text>}
          {overview.data?.families.map((f) => (
            <Group key={f.id} justify="space-between" wrap="nowrap">
              <Stack gap={0}>
                <Text fw={500}>{f.name}</Text>
                <Text size="xs" c="dimmed">
                  родителей: {f.parents} · детей: {f.children} · с {date(f.createdAt)}
                </Text>
              </Stack>
              {f.isAdmin && <Badge variant="light">администратор</Badge>}
            </Group>
          ))}
          {overview.data?.pending.map((p) => (
            <Group key={p.createdAt} justify="space-between" wrap="nowrap">
              <Stack gap={0}>
                <Text fw={500}>{p.name}</Text>
                <Text size="xs" c="dimmed">
                  приглашение ждёт до {date(p.expiresAt)}
                </Text>
              </Stack>
              <Badge variant="outline" color="gray">
                ждёт
              </Badge>
            </Group>
          ))}
        </Stack>
      </Card>
    </Stack>
  );
}
