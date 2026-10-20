// Уровни сложности игр (этап 34): у каждого ребёнка для каждого вида игры свой уровень. Две игры
// подряд без ошибок — уровень выше, много ошибок — ниже. Уровень 1 — игра как её настроил родитель;
// выше — те же картинки, но больше счёт, крупнее пазл, длиннее мелодия (в пределах схемы игры).
import type { GameKind, GameSpec } from './games';
import { PATTERNS } from './games';

export const MAX_LEVEL = 4;
/** Без ошибок столько раз подряд — уровень выше. */
export const LEVEL_UP_CLEAN = 2;
/** Столько ошибок и больше за игру — уровень ниже. */
export const LEVEL_DOWN_MISTAKES = 4;

/** С какого уровня начинать: с 5 лет — со второго. */
export const startLevel = (ageYears: number) => (ageYears >= 5 ? 2 : 1);

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/** Параметры игры на уровне `level` (1 — как задал родитель). */
export function specAtLevel(spec: GameSpec, level: number): GameSpec {
  const up = clamp(Math.round(level), 1, MAX_LEVEL) - 1;
  if (!up) return spec;
  switch (spec.kind) {
    case 'counting':
      return {
        ...spec,
        max: clamp(spec.max + 2 * up, 2, 10),
        rounds: clamp(spec.rounds + up, 1, 10),
      };
    case 'arithmetic':
      return {
        ...spec,
        max: clamp(spec.max + 2 * up, 2, 10),
        ops: up >= 2 ? ['plus', 'minus'] : spec.ops,
        rounds: clamp(spec.rounds + up, 1, 10),
      };
    case 'compare':
      return {
        ...spec,
        max: clamp(spec.max + 2 * up, 2, 10),
        ask: up >= 2 ? 'mixed' : spec.ask,
        rounds: clamp(spec.rounds + up, 1, 10),
      };
    case 'puzzle':
      return { ...spec, cols: clamp(spec.cols + up, 1, 4), rows: clamp(spec.rows + up, 1, 4) };
    case 'maze':
      return { ...spec, size: clamp(spec.size + up, 3, 9), rounds: clamp(spec.rounds + up, 1, 5) };
    case 'balloons':
      return { ...spec, count: clamp(spec.count + 3 * up, 3, 20), target: spec.target ?? 'red' };
    case 'moles':
      return {
        ...spec,
        count: clamp(spec.count + 3 * up, 3, 20),
        speed: up >= 2 ? 'fast' : spec.speed === 'slow' ? 'normal' : spec.speed,
      };
    case 'pattern': {
      const harder = PATTERNS.filter((p) => p !== 'ABC' || spec.imageIds.length >= 3);
      return {
        ...spec,
        patterns: up >= 2 ? [...harder] : spec.patterns,
        rounds: clamp(spec.rounds + up, 1, 10),
      };
    }
    case 'shapes':
      return { ...spec, rotate: true };
    case 'shadows':
      return {
        ...spec,
        perRound: clamp(spec.perRound + up, 2, Math.min(4, spec.imageIds.length)),
      };
    case 'size':
      return { ...spec, count: clamp(spec.count + up, 3, 5) };
    case 'melody':
      return {
        ...spec,
        bells: clamp(spec.bells + up, 3, 5),
        goal: clamp(spec.goal + up, Math.max(2, spec.start), 8),
      };
    case 'word':
      return { ...spec, extra: clamp(spec.extra + up, 0, 3) };
    case 'pitch':
      return { ...spec, gap: clamp(spec.gap - 6 * up, 12, 36) };
    case 'direction':
      return { ...spec, notes: clamp(spec.notes + up, 3, 5) };
    case 'beats':
      return { ...spec, max: clamp(spec.max + up, 2, 6) };
    case 'rhythm':
      return { ...spec, beats: clamp(spec.beats + up, 2, 6), timing: up >= 2 || spec.timing };
    case 'piano':
    case 'staff':
      return { ...spec, keys: clamp(spec.keys + up, 3, 8) };
    case 'orchestra':
      return { ...spec, players: clamp(spec.players + up, 3, 6) };
    case 'letter':
    case 'syllable':
    case 'firstLetter':
    case 'readWord':
      return {
        ...spec,
        choices: clamp(spec.choices + up, 2, 4),
        rounds: clamp(spec.rounds + 2 * up, 2, 12),
      };
    case 'clock':
      return {
        ...spec,
        half: true,
        choices: clamp(spec.choices + up - 1, 2, 4),
        rounds: clamp(spec.rounds + up, 2, 10),
      };
    case 'shop': {
      const coins = new Set(spec.coins);
      coins.add(2);
      if (up >= 2) coins.add(5);
      return {
        ...spec,
        max: clamp(spec.max + 2 * up, 2, 10),
        coins: [...coins].sort((a, b) => a - b),
        rounds: clamp(spec.rounds + up, 2, 8),
      };
    }
    case 'robot':
      return {
        ...spec,
        size: clamp(spec.size + up, 3, 6),
        steps: clamp(spec.steps + up, 2, 8),
        rocks: up >= 2 || spec.rocks,
      };
    case 'space':
      // Больше планет → через одну (цифры) → с конца.
      return {
        ...spec,
        count: clamp(spec.count + 2 * up, 3, 10),
        step: up >= 2 ? 2 : spec.step,
        reverse: up >= 3 || spec.reverse,
      };
    case 'fishing': {
      const speeds = ['slow', 'normal', 'fast'] as const;
      return {
        ...spec,
        max: clamp(spec.max + 2 * up, 3, 10),
        fish: clamp(spec.fish + up, 3, 6),
        speed: speeds[clamp(speeds.indexOf(spec.speed) + up, 0, 2)]!,
        rounds: clamp(spec.rounds + up, 2, 10),
      };
    }
    case 'flight': {
      // Больше звёзд → больше тучек → быстрее.
      const clouds = ['none', 'few', 'many'] as const;
      const speeds = ['slow', 'normal', 'fast'] as const;
      return {
        ...spec,
        stars: clamp(spec.stars + 3 * up, 5, 20),
        clouds: clouds[clamp(clouds.indexOf(spec.clouds) + up, 0, 2)]!,
        speed: speeds[clamp(speeds.indexOf(spec.speed) + Math.max(0, up - 1), 0, 2)]!,
      };
    }
    case 'builder':
      // Выше башня, больше разных деталей, со второго шага — по памяти.
      return {
        ...spec,
        height: clamp(spec.height + up, 2, 6),
        blocks: clamp(spec.blocks + up, 3, 5),
        hide: up >= 2 || spec.hide,
      };
    default:
      // Раскраска, рисовалка, пары, сортировка, фонарик, «лишнее», «по порядку», песенки — как есть.
      return spec;
  }
}

/** Прохождение игры: вид, ошибки (у старых записей ошибок нет — не учитываются). */
export interface GamePlay {
  kind: GameKind;
  mistakes: number | null;
  at: Date;
}

/** Уровни ребёнка по видам игр — по прохождениям по порядку времени. */
export function gameLevels(plays: GamePlay[], start: number): Partial<Record<GameKind, number>> {
  const out: Partial<Record<GameKind, number>> = {};
  const clean: Partial<Record<GameKind, number>> = {};
  for (const p of [...plays].sort((a, b) => a.at.getTime() - b.at.getTime())) {
    if (p.mistakes === null) continue;
    const level = out[p.kind] ?? start;
    if (p.mistakes === 0) {
      const n = (clean[p.kind] ?? 0) + 1;
      if (n >= LEVEL_UP_CLEAN) {
        out[p.kind] = Math.min(MAX_LEVEL, level + 1);
        clean[p.kind] = 0;
      } else {
        out[p.kind] = level;
        clean[p.kind] = n;
      }
    } else {
      clean[p.kind] = 0;
      out[p.kind] = p.mistakes >= LEVEL_DOWN_MISTAKES ? Math.max(1, level - 1) : level;
    }
  }
  return out;
}
