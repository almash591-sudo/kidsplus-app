import {
  DECK_CATEGORIES,
  LANGUAGES,
  type Card as CardT,
  type Deck,
  type DeckCategory,
  type DeckInput,
  type Language,
  type MediaRef,
} from '@kidsplus/shared/api';
import {
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  Group,
  Image,
  Loader,
  Modal,
  SegmentedControl,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
  UnstyledButton,
} from '@mantine/core';
import { useMutation } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { api } from '../api';
import { AudioStatus } from '../components/AudioStatus';
import { BulkBar, BulkFilters, KidPills, SelectMark, useBulk, type Bulk } from '../components/Bulk';
import { VoiceRecorder } from '../components/VoiceRecorder';
import { ImageSlot } from '../components/ImagePicker';
import { LANGUAGE_LABELS } from '../lib/child';
import { modals } from '../lib/modals';
import { keys, queryClient, useChildren, useDecks } from '../queries';

/** Разделы наборов — так же, как на главном экране ребёнка. */
export const CATEGORY_LABELS: Record<DeckCategory, string> = {
  english: 'Английский',
  math: 'Математика и геометрия',
  chinese: 'Китайский',
  geography: 'География',
  nature: 'Природа',
  music: 'Музыка',
  letters: 'Буквы',
  other: 'Разное',
};
const CATEGORY_ORDER: DeckCategory[] = [
  'english',
  'math',
  'chinese',
  'geography',
  'nature',
  'music',
  'letters',
  'other',
];

/** Раздел по умолчанию для нового набора — по языку озвучки. */
const categoryForLang = (lang: Language): DeckCategory =>
  lang === 'en' ? 'english' : lang === 'zh' ? 'chinese' : 'other';

const refreshDecks = () => {
  void queryClient.invalidateQueries({ queryKey: keys.decks });
  void queryClient.invalidateQueries({ queryKey: ['child-items'] });
};

export function DecksPage() {
  const decks = useDecks();
  const [creating, setCreating] = useState(false);
  // Этап 33: фильтры «есть у / нет у», раздел, выбор многих сразу.
  const withSubject = useMemo(
    () => decks.data?.map((d) => ({ ...d, subject: d.category as string })),
    [decks.data],
  );
  const b = useBulk(withSubject);

  return (
    <Stack>
      <h1 className="page-title">Карточки</h1>
      <Group gap="xs" wrap="nowrap" align="center">
        <Text size="sm" c="dimmed" style={{ flex: 1 }}>
          Картинки со словами, которые озвучиваются. У ребёнка наборы лежат по разделам.
        </Text>
        <Button radius="xl" onClick={() => setCreating(true)}>
          + Набор
        </Button>
      </Group>
      {decks.data?.length === 0 && <Text c="dimmed">Наборов пока нет.</Text>}
      {!!decks.data?.length && (
        <BulkFilters search bulk={b} subjects={CATEGORY_LABELS} shown={b.filtered} />
      )}
      {CATEGORY_ORDER.map((category) => {
        const list = b.filtered.filter((d) => d.category === category);
        if (!list.length) return null;
        return (
          <Stack key={category} gap={6}>
            <Text size="xs" fw={600} c="dimmed" tt="uppercase" px={16}>
              {CATEGORY_LABELS[category]} · {list.length}
            </Text>
            <DeckGrid decks={list} bulk={b} />
          </Stack>
        );
      })}
      {b.selecting && <div className="bulk-space" />}
      <BulkBar bulk={b} kind="deck" />
      <Modal opened={creating} onClose={() => setCreating(false)} title="Новый набор">
        {creating && <DeckForm deck={null} onDone={() => setCreating(false)} />}
      </Modal>
    </Stack>
  );
}

function DeckGrid({
  decks,
  bulk: b,
}: {
  decks: (Deck & { subject: string })[];
  bulk: Bulk<Deck & { subject: string }>;
}) {
  return (
    <Card padding={0}>
      <Stack gap={0} className="grouped decks">
        {decks.map((d) => {
          const body = (
            <>
              {b.selecting && <SelectMark checked={b.selected.has(d.id)} />}
              {d.cards[0] ? (
                <img className="deck-thumb" src={d.cards[0].image.url} alt="" />
              ) : (
                <span className="deck-thumb" aria-hidden>
                  🃏
                </span>
              )}
              <Stack gap={0} style={{ flex: 1, minWidth: 0 }}>
                <Text fw={600} truncate>
                  {d.title}
                </Text>
                <Text size="sm" c="dimmed">
                  {LANGUAGE_LABELS[d.lang]} · {d.cards.length} шт.
                </Text>
              </Stack>
            </>
          );
          if (b.selecting)
            return (
              <UnstyledButton
                key={d.id}
                className="attention-row"
                onClick={() => b.toggle(d.id)}
                aria-pressed={b.selected.has(d.id)}
                data-testid="select-row"
              >
                {body}
              </UnstyledButton>
            );
          return (
            <div key={d.id} className="attention-row" style={{ flexWrap: 'wrap' }}>
              <UnstyledButton
                component={Link}
                to={`/decks/${d.id}`}
                style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}
              >
                {body}
                <span className="chevron" aria-hidden="true">
                  ›
                </span>
              </UnstyledButton>
              <div className="row-pills">
                <KidPills kind="deck" item={d} />
              </div>
            </div>
          );
        })}
      </Stack>
    </Card>
  );
}

