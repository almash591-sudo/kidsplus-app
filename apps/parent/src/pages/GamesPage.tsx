import type { Game } from '@kidsplus/shared/api';
import { GAME_KINDS, type GameKind, type GameSpec } from '@kidsplus/shared/games';
import { SONGS } from '@kidsplus/shared/songs';
import {
  ActionIcon,
  Button,
  Card,
  Group,
  Menu,
  Modal,
  Stack,
  Text,
  UnstyledButton,
} from '@mantine/core';
import { useMutation } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { api } from '../api';
import { BulkBar, BulkFilters, KidPills, SelectMark, useBulk } from '../components/Bulk';
import { GameEditor } from '../components/GameEditor';
import { modals } from '../lib/modals';
import { SUBJECT_LABELS as GAME_CATEGORY_LABELS } from '../lib/subjects';
import { CATEGORY_LABELS } from './DecksPage';
import { keys, queryClient, useGames } from '../queries';

/** Короткое описание параметров игры для родителя. */
export const PIANO_MODE_LABELS = {
  free: 'свободная игра',
  find: 'найди ноту',
  ear: 'узнай на слух',
} as const;

export function gameSummary(spec: GameSpec): string {
  switch (spec.kind) {
    case 'drawing':
      return spec.stickerIds.length ? `наклеек: ${spec.stickerIds.length}` : 'кисть и краски';
    case 'coloring':
      return spec.tasks ? 'с заданиями «раскрась … цветом»' : 'свободная';
    case 'sorting':
      return `«${spec.prompt}» · предметов: ${spec.items.length}`;
    case 'memory':
      return `пар: ${spec.imageIds.length}`;
    case 'puzzle':
      return `${spec.cols}×${spec.rows}, картинок: ${spec.imageIds.length}`;
    case 'tracing':
      return spec.shapes.length > 6 ? `${spec.shapes.length} фигур` : spec.shapes.join(', ');
    case 'balloons':
      return `шариков: ${spec.count}${spec.target ? ' · только одного цвета' : ''}`;
    case 'counting':
      return `до ${spec.max} · раундов: ${spec.rounds}`;
    case 'maze':
      return `${spec.size}×${spec.size} · лабиринтов: ${spec.rounds}`;
    case 'shadows':
      return `картинок: ${spec.imageIds.length}, по ${spec.perRound} за раз`;
    case 'flashlight':
      return `спрятано: ${spec.items.length}`;
    case 'moles':
      return `поймать: ${spec.count}${spec.target !== null ? ' · только одного' : ''}`;
    case 'melody':
      return `колокольчиков: ${spec.bells} · мелодия до ${spec.goal} нот`;
    case 'shapes':
      return `фигур: ${spec.shapes.length}${spec.rotate ? ' · с поворотом' : ''}`;
    case 'odd':
    case 'sequence':
      return `раундов: ${spec.rounds.length}`;
    case 'pattern':
      return `${spec.patterns.join(', ')} · раундов: ${spec.rounds}`;
    case 'compare':
      return `${spec.mode === 'numbers' ? 'числа' : 'предметы'} до ${spec.max} · раундов: ${spec.rounds}`;
    case 'arithmetic':
      return `${spec.ops.map((o) => (o === 'plus' ? '+' : '−')).join(' ')} до ${spec.max} · раундов: ${spec.rounds}`;
    case 'size':
      return `по ${spec.count} размера · картинок: ${spec.imageIds.length}`;
    case 'word':
      return spec.words.map((w) => w.word).join(', ');
    case 'pitch':
      return `разница ${spec.gap} полутонов · раундов: ${spec.rounds}`;
    case 'loudness':
    case 'tempo':
    case 'duration':
      return `раундов: ${spec.rounds}`;
    case 'direction':
      return `мелодия из ${spec.notes} нот · раундов: ${spec.rounds}`;
    case 'beats':
      return `до ${spec.max} ударов · раундов: ${spec.rounds}`;
    case 'rhythm':
      return `${spec.beats} ударов${spec.timing ? ' · «та» и «ти-ти»' : ''} · раундов: ${spec.rounds}`;
    case 'piano':
      return `${PIANO_MODE_LABELS[spec.mode]} · нот: ${spec.keys}`;
    case 'staff':
      return `нот: ${spec.keys} · раундов: ${spec.rounds}`;
    case 'song':
      return spec.songs.map((s) => `«${SONGS[s].title}»`).join(', ');
    case 'freeze':
      return `раундов: ${spec.rounds}`;
    case 'orchestra':
      return `зверят: ${spec.players} · раундов: ${spec.rounds}`;
    case 'letter':
      return `${spec.letters.join(' ')} · раундов: ${spec.rounds}`;
    case 'syllable':
      return `${spec.syllables.join(', ')} · раундов: ${spec.rounds}`;
    case 'firstLetter':
    case 'readWord':
      return `${spec.words.map((w) => w.word.toLowerCase()).join(', ')} · раундов: ${spec.rounds}`;
    case 'clock':
      return `${spec.half ? 'часы и половины' : 'целые часы'} · раундов: ${spec.rounds}`;
    case 'shop':
      return `цены до ${spec.max} · монетки ${spec.coins.join(', ')} · покупок: ${spec.rounds}`;
    case 'robot':
      return `поле ${spec.size}×${spec.size}, шагов ${spec.steps}${spec.rocks ? ' · с камнями' : ''}`;
    case 'space':
      return `${spec.order === 'letters' ? 'буквы' : spec.step === 2 ? 'цифры через одну' : 'цифры'}, планет: ${spec.count}${spec.reverse ? ' · с конца' : ''} · раундов: ${spec.rounds}`;
    case 'fishing':
      return `${spec.mode === 'letters' ? `буквы (${spec.max})` : spec.mode === 'sums' ? `примеры до ${spec.max}` : `цифры до ${spec.max}`} · рыбок: ${spec.fish} · раундов: ${spec.rounds}`;
    case 'flight':
      return `звёздочек: ${spec.stars} · тучки: ${{ none: 'нет', few: 'немного', many: 'много' }[spec.clouds]}`;
    case 'builder':
      return `башня из ${spec.height}, деталей ${spec.blocks}${spec.hide ? ' · по памяти' : ''} · башен: ${spec.rounds}`;
  }
}

