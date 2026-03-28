
import { PrismaClient } from '@prisma/client';
require('dotenv').config();

console.log('Seeding memory (v5 - with user)...');
console.log('DB URL:', process.env.DATABASE_URL);

const prisma = new PrismaClient();

const interviewData = [
    { q: 'name', a: 'User', type: 'FACT' },
    { q: 'location', a: 'Deutschland', type: 'FACT' },
    { q: 'projects', a: 'Neon (KI-Assistent)', type: 'PROJECT' },
    { q: 'relaxation', a: 'Musik, Hoerspiele', type: 'PREFERENCE' },
];

async function main() {
    const userId = 'default-user';

    console.log(`Ensuring user ${userId} exists...`);
    await prisma.user.upsert({
        where: { id: userId },
        update: {},
        create: {
            id: userId,
            name: 'User',
            email: 'user@neon.local'
        }
    });
    console.log(`User confirmed.`);

    console.log(`Starting insertion of ${interviewData.length} items...`);

    for (const item of interviewData) {
        const content = `Interview (${item.q}): ${item.a}`;

        try {
            const entry = await prisma.memoryEntry.create({
                data: {
                    userId,
                    type: item.type as any,
                    content,
                    importanceScore: 1.0,
                    isActive: true,
                }
            });
            console.log(`Created ${entry.id}`);
        } catch (e) {
            console.error('Failed to create:', e);
        }
    }
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
