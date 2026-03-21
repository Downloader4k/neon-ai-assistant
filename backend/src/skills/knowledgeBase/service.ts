import fs from 'fs';
// @ts-ignore
const pdf = require('pdf-parse');
import { vectorStore } from './vectorStore';
import { ollamaService } from '../../services/ollama/OllamaService';
import { logger } from '../../utils/logger';


class KnowledgeBaseService {
    private readonly CHUNK_SIZE = 600; // Kleinere Chunks für präzisere Suche
    private readonly CHUNK_OVERLAP = 150; // Angepasster Overlap

    /**
     * Ingest a file (PDF or Text) into the vector store
     */
    async ingestFile(filePath: string, originalFilename: string, mimeType: string) {
        try {
            logger.info(`[KnowledgeBase] Ingesting file: ${originalFilename} (${mimeType})`);

            let text = '';

            if (mimeType === 'application/pdf') {
                const dataBuffer = fs.readFileSync(filePath);
                const data = await pdf(dataBuffer);
                text = data.text;
            } else {
                // Assume text/plain or markdown
                text = fs.readFileSync(filePath, 'utf-8');
            }

            if (!text || text.trim().length === 0) {
                throw new Error('File content is empty');
            }

            // 1. Chunk the text with enhanced splitter
            const chunks = this.splitText(text, originalFilename);
            logger.info(`[KnowledgeBase] Split into ${chunks.length} chunks`);

            // 2. Generate embeddings with improved metadata
            const embeddings: number[][] = [];
            const ids: string[] = [];
            const metadatas: any[] = [];
            const documents: string[] = [];

            for (let i = 0; i < chunks.length; i++) {
                const chunk = chunks[i];
                const embedding = await ollamaService.embed(chunk);

                embeddings.push(embedding);
                ids.push(`${originalFilename}_${i} `); // Simple ID verification
                metadatas.push({
                    source: originalFilename,
                    chunkIndex: i,
                    totalChunks: chunks.length,
                    timestamp: new Date().toISOString()
                });
                documents.push(chunk);
            }

            // 3. Store in Vector DB
            await vectorStore.addDocuments(ids, embeddings, metadatas, documents);
            logger.info(`[KnowledgeBase] Successfully indexed ${chunks.length} chunks from ${originalFilename} `);

            return { success: true, chunks: chunks.length };

        } catch (error) {
            logger.error('[KnowledgeBase] Error ingesting file', { error, file: originalFilename });
            throw error;
        }
    }

    /**
     * Query the knowledge base with enhanced retrieval
     */
    async query(queryText: string, nResults: number = 5) { // Erhöhte Standardanzahl
        try {
            logger.info(`[KnowledgeBase] Ursprüngliche Abfrage: "${queryText}"`);
            
            // Verbesserte Abfrage mit Relevanz-Boosts für bestimmte Themen
            let enhancedQuery = queryText;
            
            // Wenn nach Personen gefragt wird, verstärke Namen in der Abfrage
            const nameMatch = queryText.match(/wann wurde (.*?) geboren|wie alt ist (.*?)|wer ist (.*?)|über (.*?)|fakten (zu|über) (.*?)/i);
            if (nameMatch) {
                const name = (nameMatch[1] || nameMatch[2] || nameMatch[3] || nameMatch[4] || nameMatch[6] || "").trim();
                if (name && name.length > 2) {
                    enhancedQuery = `${queryText} ${name} ${name} ${name}`; // Boost Namen durch Wiederholung
                    logger.info(`[KnowledgeBase] Verbesserte Abfrage mit Namens-Boost: "${enhancedQuery}"`);
                }
            }
            
            // Präzisionsverbesserung für Datumsabfragen
            if (queryText.toLowerCase().match(/wann|datum|geboren|jahr|alter/i)) {
                enhancedQuery = `${enhancedQuery} datum exakt präzise`;
                logger.info(`[KnowledgeBase] Verbesserte Abfrage für Datumsinformation: "${enhancedQuery}"`);
            }
            
            // Generiere das Embedding
            const embedding = await ollamaService.embed(enhancedQuery);
            const results = await vectorStore.query(embedding, nResults);

            // Format results with better structure
            const simplifiedResults = results.documents[0].map((doc, index) => {
                const metadata = results.metadatas[0][index];
                // Extrahiere Quellennamen ohne .pdf und mit sauberen Leerzeichen
                const sourceTitle = metadata?.source ? String(metadata.source).replace('.pdf', '').replace(/_/g, ' ') : 'Unbekannt';
                
                return {
                    content: doc,
                    metadata: {
                        ...metadata,
                        sourceTitle // Füge bereinigten Titel hinzu
                    },
                    score: results.distances ? results.distances[0][index] : undefined
                };
            });
            
            // Sortiere nach Relevanz (niedrigere Distanz = höhere Relevanz)
            if (results.distances && results.distances[0]) {
                simplifiedResults.sort((a, b) => {
                    if (a.score === undefined || b.score === undefined) return 0;
                    return a.score - b.score;
                });
            }
            
            // Detailliertes Logging der Ergebnisse
            logger.info(`[KnowledgeBase] Gefunden: ${simplifiedResults.length} relevante Chunks`);
            simplifiedResults.forEach((result, idx) => {
                logger.info(`[KnowledgeBase] Ergebnis ${idx+1}: ${result.metadata.sourceTitle} (Score: ${result.score?.toFixed(4) || '?'}) - ${(result.content || '').substring(0, 50)}...`);
            });

            return simplifiedResults;
        } catch (error) {
            logger.error('[KnowledgeBase] Error querying', { error });
            return [];
        }
    }

