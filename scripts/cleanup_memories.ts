import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Cleanup Script: Remove non-personal knowledge from Memory System
 * 
 * KEEPS:
 * - All entries tagged with "interview:*"
 * - Personal facts (name, age, location, work, family, pets)
 * - Projects (Neon, etc.)
 * - Preferences (music, films, atmosphere)
 * - Goals
 * 
 * DELETES:
 * - General knowledge (CNNs, Photosynthese, E-Autos, etc.)
 * - Technical facts not related to user
 * - Meta information about the system itself
 */

async function cleanupMemories() {
    const userId = 'default-user';

    console.log('🧹 Starting Memory Cleanup...\n');

    // 1. Get all memories
    const allMemories = await prisma.memoryEntry.findMany({
        where: { userId, isActive: true },
        include: { tags: true }
    });

    console.log(`Total memories: ${allMemories.length}\n`);

    // 2. Filter: What to KEEP
    const keepIds = new Set<string>();
    const deleteIds = new Set<string>();

    for (const mem of allMemories) {
        // ALWAYS keep interview answers
        if (mem.tags.some(t => t.name.startsWith('interview:'))) {
            keepIds.add(mem.id);
            continue;
        }

        // Check content for personal keywords (user-specific, configure as needed)
        const content = mem.content.toLowerCase();
        const isPersonal =
            content.includes('interview') ||
            content.includes('neon') ||
            content.includes('persoenlich') ||
            content.includes('privat');

        // Check for general knowledge keywords (DELETE these)
        const isGeneralKnowledge =
            content.includes('photosynthese') ||
            content.includes('cnn') ||
            content.includes('knn') ||
            content.includes('neuronale') ||
            content.includes('backpropagation') ||
            content.includes('gan') ||
            content.includes('lstm') ||
            content.includes('e-auto') ||
            content.includes('batterien') ||
            content.includes('ukraine') ||
            content.includes('krieg') ||
            content.includes('propaganda') ||
            content.includes('react') ||
            content.includes('vue') ||
            content.includes('vuex') ||
            content.includes('jsx') ||
            content.includes('microservices') ||
            content.includes('lichtreaktion') ||
            content.includes('dunkelreaktion') ||
            content.includes('chloroplast') ||
            content.includes('hallo welt') ||
            (content.includes('ki') && !content.includes('neon')) ||
            content.includes('black box') ||
            content.includes('feedforward');

        if (isPersonal && !isGeneralKnowledge) {
            keepIds.add(mem.id);
        } else if (isGeneralKnowledge) {
            deleteIds.add(mem.id);
            console.log(`❌ DELETE: ${mem.content.substring(0, 80)}...`);
        } else {
            // Ambiguous - check importance score
            if (mem.importanceScore >= 0.85 && mem.type === 'FACT') {
                keepIds.add(mem.id);
            } else {
                deleteIds.add(mem.id);
                console.log(`❌ DELETE (low importance): ${mem.content.substring(0, 80)}...`);
            }
        }
    }

    console.log(`\n✅ Keeping: ${keepIds.size} memories`);
    console.log(`❌ Deleting: ${deleteIds.size} memories\n`);

    // 3. Delete
    if (deleteIds.size > 0) {
        await prisma.memoryEntry.deleteMany({
            where: {
                id: { in: Array.from(deleteIds) }
            }
        });
        console.log('🗑️  Deletion complete!\n');
    }

    // 4. Print summary
    const remaining = await prisma.memoryEntry.count({
        where: { userId, isActive: true }
    });
    console.log(`📊 Final count: ${remaining} memories\n`);
}

cleanupMemories()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
