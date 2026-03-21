import { PrismaClient } from '@prisma/client';
import { logger } from '../../utils/logger';

export const prisma = new PrismaClient({
    log: process.env.NODE_ENV === 'development'
        ? ['query', 'error', 'warn']
        : ['error'],
});

// Connect to database
export async function connectDatabase(): Promise<void> {
    try {
        await prisma.$connect();
        logger.info('Database connected successfully');
    } catch (error) {
        logger.error('Failed to connect to database', { error });
        throw error;
    }
}

// Disconnect from database
export async function disconnectDatabase(): Promise<void> {
    try {
        await prisma.$disconnect();
        logger.info('Database disconnected');
    } catch (error) {
        logger.error('Failed to disconnect from database', { error });
    }
}

// Handle shutdown
process.on('beforeExit', async () => {
    await disconnectDatabase();
});