function DeckForm({ deck, onDone }: { deck: Deck | null; onDone: (d: Deck) => void }) {
  const children = useChildren();
  const navigate = useNavigate();
  const [v, setV] = useState<DeckInput>({
    title: deck?.title ?? '',
    lang: deck?.lang ?? 'ru',
    category: deck?.category ?? 'other',
    childIds: deck?.childIds ?? [],
  });
  /** Раздел выбран вручную — смена языка его больше не меняет. */
  const [categoryTouched, setCategoryTouched] = useState(Boolean(deck));
  const save = useMutation({
    mutationFn: () =>
      deck ? api.put<Deck>(`/parent/decks/${deck.id}`, v) : api.post<Deck>('/parent/decks', v),
    onSuccess: (saved) => {
      refreshDecks();
      onDone(saved);
      if (!deck) navigate(`/decks/${saved.id}`);
    },
  });
  return (
    <Stack>
      <TextInput
        label="Название"
        placeholder="Животные по-английски"
        value={v.title}
        maxLength={120}
        onChange={(e) => setV({ ...v, title: e.currentTarget.value })}
      />
      <div>
        <Text size="sm" fw={500} mb={4}>
          Язык озвучки
        </Text>
        <SegmentedControl
          value={v.lang}
          onChange={(lang) =>
            setV({
              ...v,
              lang: lang as Language,
              category: categoryTouched ? v.category : categoryForLang(lang as Language),
            })
          }
          data={LANGUAGES.map((l) => ({ value: l, label: LANGUAGE_LABELS[l]! }))}
        />
      </div>
      <Select
        label="Раздел у ребёнка"
        value={v.category}
        allowDeselect={false}
        onChange={(category) => {
          setCategoryTouched(true);
          setV({ ...v, category: (category ?? 'other') as DeckCategory });
        }}
        data={DECK_CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABELS[c] }))}
      />
      <Checkbox.Group
        label="Кому показывать"
        value={v.childIds}
        onChange={(childIds) => setV({ ...v, childIds })}
      >
        <Group mt={4}>
          {children.data?.map((c) => (
            <Checkbox key={c.id} value={c.id} label={c.nickname} />
          ))}
        </Group>
      </Checkbox.Group>
      <Button onClick={() => save.mutate()} loading={save.isPending} disabled={!v.title.trim()}>
        Сохранить
      </Button>
    </Stack>
  );
}

export function DeckPage() {
  const { id } = useParams();
  const decks = useDecks();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const deck = decks.data?.find((d) => d.id === id);

  const remove = useMutation({
    mutationFn: () => api.delete(`/parent/decks/${id}`),
    onSuccess: () => {
      refreshDecks();
      navigate('/decks');
    },
  });

  if (decks.isPending) return <Loader />;
  if (!deck) return <Alert color="red">Набор не найден.</Alert>;

  return (
    <Stack maw={760}>
      <Group justify="space-between">
        <div>
          <Title order={2}>{deck.title}</Title>
          <Text c="dimmed" size="sm">
            {CATEGORY_LABELS[deck.category]} · {LANGUAGE_LABELS[deck.lang]} ·{' '}
            {deck.childIds.length ? `назначен: ${deck.childIds.length}` : 'никому не назначен'}
          </Text>
        </div>
        <Group gap="xs">
          <Button variant="default" onClick={() => setEditing(true)}>
            Настройки
          </Button>
          <Button
            variant="subtle"
            color="red"
            onClick={() =>
              modals.confirm({
                title: 'Удалить набор?',
                message: `«${deck.title}» и все его карточки пропадут у детей.`,
                confirmLabel: 'Удалить',
                onConfirm: () => remove.mutate(),
              })
            }
          >
            Удалить
          </Button>
        </Group>
      </Group>

      {deck.cards.map((c) => (
        <CardRow key={c.id} deck={deck} card={c} />
      ))}
      <CardForm deck={deck} card={null} />

      <Modal opened={editing} onClose={() => setEditing(false)} title="Набор">
        {editing && <DeckForm deck={deck} onDone={() => setEditing(false)} />}
      </Modal>
    </Stack>
  );
}

