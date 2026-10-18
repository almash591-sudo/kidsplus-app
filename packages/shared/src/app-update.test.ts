import { afterEach, describe, expect, it, vi } from 'vitest';
import { entryFromHtml, hasNewVersion, startAutoUpdate } from './app-update';

const html = (hash: string) =>
  `<!doctype html><script type="module" crossorigin src="/assets/index-${hash}.js"></script>`;

/** Страница с главным скриптом сборки (или без него — режим разработки). */
function fakeDoc(src: string | null) {
  const listeners = new Set<() => void>();
  return {
    visibilityState: 'visible',
    querySelectorAll: () => (src ? [{ getAttribute: () => src }] : []),
    addEventListener: (_: string, l: () => void) => listeners.add(l),
    removeEventListener: (_: string, l: () => void) => listeners.delete(l),
    listeners,
  };
}

const serving = (hash: string) =>
  vi.fn(async () => new Response(html(hash), { status: 200 })) as unknown as typeof fetch;

afterEach(() => {
  vi.useRealTimers();
});

describe('автообновление', () => {
  it('находит главный скрипт сборки', () => {
    expect(entryFromHtml(html('Ab_1-x'))).toBe('/assets/index-Ab_1-x.js');
    expect(entryFromHtml('<script src="/src/main.tsx"></script>')).toBeNull();
  });

  it('новая версия — только когда хэш другой и сервер ответил', async () => {
    expect(await hasNewVersion('/assets/index-A.js', serving('A'))).toBe(false);
    expect(await hasNewVersion('/assets/index-A.js', serving('B'))).toBe(true);
    const down = vi.fn(async () => {
      throw new Error('нет сети');
    }) as unknown as typeof fetch;
    expect(await hasNewVersion('/assets/index-A.js', down)).toBe(false);
    const fail = vi.fn(async () => new Response('', { status: 502 })) as unknown as typeof fetch;
    expect(await hasNewVersion('/assets/index-A.js', fail)).toBe(false);
  });

  it('ждёт спокойного момента и перезагружает один раз', async () => {
    vi.useFakeTimers();
    let busy = true;
    const reload = vi.fn();
    const doc = fakeDoc('/assets/index-A.js');
    startAutoUpdate({
      canReload: () => !busy,
      reload,
      fetchFn: serving('B'),
      checkMs: 1000,
      waitMs: 100,
      doc: doc as unknown as Document,
    });
    await vi.advanceTimersByTimeAsync(1000);
    expect(reload).not.toHaveBeenCalled();
    busy = false;
    await vi.advanceTimersByTimeAsync(100);
    expect(reload).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(5000);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(doc.listeners.size).toBe(0);
  });

  it('та же версия — не перезагружает; без сборки (dev) — не проверяет', async () => {
    vi.useFakeTimers();
    const reload = vi.fn();
    const same = serving('A');
    startAutoUpdate({
      canReload: () => true,
      reload,
      fetchFn: same,
      checkMs: 1000,
      doc: fakeDoc('/assets/index-A.js') as unknown as Document,
    });
    const dev = serving('B');
    startAutoUpdate({
      canReload: () => true,
      reload,
      fetchFn: dev,
      checkMs: 1000,
      doc: fakeDoc(null) as unknown as Document,
    });
    await vi.advanceTimersByTimeAsync(3000);
    expect(reload).not.toHaveBeenCalled();
    expect(same).toHaveBeenCalled();
    expect(dev).not.toHaveBeenCalled();
  });
});
