
import { embeddingService } from './src/services/memory/EmbeddingService';
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function checkOrphans() {
    const query = "Wie alt bin ich heute?";
    const limit = 30;
    console.log(`Searching for: "${query}" (Limit: ${limit})`);

    const vectorResults = await embeddingService.searchSimilar(query, limit, 0.1);
    console.log(`Found ${vectorResults.length} vector matches.`);

    let existingCount = 0;
    let orphanCount = 0;

    for (const res of vectorResults) {
        const entry = await prisma.memoryEntry.findUnique({
            where: { id: res.id }
        });

        if (entry) {
            existingCount++;
            console.log(`[EXISTING] ID: ${res.id}, Similarity: ${res.similarity.toFixed(4)}, Content: ${entry.content.substring(0, 50)}`);
        } else {
            orphanCount++;
            console.log(`[ORPHANED] ID: ${res.id}, Similarity: ${res.similarity.toFixed(4)} (No Prisma entry!)`);
        }
    }

    console.log(`\nSummary: ${existingCount} existing, ${orphanCount} orphans.`);
}

checkOrphans().catch(console.error).finally(() => prisma.$disconnect());
