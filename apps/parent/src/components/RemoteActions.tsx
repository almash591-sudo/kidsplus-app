// Плитки «Пульта» (этап 47): позвонить, позвать, послушать комнату, посмотреть глазами ребёнка —
// крупно и сразу на виду (раньше — шторка «Пульт», кнопка звонка на «Главной» и «глаз» в шапке).
import type { Child } from '@kidsplus/shared/api';
import { childPeer } from '@kidsplus/shared/calls';
import { Loader, SimpleGrid, UnstyledButton } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import type { ReactNode } from 'react';
import { parentCalls } from '../calls/CallLayer';
import { useControl } from './KidBits';
import { useMonitor } from './MonitorCard';
import { usePreview } from './PreviewButton';

function Tile({
  icon,
  label,
  note,
  tint,
  busy,
  disabled,
  accent,
  onClick,
  testId,
}: {
  icon: string;
  label: string;
  note?: ReactNode;
  tint: string;
  busy?: boolean;
  disabled?: boolean;
  /** Подсветка (push «шумно» — «Слушать»). */
  accent?: boolean;
  onClick: () => void;
  testId: string;
}) {
  return (
    <UnstyledButton
      className={accent ? 'remote-tile accent' : 'remote-tile'}
      style={{ '--tint': tint } as React.CSSProperties}
      onClick={onClick}
      disabled={disabled || busy}
      data-testid={testId}
    >
      <span className="remote-tile-icon" aria-hidden="true">
        {busy ? <Loader size={22} color={tint} /> : icon}
      </span>
      <span className="remote-tile-label">{label}</span>
      {note && <span className="remote-tile-note">{note}</span>}
    </UnstyledButton>
  );
}

export function RemoteActions({ child, listenAccent }: { child: Child; listenAccent?: boolean }) {
  const control = useControl(child.id);
  const { state, listen } = useMonitor(child.id);
  const preview = usePreview(child.id);
  const listening = Boolean(state.data?.listening);
  return (
    <SimpleGrid cols={2} spacing={8} data-testid="remote-actions">
      <Tile
        icon="📞"
        label="Позвонить"
        note="видеозвонок"
        tint="#34c759"
        onClick={() => void parentCalls()?.start([childPeer(child.id)], true)}
        testId="call-video"
      />
      <Tile
        icon="📣"
        label="Позвать"
        note="«Мама зовёт!»"
        tint="#ff9500"
        busy={control.isPending && control.variables?.action === 'call'}
        onClick={() =>
          control.mutate(
            { action: 'call' },
            {
              onSuccess: () =>
                notifications.show({ message: `${child.nickname}: на телефоне «Мама зовёт!»` }),
            },
          )
        }
        testId="call-kid"
      />
      <Tile
        icon="🎧"
        label={listening ? 'Слушаю…' : 'Слушать'}
        note="звук комнаты"
        tint="#5856d6"
        accent={listenAccent}
        busy={listen.isPending}
        disabled={listening}
        onClick={() => listen.mutate()}
        testId="monitor-listen"
      />
      <Tile
        icon="👁"
        label="Глазами ребёнка"
        note="его приложение"
        tint="#007aff"
        busy={preview.busy}
        onClick={preview.open}
        testId="preview-child"
      />
    </SimpleGrid>
  );
}
