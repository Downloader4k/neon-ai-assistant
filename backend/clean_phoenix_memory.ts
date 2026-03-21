import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function cleanPhoenixMemory() {
    console.log('🔍 Searching for Phoenix-related memories...');

    // Find all memories containing "Phoenix"
    // Find all memories containing "Phoenix"
    const phoenixMemories = await prisma.memoryEntry.findMany({
        where: {
            OR: [
                { content: { contains: 'Phoenix', mode: 'insensitive' } },
                { tags: { some: { name: 'PROJECT' } } }
            ]
        },
        include: { tags: true }
    });

    console.log(`Found ${phoenixMemories.length} potential Phoenix memories`);

    for (const memory of phoenixMemories) {
        if (memory.content.toLowerCase().includes('phoenix')) {
            const tags = memory.tags.map(t => t.name).join(', ');
            console.log(`🗑️  Deleting: [${tags}] ${memory.content}`);
            await prisma.memoryEntry.update({
                where: { id: memory.id },
                data: { isActive: false }
            });
        }
    }

    console.log('✅ Cleanup complete!');
}

cleanPhoenixMemory()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
