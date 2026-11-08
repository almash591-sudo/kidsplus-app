// Этап 59: живая картинка с камеры для игр. Кадры живут только в памяти телефона: их нельзя
// сохранить, отправить или показать в кабинете — этот модуль только включает камеру и выключает её
// на выходе, на паузе и при погашенном экране. Анализ — в логике игры, по двум маленьким серым кадрам.

/** wait — ждём разрешения или первого кадра, on — кадры идут, off — играем пальцем. */
export type CameraState = 'wait' | 'on' | 'off';
export type Facing = 'user' | 'environment';

/** Кадры не меняются столько мс — камера занята, закрыта или зависла: играем пальцем. */
export const FROZEN_MS = 3000;

/** Только то, что нужно от браузера: в тестах вместо него простые объекты. */
export interface CameraHost {
  media?: Pick<MediaDevices, 'getUserMedia'>;
  doc: Pick<Document, 'hidden' | 'addEventListener' | 'removeEventListener'>;
}
type Screen = Pick<HTMLVideoElement, 'srcObject' | 'play'>;

const browser = (): CameraHost => ({ media: navigator.mediaDevices, doc: document });

export function createCamera(
  video: Screen,
  facing: Facing,
  host: CameraHost = browser(),
  /** Камера ответила: поток есть или отказ. */
  onAnswer: (granted: boolean) => void = () => {},
) {
  let stream: MediaStream | null = null;
  /** Номер запроса: поток, пришедший к уже закрытой игре, сразу выключается. */
  let asked = 0;
  let wanted = false;

  const release = () => {
    asked++;
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
    video.srcObject = null;
  };
  const open = () => {
    const mine = ++asked;
    if (!host.media) {
      onAnswer(false);
      return;
    }
    host.media
      .getUserMedia({
        video: { facingMode: facing, width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      })
      .then((s) => {
        if (mine !== asked) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream = s;
        video.srcObject = s;
        void video.play().catch(() => {});
        onAnswer(true);
      })
      .catch(() => {
        if (mine === asked) onAnswer(false);
      });
  };
  // Погашенный экран и свёрнутая игра: камера не работает ни секунды.
  const onVisibility = () => {
    if (!wanted) return;
    if (host.doc.hidden) release();
    else if (!stream) open();
  };

  return {
    start() {
      if (wanted) return;
      wanted = true;
      host.doc.addEventListener('visibilitychange', onVisibility);
      if (!host.doc.hidden) open();
    },
    stop() {
      wanted = false;
      host.doc.removeEventListener('visibilitychange', onVisibility);
      release();
    },
  };
}

/** Состояние камеры по времени: ответила ли и когда кадр менялся в последний раз, мс. */
export function cameraState(
  answer: boolean | null,
  now: number,
  lastLive: number | null,
  askedAt: number,
): CameraState {
  if (answer === false) return 'off';
  if (answer === null) return 'wait';
  if (lastLive === null) return now - askedAt > FROZEN_MS ? 'off' : 'wait';
  return now - lastLive > FROZEN_MS ? 'off' : 'on';
}
