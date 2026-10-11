// Фразы самого приложения — в одном месте: их произносят экраны и игры, и их же приложение
// заранее просит озвучить на сервере (нейроголосом), когда серверная озвучка включена.
import { BATTERY_PHRASES } from '@kidsplus/shared/battery';
import type { KidCategory, KidPlaylist } from '@kidsplus/shared/api';
import type { BalloonColor, ColoringPicture, GameSpec, TraceShape } from '@kidsplus/shared/games';
import { NUMBERS, paint, PALETTE } from './games/common';
import { SORTER } from './games/sorterShapes';
import { PICTURES } from './games/pictures';
import { TRACES } from './games/traceShapes';
import { checkPrompt } from './quiz/engine';

export const CATEGORY_LABELS: Record<KidCategory, string> = {
  video: 'Видео',
  english: 'Английский',
  math: 'Математика и геометрия',
  chinese: 'Китайский',
  geography: 'География',
  nature: 'Природа',
  games: 'Игры',
  other: 'Разное',
};

export const GREETING = 'Привет! Что будем делать?';
export const TODAY_GREETING = 'Привет! Вот твои занятия на сегодня.';
export const LESSON_DONE = 'Молодец! На сегодня этот урок закончен.';
export const FREE_TIME = 'Свободное время! Выбирай, что хочешь.';
export const DAY_OVER = 'На сегодня всё! Ты молодец. До завтра!';
export const CAMERA_ENOUGH = 'На сегодня снимков хватит! Завтра снимем ещё.';
export const PAUSED = 'Сделаем перерыв.';
export const CATEGORY_DONE = 'Молодец! Выбирай, что дальше.';
export const COUNT_PROMPT = 'Сколько здесь? Посчитай и нажми цифру.';
export const categoryPhrase = (c: KidCategory) => `${CATEGORY_LABELS[c]}!`;

export const coloringTask = (picture: ColoringPicture, i: number) => {
  const r = PICTURES[picture].regions[i]!;
  return `Раскрась ${r.name} ${paint(r.target).with}.`;
};
export const needColor = (id: Parameters<typeof paint>[0]) => `Нужен ${paint(id).name} цвет.`;

export const tracePrompt = (shape: TraceShape) => `Обведи ${TRACES[shape].name}.`;

export const BALLOON_NAMES: Record<BalloonColor, { name: string; plural: string }> = {
  red: { name: 'красный', plural: 'красные' },
  yellow: { name: 'жёлтый', plural: 'жёлтые' },
  blue: { name: 'синий', plural: 'синие' },
  green: { name: 'зелёный', plural: 'зелёные' },
};
export const balloonsPrompt = (target: BalloonColor | null) =>
  target ? `Лопни ${BALLOON_NAMES[target].plural} шарики!` : 'Лопай шарики!';
export const balloonsWrong = (color: BalloonColor, target: BalloonColor) =>
  `Это ${BALLOON_NAMES[color].name}. Ищи ${BALLOON_NAMES[target].plural}!`;

export const MAZE_PROMPT = 'Веди пальчиком по дорожке до цели!';
export const SHADOWS_PROMPT = 'Найди, чья это тень! Перетащи картинку на тень.';
export const FLASH_PROMPT = 'Темно! Посвети фонариком и найди, кто спрятался.';
export const MOLES_PROMPT = 'Лови зверят, пока не спрятались!';
export const MELODY_LISTEN = 'Послушай колокольчики!';
export const MELODY_AGAIN = 'Послушай ещё раз.';
export const MELODY_YOU = 'Теперь ты!';
export const SORTER_PROMPT = 'Найди каждой фигуре её домик!';
export const SORTER_TURN = 'Поверни фигуру — нажми на неё.';
export const ODD_PROMPT = 'Что здесь лишнее?';
export const PATTERN_PROMPT = 'Что будет дальше?';
export const COMPARE_MORE = 'Где больше?';
export const COMPARE_LESS = 'Где меньше?';
export const MORE_THAN = 'больше, чем';
export const LESS_THAN = 'меньше, чем';
export const PLUS = 'плюс';
export const MINUS = 'минус';
export const WILL_BE = 'будет';
export const HOW_MANY = 'Сколько будет?';
export const SIZE_PROMPT = 'Поставь от маленького к большому!';
export const WORD_PROMPT = 'Собери слово!';

