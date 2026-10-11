import {
  createYouTubePlayer,
  loadYouTubeApi,
  YT_STATE,
  type YTPlayer,
} from '@kidsplus/shared/youtube-iframe';
import { AspectRatio, Box, Text } from '@mantine/core';
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';

export interface YouTubePreviewHandle {
  /** Текущее время воспроизведения, секунды. */
  currentTime(): number | null;
  /** Проиграть отрезок start–end и остановиться в конце. */
  playRange(startSec: number, endSec: number): void;
}

/** Предпросмотр для родителя: обычные элементы управления YouTube, домен youtube-nocookie. */
export const YouTubePreview = forwardRef<
  YouTubePreviewHandle,
  { videoId: string; startSec: number }
>(function YouTubePreview({ videoId, startSec }, ref) {
  const container = useRef<HTMLDivElement>(null);
  const player = useRef<YTPlayer | null>(null);
  const stopAt = useRef<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Начальная позиция нужна только при создании плеера — не пересоздаём его при правке таймкодов.
  const initialStart = useRef(startSec);

  useEffect(() => {
    let cancelled = false;
    let destroy: (() => void) | undefined;
    setError(null);
    loadYouTubeApi()
      .then((YT) => {
        if (cancelled || !container.current) return;
        const created = createYouTubePlayer(YT, container.current, {
          videoId,
          startSec: initialStart.current,
          endSec: 0,
          controls: true,
          autoplay: false,
          onReady: (p) => (player.current = p),
          onError: (code) => setError(`YouTube не может показать это видео (код ${code})`),
        });
        destroy = created.destroy;
      })
      .catch(() => setError('Не удалось загрузить плеер YouTube'));

    // Остановка в конце проверяемого отрезка.
    const timer = setInterval(() => {
      const p = player.current;
      if (
        p &&
        stopAt.current !== null &&
        p.getPlayerState() === YT_STATE.PLAYING &&
        p.getCurrentTime() >= stopAt.current
      ) {
        p.pauseVideo();
        stopAt.current = null;
      }
    }, 250);

    return () => {
      cancelled = true;
      clearInterval(timer);
      player.current = null;
      destroy?.();
    };
  }, [videoId]);

  useImperativeHandle(ref, () => ({
    currentTime: () => (player.current ? Math.floor(player.current.getCurrentTime()) : null),
    playRange(start, end) {
      const p = player.current;
      if (!p) return;
      stopAt.current = end;
      p.seekTo(start, true);
      p.playVideo();
    },
  }));

  return (
    <Box>
      <AspectRatio ratio={16 / 9}>
        <div ref={container} style={{ background: '#000' }} />
      </AspectRatio>
      {error && (
        <Text c="red" size="sm" mt={4}>
          {error}
        </Text>
      )}
    </Box>
  );
});
