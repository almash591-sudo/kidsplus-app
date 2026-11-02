// Ссылки на видео RuTube (этап 54). Видео не скачиваются — только встраиваемый плеер.

const ID = /^[0-9a-f]{32}$/;

/**
 * Извлекает ID видео RuTube из ссылки (rutube.ru/video/…, /shorts/…, /play/embed/…) или из
 * «голого» 32-символьного ID. Закрытые видео (/video/private/… с ключом) не принимаем: их
 * нельзя встроить. Возвращает null, если это не ссылка на видео RuTube.
 */
export function parseRuTubeId(input: string): string | null {
  const s = input.trim().toLowerCase();
  if (ID.test(s)) return s;

  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
  } catch {
    return null;
  }
  if (url.hostname.replace(/^(www|m)\./, '') !== 'rutube.ru') return null;
  const [first, second, third] = url.pathname.split('/').filter(Boolean);
  const candidate =
    first === 'video' || first === 'shorts'
      ? second
      : first === 'play' && second === 'embed'
        ? third
        : undefined;
  return candidate && ID.test(candidate) ? candidate : null;
}

/** Время из ссылки (`?t=90`) в секундах — подсказка для начала фрагмента. */
export function parseRuTubeStart(input: string): number | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  const raw = url.searchParams.get('t');
  return raw && /^\d+$/.test(raw) ? Number(raw) : null;
}
