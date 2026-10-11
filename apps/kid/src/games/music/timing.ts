/** Подождать, мс. */
export const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Ритм: промежутки между ударами в долях (1 — «та», 0,5 — «ти»).
 * Без проверки длительностей — ровные удары; с ней — смесь «та» и «ти-ти» (обе есть, если ударов ≥ 3).
 */
export function rhythmPattern(beats: number, timing: boolean, rnd: () => number = Math.random) {
  if (!timing || beats < 3) return Array.from({ length: beats - 1 }, () => 1);
  for (;;) {
    const gaps: number[] = [];
    while (gaps.length < beats - 1) {
      // «ти» всегда парой: два коротких подряд.
      if (rnd() < 0.5 && gaps.length + 2 <= beats - 1) gaps.push(0.5, 0.5);
      else gaps.push(1);
    }
    if (gaps.includes(1) && gaps.includes(0.5)) return gaps;
  }
}

/**
 * Похож ли ритм ребёнка на образец: темп любой (масштаб — по общей длине),
 * каждый промежуток — в пределах tolerance от нужного.
 */
export function rhythmMatches(expected: number[], tapped: number[], tolerance = 0.45) {
  if (expected.length !== tapped.length) return false;
  if (!expected.length) return true;
  const scale = tapped.reduce((a, b) => a + b, 0) / expected.reduce((a, b) => a + b, 0);
  if (!(scale > 0)) return false;
  return expected.every((g, i) => Math.abs(tapped[i]! / scale - g) / g <= tolerance);
}
