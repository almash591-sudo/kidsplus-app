// Раскладка материалов по темам плана (этап 19): видео, карточки и игры ребёнка расходятся по
// неделям вперемешку. Сначала — по совпадению слов в названиях темы и материала, остальное —
// равными кусками в исходном порядке (от простого к сложному), чтобы пустых недель не было.
import { SUBJECT_LABELS, type Subject, type TopicInput, type TopicItem } from './schedule';

export interface FillMaterial {
  item: TopicItem;
  title: string;
  subject: Subject;
}

/** Ответ «Заполнить материалами»: темы плана с материалами и сколько добавлено. */
export interface CurriculumFillResult {
  topics: TopicInput[];
  added: number;
}

/** Больше материалов в одной теме схема плана не принимает. */
const MAX_ITEMS = 60;

// Слова, которые есть почти в каждом названии и ничего не говорят о теме.
const STOP = new Set([
  'песен',
  'песня',
  'мульт',
  'урок',
  'музык',
  'детей',
  'дети',
  'малыш',
  'учим',
  'видео',
  'серия',
  'весёл',
  'весел',
  'игра',
  'набор',
  'сборн',
  'новые',
  'самых',
  'мален',
  'обуча',
  'разви',
  'song',
  'songs',
  'kids',
  'children',
  'learn',
  'baby',
  'with',
]);

/** Основы слов названия: до 5 первых букв слов длиннее трёх, без служебных. */
export function stems(title: string): Set<string> {
  const out = new Set<string>();
  for (const w of title.toLowerCase().split(/[^a-zа-яё]+/u)) {
    if (w.length < 4) continue;
    // Без последней буквы: «семья» и «семью», «кот» и «кота» совпадают.
    const s = w.slice(0, Math.min(5, w.length - 1));
    if (!STOP.has(s) && !STOP.has(w)) out.add(s);
  }
  return out;
}

const key = (i: TopicItem) => `${i.kind}:${i.refId}`;

/**
 * Заполняет пустые темы плана материалами ребёнка. Темы с материалами не трогает, уже
 * разложенные материалы второй раз не берёт. Если материалов меньше, чем тем, — повторяет их.
 */
export function fillTopics(
  plan: { subjects: readonly Subject[]; topics: readonly TopicInput[] },
  materials: readonly FillMaterial[],
): CurriculumFillResult {
  const topics = plan.topics.map((t) => ({ ...t, items: [...(t.items ?? [])] }));
  let added = 0;
  for (const subject of plan.subjects) {
    const mine = topics.filter((t) => t.subject === subject);
    const used = new Set(mine.flatMap((t) => t.items.map(key)));
    const pool = materials.filter((m) => m.subject === subject && !used.has(key(m.item)));
    const targets = mine.filter((t) => !t.items.length).sort((a, b) => a.week - b.week);
    if (!targets.length || !pool.length) continue;

    const cap = Math.ceil(pool.length / targets.length) + 1;
    const label = stems(SUBJECT_LABELS[subject]);
    const topicStems = targets.map((t) => {
      const s = stems(t.title);
      for (const x of label) s.delete(x);
      return s;
    });
    const bins: TopicItem[][] = targets.map(() => []);

    // 1. Совпадение слов: «Животные фермы» ↔ «Кто живёт на ферме».
    const rest: FillMaterial[] = [];
    for (const m of pool) {
      const ms = stems(m.title);
      let best = -1;
      let score = 0;
      topicStems.forEach((ts, i) => {
        let n = 0;
        for (const s of ts) if (ms.has(s)) n++;
        if (n > score && bins[i]!.length < cap) {
          score = n;
          best = i;
        }
      });
      if (best >= 0) bins[best]!.push(m.item);
      else rest.push(m);
    }

    // 2. Остальное — каждый вид отдельно и по порядку, чтобы в каждой неделе были и видео,
    // и карточки, и игры, а сложность росла от недели к неделе.
    for (const kind of ['segment', 'deck', 'interactive'] as const) {
      const list = rest.filter((m) => m.item.kind === kind);
      list.forEach((m, j) => {
        bins[Math.floor((j * targets.length) / list.length)]!.push(m.item);
      });
    }

    // 3. Материалов меньше, чем недель, — повторяем пройденное.
    bins.forEach((b, i) => {
      if (!b.length) b.push(pool[i % pool.length]!.item);
    });

    targets.forEach((t, i) => {
      t.items = bins[i]!.slice(0, MAX_ITEMS);
      added += t.items.length;
    });
  }
  return { topics, added };
}
