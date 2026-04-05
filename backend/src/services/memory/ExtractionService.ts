import { PrismaClient } from '@prisma/client';
import { applyExtractionRules } from './ExtractionRules';
import { embeddingService } from './EmbeddingService';
import { logger } from '../../utils/logger';

// ... interface ...

export interface ExtractedMemory {
    type: 'FACT' | 'PREFERENCE' | 'PROJECT' | 'INSTRUCTION' | 'KNOWLEDGE' | 'BEHAVIOR' | 'RELATIONSHIP';
    content: string;
    importance: number;
    tags: string[];
    confidence: number;
}

export class ExtractionService {
    private ollamaUrl: string;
    private extractionModel: string = process.env.OLLAMA_MODEL || 'gemma3:12b';
    private prisma: PrismaClient;
    private embeddingService: typeof embeddingService;

    constructor(
        ollamaUrl: string = 'http://localhost:11434',
        prisma: PrismaClient = new PrismaClient(),
        embedService: typeof embeddingService = embeddingService
    ) {
        this.ollamaUrl = ollamaUrl;
        this.prisma = prisma;
        this.embeddingService = embedService;
    }

    /**
     * Extract memories from a conversation
     */
    async extractMemories(conversation: {
        id: string;
        messages: Array<{ role: string; content: string }>;
    }): Promise<ExtractedMemory[]> {
        logger.debug(`[Extraction] Processing conversation ${conversation.id}`);

        // Stage 1: Rule-based extraction
        const ruleBasedResults = this.applyRulesToConversation(conversation.messages);

        // Stage 2: LLM extraction
        const llmResults = await this.llmExtraction(conversation.messages);

        // Merge and deduplicate
        const merged = this.mergeAndDeduplicate(ruleBasedResults, llmResults);

        // Verify against actual conversation text (anti-hallucination)
        const verified = this.verifyAgainstConversation(merged, conversation.messages);

        // Apply quality filter
        const filtered = this.filterByQuality(verified);

        if (filtered.length > 0) {
            logger.info(`[Extraction] Extracted ${filtered.length} memories from ${conversation.id}`);
        }

        return filtered;
    }

    /**
     * Apply rule-based extraction to all messages
     */
    private applyRulesToConversation(messages: Array<{ role: string; content: string }>): ExtractedMemory[] {
        const results: ExtractedMemory[] = [];

        for (const msg of messages) {
            if (msg.role !== 'user') continue;

            const extracted = applyExtractionRules(msg.content);
            for (const item of extracted) {
                results.push({
                    type: item.type as any,
                    content: item.content,
                    importance: item.confidence,
                    tags: [],
                    confidence: item.confidence
                });
            }
        }

        return results;
    }