/** Всё, что может прозвучать в игре. */
function gamePhrases(spec: GameSpec): string[] {
  switch (spec.kind) {
    case 'coloring':
      return spec.tasks
        ? PICTURES[spec.picture].regions.flatMap((r, i) => [
            coloringTask(spec.picture, i),
            needColor(r.target),
          ])
        : [];
    case 'tracing':
      return spec.shapes.map(tracePrompt);
    case 'sorting':
      return [spec.prompt, ...spec.bins.map((b) => b.name)];
    case 'balloons': {
      const { target } = spec;
      const wrong = target
        ? (Object.keys(BALLOON_NAMES) as BalloonColor[])
            .filter((c) => c !== target)
            .map((c) => balloonsWrong(c, target))
        : [];
      return [balloonsPrompt(target), ...wrong];
    }
    case 'counting':
      return [COUNT_PROMPT];
    case 'maze':
      return [MAZE_PROMPT];
    case 'shadows':
      return [SHADOWS_PROMPT];
    case 'flashlight':
      return [FLASH_PROMPT, ...spec.items.flatMap((i) => (i.name ? [i.name] : []))];
    case 'moles':
      return [spec.prompt ?? MOLES_PROMPT];
    case 'melody':
      return [MELODY_LISTEN, MELODY_AGAIN, MELODY_YOU];
    case 'shapes':
      return [SORTER_PROMPT, SORTER_TURN, ...spec.shapes.map((s) => SORTER[s].name)];
    case 'odd':
      return [ODD_PROMPT, ...spec.rounds.flatMap((r) => (r.explain ? [r.explain] : []))];
    case 'pattern':
      return [PATTERN_PROMPT];
    case 'compare':
      return [COMPARE_MORE, COMPARE_LESS, MORE_THAN, LESS_THAN];
    case 'arithmetic':
      return [PLUS, MINUS, WILL_BE, HOW_MANY];
    case 'size':
      return [SIZE_PROMPT];
    case 'sequence':
      return spec.rounds.map((r) => r.prompt);
    case 'word':
      return [WORD_PROMPT];
    case 'drawing':
    case 'puzzle':
    case 'memory':
      return [];
  }
}

/** Иностранные фразы игры: слова и буквы «Собери слово». */
function gameForeign(spec: GameSpec): Phrase[] {
  if (spec.kind !== 'word') return [];
  return spec.words.flatMap((w) => [
    { text: w.word.toLowerCase(), lang: spec.lang },
    ...[...w.word].map((l) => ({ text: l, lang: spec.lang })),
  ]);
}

export type Phrase = { text: string; lang: 'ru' | 'en' | 'zh' };

/** Фразы приложения для этого списка ребёнка — чтобы озвучить их заранее. */
export function appPhrases(playlist: KidPlaylist): Phrase[] {
  const ru = new Set<string>([
    GREETING,
    CATEGORY_DONE,
    TODAY_GREETING,
    LESSON_DONE,
    FREE_TIME,
    DAY_OVER,
    PAUSED,
    CAMERA_ENOUGH,
    ...Object.values(BATTERY_PHRASES),
    ...(Object.keys(CATEGORY_LABELS) as KidCategory[]).map(categoryPhrase),
    ...PALETTE.map((p) => p.name),
    ...NUMBERS.slice(1).flatMap((n) => [n, `${n}!`]),
  ]);
  const out: Phrase[] = [];
  for (const item of playlist.items) {
    if (item.kind === 'interactive') {
      gamePhrases(item.spec).forEach((t) => ru.add(t));
      for (const p of gameForeign(item.spec)) {
        if (p.lang === 'ru') ru.add(p.text);
        else out.push(p);
      }
    }
    if (item.kind === 'deck') {
      for (const card of item.cards) {
        if (card.question) continue; // свой вопрос озвучен на сервере вместе с карточкой
        for (const s of checkPrompt(card.word, playlist.immersion)) {
          if (s.audioUrl) continue;
          if (s.lang === 'ru') ru.add(s.text);
          else out.push({ text: s.text, lang: s.lang });
        }
      }
    }
  }
  const seen = new Set<string>();
  return [...[...ru].map((text) => ({ text, lang: 'ru' as const })), ...out].filter((p) => {
    const key = `${p.lang}|${p.text}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
