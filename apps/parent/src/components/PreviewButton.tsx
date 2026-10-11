// «Глазами ребёнка» (этап 16а): детское приложение под этим ребёнком — в окне размером с телефон
// (на компьютере) или в новой вкладке (на телефоне). Прогресс там не записывается.
import type { PairingCreated } from '@kidsplus/shared/api';
import { Button } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useState } from 'react';
import { api, errorMessage } from '../api';

export function PreviewButton({ childId, fullWidth }: { childId: string; fullWidth?: boolean }) {
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
  return (
    <Button
      variant="default"
      fullWidth={fullWidth}
      loading={busy}
      onClick={() => void open()}
      data-testid="preview-child"
    >
      👁 Глазами ребёнка
    </Button>
  );
}
