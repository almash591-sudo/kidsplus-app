import type { KidItem } from '@kidsplus/shared/api';
import { gameSpec } from '@kidsplus/shared/games';

/**
 * Только игры, которые эта версия приложения умеет показать. Сервер обновляется раньше
 * телефона: новый стих или вид игры приходит в список, пока на телефоне старая версия, —
 * и раньше весь список не принимался (озвучка искала незнакомый стих), ребёнок видел
 * прежний. Теперь незнакомая игра просто не показывается до обновления приложения.
 */
export const knownGames = <T extends Pick<KidItem, 'kind'> & { spec?: unknown }>(items: T[]) =>
  items.filter((i) => i.kind !== 'interactive' || gameSpec.safeParse(i.spec).success);
