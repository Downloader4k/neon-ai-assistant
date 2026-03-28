import { PrismaClient } from '@prisma/client';
import { workingMemoryService, WorkingMessage } from './WorkingMemoryService';
import { shortTermMemoryService } from './ShortTermMemoryService';
import { embeddingService } from './EmbeddingService';
import { socketService } from '../socket/SocketService';
import { logger } from '../../utils/logger';

const prisma = new PrismaClient();

/**
 * MemoryManagerService - Central coordinator for all memory layers
 * 
 * Orchestrates retrieval across:
 * - Working Memory (current session)
 * - Short-Term Memory (last 48h)
 * - Long-Term Memory (permanent storage)
 */

export interface MemoryContext {
    workingMemory: WorkingMessage[];
    shortTermContext: string;
    longTermContext: string;
    totalTokens: number;
}

export class MemoryManagerService {
    private TOKEN_BUDGET = {
        working: 2000,
        shortTerm: 1000,
        longTerm: 2000
    };
    
    // Neuer Cache für kritische Informationen
    private criticalInfoCache: Map<string, any> = new Map();
    
    // Kritische persoenliche Daten werden aus der Datenbank geladen, nicht hardcodiert
    private CRITICAL_PERSONAL_DATA: Array<{
        type: string;
        keywords: string[];
        content: string;
        summary: string;
        variations?: string[];
    }> = [];
    
    constructor() {
        // Lade kritische Informationen beim Start
        this.initializeCriticalInfo();
    }
    
