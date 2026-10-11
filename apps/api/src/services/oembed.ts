import { HttpError } from '../lib/http';

export interface OEmbedInfo {
  title: string;
  channelTitle: string | null;
  thumbnailUrl: string | null;
}

/**
 * Метаданные видео YouTube через oEmbed: без ключа API и без квоты.
 * oEmbed отвечает 401/403, если встраивание запрещено владельцем, и 400/404, если видео нет.
 */
export async function fetchYouTubeOEmbed(
  fetchFn: typeof fetch,
  videoId: string,
): Promise<OEmbedInfo> {
  const url = new URL('https://www.youtube.com/oembed');
  url.searchParams.set('url', `https://www.youtube.com/watch?v=${videoId}`);
  url.searchParams.set('format', 'json');

  let res: Response;
  try {
    res = await fetchFn(url, { signal: AbortSignal.timeout(8000) });
  } catch {
    throw new HttpError(502, 'provider_unavailable', 'YouTube не отвечает, попробуйте позже');
  }

  if (res.status === 401 || res.status === 403) {
    throw new HttpError(422, 'embedding_disabled', 'владелец запретил встраивание этого видео');
  }
  if (res.status === 400 || res.status === 404) {
    throw new HttpError(422, 'video_not_found', 'видео не найдено или недоступно');
  }
  if (!res.ok) throw new HttpError(502, 'provider_unavailable', `YouTube ответил ${res.status}`);

  const data = (await res.json()) as { title?: unknown; author_name?: unknown };
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
  return {
    title: str(data.title) ?? 'Без названия',
    channelTitle: str(data.author_name),
    // Строим сами, а не берём из ответа: только домен i.ytimg.com разрешён в CSP детского PWA.
    thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
  };
}
