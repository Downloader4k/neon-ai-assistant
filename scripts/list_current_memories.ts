
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('Fetching remaining memories...');
    const memories = await prisma.memoryEntry.findMany({
        orderBy: { createdAt: 'desc' }
    });

    console.log(`Found ${memories.length} memories:`);
    for (const m of memories) {
        console.log(`- [${m.type}] ${m.content.substring(0, 80)}...`);
    }
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
