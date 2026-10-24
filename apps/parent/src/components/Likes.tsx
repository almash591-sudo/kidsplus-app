// «Что нравится» в «Прогрессе» (этап 44): что ребёнок выбирает сам, что бросает и что
// назначено, но не открывается, — по журналу событий своего ребёнка, без модели.
import {
  UNOPENED_DAYS,
  type ChildUsage,
  type UsageItem,
  type UsageKind,
} from '@kidsplus/shared/analytics';
import { GAME_KINDS } from '@kidsplus/shared/games';
import { Button, Card, Group, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useState, type ReactNode } from 'react';
import { errorMessage } from '../api';
import { plural } from '../lib/child';
import { giveLabel } from '../lib/names';
import { useChildren, useUsage } from '../queries';
import { bulk, refresh } from './Bulk';

const ICON: Record<UsageKind, string> = { segment: '🎬', deck: '🃏', interactive: '🎮' };
const KIND: Record<UsageKind, string> = { segment: 'Видео', deck: 'Карточки', interactive: 'Игра' };
/** Сколько строк «Не открывает» видно сразу. */
const SHOWN = 5;

const times = (n: number) => `${n} ${plural(n, 'раз', 'раза', 'раз')}`;
/** «через 40 с», «через 2 мин». */
export const after = (sec: number) =>
  sec < 15 ? 'сразу' : sec < 60 ? `через ${sec} с` : `через ${Math.round(sec / 60)} мин`;

function UsageRow(props: { kind: UsageKind; title: string; sub?: string | null; value?: string }) {
  return (
    <div className="attention-row" data-testid="usage-row">
      <Text size="lg" aria-hidden="true">
        {ICON[props.kind]}
      </Text>
      <Stack gap={0} style={{ flex: 1, minWidth: 0 }}>
        <Text size="sm" truncate>
          {props.title}
        </Text>
        {props.sub && (
          <Text size="xs" c="dimmed" truncate>
            {props.sub}
          </Text>
        )}
      </Stack>
      {props.value && (
        <Text size="sm" fw={700}>
          {props.value}
        </Text>
      )}
    </div>
  );
}

function Group_(props: {
  title: string;
  testId: string;
  hint: string;
  empty: string;
  children: ReactNode[];
  footer?: ReactNode;
}) {
  return (
    <Stack gap={6} data-testid={props.testId}>
      <Text size="xs" fw={600} c="dimmed" tt="uppercase" px={16}>
        {props.title}
      </Text>
      <Card padding={0}>
        <Stack gap={0} className="grouped plain">
          {props.children.length ? (
            props.children
          ) : (
            <div className="attention-row">
              <Text size="sm" c="dimmed">
                {props.empty}
              </Text>
            </div>
          )}
        </Stack>
      </Card>
      {props.footer}
      <Text size="xs" c="dimmed" px={16}>
        {props.hint}
      </Text>
    </Stack>
  );
}

/** Вид игры, если название игры его не повторяет: «Гонки» у игры «Гонки до финиша» — лишнее. */
const kindLabel = (i: Pick<UsageItem, 'kind' | 'gameKind' | 'title'>) => {
  const label = i.gameKind ? GAME_KINDS[i.gameKind] : KIND[i.kind];
  return i.title.toLowerCase().includes(label.toLowerCase()) ? null : label;
};

/** Убрать не открытое одним запросом, с «Отменить». */
async function removeAll(childId: string, nickname: string, list: ChildUsage['unopened']) {
  const refs = list.map((i) => ({ kind: i.kind, refId: i.id }));
  try {
    const r = await bulk(childId, { remove: refs });
    refresh();
    const id = `unopened-${Date.now()}`;
    notifications.show({
      id,
      autoClose: 7000,
      message: (
        <Group justify="space-between" wrap="nowrap">
          <Text size="sm">
            {nickname}: убрано {r.removed}
          </Text>
          <Button
            size="compact-sm"
            variant="subtle"
            onClick={() => {
              notifications.hide(id);
              void bulk(childId, { add: refs }).then(refresh);
            }}
          >
            Отменить
          </Button>
        </Group>
      ),
    });
  } catch (err) {
    notifications.show({ color: 'red', message: errorMessage(err) });
  }
}

export function Likes({ childId, days }: { childId: string; days: number }) {
  const usage = useUsage(childId, days);
  const child = useChildren().data?.find((c) => c.id === childId);
  const [all, setAll] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!usage.data || !child) return null;
  const { favorites, dropped, unopened, kinds } = usage.data;
  const period = days === 7 ? 'за неделю' : `за ${days} дней`;
  const liked = kinds.filter((k) => k.chosen > 0).slice(0, 3);
  const she = child.gender === 'f';

  return (
    <Stack data-testid="likes">
      <Title order={3}>Что нравится</Title>
      <SimpleGrid cols={{ base: 1, md: 2 }}>
        <Group_
          title="Любимое"
          testId="likes-favorites"
          hint={`Пройдено до конца ${period}; сначала то, что ребёнок выбирает сам.${
            liked.length
              ? ` Из игр чаще берёт сам: ${liked.map((k) => GAME_KINDS[k.kind]).join(', ')}.`
              : ''
          }`}
          empty="Пока мало занятий, чтобы сказать."
        >
          {favorites.map((i) => (
            <UsageRow
              key={i.id}
              kind={i.kind}
              title={i.title}
              sub={
                i.chosen
                  ? `${she ? 'сама выбрала' : 'сам выбрал'} ${times(i.chosen)}`
                  : kindLabel(i)
              }
              value={`${i.completed} из ${i.opened}`}
            />
          ))}
        </Group_>
        <Group_
          title="Бросает"
          testId="likes-dropped"
          hint="Открыто 3 раза и больше, а пройдено меньше половины: может, рано, сложно или скучно — попробуйте вместе."
          empty="Ничего не бросает."
        >
          {dropped.map((i) => (
            <UsageRow
              key={i.id}
              kind={i.kind}
              title={i.title}
              sub={
                i.leftAfterSec !== null
                  ? `обычно уходит ${after(i.leftAfterSec)}`
                  : `${she ? 'ушла сама' : 'ушёл сам'} ${times(i.left)}`
              }
              value={`${i.completed} из ${i.opened}`}
            />
          ))}
        </Group_>
      </SimpleGrid>
      {unopened.length > 0 && (
        <Group_
          title={`Не открывает · ${unopened.length}`}
          testId="likes-unopened"
          hint={`Назначено больше двух недель назад, а за ${UNOPENED_DAYS} дней ни разу не открыто. Сюда не попадают уроки «Музыки» и «Букв» и темы плана с этой недели.`}
          empty=""
          footer={
            <Group gap="xs" px={16}>
              {unopened.length > SHOWN && (
                <Button size="compact-sm" variant="subtle" onClick={() => setAll(!all)}>
                  {all ? 'Свернуть' : `Показать все ${unopened.length}`}
                </Button>
              )}
              <Button
                size="compact-sm"
                variant="light"
                color="red"
                loading={busy}
                onClick={async () => {
                  setBusy(true);
                  await removeAll(childId, child.nickname, unopened);
                  setBusy(false);
                }}
              >
                {giveLabel(child, false)} — {unopened.length}
              </Button>
            </Group>
          }
        >
          {(all ? unopened : unopened.slice(0, SHOWN)).map((i) => (
            <UsageRow key={i.id} kind={i.kind} title={i.title} sub={kindLabel(i)} />
          ))}
        </Group_>
      )}
    </Stack>
  );
}