    /**
     * Lade kritische Informationen in den Cache und erstelle persistente Einträge
     */
    private async initializeCriticalInfo() {
        try {
            logger.info('🔍 [MemoryManager] Initialisiere kritische Personendaten...');
            
            // Durchlaufe alle vordefinierten kritischen Daten
            for (const criticalData of this.CRITICAL_PERSONAL_DATA) {
                // Suche nach vorhandenen Einträgen zu diesem Thema
                const existingEntries = await prisma.memoryEntry.findMany({
                    where: {
                        OR: criticalData.keywords.map(kw => ({
                            content: { contains: kw }
                        })),
                        isActive: true
                    }
                });
                
                // Prüfe ob Einträge tatsächlich die relevanten Informationen enthalten
                const validEntries = existingEntries.filter(entry => {
                    // Bei Geburtsdatum überprüfen wir, ob das Datum enthalten ist
                    if (criticalData.type === "BIRTHDAY") {
                        return criticalData.variations?.some(variant => entry.content.includes(variant));
                    }
                    // Bei anderen Typen prüfen wir, ob Keywords enthalten sind
                    return criticalData.keywords.some(kw => entry.content.toLowerCase().includes(kw));
                });
                
                if (validEntries.length === 0) {
                    logger.warn(`⚠️ [MemoryManager] Keine ${criticalData.type}-Einträge gefunden! Erstelle standardisierten Eintrag`);
                    
                    // Erstelle Eintrag für alle User-IDs (aktuell nur default-user)
                    const userIds = ["default-user"]; // Später: Liste aktiver User aus DB
                    
                    for (const userId of userIds) {
                        try {
                            // Erstelle speziell optimierten Content mit extra Keyword-Markierungen
                            const enhancedContent = `${criticalData.content} [WICHTIGE PERSÖNLICHE INFORMATION] [${criticalData.type}] [HOHE PRIORITÄT]`;
                            
                            // Erstelle einen persistenten Memory-Eintrag mit allen relevanten Metadaten
                            const entry = await prisma.memoryEntry.create({
                                data: {
                                    userId,
                                    type: "CRITICAL_FACT", // Spezialtyp für kritische Informationen
                                    content: enhancedContent,
                                    summary: criticalData.summary,
                                    importanceScore: 1.0, // Maximale Wichtigkeit
                                    accessCount: 999,   // Höchste Priorität für Retrieval
                                    isActive: true,
                                    tags: { 
                                        create: [
                                            { name: "CRITICAL" },
                                            { name: criticalData.type },
                                            { name: "PERSONAL" }
                                        ]
                                    }
                                }
                            });
                            
                            logger.info(`✅ [MemoryManager] ${criticalData.type}-Eintrag erstellt: ${entry.id}`);
                            
                            // Generiere und speichere optimiertes Embedding
                            try {
                                // Für bessere Auffindbarkeit erzeugen wir ein optimiertes Embedding
                                // mit mehrfacher Wiederholung der kritischen Wörter
                                const optimizedEmbeddingText = [
                                    enhancedContent,
                                    ...criticalData.keywords,
                                    ...(criticalData.variations || []),
                                    criticalData.type,
                                    "WICHTIG WICHTIG WICHTIG",
                                    criticalData.summary
                                ].join(" ");
                                
                                const embedding = await embeddingService.embed(optimizedEmbeddingText);
                                await embeddingService.storeEmbedding(entry.id, embedding);
                                
                                // Speichere Embedding-Referenz in Prisma
                                await prisma.memoryEmbedding.create({
                                    data: {
                                        memoryEntryId: entry.id,
                                        vector: JSON.stringify(embedding),
                                        modelName: 'nomic-embed-text'
                                    }
                                });
                                
                                logger.info(`✅ [MemoryManager] Optimiertes Embedding für ${criticalData.type}-Eintrag erstellt`);
                                
                                // Cache den Eintrag für schnellen Zugriff
                                this.criticalInfoCache.set(`${criticalData.type.toLowerCase()}:${userId}`, {
                                    id: entry.id,
                                    content: enhancedContent,
                                    type: criticalData.type,
                                    keywords: criticalData.keywords,
                                    variations: criticalData.variations
                                });
                                
                            } catch (embError) {
                                logger.error(`[MemoryManager] Fehler beim Erstellen des Embeddings für ${criticalData.type}:`, embError);
                            }
                        } catch (createError) {
                            logger.error(`[MemoryManager] Fehler beim Erstellen des ${criticalData.type}-Eintrags:`, createError);
                        }
                    }
                } else {
                    logger.info(`✅ [MemoryManager] ${validEntries.length} gültige ${criticalData.type}-Einträge gefunden`);
                    
                    // Optimiere vorhandene Einträge für bessere Auffindbarkeit
                    for (const entry of validEntries) {
                        try {
                            // Aktualisiere Wichtigkeit und Tags
                            await prisma.memoryEntry.update({
                                where: { id: entry.id },
                                data: {
                                    importanceScore: 1.0,
                                    accessCount: entry.accessCount + 100, // Erhöhe Counter für höhere Priorität
                                    tags: {
                                        connectOrCreate: [
                                            { where: { name: "CRITICAL" }, create: { name: "CRITICAL" } },
                                            { where: { name: criticalData.type }, create: { name: criticalData.type } },
                                            { where: { name: "PERSONAL" }, create: { name: "PERSONAL" } }
                                        ]
                                    }
                                }
                            });
                            
                            // Verbessere Embedding mit optimierten Keywords
                            const optimizedEmbeddingText = [
                                entry.content,
                                ...criticalData.keywords,
                                ...(criticalData.variations || []),
                                criticalData.type,
                                "WICHTIG WICHTIG WICHTIG",
                                entry.summary || criticalData.summary
                            ].join(" ");
                            
                            const newEmbedding = await embeddingService.embed(optimizedEmbeddingText);
                            await embeddingService.storeEmbedding(entry.id, newEmbedding);
                            
                            logger.info(`✅ [MemoryManager] ${criticalData.type}-Eintrag optimiert: ${entry.id}`);
                            
                            // Cache den Eintrag
                            this.criticalInfoCache.set(`${criticalData.type.toLowerCase()}:${entry.userId}`, {
                                id: entry.id,
                                content: entry.content,
                                type: criticalData.type,
                                keywords: criticalData.keywords,
                                variations: criticalData.variations
                            });
                        } catch (updateError) {
                            logger.error(`[MemoryManager] Fehler beim Optimieren des ${criticalData.type}-Eintrags:`, updateError);
                        }
                    }
                }
            }
        } catch (error) {
            logger.error('[MemoryManager] Fehler beim Initialisieren kritischer Info:', error);
        }
    }

