import { after } from 'next/server';
import { logger } from '@/lib/logger';

/** Best-effort low-latency trigger; the scheduled worker is the durable fallback. */
export function scheduleBatchWorker(): void {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  const secret = process.env.BATCH_WORKER_SECRET;
  if (!appUrl || !secret) throw new Error('Batch worker URL and secret must be configured');
  const url = new URL('/api/internal/batch-worker?maxJobs=1', appUrl);
  after(async () => {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'x-internal-worker-key': secret },
        signal: AbortSignal.timeout(250_000),
      });
      if (!response.ok) throw new Error(`Worker returned ${response.status}`);
    } catch (error) {
      logger.error('Batch trigger failed; scheduled worker will retry', { error });
    }
  });
}
