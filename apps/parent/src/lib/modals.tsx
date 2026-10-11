import { Text } from '@mantine/core';
import { modals as mantineModals } from '@mantine/modals';

export const modals = {
  /** Диалог подтверждения опасного действия. */
  confirm(o: { title: string; message: string; confirmLabel: string; onConfirm: () => void }) {
    mantineModals.openConfirmModal({
      title: o.title,
      children: <Text size="sm">{o.message}</Text>,
      labels: { confirm: o.confirmLabel, cancel: 'Отмена' },
      confirmProps: { color: 'red' },
      onConfirm: o.onConfirm,
    });
  },
};
