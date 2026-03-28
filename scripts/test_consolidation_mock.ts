
import { ExtractionService } from '../backend/src/services/memory/ExtractionService';
import { PrismaClient } from '@prisma/client';
import { embeddingService } from '../backend/src/services/memory/EmbeddingService';
import { logger } from '../backend/src/utils/logger';

// Mock Logger to avoid clutter
(logger.info as any) = () => { };
(logger.error as any) = console.error;

// Mocks
const mockPrisma = {
    memoryEntry: {
        findUnique: async () => null,
        update: async () => { },
        create: async (args: any) => ({ ...args.data, id: 'new-red-id' }),
    },
    memoryEmbedding: {
        create: async () => { },
    },
    memoryRelation: {
        findFirst: async () => null,
        create: async () => { },
    },
    memoryExtraction: {
        create: async (args: any) => ({ id: 'extraction-id', ...args.data }),
    },
    $transaction: async (cb: any) => cb(mockPrisma)
} as unknown as PrismaClient;

const mockEmbeddingService = {
    searchSimilar: async () => [],
    embed: async () => new Array(768).fill(0.1),
    storeEmbedding: async () => { },
    getStats: async () => { },
} as unknown as typeof embeddingService;

// Test Class
class TestExtractionService extends ExtractionService {
    // Override to return specific decision
    protected async askLLMForConsolidation(newItem: string, oldItem: string): Promise<any> {
        console.log(`[MockLLM] Comparing: "${newItem}" vs "${oldItem}"`);
        if (newItem.includes('Red') && oldItem.includes('Blue')) {
            console.log('[MockLLM] Deciding REPLACE');
            return { action: 'REPLACE' };
        }
        return { action: 'KEEP' };
    }

    // Public wrapper for testing
    public async testConsolidation(userId: string, memories: any[]) {
        // Mock RelationService to avoid DB calls
        (this as any).relationService = {
            detectRelations: async () => console.log('[MockRelation] Skipped relation detection')
        };

        // Apply filterByQuality first (as in extractMemories)
        const filtered = this.filterByQuality(memories);
        console.log(`[Test] Filtered ${memories.length} -> ${filtered.length} memories`);

        // We use saveMemories which calls consolidateMemories
        // Signature: userId, conversationId, memories
        return this.saveMemories(userId, 'conv-id-dummy', filtered);
    }
}

async function runTest() {
    console.log('=== STARTING MOCK CONSOLIDATION TEST ===');

    const service = new TestExtractionService(
        'mock-url',
        mockPrisma,
        mockEmbeddingService
    );

    // Setup Mock Data
    const userId = 'user-1';
    const newMemories = [
        {
            type: 'FACT',
            content: 'My favorite color is Red.',
            importance: 1, // High importance
            tags: [],
            confidence: 1
        },
        {
            type: 'BEHAVIOR',
            content: 'User replies quickly.',
            importance: 0.28, // > 0.25 (should pass)
            tags: [],
            confidence: 0.8
        },
        {
            type: 'RELATIONSHIP',
            content: 'User trusts the AI.',
            importance: 0.2, // < 0.3 (should fail quality filter)
            tags: [],
            confidence: 0.7
        },
        {
            type: 'KNOWLEDGE',
            content: 'TypeScript ist eine typisierte Obermenge von JavaScript.',
            importance: 0.7, // High importance for knowledge
            tags: ['music', 'person'],
            confidence: 0.9
        }
    ];

    // Mock searchSimilar to return "Blue" memory
    (mockEmbeddingService.searchSimilar as any) = async (text: string, /* limit: number, threshold: number */) => {
        // console.log(`[MockEmbedding] Searching for "${text}"`);
        if (text.includes('Red')) {
            return [{ id: 'blue-id', similarity: 0.85 }];
        }
        return [];
    };

    // Mock prisma.findUnique to return "Blue" memory
    (mockPrisma.memoryEntry.findUnique as any) = async (args: any) => {
        if (args.where.id === 'blue-id') {
            return {
                id: 'blue-id',
                content: 'My favorite color is Blue.',
                userId: userId,
                isActive: true
            };
        }
        return null;
    };

    // Spy on update and create
    let softDeletedId: string | null = null;
    let createdMemories: any[] = [];

    (mockPrisma.memoryEntry.update as any) = async (args: any) => {
        if (args.data.isActive === false) {
            softDeletedId = args.where.id;
            console.log(`[MockPrisma] Soft deleted memory: ${softDeletedId}`);
        }
    };

    (mockPrisma.memoryEntry.create as any) = async (args: any) => {
        console.log(`[MockPrisma] Created memory: [${args.data.type}] "${args.data.content}"`);
        createdMemories.push(args.data);
        return { id: 'new-id', ...args.data };
    };

    // Run Logic
    console.log('[Test] Calling saveMemories...');
    try {
        await service.testConsolidation(userId, newMemories);
    } catch (e) {
        console.error('Error during test:', e);
    }

    // Verify
    console.log('\n=== VERIFICATION ===');

    // 1. Consolidation Check
    if (softDeletedId === 'blue-id') {
        console.log('✅ PASS: Old memory "Blue" was soft-deleted.');
    } else {
        console.error('❌ FAIL: Old memory "Blue" was NOT soft-deleted.');
    }

    // 2. Behavior Type Check
    const behaviorMem = createdMemories.find(m => m.type === 'BEHAVIOR');
    if (behaviorMem && behaviorMem.content === 'User replies quickly.') {
        console.log('✅ PASS: BEHAVIOR memory preserved (Score 0.28 > 0.25).');
    } else {
        console.error('❌ FAIL: BEHAVIOR memory missing or filtered out.');
    }

    // 3. Relationship Filter Check
    const relMem = createdMemories.find(m => m.type === 'RELATIONSHIP');
    if (!relMem) {
        console.log('✅ PASS: Low-score RELATIONSHIP memory filtered out (scored 0.2 < 0.3).');
    } else {
        console.error('❌ FAIL: Low-score RELATIONSHIP memory was NOT filtered.');
    }

    // 4. Knowledge Check
    const knowledgeMem = createdMemories.find(m => m.type === 'KNOWLEDGE');
    if (knowledgeMem && knowledgeMem.content.includes('TypeScript')) {
        console.log('✅ PASS: KNOWLEDGE memory preserved (General Fact).');
    } else {
        console.error('❌ FAIL: KNOWLEDGE memory missing.');
    }

    console.log('=== TEST COMPLETE ===');
}

runTest();
