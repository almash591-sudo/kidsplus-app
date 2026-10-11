/** 75 → «1:15», 3723 → «1:02:03». */
export function formatTime(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

/** «1:15» → 75, «1:02:03» → 3723, «90» → 90. Неверный формат — null. */
export function parseTime(input: string): number | null {
  const parts = input.trim().split(':');
  if (!parts.length || parts.length > 3 || parts.some((p) => !/^\d{1,4}$/.test(p))) return null;
  const nums = parts.map(Number);
  if (nums.slice(1).some((n) => n >= 60)) return null;
  return nums.reduce((acc, n) => acc * 60 + n, 0);
}
