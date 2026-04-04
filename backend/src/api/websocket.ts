import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server as HTTPServer } from 'http';
import { aiRouter, AIProvider } from '../services/router/AIRouter';
import { ClaudeContent } from '../services/claude/ClaudeService';
import {
    createConversation,
    createMessage,
    getConversation,
    getConversationHistory,
    getUserConversations,
    updateConversation,
    deleteConversation,
} from '../services/db/conversationService';
import { semanticSearchService } from '../services/search/SemanticSearchService';
import { learningService } from '../services/learning/LearningService';
import { logger } from '../utils/logger';
import { responseGuardrails } from '../services/guardrails/ResponseGuardrails';
import { skillProcessor } from '../services/skills/SkillProcessor';
// import { MessageRole } from '@prisma/client';
// type MessageRole = 'system' | 'user' | 'assistant' | 'function';

export interface ClientToServerEvents {
    'user-message': (data: {
        message: string;
        attachments?: Array<{ type: 'image' | 'file'; content: string; mimeType: string; name: string }>;
        conversationId?: string;
        userId: string;
        forceProvider?: AIProvider;
        isLearning?: boolean;
    }) => void;
    'get-conversations': (data: { userId: string }) => void;
    'get-conversation': (data: { conversationId: string }) => void;
    'delete-conversation': (data: { conversationId: string }) => void;
    'rename-conversation': (data: { conversationId: string; title: string }) => void;
    'typing-start': () => void;
    'typing-stop': () => void;
    'trigger-auto-learning': (data: { topic: string; userId: string }) => void;
}



export interface ServerToClientEvents {
    'ai-response-chunk': (data: { chunk: string; provider: AIProvider }) => void;
    'ai-response-complete': (data: {
        conversationId: string;
        messageId: string;
        provider: AIProvider;
    }) => void;
    'typing-indicator': (data: { isTyping: boolean }) => void;
    'error': (data: { message: string; code?: string }) => void;
    'conversations-list': (data: any[]) => void;
    'conversation-data': (data: any) => void;
    'conversation-updated': (data: { id: string; title: string }) => void;
    'auto-learning-complete': (data: { topic: string; result: string }) => void;
    'memory-extraction-progress': (data: { processed: number; total: number; currentStep: string }) => void;
}

/**
 * Helper to generate a short title for a conversation
 */
