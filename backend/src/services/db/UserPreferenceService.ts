import { prisma } from './prisma';
import { logger } from '../../utils/logger';

export class UserPreferenceService {
    /**
     * Get a specific preference value
     */
    async getPreference(userId: string, key: string): Promise<string | null> {
        try {
            const pref = await prisma.userPreference.findUnique({
                where: {
                    userId_key: {
                        userId,
                        key,
                    },
                },
            });
            return pref ? pref.value : null;
        } catch (error) {
            logger.error('Failed to get preference', { userId, key, error });
            return null;
        }
    }

    /**
     * Set or update a preference
     */
    async setPreference(userId: string, key: string, value: string, category: string = 'general'): Promise<void> {
        try {
            await prisma.userPreference.upsert({
                where: {
                    userId_key: {
                        userId,
                        key,
                    },
                },
                update: {
                    value,
                    category,
                },
                create: {
                    userId,
                    key,
                    value,
                    category,
                },
            });
            logger.debug('Preference set', { userId, key, value });
        } catch (error) {
            logger.error('Failed to set preference', { userId, key, error });
            throw error;
        }
    }

    /**
     * Get all preferences for a user, optionally filtered by category
     */
    async getPreferences(userId: string, category?: string): Promise<Record<string, string>> {
        try {
            const whereClause: any = { userId };
            if (category) {
                whereClause.category = category;
            }

            const prefs = await prisma.userPreference.findMany({
                where: whereClause,
            });

            return prefs.reduce((acc, pref) => {
                acc[pref.key] = pref.value;
                return acc;
            }, {} as Record<string, string>);
        } catch (error) {
            logger.error('Failed to get preferences', { userId, category, error });
            return {};
        }
    }
}

export const userPreferenceService = new UserPreferenceService();