    /**
     * LLM-based extraction
     */
    private async llmExtraction(messages: Array<{ role: string; content: string }>): Promise<ExtractedMemory[]> {
        try {
            logger.info('[Extraction] Starting LLM extraction...');
            const conversationText = messages
                .map(m => `${m.role.toUpperCase()}: ${m.content}`)
                .join('\n');

            // ... prompt construction ...
            const prompt = `Du bist ein strikter Memory-Extraktor. Extrahiere NUR Informationen, die der NUTZER (USER) EXPLIZIT und WÖRTLICH über SICH SELBST gesagt hat.

ABSOLUT VERBOTEN:
- NIEMALS Informationen erfinden, die nicht WÖRTLICH in der Konversation stehen
- NIEMALS Schlussfolgerungen ziehen oder Fakten kombinieren
- NIEMALS Aussagen des ASSISTENTEN als Fakten über den Nutzer speichern
- NIEMALS temporäre Situationen als dauerhafte Fakten speichern
- NIEMALS Beziehungen zwischen Personen erfinden, die nicht explizit genannt wurden

UNTERSCHEIDE STRIKT:
1. "Fakten ÜBER den Nutzer" = Der Nutzer sagt "ICH bin/habe/mache X" → Speichern als FACT
2. "Fakten die der Nutzer ERWÄHNT" = Der Nutzer spricht über andere Personen/Dinge → NUR speichern wenn es eine dauerhafte Beziehung des Nutzers ist
3. "Temporäre Zustände" = "Meine Mutter ist beim Sport", "Ich esse gerade Pizza" → NIEMALS speichern
4. "Dauerhafte Fakten" = "Ich heiße Max", "Mein Bruder heißt Tim", "Ich arbeite als Entwickler" → Speichern

REGELN:
1. NUR Aussagen des NUTZERS (USER:) analysieren, NICHT die des Assistenten
2. Maximal 2 Einträge pro Konversation — nur das Wichtigste
3. Confidence unter 0.8 → NICHT speichern
4. Im Zweifel: NICHT speichern. Lieber eine Information verpassen als eine falsche speichern.
5. Jeder extrahierte Fakt muss als DIREKTES ZITAT aus der Konversation nachweisbar sein

Konversation:
${conversationText}

Kategorien:
- FACT: Dauerhafte, persönliche Fakten über den Nutzer (Name, Alter, Beruf, Wohnort)
- PREFERENCE: Wiederholt und klar ausgedrückte Vorlieben ("Ich mag immer...", "Ich bevorzuge...")
- PROJECT: Projekte an denen der Nutzer aktiv arbeitet ("Ich arbeite an...")
- INSTRUCTION: Explizite Anweisungen an den Assistenten ("Merke dir...", "Vergiss nicht...")
- RELATIONSHIP: Vom Nutzer explizit genannte dauerhafte Beziehungen ("Mein Bruder heißt...", "Meine Freundin ist...")

Antwort als JSON-Array (maximal 2 Einträge, oder leeres Array [] wenn nichts Wichtiges):
[
  {
    "type": "FACT|PREFERENCE|PROJECT|INSTRUCTION|RELATIONSHIP",
    "content": "Die extrahierte Information als kurzer Satz",
    "source_quote": "Das wörtliche Zitat aus der USER-Nachricht das diese Information belegt",
    "importance": 0.0-1.0,
    "tags": ["tag1"],
    "confidence": 0.0-1.0
  }
]

WICHTIG: Wenn keine dauerhaften, persönlichen Informationen vorhanden sind, gib ein leeres Array [] zurück.
NUR das JSON-Array ausgeben, kein weiterer Text.`;

            // Add AbortController for timeout
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

            logger.info(`[Extraction] Sending request to Ollama (${this.extractionModel})...`);

            try {
                const response = await fetch(`${this.ollamaUrl}/api/generate`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        model: this.extractionModel,
                        prompt,
                        stream: false,
                        options: {
                            temperature: 0.1,
                            top_p: 0.9
                        }
                    }),
                    signal: controller.signal
                });
                clearTimeout(timeoutId);

                if (!response.ok) {
                    throw new Error(`Ollama API error: ${response.statusText}`);
                }

