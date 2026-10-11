// YouTube Data API v3: метаданные видео, видео плейлиста и канала. Видео не скачиваются.
// Квота: videos.list и playlistItems.list — по 1 единице, channels.list — 1; search.list не используем.

export interface YouTubeVideoDetails {
  externalId: string;
  title: string;
  description: string;
  channelTitle: string | null;
  durationSec: number;
  embeddable: boolean;
  /** public | unlisted | private */
  privacyStatus: string;
  madeForKids: boolean | null;
  /** Видео недоступно в регионе ребёнка. */
  regionBlocked: boolean;
  thumbnailUrl: string | null;
  publishedAt: string | null;
}

export class YouTubeApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
  /** Сеть, 429, 5xx — можно повторить позже; 400/403 — ключ, квота или запрос. */
  get retryable() {
    return this.status === 0 || this.status === 429 || this.status >= 500;
  }
}

/** ISO 8601 (PT1H2M3S, P1DT2H) → секунды. */
export function parseIsoDuration(iso: string): number {
  const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(iso);
  if (!m) return 0;
  const [, d, h, min, s] = m.map((x) => Number(x ?? 0));
  return d! * 86400 + h! * 3600 + min! * 60 + s!;
}

interface ApiVideo {
  id: string;
  snippet?: {
    title?: string;
    description?: string;
    channelTitle?: string;
    publishedAt?: string;
    thumbnails?: Record<string, { url?: string } | undefined>;
  };
  contentDetails?: {
    duration?: string;
    regionRestriction?: { allowed?: string[]; blocked?: string[] };
  };
  status?: { embeddable?: boolean; privacyStatus?: string; madeForKids?: boolean };
}

export class YouTubeDataApi {
  private readonly fetchFn: typeof fetch;
  private readonly region: string;

  constructor(private readonly config: { apiKey: string; region?: string; fetch?: typeof fetch }) {
    this.fetchFn = config.fetch ?? globalThis.fetch;
    this.region = (config.region ?? 'RU').toUpperCase();
  }

  private async get<T>(path: string, params: Record<string, string>): Promise<T> {
    const url = new URL(`https://www.googleapis.com/youtube/v3/${path}`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    url.searchParams.set('key', this.config.apiKey);
    let res: Response;
    try {
      res = await this.fetchFn(url, { signal: AbortSignal.timeout(15_000) });
    } catch (err) {
      throw new YouTubeApiError(`YouTube API недоступен: ${(err as Error).message}`, 0);
    }
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      throw new YouTubeApiError(
        `YouTube API ${res.status}: ${body?.error?.message ?? res.statusText}`,
        res.status,
      );
    }
    return (await res.json()) as T;
  }

  /** Метаданные видео (по 50 за запрос). Удалённых и приватных видео в ответе нет. */
  async videos(ids: readonly string[]): Promise<YouTubeVideoDetails[]> {
    const out: YouTubeVideoDetails[] = [];
    for (let i = 0; i < ids.length; i += 50) {
      const data = await this.get<{ items?: ApiVideo[] }>('videos', {
        part: 'snippet,contentDetails,status',
        id: ids.slice(i, i + 50).join(','),
        maxResults: '50',
      });
      for (const v of data.items ?? []) out.push(this.toDetails(v));
    }
    return out;
  }

  private toDetails(v: ApiVideo): YouTubeVideoDetails {
    const thumbs = v.snippet?.thumbnails ?? {};
    const restriction = v.contentDetails?.regionRestriction;
    const regionBlocked = Boolean(
      restriction?.blocked?.includes(this.region) ||
      (restriction?.allowed && !restriction.allowed.includes(this.region)),
    );
    return {
      externalId: v.id,
      title: v.snippet?.title?.trim() || 'Без названия',
      description: v.snippet?.description ?? '',
      channelTitle: v.snippet?.channelTitle ?? null,
      durationSec: parseIsoDuration(v.contentDetails?.duration ?? ''),
      embeddable: v.status?.embeddable ?? false,
      privacyStatus: v.status?.privacyStatus ?? 'private',
      madeForKids: v.status?.madeForKids ?? null,
      regionBlocked,
      thumbnailUrl: (thumbs.high ?? thumbs.medium ?? thumbs.default)?.url ?? null,
      publishedAt: v.snippet?.publishedAt ?? null,
    };
  }

  /** ID видео плейлиста (первые `max`). */
  async playlistVideoIds(playlistId: string, max = 25): Promise<string[]> {
    const ids: string[] = [];
    let pageToken: string | undefined;
    do {
      const data = await this.get<{
        items?: { contentDetails?: { videoId?: string } }[];
        nextPageToken?: string;
      }>('playlistItems', {
        part: 'contentDetails',
        playlistId,
        maxResults: String(Math.min(50, max - ids.length)),
        ...(pageToken ? { pageToken } : {}),
      });
      for (const it of data.items ?? []) {
        if (it.contentDetails?.videoId) ids.push(it.contentDetails.videoId);
      }
      pageToken = data.nextPageToken;
    } while (pageToken && ids.length < max);
    return ids.slice(0, max);
  }

  /** Плейлист «Загрузки» канала — по @имени или ID канала. */
  async channelUploadsPlaylist(
    channel: { handle: string } | { id: string },
  ): Promise<string | null> {
    const data = await this.get<{
      items?: { contentDetails?: { relatedPlaylists?: { uploads?: string } } }[];
    }>('channels', {
      part: 'contentDetails',
      ...('handle' in channel ? { forHandle: channel.handle } : { id: channel.id }),
    });
    return data.items?.[0]?.contentDetails?.relatedPlaylists?.uploads ?? null;
  }
}