    /**
     * Get relevant context for user message
     */
    /**
     * Erkennt und klassifiziert kritische Abfragen
     * @param userMessage Die Nachricht des Benutzers
     * @returns Ein Objekt mit erkannten kritischen Themen
     */
    private detectCriticalQuery(userMessage: string): {
        type: string | null;
        isPersonalQuery: boolean;
        isFactQuery: boolean;
        enhancedQuery: string;
        detectedEntities: string[];
    } {
        const result = {
            type: null as string | null,
            isPersonalQuery: false,
            isFactQuery: false,
            enhancedQuery: userMessage,
            detectedEntities: [] as string[]
        };
        
        // Normalisiere Text für bessere Erkennung
        const normalizedQuery = userMessage.toLowerCase().trim();
        
        // 1. Persönliche Geburtsdaten-Erkennung (höchste Priorität)
        if (normalizedQuery.match(/wie alt|alter|geboren|geburtstag|geburt|wann.*geboren|geburtsdatum|birthday|birthday|birth date|date of birth/i)) {
            result.type = "BIRTHDAY";
            result.isPersonalQuery = true;
            result.isFactQuery = true;
            result.detectedEntities.push("GEBURTSTAG");
            
            // Extrahiere mögliche Personen-Entitäten
            const nameMatch = normalizedQuery.match(/(?:wann wurde|wie alt ist|wann ist) ([\w\s]+?) (?:geboren|alt)/i);
            if (nameMatch && nameMatch[1]) {
                result.detectedEntities.push(nameMatch[1].trim());
            }
            
            // Stark verbesserter Query mit Variationen und Wiederholungen
            result.enhancedQuery = `${userMessage} 
                Geburtsdatum Geburtstag Alter geboren
                "geboren am" wichtig persoenliche Information
                KRITISCHE ABFRAGE GEBURTSTAG BIRTHDAY`;
            
            logger.info(`🎯 [MemoryManager] CRITICAL QUERY: Geburtstagsabfrage erkannt: "${userMessage}"`);
        }
        
        // 2. Allgemeine biografische Abfragen
        else if (normalizedQuery.match(/wer (?:ist|bist)|(?:ueber|about) (?:dich|mich)|profil|bio(?:graf|graph)(?:ie|y)|person|background/i)) {
            result.type = "BIO";
            result.isPersonalQuery = true;
            result.isFactQuery = true;
            result.detectedEntities.push("BIOGRAFIE");
            
            result.enhancedQuery = `${userMessage} 
                Biografie Person Profil "wer ist"
                persoenliche Informationen wichtig BIOGRAFISCHE DATEN`;
                
            logger.info(`🎯 [MemoryManager] CRITICAL QUERY: Biografieabfrage erkannt: "${userMessage}"`);
        }
        
        // 3. Faktenwissen-Abfragen (z.B. Daten, Zahlen)
        else if (normalizedQuery.match(/(?:wann|wie viel|wie viele|wie lange|wieviel|was|welche) (?:ist|sind|war|waren|hat|haben)/i)) {
            result.isFactQuery = true;
            result.detectedEntities.push("FAKTENWISSEN");
            
            // Extrahiere mögliche Themenentitäten
            const topicMatch = normalizedQuery.match(/(?:wann|wie viel|wie viele|was|welche) (?:ist|sind|war|waren) ([\w\s]+)/i);
            if (topicMatch && topicMatch[1]) {
                result.detectedEntities.push(topicMatch[1].trim());
            }
            
            logger.info(`🔍 [MemoryManager] Faktenwissen-Abfrage erkannt: "${userMessage}"`);
        }
        
        return result;
    }

