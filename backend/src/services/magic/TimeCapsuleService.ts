/**
 * Time Capsule Feature - Store messages for future delivery
 */

export interface TimeCapsule {
    id: string;
    userId: string;
    content: string;
    createdAt: Date;
    openAt: Date;
    opened: boolean;
    metadata?: any;
}

export class TimeCapsuleService {
    /**
     * Create a time capsule
     */
    async createCapsule(
        userId: string,
        content: string,
        openAt: Date,
        metadata?: any
    ): Promise<TimeCapsule> {
        const { prisma } = await import('../db/prisma');

        const capsule = await prisma.timeCapsule.create({
            data: {
                userId,
                content,
                openAt,
                opened: false,
                metadata,
            },
        });

        return capsule;
    }

    /**
     * Get ready-to-open capsules
     */
    async getReadyCapsules(userId: string): Promise<TimeCapsule[]> {
        const { prisma } = await import('../db/prisma');

        const capsules = await prisma.timeCapsule.findMany({
            where: {
                userId,
                opened: false,
                openAt: { lte: new Date() },
            },
            orderBy: { createdAt: 'asc' },
        });

        return capsules;
    }

    /**
     * Open a time capsule
     */
    async openCapsule(id: string): Promise<TimeCapsule> {
        const { prisma } = await import('../db/prisma');

        const capsule = await prisma.timeCapsule.update({
            where: { id },
            data: { opened: true },
        });

        return capsule;
    }

    /**
     * Get all capsules
     */
    async getAllCapsules(userId: string, includeOpened: boolean = false): Promise<TimeCapsule[]> {
        const { prisma } = await import('../db/prisma');

        const where: any = { userId };
        if (!includeOpened) {
            where.opened = false;
        }

        const capsules = await prisma.timeCapsule.findMany({
            where,
            orderBy: { openAt: 'asc' },
        });

        return capsules;
    }

    /**
     * Suggest time capsule prompts
     */
    getSuggestions(): string[] {
        return [
            'Was sind deine aktuellen Ziele? Schreibe dir in einem Jahr!',
            'Wie fühlst du dich heute? Lass es dein zukünftiges Ich in 6 Monaten wissen.',
            'Welches Problem beschäftigt dich gerade? Sieh in 3 Monaten, ob du es gelöst hast.',
            'Was macht dich heute glücklich? Erinnere dich in einem Jahr daran.',
            'Deine größte Herausforderung aktuell? Check in 6 Monaten deinen Fortschritt.',
        ];
    }
}

export const timeCapsuleService = new TimeCapsuleService();
