// Расход модели на проверку видео (этап 47) — долей дневного лимита и короткими числами,
// а не «0 из 2 000 000 токенов». Видит только семья-администратор (llm-usage — ADMIN_ONLY).

/** «меньше 1 %», а не «0 %», пока хоть что-то потрачено; больше 100 % не бывает. */
export const usagePercent = (used: number, limit: number) => {
  if (!used || limit <= 0) return '0 %';
  const p = (used / limit) * 100;
  return p < 1 ? 'меньше 1 %' : `${Math.min(100, Math.round(p))} %`;
};

const compact = new Intl.NumberFormat('ru-RU', { notation: 'compact' });

/** «Проверка видео сегодня: меньше 1 % дневного лимита (5 тыс. из 2 млн токенов)». */
export const usageLine = (used: number, limit: number) =>
  `Проверка видео сегодня: ${usagePercent(used, limit)} дневного лимита (${compact.format(used)} из ${compact.format(limit)} токенов)`;
