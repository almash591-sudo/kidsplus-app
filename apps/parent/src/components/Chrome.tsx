// Премиальная «оболочка» кабинета (этап 17б): компактный заголовок при прокрутке, как в iOS,
// тонкая полоска загрузки, мягкий переход между страницами, виброотклик и «досчитывающиеся» цифры.
import { useIsFetching } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router';

/**
 * Большой заголовок страницы (h1.page-title) ушёл под край — сверху появляется компактный
 * с размытым фоном. Работает на любой странице без правок: следит за текущим h1.
 */
export function CompactTitle() {
  const { pathname } = useLocation();
  const [title, setTitle] = useState<string | null>(null);
  useEffect(() => {
    let observer: IntersectionObserver | null = null;
    // Страница рисуется после смены адреса — ищем заголовок чуть позже.
    const t = setTimeout(() => {
      const h1 = document.querySelector<HTMLElement>('main h1.page-title');
      if (!h1) return setTitle(null);
      observer = new IntersectionObserver(
        ([e]) => setTitle(e && !e.isIntersecting ? (h1.textContent ?? '') : null),
        { rootMargin: '-8px 0px 0px 0px' },
      );
      observer.observe(h1);
    }, 60);
    return () => {
      clearTimeout(t);
      observer?.disconnect();
      setTitle(null);
    };
  }, [pathname]);
  return (
    <div className={title ? 'compact-title on' : 'compact-title'} aria-hidden={!title}>
      <span>{title}</span>
    </div>
  );
}

/** Тонкая полоска сверху, пока что-то загружается (не мешает, но видно, что приложение живое). */
export function FetchBar() {
  const busy = useIsFetching() > 0;
  const [shown, setShown] = useState(false);
  useEffect(() => {
    // Быстрые запросы — без мигания: полоска появляется, если загрузка дольше 250 мс.
    if (!busy) return;
    const t = setTimeout(() => setShown(true), 250);
    return () => {
      clearTimeout(t);
      setShown(false);
    };
  }, [busy]);
  return <div className={shown ? 'fetch-bar on' : 'fetch-bar'} aria-hidden="true" />;
}

/** Новая страница — мягко появляется (ключ — адрес). */
export function PageTransition({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  return (
    <div key={pathname} className="page-in">
      {children}
    </div>
  );
}

/** Лёгкий виброотклик на касание кнопок и строк (Android; iPhone вибрацию из браузера не даёт). */
export function installHaptics(root: Document = document) {
  const on = (e: PointerEvent) => {
    if (e.pointerType !== 'touch') return;
    const el = (e.target as Element | null)?.closest?.(
      'button, a[href], [role=button], [role=tab], .attention-row, .mantine-Switch-root',
    );
    if (!el || (el as HTMLButtonElement).disabled) return;
    try {
      navigator.vibrate?.(6);
    } catch {
      // вибрации нет — не страшно
    }
  };
  root.addEventListener('pointerdown', on, { capture: true, passive: true });
  return () => root.removeEventListener('pointerdown', on, { capture: true });
}

/**
 * Число «досчитывается» до значения за ~0,7 с (минуты, проценты на «Главной» и в «Прогрессе»).
 * В тексте берётся первое число: «83 %» → 0…83 %, «7 из 7» → 0…7 из 7.
 */
export function CountUp({ value }: { value: string }) {
  const m = /-?\d+/.exec(value);
  const target = m ? Number(m[0]) : null;
  const [n, setN] = useState(target ?? 0);
  const from = useRef(0);
  const still =
    typeof window !== 'undefined' &&
    Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    if (target === null || still) return;
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / 700);
      const eased = 1 - (1 - k) ** 3;
      setN(Math.round(a + (target - a) * eased));
      if (k < 1) raf = requestAnimationFrame(step);
      else from.current = target;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, still]);
  if (!m || target === null || still) return <>{value}</>;
  return (
    <>
      {value.slice(0, m.index)}
      {n}
      {value.slice(m.index + m[0].length)}
    </>
  );
}
