import { useEffect, useState, type ImgHTMLAttributes } from 'react';
import { cachedObjectUrl } from '../offline';

/**
 * Картинка, которая показывается и без сети (этап 15г): если файл уже в кэше занятий —
 * берётся оттуда, иначе — обычная загрузка по сети.
 */
export function CachedImg({ src, ...rest }: ImgHTMLAttributes<HTMLImageElement> & { src: string }) {
  const [blob, setBlob] = useState<{ for: string; url: string } | null>(null);
  useEffect(() => {
    let alive = true;
    let made: string | null = null;
    void cachedObjectUrl(src).then((u) => {
      made = u;
      if (alive && u) setBlob({ for: src, url: u });
      else if (u) URL.revokeObjectURL(u);
    });
    return () => {
      alive = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [src]);
  // data-src — исходный адрес (из кэша src становится blob:).
  return <img {...rest} data-src={src} src={blob?.for === src ? blob.url : src} />;
}
