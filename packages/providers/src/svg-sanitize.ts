// Очистка SVG, нарисованного моделью: остаются только простые фигуры и их оформление.
// Это второй слой защиты: медиа и так отдаются с CSP sandbox, а в <img> скрипты не работают.

const ELEMENTS = new Set([
  'svg',
  'g',
  'path',
  'circle',
  'ellipse',
  'rect',
  'line',
  'polyline',
  'polygon',
  'defs',
  'lineargradient',
  'radialgradient',
  'stop',
]);

const ATTRIBUTES = new Set([
  'viewbox',
  'width',
  'height',
  'xmlns',
  'd',
  'cx',
  'cy',
  'r',
  'rx',
  'ry',
  'x',
  'y',
  'x1',
  'y1',
  'x2',
  'y2',
  'fx',
  'fy',
  'points',
  'fill',
  'stroke',
  'stroke-width',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-dasharray',
  'opacity',
  'fill-opacity',
  'stroke-opacity',
  'fill-rule',
  'clip-rule',
  'transform',
  'id',
  'offset',
  'stop-color',
  'stop-opacity',
  'gradientunits',
  'gradienttransform',
]);

/** Корректные регистры атрибутов SVG (парсер сравнивает без учёта регистра). */
const CASE: Record<string, string> = {
  viewbox: 'viewBox',
  lineargradient: 'linearGradient',
  radialgradient: 'radialGradient',
  gradientunits: 'gradientUnits',
  gradienttransform: 'gradientTransform',
};

/** Значение атрибута: только безопасные символы; ссылки — только на свои градиенты url(#id). */
function safeValue(v: string): boolean {
  if (/[<>"'`\\]|&#|javascript|data:|expression/i.test(v)) return false;
  const urls = v.match(/url\([^)]*\)/gi) ?? [];
  return urls.every((u) => /^url\(#[\w-]+\)$/i.test(u));
}

/**
 * Возвращает безопасный SVG или null, если в нём нет корневого <svg> с viewBox.
 * Всё, кроме разрешённых элементов и атрибутов (тексты, стили, скрипты, ссылки, вставки), удаляется.
 */
export function sanitizeSvg(input: string): string | null {
  const tags = input.match(/<[^>]*>/g) ?? [];
  const out: string[] = [];
  const stack: string[] = [];
  let skipDepth = 0; // внутри запрещённого элемента — пропускаем всё содержимое
  let hasRoot = false;

  for (const tag of tags) {
    if (/^<[!?]/.test(tag)) continue; // комментарии, DOCTYPE, CDATA, <?xml?>
    const m = /^<(\/)?\s*([a-zA-Z][\w:-]*)([\s\S]*?)(\/)?\s*>$/.exec(tag);
    if (!m) continue;
    const [, closing, rawName, rawAttrs, selfClosing] = m;
    const name = rawName!.toLowerCase();
    const allowed = ELEMENTS.has(name);

    if (closing) {
      if (skipDepth) {
        if (!allowed || stack.at(-1) === `!${name}`) {
          if (stack.at(-1) === `!${name}`) {
            stack.pop();
            skipDepth--;
          }
        }
        continue;
      }
      if (allowed && stack.at(-1) === name) {
        stack.pop();
        out.push(`</${CASE[name] ?? name}>`);
      }
      continue;
    }

    if (skipDepth || !allowed) {
      if (!selfClosing) {
        stack.push(`!${name}`);
        skipDepth++;
      }
      continue;
    }

    const attrs: string[] = [];
    for (const a of rawAttrs!.matchAll(/([a-zA-Z][\w:-]*)\s*=\s*("([^"]*)"|'([^']*)')/g)) {
      const key = a[1]!.toLowerCase();
      const value = a[3] ?? a[4] ?? '';
      if (!ATTRIBUTES.has(key) || !safeValue(value)) continue;
      if (key === 'xmlns' && value !== 'http://www.w3.org/2000/svg') continue;
      attrs.push(`${CASE[key] ?? key}="${value}"`);
    }
    if (name === 'svg' && !stack.length) {
      if (!attrs.some((a) => a.startsWith('viewBox='))) return null;
      if (!attrs.some((a) => a.startsWith('xmlns=')))
        attrs.push('xmlns="http://www.w3.org/2000/svg"');
      hasRoot = true;
    }
    if (!hasRoot) return null; // первый элемент — не <svg>
    out.push(
      `<${CASE[name] ?? name}${attrs.length ? ` ${attrs.join(' ')}` : ''}${selfClosing ? '/' : ''}>`,
    );
    if (!selfClosing) stack.push(name);
  }
  // Незакрытые элементы закрываем сами.
  while (stack.length) {
    const name = stack.pop()!;
    if (!name.startsWith('!')) out.push(`</${CASE[name] ?? name}>`);
  }
  return hasRoot ? out.join('') : null;
}
