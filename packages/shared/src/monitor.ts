// Радионяня (этап 11): телефон ребёнка показывает ночной экран (чёрный, 🌙 и 🎤) и следит за
// шумом сам — на сервер уходит только сигнал «шумно», не звук. «Слушать» — звонок только звуком
// в одну сторону (от ребёнка к родителю), без звонка на телефоне ребёнка.
import { z } from 'zod';

export const MONITOR_SENSITIVITIES = ['low', 'medium', 'high'] as const;
export type MonitorSensitivity = (typeof MONITOR_SENSITIVITIES)[number];

export const SENSITIVITY_LABELS: Record<MonitorSensitivity, string> = {
  low: 'Низкая — только громкий плач',
  medium: 'Средняя',
  high: 'Высокая — и тихий плач',
};

/** Порог громкости, дБ относительно максимума: выше — «шумно». */
export const NOISE_THRESHOLD_DB: Record<MonitorSensitivity, number> = {
  low: -22,
  medium: -32,
  high: -42,
};
/** Шумно столько подряд — сигнал (хлопок двери не считается). */
export const NOISE_SUSTAIN_MS = 3000;
/** Телефон шлёт сигнал не чаще… */
export const NOISE_REPORT_GAP_MS = 60_000;
/** …а push родителю — не чаще раза в 5 минут. */
export const NOISE_PUSH_GAP_MS = 5 * 60_000;

export const monitorUpdate = z.object({
  on: z.boolean(),
  sensitivity: z.enum(MONITOR_SENSITIVITIES).optional(),
});
export type MonitorUpdate = z.input<typeof monitorUpdate>;

export interface MonitorState {
  on: boolean;
  sensitivity: MonitorSensitivity;
  /** Родитель сейчас слушает (id звонка-прослушки). */
  listening: string | null;
  /** Когда последний раз было шумно. */
  lastNoiseAt: string | null;
}

/** Событие живого канала телефона: родитель включил или выключил радионяню. */
export interface MonitorEvent {
  type: 'monitor';
  state: { on: boolean; sensitivity: MonitorSensitivity };
}

export const noiseReport = z.object({ db: z.number().min(-120).max(0) });

/**
 * Детектор шума: громко дольше NOISE_SUSTAIN_MS — «шумно». Чистая функция над потоком
 * измерений (время, громкость), чтобы проверять без микрофона.
 */
export function noiseDetector(sensitivity: MonitorSensitivity) {
  const threshold = NOISE_THRESHOLD_DB[sensitivity];
  let loudSince: number | null = null;
  let lastReport = -Infinity;
  return (at: number, db: number): boolean => {
    if (db < threshold) {
      loudSince = null;
      return false;
    }
    loudSince ??= at;
    if (at - loudSince < NOISE_SUSTAIN_MS || at - lastReport < NOISE_REPORT_GAP_MS) return false;
    lastReport = at;
    return true;
  };
}

/** Громкость кадра звука (RMS), дБ относительно максимума. */
export function rmsDb(samples: Float32Array): number {
  let sum = 0;
  for (const s of samples) sum += s * s;
  const rms = Math.sqrt(sum / Math.max(1, samples.length));
  return rms > 0 ? Math.max(-120, 20 * Math.log10(rms)) : -120;
}