async function generateTitle(userMessage: string, aiResponse: string = '') {
    try {
        const prompt = `
Analyze the conversation below and generate a short, natural German title (2-5 words).
Rules:
1. Ignore any system prefixes like "Systemprüfung", "Klarheit", "Mode A".
2. Focus on the USER's topic or the core action.
3. If the user just says "Hello", title it "Begrüßung".
4. Language: ALWAYS German.

User: "${userMessage.slice(0, 200)}"
AI: "${aiResponse.slice(0, 200)}"

Title (no quotes):`;


        // Use 'ollama' as it is the verified working provider
        const response = await aiRouter.route(prompt, [], 'ollama');
        let title = response.content.trim().replace(/^["']|["']$/g, '');

        // Fix corrupted umlauts: replace replacement chars with correct ones
        title = Buffer.from(title, 'utf8').toString('utf8');
        // Remove any remaining replacement characters
        title = title.replace(/\ufffd/g, '');

        // Fallback if empty or too long
        if (!title || title.length > 50) {
            title = userMessage.slice(0, 30) + '...'; // Use userMessage
        }

        return title;
    } catch (error) {
        logger.warn('Failed to generate title', { error });
        return null;
    }
}

// Singleton reference
let ioInstance: SocketIOServer | null = null;

export const sendProgressToUser = (userId: string, data: { progress: number; status: string; stats?: { foundCount: number } }) => {
    if (ioInstance) {
        // Emit to room 'user:ID' which validation flow will ensure user joins
        ioInstance.to(`user:${userId}`).emit('import-progress', data);
        logger.debug('Emitting import progress', { userId, data });
    } else {
        logger.warn('SocketIO instance not initialized when sending progress');
    }
};

import { socketService } from '../services/socket/SocketService';
import { getUserPersonality } from './settingsRoutes';
import { voiceOrchestrator } from '../services/voice/VoiceSessionOrchestrator';
import { aiRouter as aiRouterInstance } from '../services/router/AIRouter';

export function initializeWebSocket(httpServer: HTTPServer): SocketIOServer {
    const io = socketService.initialize(httpServer, {
        cors: {
            origin: process.env.FRONTEND_URL || 'http://localhost:5173',
            methods: ['GET', 'POST'],
            credentials: true
        }
    });

    ioInstance = io;

    io.on('connection', (socket: Socket) => {
        logger.info('Client connected', { socketId: socket.id });

        // Explicitly register user for notification room
        socket.on('register-user', (data) => {
            const { userId } = data;
            socket.join(`user:${userId}`);
            logger.info('User registered for notifications', { socketId: socket.id, userId });
        });

        // Handle user message
        socket.on('user-message', async (data) => {
            try {
                const { message, attachments, conversationId, userId, forceProvider } = data;

                logger.info('Received user message', {
                    socketId: socket.id,
                    messageLength: message.length,
                    conversationId,
                });

                // Get or create conversation
                let currentConversationId = conversationId;

                if (!currentConversationId) {
                    // Create new conversation
                    const { isLearning } = data;
                    const newConversation = await createConversation({
                        userId,
                        title: 'Neue Unterhaltung', // Default until AI updates it
                        type: isLearning ? 'learning' : 'chat',
                    });
                    currentConversationId = newConversation.id;

                    // CRITICAL FIX: Emit conversation ID immediately to frontend to prevent fragmentation
                    // if user sends another message while AI is still generating.
                    socket.emit('ai-response-complete', {
                        conversationId: currentConversationId,
                        messageId: 'temp-init', // Placeholder
                        provider: 'system' as any,
                    });
                    // Removed: socket.emit('conversation-data', newConversation); 
                    // (This caused the frontend to clear messages because newConversation is empty here)
                }



                // Save user message
                const userMessage = await createMessage({
                    conversationId: currentConversationId,
                    role: 'user',
                    content: message,
                });

                // Index user message for semantic search (non-blocking)
                semanticSearchService.indexMessage(
                    userMessage.id,
                    message,
                    {
                        conversationId: currentConversationId,
                        role: 'user',
                        timestamp: new Date(),
                    }
                ).catch(err => logger.error('Failed to index user message', { err }));

                // ---------------------------------------------------------
                // SKILL PROCESSING (Wetter, etc.)
                // ---------------------------------------------------------
                let skillContext = '';
                let skillPayload = '';

                try {
                    const skillResult = await skillProcessor.process(message, userId);
                    if (skillResult.context) {
                        skillContext = skillResult.context;
                        logger.info('SkillProcessor: Added context to prompt');
                    }
                    if (skillResult.payload) {
                        skillPayload = skillResult.payload;
                        logger.info('SkillProcessor: Prepared payload for response');
                    }
                } catch (skillErr) {
                    logger.error('SkillProcessor failed', { skillErr });
                }

                // Get conversation history
                const history = await getConversationHistory(currentConversationId, 10);

                // Active Learning Mode & Memory Injection
                let targetMessage = message;
                let visionContext = ''; // Initialize in outer scope
                const { isLearning } = data;

                // 2. Handle Attachments (Vision Pipeline)
                if (data.attachments && data.attachments.length > 0) {
                    try {
                        logger.info('Processing attachments', { count: data.attachments.length, types: data.attachments.map((a: { type: string }) => a.type) });

                        // Filter for images
                        const images = data.attachments.filter((a: { type: string }) => a.type === 'image');

                        if (images.length > 0) {
                            logger.info('Handling image attachments - Vision Pipeline');

                            // Initialize Vision Service
                            const { visionService } = await import('../services/vision/VisionService');

                            // Process images sequentially
                            const descriptions: string[] = [];
                            for (let i = 0; i < images.length; i++) {
                                const img = images[i];
                                // Prepare base64 string (remove data URL prefix if present)
                                // Frontend might send 'content' or 'data' depending on implementation
                                const rawData = img.content || img.data || '';
                                if (!rawData) {
                                    logger.warn(`Image ${i + 1} has no content/data`);
                                    continue;
                                }
                                const base64Data = rawData.replace(/^data:image\/\w+;base64,/, '');

                                logger.info(`Analyzing image ${i + 1}/${images.length}...`);
                                const desc = await visionService.analyzeImage(base64Data);
                                descriptions.push(`[BILD ${i + 1} ANALYSE]:\n ${desc}`);
                            }

                            if (descriptions.length > 0) {
                                visionContext = `--- VISION KONTEXT ---\nDas System hat folgende Bilder analysiert und beschrieben:\n${descriptions.join('\n\n')}\n----------------------`;
                            }

                            logger.info('Vision analysis complete');
                        }
                    } catch (err: any) {
                        logger.error('Failed to process attachments', {
                            message: err.message,
                            stack: err.stack,
                            fullError: JSON.stringify(err, Object.getOwnPropertyNames(err))
                        });
                    }
                }

                // 1. MEMORY SYSTEM - 5-Layer Architecture
                let activePolicy: any = null; // Declare in outer scope of handler
                const { promptService } = await import('../services/prompts/PromptService'); // Move up

                try {
                    const { memoryManagerService } = await import('../services/memory/MemoryManagerService');
                    const { workingMemoryService } = await import('../services/memory/WorkingMemoryService');
                    // Removed promptService import from here

                    // Get or create session
                    workingMemoryService.getOrCreateSession(socket.id, userId);

                    // Add current user message to working memory
                    workingMemoryService.addMessage(socket.id, {
                        role: 'user',
                        content: message,
                        timestamp: new Date()
                    });

                    // Get relevant context from all memory layers
                    // For short follow-up messages, enrich query with recent conversation history
                    let memorySearchMessage = message;
                    const words = message.trim().split(/\s+/).filter((w: string) => w.length > 2);
                    const isShortFollowUp = words.length <= 6;
                    if (isShortFollowUp && history.length > 0) {
                        // Use the last few messages as additional search context
                        const recentContext = history.slice(-4)
                            .map((h: any) => h.content)
                            .join(' ');
                        memorySearchMessage = `${message} ${recentContext}`;
                        logger.info(`[Memory] Short follow-up detected, enriched query with history context`);
                    }

                    const memoryContext = await memoryManagerService.getRelevantContext(
                        socket.id,
                        userId,
                        memorySearchMessage
                    );

                    // Build context chunks for prompt
                    const contextChunks: string[] = [];

                    if (visionContext) {
                        contextChunks.push(visionContext);
                        socket.emit('debug:log', {
                            type: 'vision_output',
                            content: visionContext,
                            timestamp: new Date().toISOString()
                        });
                    }

                    if (skillContext) {
                        contextChunks.push(skillContext);
                        socket.emit('debug:log', {
                            type: 'skill_context',
                            content: skillContext,
                            timestamp: new Date().toISOString()
                        });
                    }

                    // REMOVED redundant working memory injection to prevent clutter
                    // The history variable already contains these messages in the standard format
                    /*
                    if (memoryContext.workingMemory.length > 0) {
                        const workingText = memoryContext.workingMemory
                            .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
                            .join('\n');
                        contextChunks.push(`Aktuelle Konversation:\n${workingText}`);
                    }
                    */

                    // Add short-term context (recent conversations)
                    if (memoryContext.shortTermContext) {
                        contextChunks.push(memoryContext.shortTermContext);
                    }

                    // Add long-term context (permanent memories)
                    if (memoryContext.longTermContext) {
                        contextChunks.push(memoryContext.longTermContext);
                    }

                    // 1.1 DETERMINE POLICY CONTEXT
                    // Simple heuristic for now - can be improved with AI Router classification later
                    const { policyService } = await import('../services/policy/PolicyService');
                    let policyContext: 'coding' | 'chat' | 'emotional' | 'planning' = 'chat';

                    const lowerMsg = message.toLowerCase();
                    if (lowerMsg.includes('code') || lowerMsg.includes('function') || lowerMsg.includes('bug') || lowerMsg.includes('error')) {
                        policyContext = 'coding';
                    } else if (lowerMsg.includes('plan') || lowerMsg.includes('schritt') || lowerMsg.includes('ziel')) {
                        policyContext = 'planning';
                    } else if (lowerMsg.includes('gefühl') || lowerMsg.includes('traurig') || lowerMsg.includes('froh')) {
                        policyContext = 'emotional';
                    }

                    activePolicy = policyService.getPolicy(policyContext);

                    // Use PromptService to construct the layered message WITH POLICY
                    targetMessage = promptService.buildUserMessage(message, contextChunks);

                    // Note: System Prompt is built inside aiRouter usually, but we need to ensure 
                    // the policy is passed there too. 
                    // CURRENTLY: aiRouter uses a static system prompt or builds it internally.
                    // We need to pass the policy to the router or inject it here.

                    // Hack: We inject policy instructions into the User Message for now, 
                    // until we update AI Router to accept dynamic system prompts.
                    // ACTUALLY: Let's do it properly by updating the router call below.

                    // For now, we'll log the policy selection
                    logger.info(`[Policy] Selected policy '${policyContext}' for message.`);


                    // DEBUG: Send Final Prompt to Frontend
                    socket.emit('debug:log', {
                        type: 'final_prompt',
                        content: targetMessage,
                        metadata: {
                            workingMemoryMessages: memoryContext.workingMemory.length,
                            hasShortTerm: !!memoryContext.shortTermContext,
                            hasLongTerm: !!memoryContext.longTermContext,
                            estimatedTokens: memoryContext.totalTokens
                        },
                        timestamp: new Date().toISOString()
                    });

                } catch (err) {
                    logger.error('Failed to build context', { err });
                }

                // 2. Active Learning Injection (Simple Interview - No Zep)
                let currentInterviewQuestion: { id: string; number: number; total: number; text: string; isStageEnd: boolean } | null = null;

                if (isLearning) {
                    const { simpleInterviewService } = await import('../services/learning/SimpleInterviewService');

                    // Get next question from in-memory state
                    const nextQuestion = await simpleInterviewService.getNextQuestion(userId);
                    currentInterviewQuestion = nextQuestion; // STORE for marking answered later

                    if (!nextQuestion) {
                        // Interview complete
                        const learningPrompt = `
[SYSTEM: INTERVIEW ABGESCHLOSSEN]
Du hast das persönliche Interview erfolgreich abgeschlossen! 
Alle wichtigen Informationen wurden gespeichert.

1. Bedanke dich herzlich für die Offenheit.
2. Fasse kurz zusammen, was du über den Nutzer gelernt hast.
3. Erwähne, dass du diese Infos nutzen wirst, um besser zu helfen.
`;
                        targetMessage = `${learningPrompt}\n\n${targetMessage}`;
                    } else {
                        // Ask specific next question
                        const learningPrompt = `
[SYSTEM: INTERVIEW MODUS - Frage ${nextQuestion.number}/${nextQuestion.total}]

DEINE AUFGABE:
1. Falls der Nutzer gerade etwas gesagt/beantwortet hat: Reagiere kurz wertschätzend (1 Satz).
2. Stelle dann EXAKT diese Frage:

"${nextQuestion.text}"

KRITISCH WICHTIG:
- Stelle die Frage WÖRTLICH wie oben angegeben
- KEINE eigenen Fragen erfinden
- KEINE Umformulierungen
- KEINE zusätzlichen Fragen
- NUR diese EINE vordefinierte Frage stellen

${nextQuestion.isStageEnd ? '\n[Nach dieser Antwort: Fasse die Stufe kurz zusammen und frage "Passt das?"]' : ''}
`;
                        targetMessage = `${learningPrompt}\n\n${targetMessage}`;
                    }
                }

                // Emit typing indicator
                socket.emit('typing-indicator', { isTyping: true });

                // Stream AI response
                let fullResponse = '';
                let provider: AIProvider = 'claude';

                // Construct final Prompt (Text + Attachments)
                let finalPrompt: string | ClaudeContent = targetMessage;
                let effectiveForceProvider = forceProvider;

                if (attachments && attachments.length > 0) {
                    logger.info('Processing attachments', { count: attachments.length, types: attachments.map((a: any) => a.type) });

                    const images = attachments.filter((a: any) => a.type === 'image');
                    // Files (text) might be already handled by frontend sending content, 
                    // OR we could append them here if they are sent as file type with content text.
                    // For now assuming attachments.content IS the text for files or base64 for images.

                    if (images.length > 0) {
                        logger.info('Handling image attachments - Vision Pipeline (Skipped in Streaming Phase - Handled in Context Phase)', { count: images.length });
                        // We do NOT append vision context here again, as it was already injected in the Context Phase.
                        // However, we might need to ensure the router knows about the images if we want to support multi-modal LLMs directly (e.g. Claude 3.5 Sonnet).
                        // But currently we use Local Vision (LLaVA) -> Text Description -> LLM.
                        // So we do nothing here.
                    }

                    // Handle text files if necessary (append to text)
                    const textFiles = attachments.filter((a: any) => a.type === 'file');
                    if (textFiles.length > 0) {
                        const fileContext = textFiles.map((f: any) => `\n---\nDatei: ${f.name}\nInhalt:\n${f.content}\n---\n`).join('');
                        if (Array.isArray(finalPrompt)) {
                            // Append to text block
                            const textBlock = finalPrompt.find(b => b.type === 'text') as { type: 'text', text: string };
                            if (textBlock) textBlock.text += fileContext;
                        } else {
                            finalPrompt += fileContext as string;
                        }
                    }
                }

                // GENERATE SYSTEM PROMPT WITH POLICY + PERSONALITY
                const userPersonality = getUserPersonality(userId);
                const fullSystemPrompt = promptService.buildSystemPrompt({
                    policy: activePolicy,
                    personality: userPersonality,
                    dynamicInstructions: [] // Can be filled with e.g. "User is tired" later
                });

                for await (const { chunk, provider: usedProvider } of aiRouter.streamRoute(
                    finalPrompt,
                    history.map((h: any) => ({ role: h.role as 'user' | 'assistant', content: h.content })),
                    effectiveForceProvider,
                    fullResponse === '' ? fullSystemPrompt : undefined
                )) {
                    fullResponse += chunk;
                    provider = usedProvider;

                    // DON'T emit yet - wait for guardrails validation first
                    // socket.emit('ai-response-chunk', { chunk, provider: usedProvider });
                }

                // Skill payload (raw JSON) nicht mehr an die Antwort anhaengen
                // Die relevanten Infos stehen bereits im Antworttext
                if (skillPayload) {
                    logger.info('Skill payload available but not appended to response');
                }

                // GUARDRAILS: Validate response BEFORE saving/sending
                try {
                    const { memoryManagerService } = await import('../services/memory/MemoryManagerService');
                    const memoryContext = await memoryManagerService.getRelevantContext(
                        socket.id,
                        userId,
                        message
                    );

                    // Extract memory entries from text context for fact-checking
                    const memoryEntries = [];

                    // Parse long-term context (has format like [TYPE] content)
                    if (memoryContext.longTermContext) {
                        const lines = memoryContext.longTermContext.split('\n');
                        for (const line of lines) {
                            const match = line.match(/^\[([A-Z_]+)\]\s*(.+)$/);
                            if (match) {
                                memoryEntries.push({
                                    type: match[1].toLowerCase(),
                                    content: match[2]
                                });
                            }
                        }
                    }

                    const validation = responseGuardrails.validate(fullResponse, memoryEntries);

                    if (!validation.isValid && validation.severity === 'high') {
                        logger.error('🚨 GUARDRAILS VIOLATION - Response blocked', {
                            violations: validation.violations,
                            severity: validation.severity,
                            conversationId: currentConversationId
                        });

                        // Replace response with safe fallback
                        const safeFallback = responseGuardrails.getSafeFallback(validation.violations);
                        fullResponse = safeFallback;

                        // Emit error to frontend for debugging
                        socket.emit('debug:log', {
                            type: 'guardrails_violation',
                            violations: validation.violations,
                            severity: validation.severity,
                            timestamp: new Date().toISOString()
                        });
                    } else if (!validation.isValid) {
                        // Log medium/low violations but allow response
                        logger.warn('⚠️ Guardrails violation (non-critical)', {
                            violations: validation.violations,
                            severity: validation.severity
                        });
                    } else {
                        logger.debug('✅ Guardrails passed', { conversationId: currentConversationId });
                    }
                } catch (err) {
                    logger.error('Failed to validate response with guardrails', { err });
                    // Continue anyway - don't block on validation errors
                }

                // Clean response: remove stray CJK/special chars at start
                fullResponse = fullResponse.replace(/^[\u2E80-\u9FFF\uAC00-\uD7AF\uF900-\uFAFF\u{20000}-\u{2FA1F}]+/u, '').trim();

                // Fix broken backticks from Gemma (´´´ → ```, ∣ → |)
                fullResponse = fullResponse.replace(/[´`]{3}/g, '```').replace(/∣/g, '|');

                // NOW stream the validated response to user
                // Use Array.from to handle multi-byte chars (emojis) safely
                const chars = Array.from(fullResponse);
                const chunkSize = 50;
                for (let i = 0; i < chars.length; i += chunkSize) {
                    const chunk = chars.slice(i, i + chunkSize).join('');
                    socket.emit('ai-response-chunk', { chunk, provider });
                    await new Promise(resolve => setTimeout(resolve, 10));
                }

                // Save AI response
                const aiMessage = await createMessage({
                    conversationId: currentConversationId,
                    role: 'assistant',
                    content: fullResponse,
                    modelUsed: provider,
                });

                // Log routing decision for learning orchestrator
                try {
                    await aiRouterInstance.logRoutingDecision({
                        userId,
                        conversationId: currentConversationId,
                        messageId: aiMessage.id,
                        domain: 'knowledge', // Will be improved when classification is exposed
                        chosenProvider: provider,
                        complexityScore: 0.5,
                        selfConfidence: 0.5,
                        responseTimeMs: Date.now() - ((userMessage as any).createdAt?.getTime?.() || userMessage.timestamp?.getTime?.() || Date.now()),
                    });
                } catch (err) {
                    logger.warn('Failed to log routing decision', { err });
                }

                // Index AI message for semantic search (non-blocking)
                semanticSearchService.indexMessage(
                    aiMessage.id,
                    fullResponse,
                    {
                        conversationId: currentConversationId,
                        role: 'assistant',
                        timestamp: new Date(),
                        modelUsed: provider,
                    }
                ).catch(err => logger.error('Failed to index AI message', { err }));

                // Update personality traits (occasionally, e.g. 10% of the time)
                if (Math.random() < 0.1) {
                    learningService.updatePersonalityFromHistory(userId)
                        .catch(err => logger.error('Failed to update personality', { err }));
                }

                // Save assistant response to working memory
                try {
                    const { workingMemoryService } = await import('../services/memory/WorkingMemoryService');
                    workingMemoryService.addMessage(socket.id, {
                        role: 'assistant',
                        content: fullResponse,
                        timestamp: new Date()
                    });
                } catch (err) {
                    logger.error('Failed to save assistant message to working memory', { err });
                }

                // REAL-TIME MEMORY EXTRACTION (Dynamic Trigger)
                try {
                    const { memoryManagerService } = await import('../services/memory/MemoryManagerService');

                    // Check if we need to extract based on message count (handled internally by MemoryManager)
                    // limit to every 5 messages
                    await memoryManagerService.checkAutoExtraction(socket.id, userId);

                } catch (err) {
                    logger.warn('Failed to import MemoryManager for auto-extraction', { err });
                }

                // Mark the question that was just answered (if in Interview mode)
                if (currentInterviewQuestion) {
                    const { simpleInterviewService } = await import('../services/learning/SimpleInterviewService');
                    await simpleInterviewService.markQuestionAnswered(userId, currentInterviewQuestion.id, message);
                }

                // Emit completion
                socket.emit('typing-indicator', { isTyping: false });
                socket.emit('ai-response-complete', {
                    conversationId: currentConversationId,
                    messageId: aiMessage.id,
                    provider,
                });

                logger.info('AI response completed', {
                    socketId: socket.id,
                    conversationId: currentConversationId,
                    provider,
                    responseLength: fullResponse.length,
                });

                // Voice Pipeline: Auto-TTS if voice session is active
                const voiceSession = voiceOrchestrator.getSession(socket.id);
                if (voiceSession && voiceSession.config.ttsEnabled) {
                    voiceOrchestrator.synthesizeAndStream(socket.id, fullResponse, socket)
                        .catch(err => logger.error('Auto-TTS failed', { err }));
                }

                // Generate Title (Async) for new conversations
                if (history.length <= 2) { // User message + AI message = 2
                    logger.info('Starting title generation', { conversationId: currentConversationId });
                    generateTitle(message, fullResponse).then(async (newTitle) => {
                        logger.info('Title generated', { newTitle });
                        if (newTitle) {
                            await updateConversation(currentConversationId!, { title: newTitle });
                            // Notify client about title update (requires checking if socket is still open technically, but broadcast helps)
                            socket.emit('conversation-updated', { id: currentConversationId!, title: newTitle });
                            // Also update list for everyone (simplified)
                            const conversations = await getUserConversations(userId);
                            socket.emit('conversations-list', conversations);
                        }
                    });
                }
            } catch (error) {
                logger.error('Error handling user message', { error, socketId: socket.id });
                socket.emit('error', {
                    message: error instanceof Error ? error.message : 'An error occurred',
                    code: 'MESSAGE_ERROR',
                });
                socket.emit('typing-indicator', { isTyping: false });
            }
        });

        // Handle get conversations
        socket.on('get-conversations', async (data: any) => {
            try {
                const { userId, includeLearning } = data;
                // Join user-specific room for notifications
                socket.join(`user:${userId}`);

                const conversations = await getUserConversations(userId, includeLearning);

                socket.emit('conversations-list', conversations);

                logger.debug('Sent conversations list', {
                    socketId: socket.id,
                    count: conversations.length,
                    includeLearning
                });
            } catch (error) {
                logger.error('Error getting conversations', { error, socketId: socket.id });
                socket.emit('error', {
                    message: 'Failed to get conversations',
                    code: 'GET_CONVERSATIONS_ERROR',
                });
            }
        });

        // Handle get conversation
        socket.on('get-conversation', async (data) => {
            try {
                const { conversationId } = data;
                const conversation = await getConversation(conversationId);

                if (conversation) {
                    socket.emit('conversation-data', conversation);
                } else {
                    socket.emit('error', {
                        message: 'Conversation not found',
                        code: 'CONVERSATION_NOT_FOUND',
                    });
                }

                logger.debug('Sent conversation data', { socketId: socket.id, conversationId });
            } catch (error) {
                logger.error('Error getting conversation', { error, socketId: socket.id });
                socket.emit('error', {
                    message: 'Failed to get conversation',
                    code: 'GET_CONVERSATION_ERROR',
                });
            }
        });

        // Handle delete conversation
        socket.on('delete-conversation', async (data) => {
            try {
                const { conversationId } = data;
                await deleteConversation(conversationId);
                logger.info('Conversation deleted', { socketId: socket.id, conversationId });
                // We don't necessarily need to emit back if we do optimistic updates, 
                // but broadcasting to other tabs of the same user would be good in a real app.
            } catch (error) {
                logger.error('Error deleting conversation', { error, socketId: socket.id });
                socket.emit('error', {
                    message: 'Failed to delete conversation',
                    code: 'DELETE_CONVERSATION_ERROR',
                });
            }
        });

        // Handle rename conversation
        socket.on('rename-conversation', async (data) => {
            try {
                const { conversationId, title } = data;
                await updateConversation(conversationId, { title });
                logger.info('Conversation renamed', { socketId: socket.id, conversationId, title });
                socket.emit('conversation-updated', { id: conversationId, title });
            } catch (error) {
                logger.error('Error renaming conversation', { error, socketId: socket.id });
                socket.emit('error', {
                    message: 'Failed to rename conversation',
                    code: 'RENAME_CONVERSATION_ERROR',
                });
            }
        });

        // Handle typing indicators
        socket.on('typing-start', () => {
            socket.broadcast.emit('typing-indicator', { isTyping: true });
        });

        socket.on('typing-stop', () => {
            socket.broadcast.emit('typing-indicator', { isTyping: false });
        });

        // Handle Auto-Learning Trigger
        socket.on('trigger-auto-learning', async (data) => {
            try {
                const { topic, userId } = data;
                logger.info('Received auto-learning trigger', { topic, userId });

                // Lazy import to avoid circular dependency issues if any
                // Auto-learning removed in favor of background extraction
                // const { autoLearningService } = await import('../services/learning/AutoLearningService');

                // Notify user we started
                // socket.emit('notification', { message: `Recherche gestartet: ${topic}` }); 

                    // Web-Recherche mit DuckDuckGo + Wikipedia
                    const { webSearchService } = await import('../services/web/WebSearchService');
                    const searchResults = await webSearchService.search(topic, 5);

                    let result = '';
                    if (searchResults.length > 0) {
                        // Erste Seite lesen für detaillierten Inhalt
                        const pageContent = await webSearchService.readPage(searchResults[0].url);
                        const summary = pageContent.length > 2000 ? pageContent.substring(0, 2000) + '...' : pageContent;

                        result = `📚 Recherche zu "${topic}" abgeschlossen!\n\n`;
                        result += `**${searchResults[0].title}**\n${searchResults[0].snippet}\n\n`;
                        if (summary && summary.length > 50) {
                            result += `--- Auszug ---\n${summary}\n\n`;
                        }
                        if (searchResults.length > 1) {
                            result += `--- Weitere Quellen ---\n`;
                            for (let i = 1; i < searchResults.length; i++) {
                                result += `• ${searchResults[i].title}: ${searchResults[i].snippet}\n`;
                            }
                        }
                        // Recherche-Ergebnisse als semantisches Wissen speichern
                        try {
                            const { prisma } = await import('../services/db/prisma');

                            // Hauptergebnis als Memory speichern
                            const memoryContent = `[Recherche: ${topic}] ${searchResults[0].title}: ${searchResults[0].snippet}`;
                            await prisma.memoryEntry.create({
                                data: {
                                    userId: userId || 'default-user',
                                    type: 'FACT',
                                    content: memoryContent.substring(0, 1000),
                                    importanceScore: 0.8,
                                    isActive: true,
                                },
                            });

                            // Weitere Quellen als einzelne Memories speichern
                            for (let i = 1; i < Math.min(searchResults.length, 3); i++) {
                                const extraContent = `[Recherche: ${topic}] ${searchResults[i].title}: ${searchResults[i].snippet}`;
                                await prisma.memoryEntry.create({
                                    data: {
                                        userId: userId || 'default-user',
                                        type: 'FACT',
                                        content: extraContent.substring(0, 1000),
                                        importanceScore: 0.6,
                                        isActive: true,
                                    },
                                });
                            }

                            const savedCount = Math.min(searchResults.length, 3);
                            result += `\n✅ ${savedCount} Wissenseinträge im Gedächtnis gespeichert.`;
                            logger.info(`Saved ${savedCount} memory entries from research on "${topic}"`);
                        } catch (memError) {
                            logger.error('Failed to save research to memory', { memError });
                            result += `\n⚠️ Ergebnisse konnten nicht im Gedächtnis gespeichert werden.`;
                        }
                    } else {
                        result = `Keine Ergebnisse zu "${topic}" gefunden. Versuche einen anderen Suchbegriff.`;
                    }

                socket.emit('auto-learning-complete', { topic, result });

            } catch (error) {
                logger.error('Error in auto-learning handler', { error });
                socket.emit('error', {
                    message: 'Auto-learning failed',
                    code: 'LEARNING_ERROR'
                });
            }
        });

        // =============================================
        // VOICE PIPELINE EVENTS
        // =============================================

        /**
         * Start a voice session for this socket
         */
        socket.on('voice-session-start', async (data: { userId: string; config?: any }) => {
            try {
                if (!voiceOrchestrator.getStatus().initialized) {
                    await voiceOrchestrator.initialize();
                }
                voiceOrchestrator.createSession(socket, data.userId, data.config);
            } catch (error) {
                logger.error('Failed to start voice session', { error, socketId: socket.id });
                socket.emit('error', { message: 'Voice-Session konnte nicht gestartet werden', code: 'VOICE_ERROR' });
            }
        });

        /**
         * Receive audio chunk from client (binary PCM data)
         */
        socket.on('voice-audio-chunk', (data: Buffer | ArrayBuffer) => {
            try {
                const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
                voiceOrchestrator.processAudioChunk(socket.id, buffer);
            } catch (error) {
                logger.error('Failed to process audio chunk', { error, socketId: socket.id });
            }
        });

        /**
         * Client requests manual transcription (non-VAD mode)
         */
        socket.on('voice-transcribe-buffer', async () => {
            try {
                await voiceOrchestrator.transcribeBuffer(socket.id, socket);
            } catch (error) {
                logger.error('Failed to transcribe buffer', { error, socketId: socket.id });
            }
        });

        /**
         * Client requests TTS for text
         */
        socket.on('voice-tts-request', async (data: { text: string }) => {
            try {
                await voiceOrchestrator.synthesizeAndStream(socket.id, data.text, socket);
            } catch (error) {
                logger.error('Failed TTS request', { error, socketId: socket.id });
            }
        });

        /**
         * Update voice session config
         */
        socket.on('voice-session-update', (data: { config: any }) => {
            voiceOrchestrator.updateSession(socket.id, data.config);
        });

        /**
         * End voice session
         */
        socket.on('voice-session-end', () => {
            voiceOrchestrator.endSession(socket.id);
        });

        // Handle disconnect
        socket.on('disconnect', () => {
            // Clean up voice session
            voiceOrchestrator.endSession(socket.id);
            logger.info('Client disconnected', { socketId: socket.id });
        });
    });

    return io;
}


