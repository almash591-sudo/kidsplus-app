import { createRuTubePlayer, type RuTubePlayer } from '@kidsplus/shared/rutube-iframe';
import { AspectRatio, Box, Text } from '@mantine/core';
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { YouTubePreviewHandle } from './YouTubePreview';

/** Предпросмотр RuTube для родителя (этап 54): обычный плеер rutube.ru с его кнопками. */
export const RuTubePreview = forwardRef<
  YouTubePreviewHandle,
  { videoId: string; startSec: number }
>(function RuTubePreview({ videoId, startSec }, ref) {
  const container = useRef<HTMLDivElement>(null);
  const player = useRef<RuTubePlayer | null>(null);
  const stopAt = useRef<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Начальная позиция нужна только при создании плеера — не пересоздаём его при правке таймкодов.
  const initialStart = useRef(startSec);

  useEffect(() => {
    if (!container.current) return;
    setError(null);
    const p = createRuTubePlayer(container.current, {
      videoId,
      startSec: initialStart.current,
      title: 'Предпросмотр RuTube',
      onEvent: (e, p) => {
        if (e.type === 'error') setError(`RuTube не может показать это видео: ${e.message}`);
        // Остановка в конце проверяемого отрезка.
        if (e.type === 'time' && stopAt.current !== null && e.time >= stopAt.current) {
          p.pause();
          stopAt.current = null;
        }
      },
    });
    player.current = p;
    return () => {
      player.current = null;
      p.destroy();
    };
  }, [videoId]);

  useImperativeHandle(ref, () => ({
    currentTime: () => {
      const t = player.current?.currentTime();
      return t == null ? null : Math.floor(t);
    },
    playRange(start, end) {
      const p = player.current;
      if (!p) return;
      stopAt.current = end;
      p.seek(start);
      p.play();
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