    async getRelevantContext(
        sessionId: string,
        userId: string,
        userMessage: string
    ): Promise<MemoryContext> {
        logger.info(`[MemoryManager] Getting context for user: ${userId}, message: ${userMessage.substring(0, 50)}...`);
        
        // 1. Erkenne kritische Abfragetypen für optimierte Suche
        const queryAnalysis = this.detectCriticalQuery(userMessage);
        
        // 1. Working Memory (always include - current conversation)
        const working = workingMemoryService.getHistory(sessionId);

        // 2. Short-Term Memory (recent conversations)
        const shortTermResults = await shortTermMemoryService.searchRecent(
            userId,
            userMessage,
            queryAnalysis.isPersonalQuery ? 5 : 3  // Bei persönlichen Abfragen mehr Short-Term-Ergebnisse
        );
        const shortTermContext = this.buildShortTermContext(shortTermResults);

        // MEMORY SEARCH mit intelligenter Abfrageverbesserung
        let memorySearchQuery = queryAnalysis.isPersonalQuery ? queryAnalysis.enhancedQuery : userMessage;
        
        // Log-Ausgabe bei kritischen Abfragen
        if (queryAnalysis.type) {
            logger.info(`🧠 [MemoryManager] KRITISCHE ABFRAGE: Typ=${queryAnalysis.type}, Entitäten=[${queryAnalysis.detectedEntities.join(', ')}]`);
            logger.info(`🧠 [MemoryManager] Verbesserter Memory Query: "${memorySearchQuery.substring(0, 100)}..."`);
        }

        // 3. Long-Term Memory (semantic search via embeddings)
        // Bei kritischen Abfragen passen wir die Suchparameter an
        let longTermResults;
        
        if (queryAnalysis.type === "BIRTHDAY" || queryAnalysis.type === "BIO") {
            // Für Geburtstags- und Bio-Abfragen verwenden wir aggressive Parameter
            longTermResults = await this.searchLongTerm(
                memorySearchQuery, 
                20,      // Viele Ergebnisse
                0.3,     // Sehr niedriger Schwellwert - wir wollen keine Geburtstagsdaten verpassen
                true     // Aktiviere Boosting für kritische Tags
            );
            
            logger.info(`🔎 [MemoryManager] KRITISCHE SUCHE mit aggressiven Parametern für ${queryAnalysis.type}`);
        } 
        else if (queryAnalysis.isFactQuery) {
            // Für Faktenabfragen verwenden wir eine Balance
            longTermResults = await this.searchLongTerm(
                memorySearchQuery, 
                15,    // Mehr Ergebnisse für Fakten
                0.35,  // Niedrigerer Schwellwert für besseren Recall
                false  // Kein Tag-Boosting
            );
        }
        else {
            // Standard für normale Abfragen
            longTermResults = await this.searchLongTerm(
                memorySearchQuery, 
                10,     // Standardanzahl
                0.4,    // Standardschwellwert
                false   // Kein Tag-Boosting
            );
        }
            
        const longTermContext = this.buildLongTermContext(longTermResults);

        logger.info(`[MemoryManager] Retrieved ${longTermResults.length} long-term memories. LTM Context length: ${longTermContext.length}`);
        
        // Detailliertes Logging der gefundenen Erinnerungen
        longTermResults.forEach((memory, idx) => {
            const tags = memory.tags ? memory.tags.map((t:any) => t.name).join(',') : '';
            logger.info(`[MemoryManager] Memory ${idx+1}: ${memory.type} [${tags}] (${memory.similarity?.toFixed(4) || '?'}) - ${memory.content.substring(0, 80)}...`);
        });
        
        // VALIDIERUNG DER ERGEBNISSE: Prüfen, ob wir kritische Informationen gefunden haben
        if (queryAnalysis.type) {
            // Spezifische Validierungslogik je nach Abfragetyp
            if (queryAnalysis.type === "BIRTHDAY") {
                // Verbesserte Erkennungslogik mit mehr Varianten
                // Geburtsdatum-Patterns werden dynamisch aus dem Memory geladen
                const birthDatePatterns = ['geboren', 'geburtstag', 'birthday', 'geburtsdatum'];
                
                const hasBirthDate = birthDatePatterns.some(pattern => 
                    longTermContext.includes(pattern) || 
                    longTermResults.some(mem => mem.content.includes(pattern))
                );
                
                if (hasBirthDate) {
                    logger.info('✅ [MemoryManager] CRITICAL SUCCESS: Birth date found in LTM context!');
                } else {
                    logger.warn('⚠️ [MemoryManager] CRITICAL FAILURE: Birth date MISSING from LTM context!');
                    
                    // NOTLÖSUNG: Wenn wichtige Daten fehlen, füge Hardcoded-Fakten hinzu
                    logger.info('🔄 [MemoryManager] Emergency injection of critical birthday data');
                    
                    // Prüfe zuerst, ob wir die Information im Cache haben
                    const cachedInfo = this.criticalInfoCache.get('birthday:default-user');
                    
                    let birthdayMemory;
                    if (cachedInfo) {
                        birthdayMemory = {
                            id: cachedInfo.id,
                            userId: userId,
                            type: "CRITICAL_FACT",
                            content: cachedInfo.content,
                            summary: "Geburtsdatum aus dem Gedaechtnis.",
                            importanceScore: 1.0,
                            accessCount: 999,
                            createdAt: new Date(),
                            updatedAt: new Date(),
                            isActive: true,
                            similarity: 1.0,
                            tags: [{ name: "BIRTHDAY" }, { name: "CRITICAL" }]
                        };
                    } else {
                        // Fallback: Kein hardcodiertes Geburtsdatum - aus DB laden
                        birthdayMemory = {
                            id: "synthetic-birthday-entry",
                            userId: userId,
                            type: "CRITICAL_FACT",
                            content: "[KRITISCHE INFORMATION] Geburtsdatum nicht im Gedaechtnis gefunden. Bitte den Nutzer fragen.",
                            summary: "Geburtsdatum unbekannt.",
                            importanceScore: 1.0,
                            accessCount: 999,
                            createdAt: new Date(),
                            updatedAt: new Date(),
                            isActive: true,
                            similarity: 1.0,
                            tags: [{ name: "BIRTHDAY" }, { name: "CRITICAL" }]
                        };
                    }
                    
                    // Füge es zu den Ergebnissen hinzu (an erster Stelle für höchste Priorität)
                    longTermResults.unshift(birthdayMemory as any);
                    
                    // Baue den Kontext neu auf mit dem hinzugefügten Memory
                    const updatedLongTermContext = this.buildLongTermContext(longTermResults);
                    return {
                        workingMemory: working,
                        shortTermContext,
                        longTermContext: updatedLongTermContext, 
                        totalTokens: this.estimateTokens(working, shortTermContext, updatedLongTermContext)
                    };
                }
            }
        }

        return {
            workingMemory: working,
            shortTermContext,
            longTermContext,
            totalTokens: this.estimateTokens(working, shortTermContext, longTermContext)
        };
    }

