import { IMAGE_MAX_BYTES, type EmojiItem, type MediaRef } from '@kidsplus/shared/api';
import {
  Button,
  FileButton,
  Image,
  Loader,
  Modal,
  SimpleGrid,
  Stack,
  Tabs,
  Text,
  TextInput,
  UnstyledButton,
} from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../api';

/** Выбор картинки: эмодзи Twemoji (поиск по-русски) или своя загрузка. */
export function ImagePicker({
  opened,
  onClose,
  onPick,
  initialQuery = '',
}: {
  opened: boolean;
  onClose: () => void;
  onPick: (image: MediaRef) => void;
  initialQuery?: string;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [debounced] = useDebouncedValue(query, 300);

  const found = useQuery({
    queryKey: ['emoji', debounced],
    queryFn: () => api.get<EmojiItem[]>(`/parent/emoji?q=${encodeURIComponent(debounced)}`),
    enabled: opened && debounced.trim().length > 0,
    staleTime: Infinity,
  });

  const done = (image: MediaRef) => {
    onPick(image);
    onClose();
  };
  const pickEmoji = useMutation({
    mutationFn: (code: string) => api.post<MediaRef>('/parent/media/emoji', { code }),
    onSuccess: done,
  });
  const upload = useMutation({
    mutationFn: (file: File) => api.upload<MediaRef>('/parent/media/images', file),
    onSuccess: done,
  });

  return (
    <Modal opened={opened} onClose={onClose} title="Картинка" size="lg">
      <Tabs defaultValue="emoji">
        <Tabs.List>
          <Tabs.Tab value="emoji">Эмодзи</Tabs.Tab>
          <Tabs.Tab value="upload">Своя картинка</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="emoji" pt="md">
          <Stack>
            <TextInput
              placeholder="кошка, яблоко, красный…"
              value={query}
              onChange={(e) => setQuery(e.currentTarget.value)}
              data-autofocus
            />
            {found.isFetching && <Loader size="sm" />}
            {found.data?.length === 0 && (
              <Text c="dimmed">Ничего не нашлось — попробуйте другое слово.</Text>
            )}
            <SimpleGrid cols={{ base: 4, sm: 6 }} spacing="xs">
              {found.data?.map((e) => (
                <UnstyledButton
                  key={e.code}
                  title={e.label}
                  onClick={() => pickEmoji.mutate(e.code)}
                  disabled={pickEmoji.isPending}
                  style={{
                    borderRadius: 8,
                    padding: 6,
                    border: '1px solid var(--mantine-color-default-border)',
                  }}
                >
                  <Image
                    src={`/api/parent/emoji/${e.code}.svg`}
                    alt={e.label}
                    h={56}
                    fit="contain"
                  />
                </UnstyledButton>
              ))}
            </SimpleGrid>
            <Text size="xs" c="dimmed">
              Эмодзи: Twemoji, лицензия CC BY 4.0.
            </Text>
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="upload" pt="md">
          <Stack>
            <Text size="sm">PNG, JPEG или WebP, до {IMAGE_MAX_BYTES / 1024 / 1024} МБ.</Text>
            <FileButton
              accept="image/png,image/jpeg,image/webp"
              onChange={(f) => f && upload.mutate(f)}
            >
              {(props) => (
                <Button {...props} loading={upload.isPending} w="fit-content">
                  Выбрать файл
                </Button>
              )}
            </FileButton>
          </Stack>
        </Tabs.Panel>
      </Tabs>
    </Modal>
  );
}

/** Квадратик выбранной картинки с кнопкой выбора. */
export function ImageSlot({
  image,
  onPick,
  size = 72,
  hint,
}: {
  image: MediaRef | null;
  onPick: (image: MediaRef) => void;
  size?: number;
  hint?: string;
}) {
  const [opened, setOpened] = useState(false);
  return (
    <>
      <UnstyledButton
        onClick={() => setOpened(true)}
        style={{
          width: size,
          height: size,
          borderRadius: 8,
          border: '1px dashed var(--mantine-color-default-border)',
          display: 'grid',
          placeItems: 'center',
          overflow: 'hidden',
        }}
        aria-label="Выбрать картинку"
      >
        {image ? (
          <Image src={image.url} alt="" w={size - 8} h={size - 8} fit="contain" />
        ) : (
          <Text size="xs" c="dimmed">
            картинка
          </Text>
        )}
      </UnstyledButton>
      <ImagePicker
        opened={opened}
        onClose={() => setOpened(false)}
        onPick={onPick}
        {...(hint ? { initialQuery: hint } : {})}
      />
    </>
  );
}
