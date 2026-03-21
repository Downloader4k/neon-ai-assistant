
import { PrismaClient } from '@prisma/client';
import { embeddingService } from '../backend/src/services/memory/EmbeddingService';

const prisma = new PrismaClient();

async function main() {
    console.log('🔍 Analyzing memory clusters (Read-Only)...');

    const memories = await prisma.memoryEntry.findMany({
        where: { isActive: true },
        orderBy: { createdAt: 'desc' }
    });

    console.log(`Found ${memories.length} memories.`);
    const processed = new Set<string>();

    for (const current of memories) {
        if (processed.has(current.id)) continue;

        // Find matches with 0.85 threshold
        const candidates = await embeddingService.searchSimilar(current.content, 10, 0.85);

        // Filter candidates that are in our list
        const group = candidates
            .filter(c => !processed.has(c.id))
            .map(c => {
                const m = memories.find(mem => mem.id === c.id);
                return { ...c, content: m?.content || '?' };
            });

        if (group.length > 1) {
            console.log(`\nCluster found (${group.length} items):`);
            group.forEach(g => {
                console.log(`  [${(g.similarity).toFixed(2)}] ${g.content.substring(0, 100)}...`);
                processed.add(g.id);
            });
        }
    }
    console.log('\n✅ Analysis complete.');
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
