// «Резервные копии» (этап 15а): когда была последняя копия базы и «сделать сейчас».
import { BACKUP_FOLDER, type BackupStatus } from '@kidsplus/shared/backup';
import { Alert, Button, Card, Stack, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api, errorMessage } from '../api';
import { queryClient } from '../queries';

const KEY = ['backup'];

const when = (iso: string) =>
  new Date(iso).toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  });
const size = (bytes: number) =>
  bytes > 1e9 ? `${(bytes / 1e9).toFixed(1)} ГБ` : `${Math.max(1, Math.round(bytes / 1e6))} МБ`;

export function BackupPage() {
  const status = useQuery({
    queryKey: KEY,
    queryFn: () => api.get<BackupStatus>('/parent/backup'),
    // Пока копия делается — обновляем статус.
    refetchInterval: (q) => (q.state.data?.requestedAt ? 5000 : false),
  });
  const now = useMutation({
    mutationFn: () => api.post<BackupStatus>('/parent/backup'),
    onSuccess: (data) => queryClient.setQueryData(KEY, data),
    onError: (err) => notifications.show({ color: 'red', message: errorMessage(err) }),
  });
  const s = status.data;

  return (
    <Stack gap="md" maw={720}>
      <h1 className="page-title">Резервные копии</h1>
      {s && !s.configured && (
        <Alert color="orange" title="Копии пока не делаются">
          Нужно один раз разрешить доступ к Google Диску: на компьютере запустить{' '}
          <code>node scripts/google-drive-auth.mjs</code> (инструкция — docs/backup.md).
        </Alert>
      )}
      {s?.configured && (
        <>
          <Card padding={0}>
            <Stack gap={0} className="grouped plain">
              <div className="attention-row">
                <Text style={{ flex: 1 }}>Последняя копия</Text>
                <Text c="dimmed" size="sm">
                  {s.last ? `${when(s.last.at)} · ${size(s.last.bytes)}` : 'ещё не было'}
                </Text>
              </div>
              <div className="attention-row">
                <Text style={{ flex: 1 }}>Когда</Text>
                <Text c="dimmed" size="sm">
                  каждую ночь в 04:00
                </Text>
              </div>
              <div className="attention-row">
                <Text style={{ flex: 1 }}>Где</Text>
                <Text c="dimmed" size="sm" ta="right">
                  {s.target === 's3'
                    ? `хранилище Cloudflare R2 → backups/, последние ${s.keep}`
                    : `Google Диск → «${BACKUP_FOLDER}», последние ${s.keep}`}
                </Text>
              </div>
            </Stack>
          </Card>
          {s.error && (
            <Alert color="red" title={`Ошибка ${when(s.error.at)}`}>
              {s.error.message}
            </Alert>
          )}
          <Button
            radius="xl"
            size="md"
            loading={now.isPending || Boolean(s.requestedAt)}
            onClick={() => now.mutate()}
          >
            {s.requestedAt ? 'Копия делается…' : 'Сделать копию сейчас'}
          </Button>
          <Text size="xs" c="dimmed" px={16}>
            В копии — вся база: профили, планы, прогресс, одобренный контент.
            {s.target === 's3'
              ? ' Картинки, озвучка и фото с камеры лежат в том же хранилище отдельно от копий.'
              : ' Приложение видит на Диске только свою папку.'}
          </Text>
        </>
      )}
    </Stack>
  );
}
