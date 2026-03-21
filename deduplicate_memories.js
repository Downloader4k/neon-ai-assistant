
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function deduplicate() {
    console.log("Deduplicating memory entries...");

    const memories = await prisma.memoryEntry.findMany({
        where: { userId: 'default-user', isActive: true },
        orderBy: { createdAt: 'desc' }
    });

    const seen = new Set();
    let deleteCount = 0;

    for (const mem of memories) {
        const normalized = mem.content.trim().toLowerCase();
        if (seen.has(normalized)) {
            console.log(`Deleting duplicate: "${mem.content}" (${mem.id})`);
            await prisma.memoryEntry.delete({ where: { id: mem.id } });
            deleteCount++;
        } else {
            seen.add(normalized);
        }
    }

    console.log(`Successfully removed ${deleteCount} duplicates.`);
}

deduplicate().catch(console.error).finally(() => prisma.$disconnect());
