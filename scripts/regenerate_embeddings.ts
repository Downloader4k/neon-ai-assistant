
import { PrismaClient } from '@prisma/client';
import { embeddingService } from '../backend/src/services/memory/EmbeddingService';

const prisma = new PrismaClient();

async function main() {
    console.log('🔄 Regenerating embeddings for all active memories...');

    // 1. Clear Vector DB
    console.log('Cleaning SQLite tables...');
    try {
        embeddingService['db'].exec('DELETE FROM memory_vectors');
        embeddingService['db'].exec('DELETE FROM vector_mapping');
        console.log('✅ Vector DB cleared.');
    } catch (e) {
        console.error('Failed to clear vector DB:', e);
    }

    // 2. Fetch all memories
    const memories = await prisma.memoryEntry.findMany({
        where: { isActive: true }
    });
    console.log(`Found ${memories.length} memories to process.`);

    // 3. Re-embed
    let count = 0;
    for (const m of memories) {
        try {
            console.log(`Embedding ${m.id} (${count + 1}/${memories.length})...`);
            const vector = await embeddingService.embed(m.content);
            await embeddingService.storeEmbedding(m.id, vector);
            count++;
        } catch (e) {
            console.error(`Failed to embed ${m.id}:`, e);
        }
    }

    console.log('✅ Regeneration complete.');
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
