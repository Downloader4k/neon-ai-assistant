
import { PrismaClient } from '@prisma/client';
import { embeddingService } from '../backend/src/services/memory/EmbeddingService';


const prisma = new PrismaClient();

async function main() {
    console.log('🧹Starting semantic cleanup (Threshold: 0.85)...');

    // Get all active memories, newest first
    const memories = await prisma.memoryEntry.findMany({
        where: { isActive: true },
        orderBy: { createdAt: 'desc' },
        include: { embeddings: true }
    });

    console.log(`Found ${memories.length} memories to check.`);

    const toDeleteIds: string[] = [];
    const keptIds = new Set<string>();

    for (const current of memories) {
        if (toDeleteIds.includes(current.id)) continue;

        // Semantic Check against already kept
        // We do O(N^2) comparison for thoroughness on small dataset
        let isDuplicate = false;

        // Search similar candidates directly from EmbeddingService to be efficient
        // We use the content of 'current' to find matches
        const candidates = await embeddingService.searchSimilar(current.content, 10, 0.5);

        if (candidates.length > 0) {
            console.log(`Debug: '${current.content.substring(0, 20)}...' found ${candidates.length} matches.`);
            candidates.forEach(c => {
                const entry = memories.find(m => m.id === c.id);
                console.log(`  - ${c.id} (${entry?.content.substring(0, 10)}...): ${(c.similarity).toFixed(3)}`);
            });
        }


        for (const candidate of candidates) {
            // Skip self
            if (candidate.id === current.id) continue;

            // Skip if candidate is already marked for deletion
            if (toDeleteIds.includes(candidate.id)) continue;

            // We found a similar entry 'candidate'.
            // Is it one we already decided to keep? Or a future one?
            // If it's one we kept, then 'current' is the duplicate (since we iterate Newest -> Oldest).
            // Wait, iteration logic:
            // 1. Take 'current' (Newest).
            // 2. Find similar.
            // 3. If similar exists and is 'better', keep similar and mark current as delete.
            // 4. If similar exists and is 'worse', mark similar as delete and keep current.

            const candidateEntry = memories.find(m => m.id === candidate.id);
            if (!candidateEntry) {
                // Might be from another user or deleted?
                continue;
            }

            // Decide which to keep:
            // Rule 1: Longer content is usually better (more detail).
            // Rule 2: If length similar, keep Newest (current).

            const lenDiff = candidateEntry.content.length - current.content.length;

            if (lenDiff > 10) {
                // Candidate is significantly longer -> Keep Candidate, Delete Current
                console.log(`Duplicate found (Sim: ${candidate.similarity.toFixed(2)}):`);
                console.log(`  KEEP (Older, Longer): "${candidateEntry.content.substring(0, 50)}..."`);
                console.log(`  DEL  (Newer, Shorter): "${current.content.substring(0, 50)}..."`);
                toDeleteIds.push(current.id);
                isDuplicate = true;
                break; // Stop checking this 'current'
            } else {
                // Current is longer or similar -> Keep Current, Delete Candidate
                console.log(`Duplicate found (Sim: ${candidate.similarity.toFixed(2)}):`);
                console.log(`  KEEP (Newer): "${current.content.substring(0, 50)}..."`);
                console.log(`  DEL  (Older): "${candidateEntry.content.substring(0, 50)}..."`);
                toDeleteIds.push(candidate.id);
                // Continue checking other candidates for 'current'
            }
        }

        if (!isDuplicate) {
            keptIds.add(current.id);
        }
    }

    console.log(`\nIdentified ${toDeleteIds.length} duplicates to delete.`);

    if (toDeleteIds.length > 0) {
        // Delete from DB (Cascade handles MemoryEmbedding relation)
        await prisma.memoryEntry.deleteMany({
            where: { id: { in: toDeleteIds } }
        });

        // Delete from Vector Store (Explicitly needed for sqlite-vec mapping)
        console.log('Cleaning up vector store...');
        for (const id of toDeleteIds) {
            await embeddingService.deleteEmbedding(id);
        }
        console.log('✅ Cleanup complete.');
    } else {
        console.log('✅ No duplicates found.');
    }
}

main()
    .catch(e => console.error(e))
    .finally(async () => {
        await prisma.$disconnect();
        // embeddingService.close() if needed, but it's a singleton
    });
