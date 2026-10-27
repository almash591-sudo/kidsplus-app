import type { GameInput } from '@kidsplus/shared/api';
import {
  gameSpec,
  problemAnswer,
  SYLLABLE_WORD_RE,
  type WordProblem,
} from '@kidsplus/shared/games';

/** Понятная причина, почему игру нельзя сохранить. */
export function problem(v: GameInput): string | null {
  if (!v.title.trim()) return 'Укажите название.';
  const spec = v.spec;
  if (spec.kind === 'sorting') {
    if (!spec.prompt.trim()) return 'Напишите задание — оно озвучивается.';
    if (!spec.bins.length) return 'Добавьте хотя бы одно место, куда раскладывать.';
    if (spec.bins.some((b) => !b.name.trim())) return 'Подпишите каждое место.';
    if (spec.items.length < 2) return 'Добавьте хотя бы 2 предмета.';
  }
  if (spec.kind === 'memory' && spec.imageIds.length < 2) return 'Нужно хотя бы 2 картинки.';
  if ((spec.kind === 'puzzle' || spec.kind === 'counting') && !spec.imageIds.length)
    return 'Выберите картинку.';
  if (spec.kind === 'tracing' && !spec.shapes.length) return 'Выберите, что обводить.';
  if (spec.kind === 'tracing' && spec.shapes.length > 12) return 'Не больше 12 фигур.';
  switch (spec.kind) {
    case 'maze':
      if (!spec.heroId || !spec.goalId) return 'Выберите, кто идёт и куда.';
      break;
    case 'shadows':
      if (spec.imageIds.length < 2) return 'Нужно хотя бы 2 картинки.';
      break;
    case 'flashlight':
      if (!spec.items.length) return 'Добавьте, кто спрятался.';
      break;
    case 'moles':
    case 'size':
    case 'arithmetic':
      if (!spec.imageIds.length) return 'Выберите картинку.';
      break;
    case 'shapes':
      if (spec.shapes.length < 2) return 'Выберите хотя бы 2 фигуры.';
      if (spec.shapes.length > 8) return 'Не больше 8 фигур.';
      break;
    case 'odd':
      if (spec.rounds.some((r) => r.imageIds.length < 3))
        return 'В каждом раунде нужно 3 или 4 картинки.';
      break;
    case 'pattern':
      if (new Set(spec.imageIds).size < 2) return 'Нужно хотя бы 2 разные картинки.';
      if (!spec.patterns.length) return 'Выберите закономерность.';
      if (spec.patterns.includes('ABC') && new Set(spec.imageIds).size < 3)
        return 'Для ряда из трёх картинок нужно 3 разные картинки.';
      break;
    case 'compare':
      if (spec.mode === 'objects' && !spec.imageIds?.length) return 'Выберите, что сравнивать.';
      break;
    case 'sequence':
      if (spec.rounds.some((r) => !r.prompt.trim())) return 'Напишите задание в каждом раунде.';
      if (spec.rounds.some((r) => r.imageIds.length < 2))
        return 'В каждом раунде нужно хотя бы 2 картинки.';
      break;
    case 'word':
      if (!spec.words.length) return 'Добавьте слово с картинкой.';
      if (spec.words.some((w) => !/^[А-ЯЁA-Z]{2,10}$/u.test(w.word.trim())))
        return 'Слово — только буквы, от 2 до 10.';
      break;
    case 'syllableWord':
      if (!spec.words.length) return 'Добавьте слово с картинкой.';
      if (spec.words.some((w) => !SYLLABLE_WORD_RE.test(w.word.trim().toUpperCase())))
        return 'Слово — слоги через дефис: МА-ШИ-НА.';
      break;
    case 'riddle':
      if (spec.riddles.length < 2) return 'Нужно хотя бы 2 загадки.';
      if (spec.riddles.some((r) => !r.text.trim() || !r.name.trim()))
        return 'У каждой загадки — текст и отгадка.';
      break;
    case 'sudoku':
      if (new Set(spec.imageIds).size < (spec.size ?? 3))
        return `Выберите ${spec.size ?? 3} разные картинки.`;
      break;
    case 'dots':
    case 'colorNumbers':
      if (!spec.pictures.length) return 'Выберите картинку.';
      break;
    case 'tangram':
      if (!spec.figures.length) return 'Выберите фигуру.';
      break;
    case 'syllableCount':
    case 'soundPlace':
    case 'wordScheme':
      if (spec.words.length < 2) return 'Нужно хотя бы 2 слова с картинкой.';
      break;
    case 'pickWord':
    case 'readPhrase': {
      if (spec.items.length < 2) return 'Нужно хотя бы 2 строки.';
      // Обманки — сначала похожие, потом ответы других строк: вариантов должно хватить.
      const rows =
        spec.kind === 'pickWord'
          ? spec.items.map((i) => [i.word, ...i.similar])
          : spec.items.map((i) => [i.emoji, ...i.similar]);
      const answers = rows.map((r) => r[0]!);
      if (rows.some((r) => new Set([...answers, ...r]).size < spec.choices))
        return `Мало похожих для ${spec.choices} вариантов — добавьте похожие или строки.`;
      break;
    }
    case 'numberHouse':
      if (!spec.numbers.length) return 'Выберите хотя бы одно число на крыше.';
      break;
    case 'numberNeighbors':
      if (spec.to - spec.from < 2) return 'Нужно хотя бы три числа подряд: «до» больше «от» на 2.';
      if (!spec.modes.length) return 'Выберите, что спрашивать.';
      break;
    case 'wordProblem':
      if (!spec.problems.length) return 'Добавьте задачу.';
      break;
    default:
      break;
  }
  if (spec.kind === 'arithmetic' && !spec.ops.length) return 'Выберите сложение или вычитание.';
  return gameSpec.safeParse(spec).success ? null : 'Проверьте параметры игры.';
}

/**
 * Строка задачи (этап 49): «🍎 2 + 1: У ёжика два яблока…» → задача; строка — что не так.
 * Числа в условии — словами: совёнок читает его вслух, а «2 яблока» легко прочитать не так.
 */
export function wordProblemOf(line: string): WordProblem | string {
  const m = /^(\S+)\s+(\d{1,2})\s*([+\-−–])\s*(\d{1,2})\s*:\s*(.+)$/u.exec(line.trim());
  if (!m) return 'нужно «эмодзи 2 + 1: условие»';
  const [, emoji, a, sign, b, text] = m as unknown as [
    string,
    string,
    string,
    string,
    string,
    string,
  ];
  if ([...emoji].length > 4 || emoji.length > 8) return 'одна эмодзи-картинка';
  const p = {
    emoji,
    a: Number(a),
    op: sign === '+' ? 'plus' : 'minus',
    b: Number(b),
    text,
  } as const;
  if (p.a < 1 || p.a > 10 || p.b < 1 || p.b > 10) return 'числа от 1 до 10';
  const answer = problemAnswer(p);
  if (answer < 0 || answer > 10) return 'ответ — от 0 до 10';
  if (/\d/u.test(text)) return 'числа в условии — словами: «два яблока»';
  if (text.length > 200) return 'условие — до 200 знаков';
  if (!text.endsWith('?')) return 'условие кончается вопросом';
  return p;
}
