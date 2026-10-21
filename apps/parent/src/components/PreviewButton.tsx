// «Глазами ребёнка» (этап 16а): детское приложение под этим ребёнком — в окне размером с телефон
// (на компьютере) или в новой вкладке (на телефоне). Прогресс там не записывается.
import type { PairingCreated } from '@kidsplus/shared/api';
import { ActionIcon, Button } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useState } from 'react';
import { api, errorMessage } from '../api';

export function PreviewButton({
  childId,
  fullWidth,
  icon,
}: {
  childId: string;
  fullWidth?: boolean;
  /** Круглая кнопка-«глаз» в шапке «Распорядка» (этап 40). */
  icon?: boolean;
}) {
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
  if (icon)
    return (
      <ActionIcon
        size={40}
        radius="xl"
        variant="light"
        loading={busy}
        onClick={() => void open()}
        data-testid="preview-child"
        aria-label="Глазами ребёнка"
        title="Глазами ребёнка"
      >
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />
        </svg>
      </ActionIcon>
    );
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
