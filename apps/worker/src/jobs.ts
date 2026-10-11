import type { PgBoss } from 'pg-boss';
import type { Logger } from 'pino';

export const HEARTBEAT_QUEUE = 'heartbeat';
/** Ежедневная проверка доступности одобренных видео (04:00 UTC — ночью по Москве). */
export const AVAILABILITY_QUEUE = 'video-availability';
/** Недельный отчёт: воскресенье, 19:00 по Москве (решение владельца 2026-10-10). */
export const WEEKLY_QUEUE = 'weekly-report';
export const WEEKLY_CRON = '0 19 * * 0';

type Boss = Pick<PgBoss, 'createQueue' | 'schedule' | 'work'>;

/**
 * Регистрирует очереди и обработчики: «пульс» раз в 5 минут (расписание через PostgreSQL
 * работает) и, если задан ключ YouTube, ежедневную проверку доступности видео.
 */
export async function registerJobs(
  boss: Boss,
  log: Logger,
  checkVideos?: () => Promise<Record<string, number>>,
  weekly?: () => Promise<number>,
): Promise<void> {
  await boss.createQueue(HEARTBEAT_QUEUE);
  await boss.schedule(HEARTBEAT_QUEUE, '*/5 * * * *');
  await boss.work(HEARTBEAT_QUEUE, async (jobs) => {
    for (const job of jobs) {
      log.info({ jobId: job.id }, 'heartbeat');
    }
  });

  if (weekly) {
    await boss.createQueue(WEEKLY_QUEUE);
    await boss.schedule(WEEKLY_QUEUE, WEEKLY_CRON, null, { tz: 'Europe/Moscow' });
    await boss.work(WEEKLY_QUEUE, async () => {
      await weekly();
    });
  }

  if (!checkVideos) return;
  await boss.createQueue(AVAILABILITY_QUEUE);
  await boss.schedule(AVAILABILITY_QUEUE, '0 4 * * *');
  await boss.work(AVAILABILITY_QUEUE, async () => {
    log.info(await checkVideos(), 'проверка доступности видео');
  });
}