/** Глиняный значок игры — тот же, что у ребёнка на плитке (этап 35). */
function GameIcon({ kind }: { kind: GameKind }) {
  return <img className="game-icon" src={`/games/icon-${kind}.webp`} alt="" />;
}

/** Игры (п. 5.6 ТЗ): кому какую показывать. У ребёнка они — в разделе «Игры». */
export function GamesPage() {
  const games = useGames();
  /** Открытый редактор: null — закрыт, 'new' — новая игра. */
  const [editing, setEditing] = useState<Game | 'new' | null>(null);
  // Этап 33: фильтры «есть у / нет у», раздел, выбор многих сразу.
  const withSubject = useMemo(
    () => games.data?.map((g) => ({ ...g, subject: g.category as string })),
    [games.data],
  );
  const b = useBulk(withSubject);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: keys.games });
    void queryClient.invalidateQueries({ queryKey: ['child-items'] });
  };
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/parent/games/${id}`),
    onSuccess: refresh,
  });

  return (
    <Stack>
      <h1 className="page-title">Игры</h1>
      <Group gap="xs" wrap="nowrap" align="center">
        <Text size="sm" c="dimmed" style={{ flex: 1 }}>
          Касание имени — показать или скрыть игру у ребёнка.
        </Text>
        <Button radius="xl" onClick={() => setEditing('new')}>
          + Игра
        </Button>
      </Group>
      {!!games.data?.length && (
        <BulkFilters search bulk={b} subjects={GAME_CATEGORY_LABELS} shown={b.filtered} />
      )}
      <Card padding={0}>
        <Stack gap={0} className="grouped decks">
          {games.data?.length === 0 && (
            <div className="attention-row">
              <Text c="dimmed">Игр пока нет.</Text>
            </div>
          )}
          {b.filtered.map((g) =>
            b.selecting ? (
              <UnstyledButton
                key={g.id}
                className="attention-row"
                onClick={() => b.toggle(g.id)}
                aria-pressed={b.selected.has(g.id)}
                data-testid="select-row"
              >
                <SelectMark checked={b.selected.has(g.id)} />
                <span className="deck-thumb" aria-hidden>
                  <GameIcon kind={g.spec.kind} />
                </span>
                <Stack gap={0} style={{ flex: 1, minWidth: 0 }}>
                  <Text fw={600} truncate>
                    {g.title}
                  </Text>
                  <Text size="xs" c="dimmed" truncate>
                    {GAME_KINDS[g.spec.kind]}
                  </Text>
                </Stack>
              </UnstyledButton>
            ) : (
              <div key={g.id} className="attention-row">
                <span className="deck-thumb" aria-hidden>
                  <GameIcon kind={g.spec.kind} />
                </span>
                <Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
                  <UnstyledButton onClick={() => setEditing(g)} style={{ minWidth: 0 }}>
                    <Text fw={600} truncate>
                      {g.title}
                    </Text>
                    <Text size="xs" c="dimmed" truncate>
                      {GAME_KINDS[g.spec.kind]}
                      {g.category !== 'games' ? ` · ${CATEGORY_LABELS[g.category]}` : ''} ·{' '}
                      {gameSummary(g.spec)}
                    </Text>
                  </UnstyledButton>
                  <KidPills kind="interactive" item={g} />
                </Stack>
                <Menu position="bottom-end" withinPortal>
                  <Menu.Target>
                    <ActionIcon variant="subtle" color="gray" aria-label="Действия">
                      ⋯
                    </ActionIcon>
                  </Menu.Target>
                  <Menu.Dropdown>
                    <Menu.Item onClick={() => setEditing(g)}>Изменить</Menu.Item>
                    <Menu.Item
                      color="red"
                      onClick={() =>
                        modals.confirm({
                          title: 'Удалить игру?',
                          message: `«${g.title}» пропадёт у детей.`,
                          confirmLabel: 'Удалить',
                          onConfirm: () => remove.mutate(g.id),
                        })
                      }
                    >
                      Удалить
                    </Menu.Item>
                  </Menu.Dropdown>
                </Menu>
              </div>
            ),
          )}
        </Stack>
      </Card>
      {b.selecting && <div className="bulk-space" />}
      <BulkBar bulk={b} kind="interactive" />
      <Modal
        opened={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? 'Новая игра' : 'Игра'}
        size="lg"
      >
        {editing !== null && (
          <GameEditor game={editing === 'new' ? null : editing} onDone={() => setEditing(null)} />
        )}
      </Modal>
    </Stack>
  );
}
