// Камера ребёнка (этап 9): фото по одному касанию (пауза 2 с — серийной съёмки нет), видео
// не длиннее 30 с (останавливается само). Снимки — в галерею на телефоне и копией в кабинет.
import {
  CAPTURE_DAILY_LIMIT,
  PHOTO_COOLDOWN_MS,
  PHOTO_MAX_SIDE,
  VIDEO_BITS_PER_SECOND,
  VIDEO_MAX_MS,
  type CaptureKind,
  type CaptureToday,
} from '@kidsplus/shared/captures';
import { useCallback, useEffect, useRef, useState } from 'react';
import { kidApi } from '../api';
import { playSequence } from '../audio';
import { fx } from '../fx';
import { ru } from '../games/common';
import { CAMERA_ENOUGH } from '../phrases';
import { saveCapture } from './store';
import { flushCaptures } from './upload';
import './camera.css';
import { Icon } from '../ui/icons';

type Facing = 'user' | 'environment';

/** Формат записи: MP4 открывается везде (кабинет на любом телефоне), иначе WebM. */
export function recorderMime(): string {
  const prefs = ['video/mp4', 'video/webm;codecs=vp8,opus', 'video/webm'];
  if (typeof MediaRecorder === 'undefined') return '';
  return prefs.find((m) => MediaRecorder.isTypeSupported(m)) ?? '';
}