                const data = await response.json();
                logger.info('[Extraction] LLM response received');
                return this.parseExtractionResponse((data as any).response);
            } catch (fetchError: any) {
                clearTimeout(timeoutId);
                if (fetchError.name === 'AbortError') {
                    logger.warn('[Extraction] LLM request timed out after 30s');
                } else {
                    logger.error('[Extraction] LLM request failed', fetchError);
                }
                return [];
            }
        } catch (error) {
            logger.error('[Extraction] LLM extraction failed:', error);
            return [];
        }
    }

    /**
     * Parse JSON response from LLM
     */
    private parseExtractionResponse(responseText: string): ExtractedMemory[] {
        try {
            // Extract JSON array from response
            const jsonMatch = responseText.match(/\[[\s\S]*\]/);
            if (!jsonMatch) {
                console.warn('[Extraction] No JSON found in LLM response');
                return [];
            }

            const parsed = JSON.parse(jsonMatch[0]);

            // Validate and filter — require minimum confidence of 0.7
            return parsed.filter((item: any) =>
                item.type &&
                item.content &&
                item.confidence >= 0.7 &&
                ['FACT', 'PREFERENCE', 'PROJECT', 'INSTRUCTION', 'RELATIONSHIP'].includes(item.type)
            ).map((item: any) => ({
                ...item,
                // Preserve source_quote for verification
                sourceQuote: item.source_quote || ''
            }));
        } catch (error) {
            console.error('[Extraction] Failed to parse LLM response:', error);
            return [];
        }
    }

    /**
     * Verify extracted memories against actual conversation text.
     * Rejects any memory whose content cannot be traced back to user messages.
     */
    private verifyAgainstConversation(
        memories: ExtractedMemory[],
        messages: Array<{ role: string; content: string }>
    ): ExtractedMemory[] {
        // Collect all user messages as one lowercase string for verification
        const userText = messages
            .filter(m => m.role === 'user')
            .map(m => m.content.toLowerCase())
            .join(' ');

        return memories.filter(memory => {
            // Extract key nouns/names from the memory content
            const contentWords = memory.content
                .toLowerCase()
                .split(/\s+/)
                .filter((w: string) => w.length > 3)
                // Remove common German filler words
                .filter((w: string) => !['nutzer', 'benutzer', 'user', 'dass', 'eine', 'einem', 'einen', 'einer', 'sind', 'wird', 'wurde', 'haben', 'hatte', 'macht', 'machen', 'heißt', 'arbeitet', 'bevorzugt', 'möchte'].includes(w));

            // At least 50% of meaningful words must appear in user messages
            const matchCount = contentWords.filter((w: string) => userText.includes(w)).length;
            const matchRatio = contentWords.length > 0 ? matchCount / contentWords.length : 0;

            // Also check source_quote if provided
            const sourceQuote = (memory as any).sourceQuote || '';
            const quoteFound = sourceQuote.length > 5 && userText.includes(sourceQuote.toLowerCase().trim());

            const verified = matchRatio >= 0.5 || quoteFound;

            if (!verified) {
                logger.warn(`[Verification] REJECTED hallucinated memory: "${memory.content}" (matchRatio: ${matchRatio.toFixed(2)}, quoteFound: ${quoteFound})`);
            } else {
                logger.info(`[Verification] VERIFIED memory: "${memory.content}" (matchRatio: ${matchRatio.toFixed(2)})`);
            }

            return verified;
        });
    }

    /**
     * Merge and deduplicate extracted memories
     */
    private mergeAndDeduplicate(
        ruleBasedResults: ExtractedMemory[],
        llmResults: ExtractedMemory[]
    ): ExtractedMemory[] {
        const all = [...ruleBasedResults, ...llmResults];
        const unique = new Map<string, ExtractedMemory>();

        for (const item of all) {
            const key = `${item.type}:${item.content.toLowerCase().trim()}`;

            if (!unique.has(key) || unique.get(key)!.confidence < item.confidence) {
                unique.set(key, item);
            }
        }

        return Array.from(unique.values());
    }

    /**
     * Filter memories by quality criteria
     * Prevents storing trivial or low-value content
     */
    protected filterByQuality(memories: ExtractedMemory[]): ExtractedMemory[] {
        const trivialPatterns = [
            /^(hallo|hi|hey|tschüss|danke|bitte|ok|okay|ja|nein)$/i,
            /^(what|how|why|where|when)\??$/i,
            /^.{1,14}$/,  // Too short (< 15 chars)
        ];

        // Patterns to filter out ephemeral/weather/temporal data
        const ephemeralPatterns = [
            /(wetter|temperatur|grad|bewölkt|sonnig|regen|schnee|wind|vorhersage).*in/i,
            /(aktuell|heute|morgen|jetzt|gerade|momentan).*ist/i,
            /grad celsius/i,
            /topolino/i,
        ];

        // Patterns for temporary situations — these should NEVER be stored
        const temporalPatterns = [
            /(?:ist|sind|war|waren)\s+(?:gerade|momentan|aktuell|jetzt|heute|beim|im)\s/i,
            /(?:gerade|momentan|aktuell|jetzt)\s+(?:beim|im|am|bei)\s/i,
            /(?:beim|im)\s+(?:sport|einkaufen|kochen|arbeiten|training|fitness|arzt|schule)/i,
            /(?:wenn|sobald|falls)\s+.+(?:zurück|fertig|da ist|kommt)/i,
            /(?:heute|morgen|gestern|gleich|später|nachher)\s+(?:essen|machen|gehen|kommen)/i,
            /(?:warte|wartet)\s+(?:auf|bis)/i,
            /(?:ist\s+(?:nicht\s+)?(?:da|hier|weg|unterwegs))/i,
        ];

        // Patterns that indicate the memory is about someone else, not the user
        const thirdPartyPatterns = [
            /^(?:der|die|das)\s+(?:nutzer|user)\s+(?:hat\s+)?(?:erwähnt|gesagt|geschrieben|berichtet)/i,
            /(?:ist\s+der\s+sohn|ist\s+die\s+tochter|ist\s+der\s+vater|ist\s+die\s+mutter)\s+von/i,
        ];

        return memories.filter(memory => {
            const content = memory.content.trim();

            // Check minimum length
            if (content.length < 15) {
                logger.info(`[Quality Filter] Rejected (too short): "${content}"`);
                return false;
            }

            // Check trivial patterns
            for (const pattern of trivialPatterns) {
                if (pattern.test(content)) {
                    logger.info(`[Quality Filter] Rejected (trivial): "${content}"`);
                    return false;
                }
            }

            // Check ephemeral/weather patterns
            for (const pattern of ephemeralPatterns) {
                if (pattern.test(content)) {
                    logger.info(`[Quality Filter] Rejected (ephemeral): "${content}"`);
                    return false;
                }
            }

            // Check temporal situation patterns
            for (const pattern of temporalPatterns) {
                if (pattern.test(content)) {
                    logger.info(`[Quality Filter] Rejected (temporal situation): "${content}"`);
                    return false;
                }
            }

            // Check third-party inference patterns (e.g. "X ist der Sohn von Y")
            for (const pattern of thirdPartyPatterns) {
                if (pattern.test(content)) {
                    logger.info(`[Quality Filter] Rejected (third-party inference): "${content}"`);
                    return false;
                }
            }

            // Higher importance thresholds
            let minImportance = 0.6;

            switch (memory.type) {
                case 'FACT':
                    minImportance = 0.7;
                    break;
                case 'RELATIONSHIP':
                    minImportance = 0.7;
                    break;
                case 'PREFERENCE':
                    minImportance = 0.7;
                    break;
                case 'INSTRUCTION':
                    minImportance = 0.7;
                    break;
                case 'PROJECT':
                    minImportance = 0.6;
                    break;
                default:
                    minImportance = 0.7;
            }

            if (memory.importance < minImportance) {
                logger.info(`[Quality Filter] Rejected ${memory.type} (score ${memory.importance} < ${minImportance}): "${content}"`);
                return false;
            }

            // Require high confidence for all types
            if (memory.confidence < 0.7) {
                logger.info(`[Quality Filter] Rejected low confidence ${memory.type} (conf ${memory.confidence}): "${content}"`);
                return false;
            }

            return true;
        });
    }

    /**
     * Consolidate new memories with existing ones (Conflict Resolution)
     */
    private async consolidateMemories(
        userId: string,
        memories: ExtractedMemory[]
    ): Promise<ExtractedMemory[]> {
        const finalized: ExtractedMemory[] = [];

        console.log(`[Consolidation] Processing ${memories.length} candidates...`);

        for (const memory of memories) {
            try {
                // 1. Search for semantic candidates (low threshold to catch near-duplicates)
                // Lowered from 0.75 to 0.50 to aggressively catch duplicate concepts
                const candidates = await this.embeddingService.searchSimilar(memory.content, 1, 0.50);

                if (candidates.length === 0) {
                    finalized.push(memory);
                    continue;
                }

                const existingId = candidates[0].id;
                const similarity = candidates[0].similarity;

                // Fetch full existing entry
                const existingEntry = await this.prisma.memoryEntry.findUnique({
                    where: { id: existingId }
                });

                if (!existingEntry || existingEntry.userId !== userId) {
                    finalized.push(memory);
                    continue;
                }

                console.log(`[Consolidation] Conflict check (sim: ${similarity.toFixed(2)}):\nNEW: "${memory.content}"\nOLD: "${existingEntry.content}"`);

                // 2. Ask LLM for decision
                const decision = await this.askLLMForConsolidation(memory.content, existingEntry.content);
                console.log(`[Consolidation] Decision: ${decision.action}`);

                // 3. Execute Decision
                if (decision.action === 'REPLACE') {
                    // Update existing entry with new content (keep ID to preserve relations?)
                    // Or delete old, create new?
                    // Updating is cleaner for references, but type might change.
                    // Let's delete old to be safe and treat new as new.
                    // Actually, if we delete, we lose history. But we want to "forget" the error.
                    await this.prisma.memoryEntry.update({
                        where: { id: existingId },
                        data: { isActive: false } // Soft delete
                    });
                    finalized.push(memory);

                } else if (decision.action === 'MERGE') {
                    // Soft delete old, add merged as new
                    await this.prisma.memoryEntry.update({
                        where: { id: existingId },
                        data: { isActive: false }
                    });
                    finalized.push({
                        ...memory,
                        content: decision.text || memory.content
                    });

                } else if (decision.action === 'IGNORE') {
                    // Skip new memory
                    continue;

                } else { // KEEP
                    // Both are valid
                    finalized.push(memory);
                }

            } catch (error) {
                console.error('[Consolidation] Error processing memory:', error);
                finalized.push(memory); // Fallback: save it
            }
        }

        return finalized;
    }

    /**
     * Ask LLM to compare new and old memory
     */
    protected async askLLMForConsolidation(
        newItem: string,
        oldItem: string
    ): Promise<{ action: 'REPLACE' | 'MERGE' | 'IGNORE' | 'KEEP', text?: string }> {
        const prompt = `
Entscheide, wie mit diesen zwei Informationen über den Nutzer umgegangen werden soll:

ALTE Info: "${oldItem}"
NEUE Info: "${newItem}"

Regeln:
- REPLACE: Die NEUE Info korrigiert die ALTE (z.B. "Ich bin 25" vs "Ich bin 26"). Die Alte ist falsch/veraltet.
- MERGE: Die NEUE Info ergänzt die ALTE. Kombiniere beide zu einer besseren Aussage.
- IGNORE: Die NEUE Info ist bereits in der ALTEN enthalten oder weniger präzise.
- KEEP: Beide Infos sind unterschiedlich und sollten beide behalten werden.

Antworte NUR als JSON:
{
  "action": "REPLACE" | "MERGE" | "IGNORE" | "KEEP",
  "text": "Der kombinierte Text (nur bei MERGE notwendig, sonst weglassen)"
}`;

        try {
            const response = await fetch(`${this.ollamaUrl}/api/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: this.extractionModel,
                    prompt,
                    stream: false,
                    format: "json", // Force JSON
                    options: { temperature: 0.0 }
                })
            });

            const data = await response.json();
            return JSON.parse((data as any).response);
        } catch (error) {
            console.error('[Consolidation] LLM Check failed', error);
            return { action: 'KEEP' };
        }
    }

    /**
     * Save extracted memories to database with embeddings
     */
    async saveMemories(
        userId: string,
        conversationId: string,
        memories: ExtractedMemory[]
    ): Promise<void> {
        try {
            // Check for duplicates/conflicts in database first
            const uniqueMemories = await this.consolidateMemories(userId, memories);

            if (uniqueMemories.length === 0) {
                console.log('[Extraction] No new memories to save after consolidation');
                return;
            }

            // Create extraction log
            const extraction = await this.prisma.memoryExtraction.create({
                data: {
                    conversationId,
                    extractedBy: 'hybrid', // rule-based + LLM
                    confidence: this.calculateAverageConfidence(uniqueMemories)
                }
            });

            // Save each memory with embedding
            for (const memory of uniqueMemories) {
                const entry = await this.prisma.memoryEntry.create({
                    data: {
                        userId,
                        type: memory.type,
                        content: memory.content,
                        summary: memory.content.substring(0, 100), // First 100 chars
                        importanceScore: memory.importance,
                        sourceExtractionId: extraction.id
                    }
                });

                // Generate and store embedding
                const embedding = await this.embeddingService.embed(memory.content);
                await this.embeddingService.storeEmbedding(entry.id, embedding);

                // Save embedding reference in Prisma
                await this.prisma.memoryEmbedding.create({
                    data: {
                        memoryEntryId: entry.id,
                        vector: JSON.stringify(embedding),
                        modelName: 'nomic-embed-text'
                    }
                });

                // Check for semantic relations (Phase 7)
                try {
                    const { relationService } = await import('./RelationService');
                    await relationService.detectRelations(entry.id, memory.content);
                } catch (error) {
                    console.error('[Extraction] Relation detection failed:', error);
                }

                // Add tags
                for (const tagName of memory.tags) {
                    const tag = await this.prisma.memoryTag.upsert({
                        where: { name: tagName },
                        update: {},
                        create: { name: tagName }
                    });

                    // Link tag to memory
                    await this.prisma.memoryEntry.update({
                        where: { id: entry.id },
                        data: {
                            tags: {
                                connect: { id: tag.id }
                            }
                        }
                    });
                }
            }

            logger.info(`[Extraction] Saved ${uniqueMemories.length} memories for conversation ${conversationId}`);
        } catch (error) {
            logger.error('[Extraction] Failed to save memories:', error);
            throw error;
        }
    }

    /**
     * Calculate average confidence
     */
    private calculateAverageConfidence(memories: ExtractedMemory[]): number {
        if (memories.length === 0) return 0;
        const sum = memories.reduce((acc, m) => acc + m.confidence, 0);
        return sum / memories.length;
    }
}

// Singleton instance
export const extractionService = new ExtractionService();

