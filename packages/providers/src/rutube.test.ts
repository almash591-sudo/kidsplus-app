import { describe, expect, it, vi } from 'vitest';
import {
  fetchRuTubeVideo,
  RuTubeApiError,
  ruTubeRegionBlocked,
  ruTubeUnavailable,
  type RuTubeVideoDetails,
} from './rutube';

const ID = 'c9be5e8850ddc8583c71a986284ac6ef';

/** Ответ /api/video/<id>/ — поля как у настоящего (лишние отброшены). */
const apiVideo = {
  id: ID,
  title: ' Мультфильм про ёжика ',
  duration: 880,
  thumbnail_url:
    'https://pic.rtbcdn.ru/video/2025-05-26/16/94/1694170dbf16539fc46165c70b4661bc.jpg',
  author: { id: 1, name: 'Детский канал' },
  is_adult: false,
  is_hidden: false,
  is_deleted: false,
  is_paid: false,
  is_club: false,
  is_livestream: false,
  is_audio: false,
  pg_rating: { age: 6, logo: 'https://pic.rtbcdn.ru/agerestriction/x.png' },
  restrictions: { country: { allowed: ['AB', 'OS', 'RU'], restricted: ['-', 'DE', 'US'] } },
  category: { id: 7, short_name: 'cartoons' },
  embed_url: `https://rutube.ru/play/embed/${ID}`,
};

const fetchWith = (res: Response | Error) =>
  vi.fn(async () => {
    if (res instanceof Error) throw res;
    return res;
  }) as unknown as typeof fetch;

describe('fetchRuTubeVideo', () => {
  it('разбирает ответ API', async () => {
    const f = fetchWith(Response.json(apiVideo));
    const d = await fetchRuTubeVideo(f, ID);
    expect(f).toHaveBeenCalledWith(`https://rutube.ru/api/video/${ID}/`, expect.anything());
    expect(d).toEqual({
      externalId: ID,
      title: 'Мультфильм про ёжика',
      channelTitle: 'Детский канал',
      durationSec: 880,
      thumbnailUrl: apiVideo.thumbnail_url,
      adult: false,
      hidden: false,
      notEmbeddable: false,
      ageRating: 6,
      allowedCountries: ['AB', 'OS', 'RU'],
      restrictedCountries: ['-', 'DE', 'US'],
    });
  });

  it('превью с чужого домена не берём; пустые поля — по умолчанию', async () => {
    const d = await fetchRuTubeVideo(
      fetchWith(
        Response.json({ id: ID, thumbnail_url: 'https://evil.example/x.jpg', restrictions: null }),
      ),
      ID,
    );
    expect(d).toMatchObject({
      title: 'Без названия',
      channelTitle: null,
      durationSec: 0,
      thumbnailUrl: null,
      ageRating: null,
      allowedCountries: null,
      restrictedCountries: [],
    });
  });

  it('404 — видео нет', async () => {
    expect(await fetchRuTubeVideo(fetchWith(new Response('', { status: 404 })), ID)).toBeNull();
  });

  it('сеть и 5xx — ошибка, которую можно повторить; непонятный ответ — тоже ошибка', async () => {
    const net = await fetchRuTubeVideo(fetchWith(new Error('ECONNRESET')), ID).catch((e) => e);
    expect(net).toBeInstanceOf(RuTubeApiError);
    expect((net as RuTubeApiError).retryable).toBe(true);
    const busy = await fetchRuTubeVideo(fetchWith(new Response('', { status: 503 })), ID).catch(
      (e) => e,
    );
    expect((busy as RuTubeApiError).retryable).toBe(true);
    const forbidden = await fetchRuTubeVideo(
      fetchWith(new Response('', { status: 403 })),
      ID,
    ).catch((e) => e);
    expect((forbidden as RuTubeApiError).retryable).toBe(false);
    await expect(fetchRuTubeVideo(fetchWith(Response.json({ title: 1 })), ID)).rejects.toThrow(
      RuTubeApiError,
    );
  });
});

describe('можно ли показывать', () => {
  const base: RuTubeVideoDetails = {
    externalId: ID,
    title: 'x',
    channelTitle: null,
    durationSec: 100,
    thumbnailUrl: null,
    adult: false,
    hidden: false,
    notEmbeddable: false,
    ageRating: 0,
    allowedCountries: null,
    restrictedCountries: [],
  };

  it('причины', () => {
    expect(ruTubeUnavailable(base)).toBeNull();
    expect(ruTubeUnavailable({ ...base, ageRating: 6 })).toBeNull();
    expect(ruTubeUnavailable(null)).toBe('not_found');
    expect(ruTubeUnavailable({ ...base, hidden: true })).toBe('not_public');
    expect(ruTubeUnavailable({ ...base, adult: true })).toBe('not_for_kids');
    expect(ruTubeUnavailable({ ...base, ageRating: 12 })).toBe('not_for_kids');
    expect(ruTubeUnavailable({ ...base, notEmbeddable: true })).toBe('not_embeddable');
  });

  it('страны', () => {
    expect(ruTubeRegionBlocked(base, 'RU')).toBe(false);
    expect(ruTubeRegionBlocked({ ...base, allowedCountries: ['RU'] }, 'ru')).toBe(false);
    expect(ruTubeRegionBlocked({ ...base, allowedCountries: ['RU'] }, 'DE')).toBe(true);
    expect(ruTubeRegionBlocked({ ...base, restrictedCountries: ['RU'] }, 'RU')).toBe(true);
  });
});
