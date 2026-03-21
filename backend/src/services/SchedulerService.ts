
import { logger } from '../utils/logger';
import { decayService } from './memory/DecayService';

export class SchedulerService {
    private decayInterval: NodeJS.Timeout | null = null;

    /**
     * Start all background jobs
     */
    start() {
        logger.info('[Scheduler] Starting background jobs...');

        // 1. Memory Extraction - Only via manual Admin Panel trigger
        // Startup-based extraction removed due to ERR_DLOPEN_FAILED issue
        // Use POST /api/admin/extract-memories endpoint instead


        // 2. Decay Job (Run once every 24 hours)
        const DECAY_PERIOD = 24 * 60 * 60 * 1000;

        this.decayInterval = setInterval(async () => {
            logger.info('[Scheduler] Running scheduled decay...');
            try {
                const result = await decayService.runDailyDecay();
                logger.info('[Scheduler] Decay result:', result);
            } catch (error) {
                logger.error('[Scheduler] Decay job failed', error);
            }
        }, DECAY_PERIOD);

        // 3. Backup Job (Run once every 24 hours)
        const BACKUP_PERIOD = 24 * 60 * 60 * 1000;

        setInterval(async () => {
            logger.info('[Scheduler] Running scheduled backup...');
            try {
                const { backupService } = await import('./BackupService');
                const path = await backupService.createBackup();
                logger.info(`[Scheduler] Backup created at ${path}`);
            } catch (error) {
                logger.error('[Scheduler] Backup job failed', error);
            }
        }, BACKUP_PERIOD);

        logger.info('[Scheduler] Background jobs scheduled.');
    }

    /**
     * Stop all jobs (graceful shutdown)
     */
    stop() {
        if (this.decayInterval) clearInterval(this.decayInterval);
        logger.info('[Scheduler] Background jobs stopped.');
    }
}

export const schedulerService = new SchedulerService();
