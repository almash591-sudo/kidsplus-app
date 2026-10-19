// Массовые действия в «Контенте» (этап 33): фильтры «есть у / нет у», предмет, режим выбора,
// нижняя панель «Дать / Убрать» с отменой и кнопки-имена у каждого пункта.
import type { ChildItemsBulkRequest, ChildItemsBulkResult } from '@kidsplus/shared/api';
import { Button, Group, Menu, Portal, Text, TextInput } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useMemo, useState } from 'react';
import { api, errorMessage } from '../api';
import { queryClient, useChildren } from '../queries';

export type ItemKind = 'segment' | 'deck' | 'interactive';
/** Что нужно от видео, набора или игры. */
export interface Assignable {
  id: string;
  childIds: string[];
  /** Предмет / раздел; null — без предмета. */
  subject: string | null;
  /** Название — для поиска. */
  title?: string;
}

type Owner = { childId: string; has: boolean } | null;

/** Списки, которые меняются от назначения. */
const refresh = () => {
  for (const key of ['segments', 'decks', 'games', 'child-items'])
    void queryClient.invalidateQueries({ queryKey: [key] });
};

/** Дать/убрать у одного ребёнка много пунктов одним запросом. */
async function bulk(childId: string, body: ChildItemsBulkRequest) {
  return api.post<ChildItemsBulkResult>(`/parent/children/${childId}/items/bulk`, body);
}

const word = (n: number, kind: ItemKind) => {
  const forms: Record<ItemKind, [string, string, string]> = {
    segment: ['видео', 'видео', 'видео'],
    deck: ['набор', 'набора', 'наборов'],
    interactive: ['игра', 'игры', 'игр'],
  };
  const [one, few, many] = forms[kind];
  const d = n % 10;
  const h = n % 100;
  return `${n} ${d === 1 && h !== 11 ? one : d >= 2 && d <= 4 && (h < 12 || h > 14) ? few : many}`;
};

/** Назначить/снять с отменой: уведомление «Дать Маше 12 видео · Отменить». */
export async function assignMany(
  kind: ItemKind,
  childId: string,
  childName: string,
  ids: string[],
  give: boolean,
) {
  const refs = ids.map((refId) => ({ kind, refId }));
  try {
    const r = await bulk(childId, give ? { add: refs } : { remove: refs });
    refresh();
    const n = give ? r.added : r.removed;
    const id = `bulk-${Date.now()}`;
    notifications.show({
      id,
      autoClose: 7000,
      message: (
        <Group justify="space-between" wrap="nowrap">
          <Text size="sm">
            {n === 0
              ? give
                ? `У ${childName} это уже было`
                : `У ${childName} этого не было`
              : give
                ? `${childName}: добавлено ${word(n, kind)}`
                : `${childName}: убрано ${word(n, kind)}`}
          </Text>
          {n > 0 && (
            <Button
              size="compact-sm"
              variant="subtle"
              onClick={() => {
                notifications.hide(id);
                void bulk(childId, give ? { remove: refs } : { add: refs }).then(refresh);
              }}
            >
              Отменить
            </Button>
          )}
        </Group>
      ),
    });
  } catch (err) {
    notifications.show({ color: 'red', message: errorMessage(err) });
  }
}

/** Фильтр из адреса: `?owner=<id>:has` или `?owner=<id>:lacks` (ссылки с «Главной» и страницы ребёнка). */
function ownerFromUrl(): Owner {
  const m = /^([0-9a-f-]{36}):(has|lacks)$/.exec(
    new URLSearchParams(window.location.search).get('owner') ?? '',
  );
  return m ? { childId: m[1]!, has: m[2] === 'has' } : null;
}
export const ownerLink = (tab: 'videos' | 'decks' | 'games', childId: string, has: boolean) =>
  `/content?tab=${tab}&owner=${childId}:${has ? 'has' : 'lacks'}`;

/** Фильтры и выбор для списка. */
export function useBulk<T extends Assignable>(all: T[] | undefined) {
  const [owner, setOwner] = useState<Owner>(ownerFromUrl);
  const [subject, setSubject] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (all ?? []).filter(
      (x) =>
        (!owner || x.childIds.includes(owner.childId) === owner.has) &&
        (!subject || x.subject === subject) &&
        (!q || (x.title ?? '').toLowerCase().includes(q)),
    );
  }, [all, owner, subject, query]);
  return {
    all: all ?? [],
    filtered,
    owner,
    setOwner,
    subject,
    setSubject,
    query,
    setQuery,
    selecting,
    selected,
    start: () => setSelecting(true),
    stop: () => {
      setSelecting(false);
      setSelected(new Set());
    },
    toggle: (id: string) =>
      setSelected((s) => {
        const n = new Set(s);
        if (n.has(id)) n.delete(id);
        else n.add(id);
        return n;
      }),
    selectAll: (ids: string[]) => setSelected(new Set(ids)),
  };
}
export type Bulk<T extends Assignable> = ReturnType<typeof useBulk<T>>;

/**
 * Чипы фильтров: «Нет у Маши · 12», «Есть у Маши · 3» по каждому ребёнку и предметы.
 * `extra` — свои чипы страницы (например, «Без вопросов»).
 */
