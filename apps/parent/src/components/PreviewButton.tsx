// «Глазами ребёнка» (этап 16а): детское приложение под этим ребёнком — в окне размером с телефон
// (на компьютере) или в новой вкладке (на телефоне). Прогресс там не записывается.
// Этап 47: плитка в «Пульте» и кнопка в профиле ребёнка (значок-«глаз» в «Распорядке» не находили).
import type { PairingCreated } from '@kidsplus/shared/api';
import { Button } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useState } from 'react';
import { api, errorMessage } from '../api';

/** Открыть детское приложение этого ребёнка; busy — пока сервер выдаёт адрес. */
export function usePreview(childId: string) {
  const [busy, setBusy] = useState(false);
  const open = async () => {
    // Окно открываем сразу по нажатию (иначе браузер посчитает его всплывающим), адрес — потом.
    const win = window.open('about:blank', `kidsplus-preview-${childId}`, 'width=412,height=915');
    setBusy(true);
    try {
      const p = await api.post<PairingCreated>(`/parent/children/${childId}/preview`);
      if (win) win.location.href = p.url;
      else window.location.href = p.url;
    } catch (err) {
      win?.close();
      notifications.show({ color: 'red', message: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  };
  return { open: () => void open(), busy };
}

export function PreviewButton({ childId, fullWidth }: { childId: string; fullWidth?: boolean }) {
  const { open, busy } = usePreview(childId);
  return (
    <Button
      variant="default"
      fullWidth={fullWidth}
      loading={busy}
      onClick={open}
      data-testid="preview-child"
    >
      👁 Глазами ребёнка
    </Button>
  );
}