/** Кадр из видео — в JPEG, длинная сторона не больше PHOTO_MAX_SIDE. */
function snapshot(video: HTMLVideoElement): Promise<Blob | null> {
  const w = video.videoWidth;
  const h = video.videoHeight;
  if (!w || !h) return Promise.resolve(null);
  const scale = Math.min(1, PHOTO_MAX_SIDE / Math.max(w, h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  canvas.getContext('2d')!.drawImage(video, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
}

const RING = 2 * Math.PI * 46;

export function CameraScreen({ onExit, onGallery }: { onExit: () => void; onGallery: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const [mode, setMode] = useState<CaptureKind>('photo');
  const [facing, setFacing] = useState<Facing>('environment');
  const [failed, setError] = useState(false);
  // Камеры нет вовсе (старый браузер) — сразу заглушка.
  const error = failed || !navigator.mediaDevices;
  const [cooldown, setCooldown] = useState(false);
  /** Поток камеры готов (после смены режима или камеры — не сразу). */
  const [ready, setReady] = useState(false);
  const [flash, setFlash] = useState(false);
  const [recording, setRecording] = useState<{ startedAt: number } | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [today, setToday] = useState<CaptureToday | null>(null);

  useEffect(() => {
    kidApi.captureToday().then(setToday, () => {});
    void flushCaptures();
  }, []);

  // Камера (и микрофон — только для видео). Смена режима или камеры — новый поток.
  useEffect(() => {
    let cancelled = false;
    navigator.mediaDevices
      ?.getUserMedia({
        video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: mode === 'video',
      })
      .then((s) => {
        if (cancelled) return s.getTracks().forEach((t) => t.stop());
        stream.current = s;
        if (video.current) {
          video.current.srcObject = s;
          void video.current.play().catch(() => {});
        }
        setReady(true);
      })
      .catch(() => !cancelled && setError(true));
    return () => {
      cancelled = true;
      stream.current?.getTracks().forEach((t) => t.stop());
      stream.current = null;
    };
  }, [mode, facing]);

  // Уходим с экрана посреди записи — запись останавливается и сохраняется.
  useEffect(() => () => recorder.current?.stop(), []);

  const used = (k: CaptureKind) => today?.[k].used ?? 0;
  const enough = (k: CaptureKind) => used(k) >= (today?.[k].limit ?? CAPTURE_DAILY_LIMIT[k]);
  const counted = (k: CaptureKind) =>
    setToday((t) => (t ? { ...t, [k]: { ...t[k], used: t[k].used + 1 } } : t));

  const store = useCallback(async (kind: CaptureKind, blob: Blob, durationMs: number | null) => {
    await saveCapture({
      id: crypto.randomUUID(),
      kind,
      blob,
      durationMs,
      takenAt: new Date().toISOString(),
      uploaded: false,
    });
    counted(kind);
    void flushCaptures();
  }, []);

  const takePhoto = async () => {
    if (cooldown || !video.current) return;
    if (enough('photo')) return void playSequence([ru(CAMERA_ENOUGH)]);
    setCooldown(true);
    setTimeout(() => setCooldown(false), PHOTO_COOLDOWN_MS);
    fx.snap();
    setFlash(true);
    setTimeout(() => setFlash(false), 180);
    const blob = await snapshot(video.current);
    if (blob) await store('photo', blob, null);
  };

  const stopRecording = () => recorder.current?.state === 'recording' && recorder.current.stop();

  const startRecording = () => {
    if (!stream.current || recorder.current) return;
    if (enough('video')) return void playSequence([ru(CAMERA_ENOUGH)]);
    const mimeType = recorderMime();
    const r = new MediaRecorder(stream.current, {
      ...(mimeType ? { mimeType } : {}),
      videoBitsPerSecond: VIDEO_BITS_PER_SECOND,
    });
    const chunks: Blob[] = [];
    const startedAt = Date.now();
    const limit = setTimeout(stopRecording, VIDEO_MAX_MS);
    r.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    r.onstop = () => {
      clearTimeout(limit);
      recorder.current = null;
      setRecording(null);
      setElapsed(0);
      const durationMs = Math.min(Date.now() - startedAt, VIDEO_MAX_MS);
      const blob = new Blob(chunks, {
        type: (r.mimeType || mimeType || 'video/webm').split(';')[0],
      });
      if (blob.size) void store('video', blob, durationMs);
    };
    recorder.current = r;
    r.start(1000);
    fx.pop();
    setRecording({ startedAt });
  };

  // Кольцо: сколько из 30 секунд прошло.
  useEffect(() => {
    if (!recording) return;
    const timer = setInterval(() => setElapsed(Date.now() - recording.startedAt), 100);
    return () => clearInterval(timer);
  }, [recording]);

  const shutter = () => {
    if (mode === 'photo') void takePhoto();
    else if (recording) stopRecording();
    else startRecording();
  };

  const left = Math.max(0, Math.ceil((VIDEO_MAX_MS - elapsed) / 1000));
  const progress = Math.min(1, elapsed / VIDEO_MAX_MS);
  const disabled =
    !ready || (mode === 'photo' ? cooldown || enough('photo') : !recording && enough('video'));

  return (
    <div className="screen camera" data-testid="camera" data-mode={mode}>
      {error ? (
        <div className="camera-error" data-testid="camera-error">
          📷❌
        </div>
      ) : (
        <video
          ref={video}
          className={`camera-preview${facing === 'user' ? ' mirrored' : ''}`}
          playsInline
          muted
          autoPlay
        />
      )}
      {flash && <div className="camera-flash" />}

      <div className="camera-modes">
        {(['photo', 'video'] as const).map((m) => (
          <button
            key={m}
            type="button"
            className={`camera-mode${mode === m ? ' active' : ''}`}
            aria-label={m === 'photo' ? 'Фото' : 'Видео'}
            data-testid={`camera-mode-${m}`}
            disabled={Boolean(recording)}
            onClick={() => {
              fx.tap();
              setError(false);
              if (m !== mode) setReady(false);
              setMode(m);
            }}
          >
            {m === 'photo' ? '📷' : '🎥'}
          </button>
        ))}
      </div>

      <div className="camera-bar">
        <button
          type="button"
          className="camera-side"
          aria-label="Мои снимки"
          data-testid="camera-gallery"
          disabled={Boolean(recording)}
          onClick={onGallery}
        >
          🖼️
        </button>
        <button
          type="button"
          className={`camera-shutter ${mode}${recording ? ' recording' : ''}`}
          aria-label={mode === 'photo' ? 'Снять' : recording ? 'Стоп' : 'Записать'}
          data-testid="camera-shutter"
          data-ready={disabled ? '0' : '1'}
          disabled={disabled || error}
          onClick={shutter}
        >
          <svg viewBox="0 0 100 100" aria-hidden="true">
            <circle cx="50" cy="50" r="46" className="ring-bg" />
            {recording && (
              <circle
                cx="50"
                cy="50"
                r="46"
                className="ring"
                strokeDasharray={RING}
                strokeDashoffset={RING * progress}
                data-testid="camera-progress"
              />
            )}
          </svg>
          {recording && <span className="camera-left">{left}</span>}
        </button>
        <button
          type="button"
          className="camera-side"
          aria-label="Другая камера"
          data-testid="camera-flip"
          disabled={Boolean(recording)}
          onClick={() => {
            fx.flip();
            setError(false);
            setReady(false);
            setFacing((f) => (f === 'user' ? 'environment' : 'user'));
          }}
        >
          🔄
        </button>
      </div>

      {(mode === 'photo' ? enough('photo') : enough('video') && !recording) && (
        <div className="camera-limit" data-testid="camera-limit">
          ✋
        </div>
      )}

      <button
        type="button"
        className="corner-button home"
        aria-label="Домой"
        onClick={() => {
          stopRecording();
          onExit();
        }}
        data-testid="go-home"
      >
        <Icon name="home" size={34} stroke={2.6} />
      </button>
    </div>
  );
}
