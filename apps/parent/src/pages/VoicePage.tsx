// «Голос» (этап 14в): прослушать нейроголоса, выбрать голос и скорость, проверить свою фразу.
import {
  VOICE_SAMPLE,
  VOICE_SPEED_LABELS,
  VOICE_SPEEDS,
  type VoiceInfo,
  type VoiceName,
  type VoicePreview,
} from '@kidsplus/shared/voice';
import {
  ActionIcon,
  Alert,
  Button,
  Card,
  Group,
  Loader,
  SegmentedControl,
  Stack,
  Text,
  TextInput,
  UnstyledButton,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { api, errorMessage } from '../api';
import { modals } from '../lib/modals';
import { queryClient } from '../queries';

type Speed = (typeof VOICE_SPEEDS)[number];
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Озвучить фразу голосом (сервер ставит в очередь; ждём, пока будет готово) и проиграть. */
function usePlayer() {
  const [playing, setPlaying] = useState<string | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const play = async (key: string, voice: VoiceName, speed: Speed, text: string) => {
    audio.current?.pause();
    setPlaying(key);
    try {
      let p = await api.post<VoicePreview>('/parent/voice/preview', { voice, speed, text });
      for (let i = 0; p.status === 'pending' && i < 60; i++) {
        await wait(1000);
        p = await api.get<VoicePreview>(`/parent/voice/preview/${p.id}`);
      }
      if (p.status !== 'ready' || !p.url) {
        notifications.show({
          color: 'red',
          message:
            p.status === 'failed' ? 'Этот голос недоступен для русского' : 'Озвучка не успела',
        });
        return;
      }
      const a = new Audio(p.url);
      audio.current = a;
      await new Promise<void>((resolve) => {
        a.onended = () => resolve();
        a.onerror = () => resolve();
        void a.play().catch(() => resolve());
      });
    } catch (err) {
      notifications.show({ color: 'red', message: errorMessage(err) });
    } finally {
      setPlaying((k) => (k === key ? null : k));
    }
  };
  return { playing, play };
}

function PlayButton(props: { busy: boolean; onClick: () => void; label: string }) {
  return (
    <ActionIcon
      variant="light"
      radius="xl"
      size="lg"
      aria-label={props.label}
      onClick={(e) => {
        e.stopPropagation();
        props.onClick();
      }}
    >
      {props.busy ? <Loader size={16} /> : '▶'}
    </ActionIcon>
  );
}

export function VoicePage() {
  const info = useQuery({
    queryKey: ['voice'],
    queryFn: () => api.get<VoiceInfo>('/parent/voice'),
  });
  return info.data ? <VoiceForm key={info.data.voice + info.data.speed} info={info.data} /> : null;
}

function VoiceForm({ info }: { info: VoiceInfo }) {
  const [voice, setVoice] = useState<VoiceName>(info.voice);
  const [speed, setSpeed] = useState<Speed>(
    (VOICE_SPEEDS as readonly number[]).includes(info.speed) ? (info.speed as Speed) : 0.85,
  );
  const [text, setText] = useState('');
  const { playing, play } = usePlayer();
  const save = useMutation({
    mutationFn: () => api.put<VoiceInfo>('/parent/voice', { voice, speed }),
    onSuccess: (data) => {
      queryClient.setQueryData(['voice'], data);
      notifications.show({
        color: 'green',
        message: 'Голос сохранён. Переозвучка идёт в фоне — несколько минут.',
      });
    },
    onError: (err) => notifications.show({ color: 'red', message: errorMessage(err) }),
  });
  const changed = voice !== info.voice || speed !== info.speed;

  if (!info.serverVoice)
    return (
      <Stack gap="md">
        <h1 className="page-title">Голос</h1>
        <Alert color="gray">
          Сейчас фразы читает голос телефона — нейроголос на сервере не включён (docs/railway.md).
        </Alert>
      </Stack>
    );

  return (
    <Stack gap="md" maw={720}>
      <h1 className="page-title">Голос</h1>

      <Stack gap={6}>
        <Text size="xs" fw={600} c="dimmed" tt="uppercase" px={16}>
          Скорость речи
        </Text>
        <SegmentedControl
          fullWidth
          value={String(speed)}
          onChange={(v) => setSpeed(Number(v) as Speed)}
          data={VOICE_SPEEDS.map((s) => ({ value: String(s), label: VOICE_SPEED_LABELS[s] }))}
        />
        <Text size="xs" c="dimmed" px={16}>
          Замедленная речь нейроголоса иногда звучит неестественно — сравните на слух.
        </Text>
      </Stack>

      <Stack gap={6}>
        <Text size="xs" fw={600} c="dimmed" tt="uppercase" px={16}>
          Голос — нажмите ▶, чтобы послушать
        </Text>
        <Card padding={0}>
          <Stack gap={0} className="grouped plain">
            {info.voices.map((name) => (
              <UnstyledButton
                key={name}
                className="attention-row"
                onClick={() => setVoice(name)}
                aria-pressed={voice === name}
              >
                <Text fw={voice === name ? 700 : 500} style={{ flex: 1 }}>
                  {name}
                  {name === info.voice && (
                    <Text span size="xs" c="dimmed" fw={400}>
                      {'  '}сейчас
                    </Text>
                  )}
                </Text>
                {voice === name && (
                  <Text c="ios" fw={700} aria-hidden="true">
                    ✓
                  </Text>
                )}
                <PlayButton
                  label={`Послушать ${name}`}
                  busy={playing === name}
                  onClick={() => void play(name, name, speed, VOICE_SAMPLE)}
                />
              </UnstyledButton>
            ))}
          </Stack>
        </Card>
      </Stack>

      <Stack gap={6}>
        <Text size="xs" fw={600} c="dimmed" tt="uppercase" px={16}>
          Проверить свою фразу голосом {voice}
        </Text>
        <Card padding="md">
          <Group gap="xs" wrap="nowrap" align="flex-end">
            <TextInput
              style={{ flex: 1 }}
              placeholder="Например: Молодец, здор+ово!"
              value={text}
              maxLength={200}
              onChange={(e) => setText(e.currentTarget.value)}
            />
            <PlayButton
              label="Послушать фразу"
              busy={playing === 'custom'}
              onClick={() => text.trim() && void play('custom', voice, speed, text)}
            />
          </Group>
          <Text size="xs" c="dimmed" mt={6}>
            Неверное ударение? Поставьте «+» перед ударной гласной: «здор+ово». Так же можно писать
            в словах карточек и вопросах к видео — ребёнок «+» не увидит.
          </Text>
        </Card>
      </Stack>

      <Button
        size="md"
        radius="xl"
        disabled={!changed}
        loading={save.isPending}
        onClick={() =>
          modals.confirm({
            title: `Голос ${voice}, «${VOICE_SPEED_LABELS[speed].toLowerCase()}»?`,
            message:
              'Все фразы, слова карточек и вопросы будут озвучены заново (несколько минут; расходуется лимит сервиса озвучки). Пока идёт переозвучка, новые фразы звучат голосом телефона.',
            confirmLabel: 'Сохранить',
            onConfirm: () => save.mutate(),
          })
        }
      >
        Сохранить голос
      </Button>
    </Stack>
  );
}