export function BulkFilters<T extends Assignable>({
  bulk: b,
  subjects,
  shown,
  search,
  owners = true,
}: {
  bulk: Bulk<T>;
  subjects?: Record<string, string>;
  /** Пункты после всех фильтров страницы — для «Выбрать все». */
  shown: T[];
  /** Поле поиска по названию (у «Видео» — своё, с каналом). */
  search?: boolean;
  /** Чипы «Есть у / Нет у» (у аудио детей нет — там «Детям»). */
  owners?: boolean;
}) {
  const children = useChildren().data ?? [];
  const present = subjects
    ? Object.keys(subjects).filter((s) => b.all.some((x) => x.subject === s))
    : [];
  return (
    <>
      {search && (
        <TextInput
          placeholder="Поиск по названию"
          value={b.query}
          onChange={(e) => b.setQuery(e.currentTarget.value)}
          radius="xl"
          aria-label="Поиск"
        />
      )}
      {owners && children.length > 0 && (
        <div className="chip-row" data-testid="owner-chips">
          {children.flatMap((c) =>
            [false, true].map((has) => {
              const n = b.all.filter((x) => x.childIds.includes(c.id) === has).length;
              const on = b.owner?.childId === c.id && b.owner.has === has;
              if (!n && !on) return null;
              return (
                <button
                  key={`${c.id}-${has}`}
                  type="button"
                  className={on ? 'on' : ''}
                  onClick={() => b.setOwner(on ? null : { childId: c.id, has })}
                >
                  {has ? 'Есть у' : 'Нет у'} {c.nickname} · {n}
                </button>
              );
            }),
          )}
        </div>
      )}
      {present.length > 1 && (
        <div className="chip-row" data-testid="subject-chips">
          {present.map((s) => (
            <button
              key={s}
              type="button"
              className={b.subject === s ? 'on' : ''}
              onClick={() => b.setSubject(b.subject === s ? null : s)}
            >
              {subjects![s]} · {b.all.filter((x) => x.subject === s).length}
            </button>
          ))}
        </div>
      )}
      <Group justify="space-between" px={4}>
        <Text size="sm" c="dimmed">
          {b.selecting ? `Выбрано: ${b.selected.size}` : `Показано: ${shown.length}`}
        </Text>
        {b.selecting ? (
          <Group gap={4}>
            <Button
              size="compact-sm"
              variant="subtle"
              onClick={() =>
                b.selected.size === shown.length
                  ? b.selectAll([])
                  : b.selectAll(shown.map((x) => x.id))
              }
            >
              {b.selected.size === shown.length && shown.length ? 'Снять все' : 'Выбрать все'}
            </Button>
            <Button size="compact-sm" variant="subtle" color="gray" onClick={b.stop}>
              Готово
            </Button>
          </Group>
        ) : (
          <Button
            size="compact-sm"
            variant="light"
            radius="xl"
            onClick={b.start}
            disabled={!shown.length}
            data-testid="bulk-select"
          >
            Выбрать
          </Button>
        )}
      </Group>
    </>
  );
}

/** Нижняя панель режима выбора: «Дать …» / «Убрать у …» для каждого ребёнка. */
export function BulkBar<T extends Assignable>({
  bulk: b,
  kind,
}: {
  bulk: Bulk<T>;
  kind: ItemKind;
}) {
  const children = useChildren().data ?? [];
  const [busy, setBusy] = useState(false);
  if (!b.selecting) return null;
  const ids = [...b.selected];
  const run = async (childId: string, name: string, give: boolean) => {
    setBusy(true);
    await assignMany(kind, childId, name, ids, give);
    setBusy(false);
    b.stop();
  };
  // В портале: у страницы есть анимация (transform), и fixed внутри неё привязался бы к странице.
  return (
    <Portal>
      <div className="bulk-bar" data-testid="bulk-bar">
        <Text size="sm" fw={600}>
          {ids.length ? word(ids.length, kind) : 'Отметьте нужное'}
        </Text>
        <Group gap={6} justify="flex-end">
          {children.map((c) => (
            <Menu key={c.id} position="top" withinPortal>
              <Menu.Target>
                <Button size="sm" radius="xl" disabled={!ids.length} loading={busy}>
                  {c.nickname}
                </Button>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Item onClick={() => void run(c.id, c.nickname, true)}>
                  Дать {c.nickname}
                </Menu.Item>
                <Menu.Item color="red" onClick={() => void run(c.id, c.nickname, false)}>
                  Убрать у {c.nickname}
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          ))}
        </Group>
      </div>
    </Portal>
  );
}

/** Кнопки-имена у пункта: касание — показать или скрыть у ребёнка (сразу, с отменой). */
export function KidPills({ kind, item }: { kind: ItemKind; item: Assignable }) {
  const children = useChildren().data ?? [];
  if (!children.length) return null;
  return (
    <div className="kid-pills">
      {children.map((c) => {
        const on = item.childIds.includes(c.id);
        return (
          <button
            key={c.id}
            type="button"
            className={on ? 'on' : ''}
            aria-pressed={on}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              void assignMany(kind, c.id, c.nickname, [item.id], !on);
            }}
          >
            {on ? '✓ ' : ''}
            {c.nickname}
          </button>
        );
      })}
    </div>
  );
}

/** Кружок-галочка у строки в режиме выбора. */
export function SelectMark({ checked }: { checked: boolean }) {
  return (
    <span className={checked ? 'select-mark on' : 'select-mark'} aria-hidden="true">
      {checked ? '✓' : ''}
    </span>
  );
}
