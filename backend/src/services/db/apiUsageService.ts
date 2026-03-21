import { prisma } from './prisma';
import { logger } from '../../utils/logger';

export interface APIUsageData {
    service: string;
    tokensUsed: number;
    cost: number;
    messageId?: string;
}

/**
 * Track API usage in the database
 */
export async function trackAPIUsage(data: APIUsageData): Promise<void> {
    try {
        await prisma.apiUsage.create({
            data: {
                service: data.service,
                tokensUsed: data.tokensUsed,
                cost: data.cost,
                messageId: data.messageId,
            },
        });

        logger.debug('API usage tracked', data);
    } catch (error) {
        logger.error('Error tracking API usage', { error, data });
        // Don't throw - this is non-critical
    }
}

/**
 * Get total API usage statistics
 */
export async function getAPIUsageStats(
    service?: string,
    startDate?: Date,
    endDate?: Date
): Promise<{
    totalTokens: number;
    totalCost: number;
    requestCount: number;
}> {
    try {
        const where: any = {};

        if (service) {
            where.service = service;
        }

        if (startDate || endDate) {
            where.timestamp = {};
            if (startDate) where.timestamp.gte = startDate;
            if (endDate) where.timestamp.lte = endDate;
        }

        const [aggregation, count] = await Promise.all([
            prisma.apiUsage.aggregate({
                where,
                _sum: {
                    tokensUsed: true,
                    cost: true,
                },
            }),
            prisma.apiUsage.count({ where }),
        ]);

        return {
            totalTokens: aggregation._sum.tokensUsed || 0,
            totalCost: aggregation._sum.cost || 0,
            requestCount: count,
        };
    } catch (error) {
        logger.error('Error getting API usage stats', { error });
        return { totalTokens: 0, totalCost: 0, requestCount: 0 };
    }
}
