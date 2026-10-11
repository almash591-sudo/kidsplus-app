// Состояние радионяни на телефоне: с сервера при запуске и по живому каналу (событие «monitor»).
import { API_PREFIX } from '@kidsplus/shared';
import type { MonitorEvent, MonitorSensitivity } from '@kidsplus/shared/monitor';
import { useEffect, useState } from 'react';

type State = { on: boolean; sensitivity: MonitorSensitivity };
const OFF: State = { on: false, sensitivity: 'medium' };
const listeners = new Set<(s: State) => void>();

export function onMonitorEvent(raw: string) {
  try {
    const e = JSON.parse(raw) as MonitorEvent;
    listeners.forEach((fn) => fn(e.state));
  } catch {
    // повреждённое событие — пропускаем
  }
}

async function load(): Promise<State | null> {
  try {
    const res = await fetch(`${API_PREFIX}/kid/monitor`, { credentials: 'same-origin' });
    return res.ok ? ((await res.json()) as State) : null;
  } catch {
    return null;
  }
}

export function useMonitor(paired: boolean): State {
  const [state, setState] = useState<State>(OFF);
  useEffect(() => {
    if (!paired) return;
    const apply = (s: State | null) => s && setState(s);
    listeners.add(setState);
    void load().then(apply);
    const onVisible = () => document.visibilityState === 'visible' && void load().then(apply);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      listeners.delete(setState);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [paired]);
  return state;
}
