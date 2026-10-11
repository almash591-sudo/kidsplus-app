const ID = /^[A-Za-z0-9_-]{11}$/;

/**
 * Извлекает ID видео YouTube из ссылки (watch, youtu.be, shorts, embed, live, music)
 * или из «голого» 11-символьного ID. Возвращает null, если это не ссылка на видео YouTube.
 */
export function parseYouTubeId(input: string): string | null {
  const s = input.trim();
  if (ID.test(s)) return s;

  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^(www|m|music)\./, '');
  let candidate: string | null = null;
  if (host === 'youtu.be') {
    candidate = url.pathname.split('/')[1] ?? null;
  } else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    const [first, second] = url.pathname.split('/').filter(Boolean);
    if (first === 'watch') candidate = url.searchParams.get('v');
    else if (first && ['shorts', 'embed', 'live', 'v'].includes(first)) candidate = second ?? null;
  }
  return candidate && ID.test(candidate) ? candidate : null;
}

/** Время из ссылки (`t=90`, `t=1m30s`, `start=90`) в секундах — подсказка для начала фрагмента. */
export function parseYouTubeStart(input: string): number | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  const raw = url.searchParams.get('t') ?? url.searchParams.get('start');
  if (!raw) return null;
  if (/^\d+$/.test(raw)) return Number(raw);
  const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(raw);
  if (!m || !raw) return null;
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
}

export type YouTubeTarget =
  | { kind: 'video'; id: string }
  | { kind: 'playlist'; id: string }
  | { kind: 'channel'; handle: string }
  | { kind: 'channel'; id: string };

/**
 * Что за ссылка: видео, плейлист или канал (@имя или /channel/UC…). Ссылка на видео
 * из плейлиста (`watch?v=…&list=…`) — это видео.
 */
export function parseYouTubeTarget(input: string): YouTubeTarget | null {
  const video = parseYouTubeId(input);
  if (video) return { kind: 'video', id: video };
  const s = input.trim();
  if (/^@[\w.-]{3,100}$/.test(s)) return { kind: 'channel', handle: s };
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^(www|m|music)\./, '');
  if (host !== 'youtube.com') return null;
  const list = url.searchParams.get('list');
  if (list && /^[\w-]{10,64}$/.test(list)) return { kind: 'playlist', id: list };
  const [first, second] = url.pathname.split('/').filter(Boolean);
  if (first?.startsWith('@') && /^@[\w.-]{3,100}$/.test(first))
    return { kind: 'channel', handle: first };
  if (first === 'channel' && second && /^UC[\w-]{22}$/.test(second))
    return { kind: 'channel', id: second };
  return null;
}
