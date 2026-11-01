import { describe, expect, it } from 'vitest';
import { knownGames } from './knownGames';

describe('незнакомые игры (сервер новее телефона)', () => {
  it('новый стих и новый вид игры пропускаются, остальное — как пришло', () => {
    const poem = (code: string) => ({
      kind: 'interactive' as const,
      id: code,
      spec: { kind: 'poem', poem: code, repeat: true, blanks: true, questions: true, choices: 2 },
    });
    const items = [
      { kind: 'segment' as const, id: 'v' },
      poem('ladushki'),
      poem('not-yet'),
      { kind: 'interactive' as const, id: 'f', spec: { kind: 'future-game' } },
      { kind: 'interactive' as const, id: 'b', spec: { kind: 'balloons', count: 5, target: null } },
      { kind: 'deck' as const, id: 'd' },
    ];
    expect(knownGames(items).map((i) => i.id)).toEqual(['v', 'ladushki', 'b', 'd']);
  });

  it('видео YouTube и RuTube показываются, с незнакомого сервиса — пропускается', () => {
    const items = [
      { kind: 'segment' as const, id: 'yt', provider: 'youtube' as const },
      { kind: 'segment' as const, id: 'rt', provider: 'rutube' as const },
      { kind: 'segment' as const, id: 'vk', provider: 'vk' as never },
      { kind: 'segment' as const, id: 'old' },
    ];
    expect(knownGames(items).map((i) => i.id)).toEqual(['yt', 'rt', 'old']);
  });
});