    /**
     * List all documents
     */
    async listDocuments() {
        return await vectorStore.listDocuments();
    }

    /**
     * Delete a document
     */
    async deleteDocument(filename: string) {
        return await vectorStore.deleteDocument(filename);
    }

    /**
     * Enhanced text splitter with better segmentation and preprocessing
     */
    private splitText(text: string, filename: string = ""): string[] {
        // Vorverarbeitung: Doppelte Leerzeilen in einzelne Absätze umwandeln
        let processedText = text.replace(/\n{3,}/g, "\n\n");
        
        // Spezielle Vorverarbeitung für Wiki-Artikel: Überschriften hervorheben
        processedText = processedText.replace(/^(=+)\s*([^=]+?)\s*\1/gm, (_match, level, title) => {
            // Konvertiere Wiki-Headings in Markdown-Headings mit zusätzlichem Kontext
            const headingLevel = level.length; // Anzahl der = bestimmt Level
            const prefix = '#'.repeat(Math.min(headingLevel, 6));
            return `\n\n${prefix} ${title.trim()}\n\n`;
        });
        
        // Extrahiere Dokumententitel (ohne .pdf)
        const docTitle = filename.replace('.pdf', '').replace(/_/g, ' ');
        
        const chunks: string[] = [];
        let startIndex = 0;

        // Suche nach Überschriften für bessere Chunk-Grenzen
        const headingMatches = [...processedText.matchAll(/\n(#+\s+[^\n]+|\n[^\n]+\n-{3,})/g)];
        const headingPositions = headingMatches.map(m => m.index || 0);
        
        // Füge Start und Ende hinzu
        headingPositions.unshift(0);
        headingPositions.push(processedText.length);
        
        // Wenn wir Überschriften haben, nutze sie zur Segmentierung
        if (headingPositions.length > 2) {
            // Für jeden Abschnitt zwischen Überschriften
            for (let i = 0; i < headingPositions.length - 1; i++) {
                const sectionStart = headingPositions[i];
                const sectionEnd = headingPositions[i + 1];
                const section = processedText.substring(sectionStart, sectionEnd);
                
                // Wenn Abschnitt zu lang, teile ihn weiter auf
                if (section.length > this.CHUNK_SIZE) {
                    // Rekursive Teilung des Abschnitts
                    this.splitSectionIntoChunks(section, chunks);
                } else if (section.trim().length > 0) {
                    // Füge Kontext hinzu: Dokumenttitel + Abschnitt
                    const contextEnhancedSection = `[Dokument: ${docTitle}]\n${section}`;
                    chunks.push(contextEnhancedSection);
                }
            }
        } else {
            // Fallback auf Standard-Chunking, wenn keine Überschriften gefunden wurden
            while (startIndex < processedText.length) {
                let endIndex = startIndex + this.CHUNK_SIZE;

                // Natürliche Grenzen finden
                if (endIndex < processedText.length) {
                    // Priorisiert: Absatz, dann Satz, dann Leerzeichen
                    const lastParagraph = processedText.lastIndexOf("\n\n", endIndex);
                    if (lastParagraph > startIndex && lastParagraph > endIndex - this.CHUNK_OVERLAP) {
                        endIndex = lastParagraph;
                    } else {
                        const lastSentence = processedText.lastIndexOf(".", endIndex);
                        if (lastSentence > startIndex && lastSentence > endIndex - this.CHUNK_OVERLAP) {
                            endIndex = lastSentence + 1; // +1 um den Punkt einzuschließen
                        } else {
                            const lastSpace = processedText.lastIndexOf(" ", endIndex);
                            if (lastSpace > startIndex && lastSpace > endIndex - this.CHUNK_OVERLAP) {
                                endIndex = lastSpace;
                            }
                        }
                    }
                }

                let chunk = processedText.slice(startIndex, endIndex).trim();
                if (chunk.length > 0) {
                    // Füge Dokumentkontext hinzu
                    chunk = `[Dokument: ${docTitle}]\n${chunk}`;
                    chunks.push(chunk);
                }

                // Rücke Pointer vor
                startIndex = endIndex - this.CHUNK_OVERLAP;
                if (startIndex >= endIndex) startIndex = endIndex;
            }
        }

        return chunks;
    }
    
    /**
     * Hilfsmethode zum rekursiven Aufteilen großer Abschnitte
     */
    private splitSectionIntoChunks(section: string, chunks: string[]) {
        let startIndex = 0;
        
        while (startIndex < section.length) {
            let endIndex = startIndex + this.CHUNK_SIZE;

            if (endIndex < section.length) {
                // Versuche, bei Satzenden zu trennen
                const lastSentence = section.lastIndexOf(".", endIndex);
                if (lastSentence > startIndex && lastSentence > endIndex - this.CHUNK_OVERLAP) {
                    endIndex = lastSentence + 1; // +1 um den Punkt einzuschließen
                } else {
                    const lastSpace = section.lastIndexOf(" ", endIndex);
                    if (lastSpace > startIndex && lastSpace > endIndex - this.CHUNK_OVERLAP) {
                        endIndex = lastSpace;
                    }
                }
            }

            const chunk = section.slice(startIndex, endIndex).trim();
            if (chunk.length > 0) {
                chunks.push(chunk);
            }

            startIndex = endIndex - this.CHUNK_OVERLAP;
            if (startIndex >= endIndex) startIndex = endIndex;
        }
    }
}

export const knowledgeBaseService = new KnowledgeBaseService();
