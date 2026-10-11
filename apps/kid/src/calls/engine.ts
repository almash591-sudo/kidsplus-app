// Звонки в детском приложении (этап 10): один клиент на приложение; события — из живого канала.
import { API_PREFIX } from '@kidsplus/shared';
import { CallEngine, type CallView } from '@kidsplus/shared/call-client';
import type { CallEvent, Peer } from '@kidsplus/shared/calls';
import { useEffect, useState } from 'react';

let engine: CallEngine | null = null;
let starting: Promise<CallEngine | null> | null = null;
const waiting: ((e: CallEngine) => void)[] = [];

async function request(method: 'GET' | 'POST', path: string, body?: unknown) {
  const res = await fetch(`${API_PREFIX}${path}`, {
    method,
    credentials: 'same-origin',
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.status === 204 ? null : res.json();
}

/** Запустить клиент звонков (после привязки) и узнать, не звонят ли сейчас. */
export function startCalls(): Promise<CallEngine | null> {
  if (engine) return Promise.resolve(engine);
  starting ??= request('GET', '/calls/me')
    .then((r: { id: Peer }) => {
      engine = new CallEngine(r.id, request);
      waiting.splice(0).forEach((fn) => fn(engine!));
      void engine.sync();
      return engine;
    })
    .catch(() => {
      starting = null;
      return null;
    });
  return starting;
}

export const callEngine = () => engine;
/** Кто я в звонках (после startCalls). */
export const callMe = () => engine?.me ?? null;

/** Событие живого канала («call» или «signal»). */
export function onCallEvent(raw: string) {
  try {
    const event = JSON.parse(raw) as CallEvent;
    void engine?.handle(event);
  } catch {
    // повреждённое событие — пропускаем
  }
}

/** Состояние звонка для экрана. */
export function useCallView(): CallView | null {
  const [view, setView] = useState<CallView | null>(null);
  useEffect(() => {
    let off: (() => void) | undefined;
    const attach = (e: CallEngine) => {
      const unsubscribe = e.subscribe(setView);
      off = () => void unsubscribe();
    };
    if (engine) attach(engine);
    else waiting.push(attach);
    return () => off?.();
  }, []);
  return view;
}

/** Для тестов. */
export function resetCalls() {
  engine = null;
  starting = null;
}
