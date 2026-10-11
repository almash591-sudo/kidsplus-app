// Радионяня на телефоне ребёнка (этап 11): ночной экран — чёрный (на AMOLED почти не светит),
// маленькая луна и значок микрофона: скрыто слушать нельзя. Экран не гаснет, иначе Android
// не даст микрофон. Громкость считает сам телефон; на сервер — только сигнал «шумно».
import { API_PREFIX } from '@kidsplus/shared';
import { noiseDetector, rmsDb, type MonitorSensitivity } from '@kidsplus/shared/monitor';
import { useEffect } from 'react';
import { setNightMode } from '../kiosk';
import './monitor.css';

/** Сколько раз в секунду мерить громкость. */
const SAMPLE_MS = 200;

function useNoiseWatch(sensitivity: MonitorSensitivity) {
  useEffect(() => {
    let stream: MediaStream | null = null;
    let ctx: AudioContext | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;
    let stopped = false;
    const detect = noiseDetector(sensitivity);
    navigator.mediaDevices
      ?.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      })
      .then((s) => {
        if (stopped) return s.getTracks().forEach((t) => t.stop());
        stream = s;
        ctx = new AudioContext();
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 2048;
        ctx.createMediaStreamSource(s).connect(analyser);
        const buf = new Float32Array(analyser.fftSize);
        timer = setInterval(() => {
          analyser.getFloatTimeDomainData(buf);
          const db = rmsDb(buf);
          if (detect(Date.now(), db))
            void fetch(`${API_PREFIX}/kid/monitor/noise`, {
              method: 'POST',
              credentials: 'same-origin',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ db: Math.round(db) }),
            }).catch(() => {});
        }, SAMPLE_MS);
      })
      .catch(() => {});
    return () => {
      stopped = true;
      if (timer) clearInterval(timer);
      stream?.getTracks().forEach((t) => t.stop());
      void ctx?.close();
    };
  }, [sensitivity]);
}

export function MonitorScreen({
  sensitivity,
  listening,
  corner,
}: {
  sensitivity: MonitorSensitivity;
  /** Родитель сейчас слушает. */
  listening: boolean;
  corner: React.ReactNode;
}) {
  useNoiseWatch(sensitivity);
  // Экран не гаснет и почти не светит, пока включена радионяня.
  useEffect(() => {
    setNightMode(true);
    return () => setNightMode(false);
  }, []);
  return (
    <div className="screen night" data-testid="monitor" data-listening={listening ? '1' : '0'}>
      <span className="night-moon" aria-hidden="true">
        🌙
      </span>
      <span
        className={`night-mic${listening ? ' on' : ''}`}
        role="img"
        aria-label={listening ? 'Мама или папа слушает' : 'Радионяня включена'}
      >
        🎤
      </span>
      {corner}
    </div>
  );
}
