import { env } from '../config/env.js';
import { scanAllHotels } from './alertService.js';

/**
 * Periodic alert scan. Stock alerts are refreshed immediately on every movement; this job
 * catches calendar-driven changes (an item crossing its expiry date with no stock movement).
 */
export function startBackgroundJobs() {
  const run = () => scanAllHotels().catch((err) => console.error('Alert scan failed:', err.message));
  const startup = setTimeout(run, 5000);
  const interval = setInterval(run, env.alertScanIntervalMinutes * 60 * 1000);
  interval.unref();
  return {
    stop() {
      clearTimeout(startup);
      clearInterval(interval);
    },
  };
}
