import { prisma } from './prisma';
import { logger } from '../../utils/logger';

/**
 * Ensure default user exists
 */
export async function ensureDefaultUser() {
    try {
        const defaultUserId = 'default-user';

        let user = await prisma.user.findUnique({
            where: { id: defaultUserId },
        });

        if (!user) {
            user = await prisma.user.create({
                data: {
                    id: defaultUserId,
                    name: 'User',
                    avatar: '👤',
                    preferences: JSON.stringify({
                        theme: 'dark',
                        language: 'de',
                    }),
                },
            });

            logger.info('Default user created', { userId: user.id });
        }

        return user;
    } catch (error) {
        logger.error('Error ensuring default user', { error });
        throw error;
    }
}
