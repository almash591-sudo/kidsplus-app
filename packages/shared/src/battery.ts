// Заряд телефона ребёнка (этап 8): значок, голосовые напоминания, заряд в кабинете и push.
import { z } from 'zod';

/** Что телефон сообщает о батарее. */
export const batteryReport = z.object({
  level: z.number().int().min(0).max(100),
  charging: z.boolean(),
});
export type BatteryReport = z.infer<typeof batteryReport>;

/** Пороги напоминаний ребёнку, от высокого к низкому. */
export const BATTERY_THRESHOLDS = [20, 10, 5] as const;
export type BatteryThreshold = (typeof BATTERY_THRESHOLDS)[number];

/** Push родителю — один раз за разряд. */
export const BATTERY_PUSH_LEVEL = 15;
/** Выше этого заряда (или на зарядке) напоминания и push начинаются заново. */
export const BATTERY_RESET_LEVEL = 25;

export const BATTERY_PHRASES: Record<BatteryThreshold | 'charging', string> = {
  20: 'Батарейка садится. Скоро нужно поставить телефон на зарядку.',
  10: 'Пора поставить телефон на зарядку.',
  5: 'Батарейка почти села! Попроси маму или папу поставить телефон на зарядку.',
  charging: 'Телефон заряжается. Молодец!',
};

/** Состояние напоминаний: какие пороги уже прозвучали за этот разряд. */
export interface BatteryVoiceState {
  said: BatteryThreshold[];
  charging: boolean | null;
}

export const initialBatteryVoice = (): BatteryVoiceState => ({ said: [], charging: null });

/**
 * Что сказать при новом показании заряда. Каждый порог — один раз за разряд; если заряд
 * сразу упал ниже нескольких порогов, звучит только самый низкий. Подключили зарядку —
 * «Телефон заряжается» (не при первом показании: приложение могло открыться уже на зарядке).
 */
export function batteryVoice(
  state: BatteryVoiceState,
  b: BatteryReport,
): { state: BatteryVoiceState; say: BatteryThreshold | 'charging' | null } {
  if (b.charging) {
    const plugged = state.charging === false;
    return { state: { said: [], charging: true }, say: plugged ? 'charging' : null };
  }
  const said = b.level > BATTERY_RESET_LEVEL ? [] : state.said;
  const crossed = BATTERY_THRESHOLDS.filter((t) => b.level <= t && !said.includes(t));
  const next = { said: [...said, ...crossed], charging: false };
  return { state: next, say: crossed.length ? crossed[crossed.length - 1]! : null };
}

/** Цвет значка. */
export const batteryTone = (b: BatteryReport): 'ok' | 'low' | 'critical' =>
  b.charging || b.level > 20 ? 'ok' : b.level > 10 ? 'low' : 'critical';
