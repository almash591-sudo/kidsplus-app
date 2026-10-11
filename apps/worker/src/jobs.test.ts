import { pino } from 'pino';
import { describe, expect, it, vi } from 'vitest';
import { HEARTBEAT_QUEUE, registerJobs } from './jobs';

describe('registerJobs', () => {
  it('создаёт очередь heartbeat, ставит расписание и обработчик', async () => {
    const boss = {
      createQueue: vi.fn(async () => {}),
      schedule: vi.fn(async () => {}),
      work: vi.fn(async () => 'worker-id'),
    };

    await registerJobs(boss as never, pino({ level: 'silent' }));

    expect(boss.createQueue).toHaveBeenCalledWith(HEARTBEAT_QUEUE);
    expect(boss.schedule).toHaveBeenCalledWith(HEARTBEAT_QUEUE, '*/5 * * * *');
    expect(boss.work).toHaveBeenCalledWith(HEARTBEAT_QUEUE, expect.any(Function));
  });
});