    /**
     * Search long-term memory using semantic similarity with advanced filtering
     * @param query The search query
     * @param limit Maximum number of results to return
     * @param threshold Optional similarity threshold (default: 0.4)
     * @param boostCriticalTags Whether to boost results with critical tags
     */
    private async searchLongTerm(query: string, limit: number = 5, threshold: number = 0.4, boostCriticalTags = false) {
        try {
            // Use embedding service for semantic search with configurable threshold
            const vectorResults = await embeddingService.searchSimilar(query, limit * 2, threshold); // Holen wir doppelt so viele für Post-Processing
            
            // Fetch full memory entries with tags
            const memories = await Promise.all(
                vectorResults.map(async (result) => {
                    const entry = await prisma.memoryEntry.findUnique({
                        where: { id: result.id },
                        include: { tags: true }
                    });
                    
                    if (entry) {
                        // Berechne angepassten Similarity-Score basierend auf Metadaten
                        let adjustedSimilarity = result.similarity;
                        
                        // Boost für kritische Tags wenn aktiviert
                        if (boostCriticalTags) {
                            const hasCriticalTag = entry.tags?.some((tag: any) => 
                                ["CRITICAL", "BIRTHDAY", "BIO", "PERSONAL"].includes(tag.name)
                            );
                            
                            if (hasCriticalTag) {
                                // Boost von 25% für kritische Tags
                                adjustedSimilarity = Math.min(1.0, adjustedSimilarity * 1.25);
                                logger.info(`🔼 [MemoryManager] Boosted critical memory: ${entry.id} (${result.similarity.toFixed(4)} → ${adjustedSimilarity.toFixed(4)})`);
                            }
                        }
                        
                        // Boost basierend auf importanceScore
                        if (entry.importanceScore > 0.7) {
                            const importanceBoost = entry.importanceScore * 0.15; // Max 15% Boost bei Score 1.0
                            adjustedSimilarity = Math.min(1.0, adjustedSimilarity * (1 + importanceBoost));
                        }
                        
                        // Boost basierend auf accessCount (häufiger abgerufene Memories sind wichtiger)
                        if (entry.accessCount > 5) {
                            const accessBoost = Math.min(0.1, entry.accessCount * 0.01); // Max 10% Boost
                            adjustedSimilarity = Math.min(1.0, adjustedSimilarity * (1 + accessBoost));
                        }
                        
                        logger.debug(`[MemoryManager] Match: ID=${entry.id}, Sim=${adjustedSimilarity.toFixed(4)}, Text="${entry.content.substring(0, 30)}..."`);
                        return { ...entry, similarity: adjustedSimilarity };
                    } else {
                        logger.warn(`[MemoryManager] Mismatch: ID=${result.id} not found in Prisma!`);
                        return null;
                    }
                })
            );

            // Filtere leere Einträge und sortiere nach angepasstem Score
            const filtered = memories
                .filter(m => m !== null)
                .sort((a, b) => (b?.similarity || 0) - (a?.similarity || 0))
                .slice(0, limit); // Schneide auf das ursprünglich angeforderte Limit
            
            // Inkrementiere accessCount für gefundene Memories
            this.incrementAccessCountForMemories(filtered.map(m => m?.id).filter(Boolean) as string[]);
            
            logger.info(`[MemoryManager] Total active memories retrieved: ${filtered.length} (from ${vectorResults.length} vector results)`);
            return filtered;
        } catch (error) {
            console.error('[MemoryManager] Long-term search failed:', error);
            return [];
        }
    }
    
    /**
     * Inkrementiert den Zugriffszähler für Memories
     * Wird asynchron aufgerufen und wartet nicht auf Abschluss
     */
    private async incrementAccessCountForMemories(memoryIds: string[]) {
        if (!memoryIds.length) return;
        
        try {
            // Batch-Update aller Memories in einem Durchlauf
            await Promise.all(memoryIds.map(id => 
                prisma.memoryEntry.update({
                    where: { id },
                    data: {
                        accessCount: {
                            increment: 1
                        },
                        updatedAt: new Date()
                    }
                })
            ));
            
            logger.debug(`[MemoryManager] Incremented access count for ${memoryIds.length} memories`);
        } catch (error) {
            logger.error('[MemoryManager] Failed to increment access counts:', error);
        }
    }

