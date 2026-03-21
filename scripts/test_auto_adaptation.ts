import { workingMemoryService } from '../backend/src/services/memory/WorkingMemoryService';
import { memoryManagerService } from '../backend/src/services/memory/MemoryManagerService';
import { embeddingService } from '../backend/src/services/memory/EmbeddingService';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function runTest() {
    console.log('=== STARTING AUTO ADAPTATION TEST (COLOR) ===');
    const userId = 'test-user-auto';
    const sessionId = 'session-auto-1';

    // Ensure user exists
    await prisma.user.upsert({
        where: { id: userId },
        update: {},
        create: {
            id: userId,
            name: 'Test User Auto',
            email: 'test@auto.com'
        }
    });

    // Cleanup
    await prisma.memoryEntry.deleteMany({ where: { userId } });
    await prisma.conversation.deleteMany({ where: { userId } });
    await embeddingService.clearAll(); // Clear vectors too
    workingMemoryService.clearAll();

    // Start session
    workingMemoryService.getOrCreateSession(sessionId, userId);

    console.log('[Step 1] Simulating initial conversation (Fact: Blue)...');

    const messages1 = [
        { role: 'user', content: 'Hi, ich bin Johannes.' },
        { role: 'assistant', content: 'Hallo Johannes!' },
        { role: 'user', content: 'Meine Lieblingsfarbe ist Blau.' },
        { role: 'assistant', content: 'Blau ist schön.' },
        { role: 'user', content: 'Ich mag Hunde.' }
    ];

    for (const msg of messages1) {
        workingMemoryService.addMessage(sessionId, {
            role: msg.role as any,
            content: msg.content,
            timestamp: new Date()
        });
        await delay(100);
    }

    // Trigger check 1
    console.log('[Step 1] Triggering checkAutoExtraction...');
    await memoryManagerService.checkAutoExtraction(sessionId, userId);

    // Check DB stats
    // console.log('[Step 1] Checking Vector DB stats...');
    // await embeddingService.getDebugStats();

    // Check DB
    let memories = await prisma.memoryEntry.findMany({ where: { userId, isActive: true } });
    console.log('[Step 1 Result] Active Memories:', memories.map(m => `${m.id}: ${m.content}`));

    const hasBlue = memories.some(m => m.content.includes('Blau'));
    if (!hasBlue) console.error('FAILED: Blue not found!');
    else console.log('SUCCESS: Blue found.');

    console.log('\n[Step 2] Simulating Correction (Fact: Red)...');

    const messages2 = [
        { role: 'assistant', content: 'Hast du einen Hund?' },
        { role: 'user', content: 'Ja, einen Dackel.' },
        { role: 'assistant', content: 'Süß.' },
        { role: 'user', content: 'Eigentlich ist meine Lieblingsfarbe Rot, nicht Blau.' }, // Explicit correction
        { role: 'assistant', content: 'Oh, okay!' }
    ];

    for (const msg of messages2) {
        workingMemoryService.addMessage(sessionId, {
            role: msg.role as any,
            content: msg.content,
            timestamp: new Date()
        });
        await delay(100);
    }

    console.log('[Step 2] Triggering checkAutoExtraction...');
    await memoryManagerService.checkAutoExtraction(sessionId, userId);

    // Check DB again
    memories = await prisma.memoryEntry.findMany({ where: { userId, isActive: true } });
    console.log('[Step 2 Result] Active Memories:', memories.map(m => `${m.id}: ${m.content}`));

    const hasRed = memories.some(m => m.content.includes('Rot'));
    const stillHasBlue = memories.some(m => m.content.includes('Blau'));

    if (hasRed && !stillHasBlue) {
        console.log('SUCCESS: "Red" replaced "Blue". Consolidation worked!');
    } else if (hasRed && stillHasBlue) {
        console.warn('PARTIAL: "Red" added, "Blue" still there. Consolidation failed or decided KEEP.');
    } else {
        console.error('FAILED: "Red" not found.');
    }

    console.log('=== TEST COMPLETE ===');
}

runTest().catch(console.error).finally(() => prisma.$disconnect());
