
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('🗑️  Clearing all memories and resetting status...');

    try {
        // 1. Delete all memory entries (Cascades to embeddings/tags/relations mappings)
        const deletedMemories = await prisma.memoryEntry.deleteMany({});
        console.log(`✅ Deleted ${deletedMemories.count} memory entries.`);

        // 2. Delete extraction logs
        const deletedExtractions = await prisma.memoryExtraction.deleteMany({});
        console.log(`✅ Deleted ${deletedExtractions.count} extraction logs.`);

        // 3. Reset conversation status
        const updatedConversations = await prisma.conversation.updateMany({
            data: {
                processed: false
            }
        });
        console.log(`✅ Reset ${updatedConversations.count} conversations to unprocessed.`);

        // 4. Clear Vector Store
        const { chromaService } = await import('../backend/src/services/chroma/ChromaService');
        await chromaService.resetCollection();
        console.log('✅ Cleared Vector Store (ChromaDB).');

    } catch (e) {
        console.error('❌ Error during reset:', e);
    } finally {
        await prisma.$disconnect();
    }
}

main();
