// Заряд телефона (этап 8): в киоске — от оболочки (системный ACTION_BATTERY_CHANGED),
// в браузере — Battery Status API. Напоминания голосом — не посреди видео и квиза.
import {
  BATTERY_PHRASES,
  batteryVoice,
  initialBatteryVoice,
  type BatteryReport,
  type BatteryThreshold,
} from '@kidsplus/shared/battery';
import { useEffect, useRef, useState } from 'react';
import { kidApi } from './api';
import { playSequence } from './audio';
import { ru } from './games/common';
import { kioskBattery } from './kiosk';

interface BrowserBattery extends EventTarget {
  level: number;
  charging: boolean;
}

/** Подписка на заряд; null — источник недоступен. Возвращает отписку. */
export function watchBattery(onChange: (b: BatteryReport) => void): () => void {
  const kiosk = kioskBattery(onChange);
  if (kiosk) return kiosk;
  const nav = navigator as Navigator & { getBattery?: () => Promise<BrowserBattery> };
  if (!nav.getBattery) return () => {};
  let off = () => {};
  let stopped = false;
  void nav
    .getBattery()
    .then((b) => {
      if (stopped) return;
      const emit = () => onChange({ level: Math.round(b.level * 100), charging: b.charging });
      b.addEventListener('levelchange', emit);
      b.addEventListener('chargingchange', emit);
      off = () => {
        b.removeEventListener('levelchange', emit);
        b.removeEventListener('chargingchange', emit);
      };
      emit();
    })
    .catch(() => {});
  return () => {
    stopped = true;
    off();
  };
}

/** Видео или квиз на экране — напоминание подождёт. */
const busy = () => Boolean(document.querySelector('[data-testid=player], [data-testid=quiz]'));
const WAIT_MS = 2000;

/**
 * Заряд для значка; сообщает серверу (родителю) и говорит напоминания.
 * @param enabled — телефон привязан (иначе серверу не сообщаем).
 */
export function useBattery(enabled: boolean): BatteryReport | null {
  const [battery, setBattery] = useState<BatteryReport | null>(null);
  const voice = useRef(initialBatteryVoice());
  const pending = useRef<BatteryThreshold | 'charging' | null>(null);
  const sent = useRef<string | null>(null);

  useEffect(
    () =>
      watchBattery((b) => {
        setBattery(b);
        const r = batteryVoice(voice.current, b);
        voice.current = r.state;
        if (r.say) pending.current = r.say;
      }),
    [],
  );

  // Серверу — только изменения (уровень или зарядка).
  useEffect(() => {
    if (!enabled || !battery) return;
    const key = `${battery.level}|${battery.charging}`;
    if (sent.current === key) return;
    sent.current = key;
    kidApi.battery(battery).catch(() => {
      sent.current = null; // нет связи — пошлём со следующим изменением
    });
  }, [enabled, battery]);

  // Напоминание — как только на экране нет видео и квиза.
  useEffect(() => {
    const timer = setInterval(() => {
      const say = pending.current;
      if (!say || busy()) return;
      pending.current = null;
      void playSequence([ru(BATTERY_PHRASES[say])]);
    }, WAIT_MS);
    return () => clearInterval(timer);
  }, []);

  return battery;
}
