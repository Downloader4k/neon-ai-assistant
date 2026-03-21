/**
 * Predictive Assistance - Proactive suggestions based on patterns
 */

export interface Prediction {
    type: 'task' | 'question' | 'reminder' | 'suggestion';
    content: string;
    confidence: number;
    basedOn: string;
}

export class PredictiveService {
    /**
     * Analyze patterns and make predictions
     */
    async predictNext(userId: string): Promise<any[]> {
        const { prisma } = await import('../db/prisma');
        const { aiRouter } = await import('../router/AIRouter');

        // Get recent conversations
        const conversations = await prisma.conversation.findMany({
            where: { userId },
            take: 5, // Reduce to 5 most recent to fit context
            orderBy: { createdAt: 'desc' },
            include: {
                messages: {
                    take: 10,
                    orderBy: { timestamp: 'desc' },
                },
            },
        });

        // 1. Prepare Context from History
        let contextSummary = "";
        conversations.forEach((conv, i) => {
            const msgs = conv.messages.slice().reverse().map(m => `${m.role}: ${m.content}`).join('\n');
            contextSummary += `\n[Conversation ${i + 1} - Title: ${conv.title}]\n${msgs}\n`;
        });

        if (!contextSummary) {
            // Fallback for new users
            return [{
                type: 'suggestion',
                content: 'Ich bin bereit! Erzähl mir, woran du gerade arbeitest.',
                confidence: 0.9,
                category: 'Start',
                priority: 'high'
            }];
        }

        // 2. Prompt the AI
        const prompt = `
        You are 'Neon', a proactive AI assistant. 
        Analyze the recent user conversation history below.
        Identify the user's current goals, unfinished tasks, or potential interests.
        
        Generate 3 proactive suggestions/questions that you (the AI) could ask the user right now to offer help.
        The suggestions should be natural, helpful, and specific to the context. 
        Avoid generic "How can I help?". Be specific like "Should we continue debugging the React component?"
        
        Output MUST be a valid JSON array of objects with the following structure:
        [
            {
                "type": "question" | "task" | "suggestion",
                "content": "The actual text string to show the user",
                "confidence": number (0.0 to 1.0),
                "category": "Short Label (e.g. Coding, Health, Work)",
                "priority": "high" | "medium" | "low"
            }
        ]
        
        Key Rules:
        - Output ONLY the JSON. No markdown formatting, no explanations.
        - Language: German (Deutsch).
        - Maximum 3 items.

        [Recent History]:
        ${contextSummary}
        `;

        try {
            // Use 'ollama' or 'claude' based on router availability, but prefer a smart model if possible.
            // Using aiRouter.route defaults to auto-selection.
            const response = await aiRouter.route(prompt, [], 'ollama'); // Use ollama for speed/cost if available, or just auto. 
            // Actually, let's use the default routing logic (remove forceProvider if you want smart routing, 
            // but for simple structure tasks Ollama is often enough and faster).
            // Let's stick to Ollama for now as it's the verified working provider in previous steps.

            let jsonString = response.content;

            // Clean up potentially markdown wrapped JSON
            jsonString = jsonString.replace(/```json/g, '').replace(/```/g, '').trim();

            const predictions = JSON.parse(jsonString);

            // Validate basic structure
            if (Array.isArray(predictions)) {
                return predictions.sort((a: any, b: any) => b.confidence - a.confidence);
            }

            throw new Error("Invalid JSON structure");

        } catch (error) {
            console.error("AI Prediction failed, falling back to simple logic", error);

            // Fallback Logic (Time-based)
            const hour = new Date().getHours();
            const fallback = [];

            if (hour < 12) {
                fallback.push({
                    type: 'task',
                    content: 'Guten Morgen! Was sind deine Hauptziele für heute?',
                    confidence: 0.8,
                    category: 'Planung',
                    priority: 'high'
                });
            } else {
                fallback.push({
                    type: 'suggestion',
                    content: 'Wie läuft dein Tag bisher? Gibt es Blockaden?',
                    confidence: 0.7,
                    category: 'Check-in',
                    priority: 'medium'
                });
            }
            return fallback;
        }
    }



    /**
     * Predict user needs based on context
     */
    async predictUserNeeds(_userId: string, context: string): Promise<string[]> {
        // Simple context-based predictions
        const needs: string[] = [];

        if (context.includes('code') || context.includes('programmier')) {
            needs.push('Code-Beispiele');
            needs.push('Dokumentation');
            needs.push('Best Practices');
        }

        if (context.includes('problem') || context.includes('fehler')) {
            needs.push('Schritt-für-Schritt Lösung');
            needs.push('Alternative Ansätze');
            needs.push('Debugging-Tipps');
        }

        if (context.includes('lernen') || context.includes('verstehen')) {
            needs.push('Einfache Erklärung');
            needs.push('Beispiele');
            needs.push('Übungen');
        }

        return needs;
    }
}

export const predictiveService = new PredictiveService();
