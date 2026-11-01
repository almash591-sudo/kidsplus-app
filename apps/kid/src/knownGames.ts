import type { KidItem, VideoProvider } from '@kidsplus/shared/api';
import { gameSpec } from '@kidsplus/shared/games';

/** Сервисы, чьи видео эта версия приложения умеет играть (RuTube — с этапа 54). */
const PLAYABLE: readonly VideoProvider[] = ['youtube', 'rutube'];

/**
 * Только игры и видео, которые эта версия приложения умеет показать. Сервер обновляется
 * раньше телефона: новый стих, вид игры или сервис видео приходит в список, пока на телефоне
 * старая версия, — и раньше весь список не принимался (озвучка искала незнакомый стих),
 * ребёнок видел прежний. Теперь незнакомое просто не показывается до обновления приложения.
 */
export const knownGames = <
  T extends Pick<KidItem, 'kind'> & { spec?: unknown; provider?: VideoProvider },
>(
  items: T[],
) =>
  items.filter((i) =>
    i.kind === 'interactive'
      ? gameSpec.safeParse(i.spec).success
      : i.kind !== 'segment' || PLAYABLE.includes(i.provider ?? 'youtube'),
  );