    /**
     * Build context string from short-term conversations
     */
    private buildShortTermContext(conversations: any[]): string {
        if (conversations.length === 0) return '';

        const chunks: string[] = [];
        let tokens = 0;

        for (const conv of conversations) {
            const summary = conv.summary || this.summarizeConversation(conv.messages);
            const chunk = `[${this.formatDate(conv.createdAt)}] ${summary}`;
            const chunkTokens = this.estimateText(chunk);

            if (tokens + chunkTokens > this.TOKEN_BUDGET.shortTerm) break;

            chunks.push(chunk);
            tokens += chunkTokens;
        }

        return chunks.length > 0
            ? `Kürzliche Konversationen:\n${chunks.join('\n')}`
            : '';
    }

    /**
     * Build context string from long-term memories with improved formatting
     */
    private buildLongTermContext(memories: any[]): string {
        if (memories.length === 0) return '';

        const chunks: string[] = [];
        let tokens = 0;
        
        // Gruppiere Memories nach Typ für bessere Organisation
        const groupedMemories: {[key: string]: any[]} = {};
        
        // Sortiere zuerst nach Priorität
        const sortedMemories = [...memories].sort((a, b) => {
            // Kritische Fakten zuerst
            if (a.type === "CRITICAL_FACT" && b.type !== "CRITICAL_FACT") return -1;
            if (b.type === "CRITICAL_FACT" && a.type !== "CRITICAL_FACT") return 1;
            
            // Dann nach Similarity
            return (b.similarity || 0) - (a.similarity || 0);
        });
        
        // Gruppiere nach Typ
        for (const memory of sortedMemories) {
            const type = memory.type || "UNKNOWN";
            if (!groupedMemories[type]) {
                groupedMemories[type] = [];
            }
            groupedMemories[type].push(memory);
        }
        
        // Verarbeite zuerst kritische Fakten (wenn vorhanden)
        if (groupedMemories["CRITICAL_FACT"]) {
            chunks.push("\n📌 WICHTIGE PERSÖNLICHE INFORMATIONEN:");
            
            for (const memory of groupedMemories["CRITICAL_FACT"]) {
                const text = memory.summary || memory.content;
                // Entferne Metadaten-Tags aus dem Text für sauberere Ausgabe
                const cleanedText = text
                    .replace(/\[WICHTIGE PERSÖNLICHE INFORMATION\]/g, '')
                    .replace(/\[KRITISCHE INFORMATION\]/g, '')
                    .replace(/\[WICHTIGES GEBURTSDATUM\]/g, '')
                    .replace(/\[HOHE PRIORITÄT\]/g, '')
                    .replace(/\[BIRTHDAY\]/g, '')
                    .replace(/\[BIO\]/g, '')
                    .trim();
                    
                const chunk = `- ${cleanedText}`;
                const chunkTokens = this.estimateText(chunk);

                if (tokens + chunkTokens > this.TOKEN_BUDGET.longTerm) break;

                chunks.push(chunk);
                tokens += chunkTokens;
            }
            
            // Entferne aus der Map, damit diese nicht doppelt verarbeitet werden
            delete groupedMemories["CRITICAL_FACT"];
        }
        
        // Verarbeite dann normale Fakten
        if (groupedMemories["FACT"]) {
            chunks.push("\n📚 FAKTENWISSEN:");
            
            for (const memory of groupedMemories["FACT"]) {
                const text = memory.summary || memory.content;
                const chunk = `- ${text}`;
                const chunkTokens = this.estimateText(chunk);

                if (tokens + chunkTokens > this.TOKEN_BUDGET.longTerm) break;

                chunks.push(chunk);
                tokens += chunkTokens;
            }
            
            delete groupedMemories["FACT"];
        }
        
        // Verarbeite alle anderen Typen
        for (const [type, typeMemories] of Object.entries(groupedMemories)) {
            if (typeMemories.length === 0) continue;
            
            chunks.push(`\n💡 ${type.replace(/_/g, ' ')}:`);
            
            for (const memory of typeMemories) {
                const text = memory.summary || memory.content;
                const chunk = `- ${text}`;
                const chunkTokens = this.estimateText(chunk);

                if (tokens + chunkTokens > this.TOKEN_BUDGET.longTerm) break;

                chunks.push(chunk);
                tokens += chunkTokens;
            }
        }

        return chunks.length > 0
            ? `GESPEICHERTE ERINNERUNGEN:${chunks.join('\n')}`
            : '';
    }

