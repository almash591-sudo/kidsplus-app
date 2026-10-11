// Запись голоса родителя (этап 15в): касание — запись, второе касание или 8 секунд — стоп,
// запись сразу загружается на сервер.
import type { MediaRef } from '@kidsplus/shared/api';
import { RECORD_MAX_SEC } from '@kidsplus/shared/family-voice';
import { Button } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useEffect, useRef, useState } from 'react';
import { api, errorMessage } from '../api';

/** Формат записи, который понимает браузер (Chrome — WebM, Safari — M4A). */
const mimeType = () =>
  ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'].find((t) =>
    typeof MediaRecorder !== 'undefined' ? MediaRecorder.isTypeSupported(t) : false,
  );

export function VoiceRecorder(props: {
  onRecorded: (audio: MediaRef) => void;
  label?: string;
  size?: 'xs' | 'sm' | 'md';
  disabled?: boolean;
}) {
  const [state, setState] = useState<'idle' | 'recording' | 'saving'>('idle');
  const [left, setLeft] = useState(RECORD_MAX_SEC);
  const rec = useRef<MediaRecorder | null>(null);
  const timer = useRef<ReturnType<typeof setInterval>>(undefined);

  useEffect(
    () => () => {
      clearInterval(timer.current);
      rec.current?.stream.getTracks().forEach((t) => t.stop());
    },
    [],
  );

  const stop = () => {
    clearInterval(timer.current);
    if (rec.current?.state === 'recording') rec.current.stop();
  };

  const start = async () => {
    const type = mimeType();
    if (!type || !navigator.mediaDevices?.getUserMedia) {
      notifications.show({ color: 'red', message: 'Этот браузер не умеет записывать звук' });
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      notifications.show({ color: 'red', message: 'Нет доступа к микрофону' });
      return;
    }
    const chunks: Blob[] = [];
    const r = new MediaRecorder(stream, { mimeType: type });
    rec.current = r;
    r.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    r.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      setState('saving');
      const blob = new Blob(chunks, { type: type.split(';')[0] });
      void api
        .upload<MediaRef>('/parent/media/audio', blob)
        .then(props.onRecorded)
        .catch((err: unknown) => notifications.show({ color: 'red', message: errorMessage(err) }))
        .finally(() => setState('idle'));
    };
    r.start();
    setState('recording');
    setLeft(RECORD_MAX_SEC);
    const started = Date.now();
    timer.current = setInterval(() => {
      const rest = RECORD_MAX_SEC - Math.floor((Date.now() - started) / 1000);
      setLeft(rest);
      if (rest <= 0) stop();
    }, 250);
  };

  return (
    <Button
      size={props.size ?? 'sm'}
      radius="xl"
      color={state === 'recording' ? 'red' : 'ios'}
      variant={state === 'recording' ? 'filled' : 'light'}
      loading={state === 'saving'}
      disabled={props.disabled}
      onClick={() => (state === 'recording' ? stop() : void start())}
    >
      {state === 'recording' ? `■ Стоп · ${left}` : `● ${props.label ?? 'Записать'}`}
    </Button>
  );
}
