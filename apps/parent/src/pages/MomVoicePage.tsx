// «Мамин голос» (этап 15в): похвала и подсказки голосом родителя вместо нейроголоса.
import type { MediaRef } from '@kidsplus/shared/api';
import {
  FAMILY_PHRASE_HINTS,
  FAMILY_PHRASE_KINDS,
  FAMILY_PHRASE_TITLES,
  recordMaxSec,
  type FamilyPhrase,
  type FamilyPhraseKind,
} from '@kidsplus/shared/family-voice';
import { ActionIcon, Card, Stack, Text, TextInput } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api, errorMessage } from '../api';
import { VoiceRecorder } from '../components/VoiceRecorder';
import { queryClient } from '../queries';

const KEY = ['family-phrases'];
const play = (url: string) => void new Audio(url).play().catch(() => {});

function KindSection({ kind, phrases }: { kind: FamilyPhraseKind; phrases: FamilyPhrase[] }) {
  const [label, setLabel] = useState('');
  const add = useMutation({
    mutationFn: (audio: MediaRef) =>
      api.post<FamilyPhrase[]>('/parent/family-phrases', {
        kind,
        audioId: audio.id,
        label:
          label.trim() ||
          (kind === 'lullaby' ? 'Колыбельная' : FAMILY_PHRASE_HINTS[kind].split('!')[0] + '!'),
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(KEY, data);
      setLabel('');
    },
    onError: (err) => notifications.show({ color: 'red', message: errorMessage(err) }),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete<FamilyPhrase[]>(`/parent/family-phrases/${id}`),
    onSuccess: (data) => queryClient.setQueryData(KEY, data),
  });

  return (
    <Stack gap={6}>
      <Text size="xs" fw={600} c="dimmed" tt="uppercase" px={16}>
        {FAMILY_PHRASE_TITLES[kind]}
      </Text>
      <Card padding={0}>
        <Stack gap={0} className="grouped plain">
          {phrases.map((p) => (
            <div key={p.id} className="attention-row">
              <ActionIcon
                variant="light"
                radius="xl"
                aria-label="Послушать"
                onClick={() => play(p.audio.url)}
              >
                ▶
              </ActionIcon>
              <Text style={{ flex: 1 }}>{p.label}</Text>
              <ActionIcon
                variant="subtle"
                color="red"
                aria-label="Удалить"
                onClick={() => remove.mutate(p.id)}
              >
                ✕
              </ActionIcon>
            </div>
          ))}
          <div className="attention-row">
            <TextInput
              style={{ flex: 1 }}
              placeholder={`Что скажете: ${FAMILY_PHRASE_HINTS[kind]}`}
              value={label}
              maxLength={120}
              onChange={(e) => setLabel(e.currentTarget.value)}
            />
            <VoiceRecorder maxSec={recordMaxSec(kind)} onRecorded={(a) => add.mutate(a)} />
          </div>
        </Stack>
      </Card>
      <Text size="xs" c="dimmed" px={16}>
        {phrases.length
          ? 'Ребёнок слышит эти записи вместо нейроголоса — по очереди, случайно.'
          : 'Пока записей нет — звучит нейроголос.'}
      </Text>
    </Stack>
  );
}

export function MomVoicePage() {
  const phrases = useQuery({
    queryKey: KEY,
    queryFn: () => api.get<FamilyPhrase[]>('/parent/family-phrases'),
  });
  return (
    <Stack gap="md" maw={720}>
      <h1 className="page-title">Мамин голос</h1>
      <Text c="dimmed" size="sm" px={4}>
        Запишите похвалу своим голосом — касание «Записать», скажите фразу, «Стоп». Слова в
        карточках тоже можно записать своим голосом: «Контент» → «Карточки» → набор → 🎙 у карточки.
      </Text>
      {phrases.data &&
        FAMILY_PHRASE_KINDS.map((k) => (
          <KindSection key={k} kind={k} phrases={phrases.data.filter((p) => p.kind === k)} />
        ))}
    </Stack>
  );
}