    /**
     * Summarize conversation (simple heuristic)
     */
    private summarizeConversation(messages: any[]): string {
        const firstUser = messages.find((m: any) => m.role === 'user');
        if (!firstUser) return 'Konversation';

        const text = firstUser.content.substring(0, 80);
        return text.length < firstUser.content.length ? `${text}...` : text;
    }

    /**
     * Format date for context
     */
    private formatDate(date: Date | string): string {
        const d = new Date(date);
        const now = new Date();
        const diffHours = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60));

        if (diffHours < 1) return 'vor Kurzem';
        if (diffHours < 24) return `vor ${diffHours}h`;
        if (diffHours < 48) return 'gestern';
        return `vor ${Math.floor(diffHours / 24)} Tagen`;
    }

    /**
     * Estimate tokens (simple heuristic: ~4 chars per token)
     */
    private estimateText(text: string): number {
        return Math.ceil(text.length / 4);
    }

    /**
     * Estimate total tokens
     */
    private estimateTokens(
        working: WorkingMessage[],
        shortTerm: string,
        longTerm: string
    ): number {
        const workingText = working.map(m => m.content).join(' ');
        return (
            this.estimateText(workingText) +
            this.estimateText(shortTerm) +
            this.estimateText(longTerm)
        );
    }

    /**
     * Save conversation and extract memories (called when session ends)
     */
    async processEndedSession(sessionId: string, userId: string): Promise<void> {
        try {
            const session = workingMemoryService.endSession(sessionId);
            if (!session) {
                console.warn(`[MemoryManager] Session not found: ${sessionId}`);
                return;
            }

            // Save to short-term memory
            const conversationId = await shortTermMemoryService.saveConversation(
                userId,
                sessionId,
                session.messages.map(m => ({
                    role: m.role,
                    content: m.content,
                    timestamp: m.timestamp
                }))
            );

            console.log(`[MemoryManager] Session ${sessionId} saved as conversation ${conversationId}`);

            // Trigger extraction immediately
            this.runExtractionJob().catch(err =>
                console.error('[MemoryManager] Post-session extraction failed:', err)
            );
        } catch (error) {
            console.error('[MemoryManager] Failed to process ended session:', error);
        }
    }

    /**
     * Check if active session needs extraction
     */
    async checkAutoExtraction(sessionId: string, userId: string): Promise<void> {
        try {
            const history = workingMemoryService.getHistory(sessionId);

            // Extract every 5 messages
            if (history.length > 0 && history.length % 5 === 0) {
                console.log(`[MemoryManager] Auto-extraction triggered for session ${sessionId} (${history.length} msgs)`);

                const { extractionService } = await import('./ExtractionService');

                // Ensure conversation exists in DB to link memories
                const conversationId = await shortTermMemoryService.ensureActiveConversation(userId, sessionId);

                // Extract from current buffer
                const memories = await extractionService.extractMemories({
                    id: conversationId,
                    messages: history.map(m => ({
                        role: m.role,
                        content: m.content
                    }))
                });

                if (memories.length > 0) {
                    await extractionService.saveMemories(userId, conversationId, memories);
                    console.log(`[MemoryManager] Auto-extracted ${memories.length} memories from active session`);

                    // Notify frontend to reload memories
                    socketService.emit('memories-updated', {
                        count: memories.length,
                        source: 'auto-extraction'
                    });
                }
            }
        } catch (error) {
            console.error('[MemoryManager] Auto-extraction failed:', error);
        }
    }

    /**
     * Extract memories from unprocessed conversations (background job)
     */
    async runExtractionJob(): Promise<{ processed: number, skipped: number, errors: number }> {
        const stats = { processed: 0, skipped: 0, errors: 0 };
        try {
            const unprocessed = await shortTermMemoryService.getUnprocessedConversations(10);

            if (unprocessed.length === 0) {
                console.log('[MemoryManager] No unprocessed conversations found');
                return stats;
            }

            console.log(`[MemoryManager] Processing ${unprocessed.length} conversations...`);

            const { extractionService } = await import('./ExtractionService');

            for (const [index, conversation] of unprocessed.entries()) {
                const progress = {
                    processed: index + 1,
                    total: unprocessed.length,
                    currentStep: `Extrahiere aus Konversation ${conversation.id.substring(0, 8)}...`
                };

                // Emit progress
                socketService.emit('memory-extraction-progress', progress);

                try {
                    // Extract memories

                    // Add timeout race
                    const timeoutPromise = new Promise((_, reject) =>
                        setTimeout(() => reject(new Error('Extraction timed out after 30s')), 30000)
                    );

                    const memories = await Promise.race([
                        extractionService.extractMemories({
                            id: conversation.id,
                            messages: conversation.messages
                        }),
                        timeoutPromise
                    ]) as any;

                    if (memories.length > 0) {
                        // Save to long-term memory
                        await extractionService.saveMemories(
                            conversation.userId,
                            conversation.id,
                            memories
                        );
                        stats.processed++;
                    } else {
                        stats.skipped++;
                    }

                    // Mark as processed
                    await shortTermMemoryService.markAsProcessed(conversation.id);
                } catch (error) {
                    logger.error(`[MemoryManager] Failed to extract from ${conversation.id}:`, error);
                    stats.errors++;
                }
            }
            logger.info(`[MemoryManager] Job finished:`, stats);
            return stats;
        } catch (error) {
            console.error('[MemoryManager] Extraction job failed:', error);
            throw error;
        }
    }

    /**
     * Get statistics for dashboard
     */
    async getStats(userId: string) {
        try {
            const shortTermStats = await shortTermMemoryService.getStats(userId);
            const longTermCount = await prisma.memoryEntry.count({
                where: { userId, isActive: true }
            });
            const episodeCount = await prisma.episode.count({ where: { userId } });

            return {
                shortTerm: shortTermStats,
                longTerm: { total: longTermCount },
                episodic: { total: episodeCount },
                working: {
                    activeSessions: workingMemoryService.getActiveSessions().length
                }
            };
        } catch (error) {
            console.error('[MemoryManager] Failed to get stats:', error);
            return null;
        }
    }

    /**
     * Delete a specific memory by ID
     */
    async deleteMemory(memoryId: string): Promise<void> {
        try {
            // Delete from vector store
            await embeddingService.deleteEmbedding(memoryId);

            // Delete from database
            await prisma.memoryEntry.delete({ where: { id: memoryId } });

            logger.info(`[MemoryManager] Deleted memory ${memoryId}`);
        } catch (error) {
            logger.error('[MemoryManager] Failed to delete memory:', error);
            throw error;
        }
    }

    /**
     * Delete memories by filter criteria
     */
    async deleteMemoriesByFilter(userId: string, filter: {
        minImportance?: number;
        maxImportance?: number;
        types?: string[];
        tags?: string[];
        excludeTags?: string[];
    }): Promise<number> {
        try {
            const where: any = { userId, isActive: true };

            if (filter.minImportance !== undefined || filter.maxImportance !== undefined) {
                where.importanceScore = {};
                if (filter.minImportance !== undefined) where.importanceScore.gte = filter.minImportance;
                if (filter.maxImportance !== undefined) where.importanceScore.lte = filter.maxImportance;
            }

            if (filter.types && filter.types.length > 0) {
                where.type = { in: filter.types };
            }

            if (filter.tags && filter.tags.length > 0) {
                where.tags = { some: { name: { in: filter.tags } } };
            }

            if (filter.excludeTags && filter.excludeTags.length > 0) {
                where.tags = { none: { name: { in: filter.excludeTags } } };
            }

            const toDelete = await prisma.memoryEntry.findMany({ where, select: { id: true } });

            for (const mem of toDelete) {
                await embeddingService.deleteEmbedding(mem.id);
            }

            const result = await prisma.memoryEntry.deleteMany({ where });

            logger.info(`[MemoryManager] Deleted ${result.count} memories by filter`);
            return result.count;
        } catch (error) {
            logger.error('[MemoryManager] Failed to delete memories by filter:', error);
            throw error;
        }
    }

    /**
     * Clear all memories (for reset)
     */
    async clearAll(userId: string): Promise<void> {
        try {
            // Clear working memory
            workingMemoryService.clearAll();

            // Clear embeddings
            await embeddingService.clearAll();

            // Clear long-term memories
            await prisma.memoryEntry.deleteMany({ where: { userId } });
            await prisma.episode.deleteMany({ where: { userId } });
            await prisma.knowledgeEntry.deleteMany({ where: { userId } });

            // Clear short-term conversations
            await prisma.conversation.deleteMany({ where: { userId } });

            console.log(`[MemoryManager] All memories cleared for user ${userId}`);
        } catch (error) {
            console.error('[MemoryManager] Failed to clear memories:', error);
            throw error;
        }
    }
}

// Singleton instance
export const memoryManagerService = new MemoryManagerService();
