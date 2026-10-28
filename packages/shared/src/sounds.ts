// Звуки слова для уроков «Буквы» (этап 49): сколько слогов, где звук, звуковая схема.
// Проверки нужны, чтобы буква в задании совпадала со звуком, который слышит ребёнок:
// в «грибе» на конце звучит [п], в «лисе» звук [л'] мягкий — такие слова в задание не берём.

const VOWELS = 'АОУЫЭИЯЁЮЕ';
/** Гласные, которые не смягчают согласный перед собой. */
const HARD_VOWELS = 'АОУЫЭ';
/** После этих букв согласный мягкий. */
const SOFTENING = 'ЯЁЮЕИЬ';
/** Всегда твёрдые и всегда мягкие согласные — мягкость им не мешает. */
const ALWAYS_HARD = 'ЖШЦ';
const ALWAYS_SOFT = 'ЧЩЙ';
/** Звонкие парные: на конце слова и перед глухим оглушаются. */
const VOICED = 'БВГДЖЗ';
/** Глухие: перед звонким (кроме В) озвончаются. */
const VOICELESS = 'ПФКТШСХЦЧЩ';
const VOICING = 'БГДЖЗ';
const isVowel = (c: string | undefined) => !!c && VOWELS.includes(c);
const isConsonant = (c: string | undefined) => !!c && !isVowel(c) && !'ЬЪ'.includes(c);

/** Слогов в слове столько же, сколько гласных. */
export const syllablesIn = (word: string) => [...word].filter(isVowel).length;

/**
 * Слово по слогам, как в «Слове из слогов»: ЛЯ-ГУШ-КА, УТ-КА, ЯБ-ЛО-КО. Один согласный между
 * гласными уходит к следующему слогу, из нескольких первый остаётся с предыдущим; Й, Ь и Ъ —
 * всегда с предыдущим (ЗАЙ-КА, ПАЛЬ-ТО, СЕМЬ-Я). Регистр букв сохраняется.
 */
export function syllableSplit(word: string): string[] {
  const chars = [...word];
  const up = chars.map((c) => c.toUpperCase());
  const vowels = up.flatMap((c, i) => (isVowel(c) ? [i] : []));
  const cuts = vowels.slice(1).map((b, k) => {
    const a = vowels[k]!;
    if (b === a + 1) return b;
    // Разделительный Ь или Ъ перед гласной: СЕМЬ-Я, ОБЪ-ЕЗД.
    if ('ЬЪ'.includes(up[b - 1]!)) return b;
    // Первый согласный (с Ь после него): один между гласными — к следующему слогу (ЛИ-СА),
    // иначе остаётся с предыдущим (УТ-КА); Й — всегда с предыдущим.
    const end = 'ЬЪ'.includes(up[a + 2]!) ? a + 2 : a + 1;
    return end === b - 1 && up[a + 1] !== 'Й' ? a + 1 : end + 1;
  });
  return [0, ...cuts].map((from, i) => chars.slice(from, cuts[i] ?? chars.length).join(''));
}

/**
 * Звуки, которые совёнок может протянуть («с-с-с», «м-м-м»): с ними задание «Где звук?»
 * звучит понятно. Взрывные (К, Т, П…) голос называет как букву — «ка», «тэ», — их не берём.
 */
export const SOUND_LETTERS = ['М', 'Н', 'Л', 'Р', 'С', 'З', 'Ш', 'Ж', 'В', 'Ф', 'Х', 'Щ'] as const;
export type SoundLetter = (typeof SOUND_LETTERS)[number];

export const SOUND_PLACES = ['start', 'middle', 'end'] as const;
export type SoundPlace = (typeof SOUND_PLACES)[number];

/** Где в слове буква letter: в начале, в середине или в конце (Ь и Ъ — не звуки). */
export function soundPlace(word: string, letter: string): SoundPlace | null {
  const sounds = [...word].filter((c) => !'ЬЪ'.includes(c));
  const i = sounds.indexOf(letter);
  if (i < 0) return null;
  return i === 0 ? 'start' : i === sounds.length - 1 ? 'end' : 'middle';
}

/** Почему слово не годится для «Где звук letter?»; null — годится. */
export function soundProblem(word: string, letter: string): string | null {
  const chars = [...word];
  const at = chars.flatMap((c, i) => (c === letter ? [i] : []));
  if (at.length !== 1) return `буква ${letter} должна быть в слове ровно один раз`;
  const i = at[0]!;
  const next = chars[i + 1];
  const after = chars[i + 2];
  const soft =
    !ALWAYS_HARD.includes(letter) &&
    !ALWAYS_SOFT.includes(letter) &&
    // «лиса», «конь» — мягкий; «гвоздь», «кости» — смягчается перед мягким согласным.
    ((!!next && SOFTENING.includes(next)) ||
      ('СЗНД'.includes(letter) && isConsonant(next) && !!after && SOFTENING.includes(after)));
  if (soft) return `звук ${letter} здесь мягкий`;
  const last = chars.filter((c) => !'ЬЪ'.includes(c)).length - 1 === i;
  if (VOICED.includes(letter) && (last || (!!next && VOICELESS.includes(next))))
    return `звук ${letter} здесь оглушается`;
  if (VOICELESS.includes(letter) && !!next && VOICING.includes(next))
    return `звук ${letter} здесь озвончается`;
  return null;
}

/** Фишка звуковой схемы: гласный (красная) или твёрдый согласный (синяя). */
export type SchemeChip = 'v' | 'c';

/**
 * Звуковая схема слова, как в первом классе; null — в слове есть мягкие согласные или
 * Я, Ё, Ю, Е, Й, Ь (у них фишки другие — зелёные, а гласная даёт два звука).
 */
export function wordScheme(word: string): SchemeChip[] | null {
  const chars = [...word];
  const out: SchemeChip[] = [];
  for (const [i, c] of chars.entries()) {
    if ('ЕЁЮЯЬЪЧЩЙ'.includes(c)) return null;
    if (c === 'И') {
      const prev = chars[i - 1];
      if (prev && !HARD_VOWELS.includes(prev) && !ALWAYS_HARD.includes(prev)) return null;
      out.push('v');
    } else out.push(isVowel(c) ? 'v' : 'c');
  }
  return out;
}