function CardRow({ deck, card }: { deck: Deck; card: CardT }) {
  const [editing, setEditing] = useState(false);
  const remove = useMutation({
    mutationFn: () => api.delete<Deck>(`/parent/cards/${card.id}`),
    onSuccess: refreshDecks,
  });
  // Слово своим голосом (этап 15в): запись звучит вместо нейроголоса.
  const voice = useMutation({
    mutationFn: (audioId: string | null) =>
      api.put<Deck>(`/parent/cards/${card.id}/voice`, { audioId }),
    onSuccess: refreshDecks,
  });
  if (editing) return <CardForm deck={deck} card={card} onDone={() => setEditing(false)} />;
  return (
    <Card withBorder padding="sm">
      <Group wrap="nowrap">
        <Image src={card.image.url} alt="" w={64} h={64} fit="contain" />
        <Stack gap={2} style={{ flex: 1 }}>
          <Group gap="xs">
            <Text fw={600}>{card.text}</Text>
            <AudioStatus audio={card.audio} text={card.text} lang={deck.lang} />
          </Group>
          <Group gap={6}>
            {card.voice ? (
              <>
                <Button
                  size="compact-xs"
                  variant="light"
                  radius="xl"
                  onClick={() => void new Audio(card.voice!.url).play().catch(() => {})}
                >
                  ▶ Мой голос
                </Button>
                <Button
                  size="compact-xs"
                  variant="subtle"
                  color="gray"
                  onClick={() => voice.mutate(null)}
                >
                  Вернуть нейроголос
                </Button>
              </>
            ) : (
              <VoiceRecorder
                size="xs"
                label="🎙 Своим голосом"
                onRecorded={(a) => voice.mutate(a.id)}
              />
            )}
          </Group>
          {card.translation && (
            <Group gap="xs">
              <Text size="sm" c="dimmed">
                {card.translation}
              </Text>
              <AudioStatus audio={card.translationAudio} text={card.translation} lang="ru" />
            </Group>
          )}
          {card.question && (
            <Group gap="xs">
              <Text size="sm" c="dimmed">
                Вопрос: {card.question}
              </Text>
              <AudioStatus audio={card.questionAudio} text={card.question} lang={deck.lang} />
            </Group>
          )}
        </Stack>
        <Button size="compact-sm" variant="default" onClick={() => setEditing(true)}>
          Изменить
        </Button>
        <Button size="compact-sm" variant="subtle" color="red" onClick={() => remove.mutate()}>
          Удалить
        </Button>
      </Group>
    </Card>
  );
}

function CardForm({ deck, card, onDone }: { deck: Deck; card: CardT | null; onDone?: () => void }) {
  const [image, setImage] = useState<MediaRef | null>(card?.image ?? null);
  const [text, setText] = useState(card?.text ?? '');
  const [translation, setTranslation] = useState(card?.translation ?? '');
  const [question, setQuestion] = useState(card?.question ?? '');
  const foreign = deck.lang !== 'ru';

  const save = useMutation({
    mutationFn: () => {
      const body = {
        imageId: image!.id,
        text,
        translation: foreign && translation.trim() ? translation : null,
        question: question.trim() ? question : null,
      };
      return card
        ? api.put<Deck>(`/parent/cards/${card.id}`, body)
        : api.post<Deck>(`/parent/decks/${deck.id}/cards`, body);
    },
    onSuccess: () => {
      refreshDecks();
      if (card) onDone?.();
      else {
        setImage(null);
        setText('');
        setTranslation('');
        setQuestion('');
      }
    },
  });

  return (
    <Card withBorder>
      <Stack>
        <Text fw={600}>{card ? 'Карточка' : 'Новая карточка'}</Text>
        <Group align="flex-start" wrap="nowrap">
          <ImageSlot image={image} onPick={setImage} hint={translation || text} size={88} />
          <Stack style={{ flex: 1 }} gap="xs">
            <TextInput
              label={`Слово или фраза (${LANGUAGE_LABELS[deck.lang]})`}
              placeholder={foreign ? 'cat' : 'кошка'}
              value={text}
              maxLength={200}
              onChange={(e) => setText(e.currentTarget.value)}
            />
            {foreign && (
              <TextInput
                label="Перевод на русский (необязательно)"
                description="Озвучивается после слова"
                placeholder="кошка"
                value={translation}
                maxLength={200}
                onChange={(e) => setTranslation(e.currentTarget.value)}
              />
            )}
            <TextInput
              label="Свой вопрос для проверки (необязательно)"
              description={`Вместо «Где ${text.trim() || '…'}?» — на языке набора`}
              placeholder="Покажи пример: два плюс один"
              value={question}
              maxLength={200}
              onChange={(e) => setQuestion(e.currentTarget.value)}
            />
          </Stack>
        </Group>
        <Group>
          <Button
            onClick={() => save.mutate()}
            loading={save.isPending}
            disabled={!image || !text.trim()}
          >
            {card ? 'Сохранить' : 'Добавить карточку'}
          </Button>
          {card && (
            <Button variant="subtle" onClick={onDone}>
              Отмена
            </Button>
          )}
        </Group>
        {!card && deck.cards.length === 0 && (
          <Badge variant="light" color="gray" w="fit-content">
            пока пусто
          </Badge>
        )}
      </Stack>
    </Card>
  );
}
