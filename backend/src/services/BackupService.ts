
import { logger } from '../utils/logger';

export class BackupService {
    constructor() {
        // Disabled for Postgres
    }

    /**
     * Create a backup
     */
    async createBackup(): Promise<string> {
        logger.warn('[BackupService] Backup not implemented for PostgreSQL yet.');
        return '';
    }
}

export const backupService = new BackupService();
