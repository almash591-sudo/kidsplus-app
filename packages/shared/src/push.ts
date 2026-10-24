// Push-уведомления родителю (п. 6.2 ТЗ). В тексте нет имени ребёнка: вместо него {child},
// имя подставляет service worker кабинета, запросив его у нашего сервера.
import { z } from 'zod';

export const PUSH_KINDS = [
  'moderation',
  'day_done',
  'video',
  'tokens',
  'weekly',
  'battery',
  'call',
  'noise',
  'offline',
] as const;
export type PushKind = (typeof PUSH_KINDS)[number];

export const PUSH_KIND_LABELS: Record<PushKind, string> = {
  moderation: 'Модерация готова к проверке',
  day_done: 'Ребёнок закончил занятия на сегодня',
  video: 'Видео стало недоступно',
  tokens: 'Расход токенов ИИ подошёл к лимиту',
  weekly: 'Недельный отчёт готов',
  battery: 'Телефон ребёнка садится',
  call: 'Входящий звонок',
  noise: 'Радионяня: в комнате шумно',
  offline: 'Телефон ребёнка долго не на связи',
};

export const pushSubscription = z.object({
  endpoint: z.url().max(1000),
  keys: z.object({ p256dh: z.string().min(10).max(200), auth: z.string().min(8).max(100) }),
  kinds: z.array(z.enum(PUSH_KINDS)).max(PUSH_KINDS.length),
});
export type PushSubscriptionInput = z.input<typeof pushSubscription>;

/** Содержимое уведомления. url — куда открыть кабинет; childId — чьё имя подставить в {child}. */
export interface PushMessage {
  kind: PushKind;
  title: string;
  body: string;
  url: string;
  childId?: string;
}

export const pushMessages = {
  moderation: (title: string): PushMessage => ({
    kind: 'moderation',
    title: 'Модерация: отчёт готов',
    body: `«${title.slice(0, 80)}» — можно проверять.`,
    url: '/moderation',
  }),
  dayDone: (childId: string): PushMessage => ({
    kind: 'day_done',
    title: 'Занятия на сегодня закончены',
    body: '{child}: всё пройдено. Молодец!',
    url: `/remote?child=${childId}`,
    childId,
  }),
  video: (title: string): PushMessage => ({
    kind: 'video',
    title: 'Видео стало недоступно',
    body: `«${title.slice(0, 80)}» больше не открывается — замените его.`,
    url: '/videos',
  }),
  /** Телефон не открывает видео вообще (этап 34) — обычно нет связи с YouTube или выключен VPN. */
  videosDown: (childId: string): PushMessage => ({
    kind: 'video',
    title: 'Видео не открываются',
    body: 'На телефоне {child} подряд не открываются видео. Проверьте интернет и VPN.',
    url: `/remote?child=${childId}`,
    childId,
  }),
  tokens: (percent: number): PushMessage => ({
    kind: 'tokens',
    title: 'Лимит токенов ИИ',
    body: `Израсходовано ${percent} % лимита. При превышении модерация встанет на паузу.`,
    url: '/moderation',
  }),
  /** Входящий звонок: от ребёнка — имя подставит service worker ({child}), от родителя — его имя. */
  call: (
    callId: string,
    from: { childId: string } | { parentName: string },
    video: boolean,
  ): PushMessage => ({
    kind: 'call',
    title: video ? 'Видеозвонок' : 'Звонок',
    body: 'childId' in from ? 'Звонит {child}' : `Звонит ${from.parentName.slice(0, 40)}`,
    url: `/call/${callId}`,
    ...('childId' in from ? { childId: from.childId } : {}),
  }),
  noise: (childId: string): PushMessage => ({
    kind: 'noise',
    title: 'Радионяня',
    body: 'В комнате {child} шумно — нажмите, чтобы послушать.',
    url: `/remote?listen=${childId}`,
    childId,
  }),
  /** Телефон не выходил на связь больше двух часов (днём). */
  offline: (childId: string, hours: number): PushMessage => ({
    kind: 'offline',
    title: 'Телефон не на связи',
    body: `Телефон {child} не выходит на связь ${hours} ч. Разряжен, выключен или нет интернета?`,
    url: '/devices',
    childId,
  }),
  online: (childId: string): PushMessage => ({
    kind: 'offline',
    title: 'Телефон снова на связи',
    body: 'Телефон {child} снова на связи.',
    url: `/remote?child=${childId}`,
    childId,
  }),
  battery: (childId: string, level: number): PushMessage => ({
    kind: 'battery',
    title: 'Телефон садится',
    body: `Телефон {child}: ${level} %. Поставьте его на зарядку.`,
    url: `/remote?child=${childId}`,
    childId,
  }),
  weekly: (childId: string): PushMessage => ({
    kind: 'weekly',
    title: 'Недельный отчёт',
    body: '{child}: итоги недели готовы.',
    url: '/analytics',
    childId,
  }),
};
