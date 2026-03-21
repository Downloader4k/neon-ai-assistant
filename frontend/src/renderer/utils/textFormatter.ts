/**
 * Text Formatter Utility - ChatGPT Level
 * Automatically improves AI-generated text formatting for better readability
 * Works independent of the AI model quality
 */

// Simple LRU cache for formatted text (like assistant-ui optimization)
const formatCache = new Map<string, string>();
const MAX_CACHE_SIZE = 50;

/**
 * Main function to improve text formatting
 */
export function improveTextFormatting(text: string): string {
    // Check cache first
    if (formatCache.has(text)) {
        return formatCache.get(text)!;
    }

    // Skip processing for short texts (likely already well-formatted)
    if (text.length < 150) {
        return text;
    }

    let improved = text;

    // Apply improvements in order (AGGRESSIVE for ChatGPT-level quality)
    improved = detectAndFormatSteps(improved);
    improved = detectAndFormatLists(improved);
    improved = addAggressiveParagraphBreaks(improved);
    improved = improveListFormatting(improved);
    improved = ensureSpacingAroundCodeBlocks(improved);
    improved = cleanupExcessiveSpacing(improved);

    // Cache result
    if (formatCache.size >= MAX_CACHE_SIZE) {
        // Remove oldest entry (first key)
        const firstKey = formatCache.keys().next().value;
        if (firstKey) {
            formatCache.delete(firstKey);
        }
    }
    formatCache.set(text, improved);

    return improved;
}

/**
 * Detects step patterns like "Schritt 1:", "1.", "Step 1:" and converts to lists
 */
function detectAndFormatSteps(text: string): string {
    // Pattern: "Schritt 1:", "Step 1:", "1.", "1)", etc. at start of line
    const stepPattern = /^(\s*)((?:Schritt|Step|Punkt)\s+\d+[:.)]|\d+[:.)])\s+(.+)$/gim;

    let hasSteps = false;
    const formatted = text.replace(stepPattern, (_match, indent, _prefix, content) => {
        hasSteps = true;
        // Convert to simple numbered list without bold
        return `${indent}- ${content}`;
    });

    return hasSteps ? formatted : text;
}

/**
 * Detects bullet-like patterns and ensures proper list formatting
 */
function detectAndFormatLists(text: string): string {
    // Pattern: Lines starting with "- ", "* ", "• ", or "→ "
    const listPattern = /^(\s*)[-•*→]\s+(.+)$/gim;

    let improved = text.replace(listPattern, (_match, indent, content) => {
        // Normalize to markdown list format
        return `${indent}- ${content}`;
    });

    // Detect "A: answer B: answer" patterns (Q&A style)
    improved = improved.replace(
        /([A-Z]):\s+([^.!?]+[.!?])\s+([A-Z]):/g,
        (_match, letter1, answer1, letter2) => {
            return `\n\n**${letter1}:** ${answer1}\n\n**${letter2}:**`;
        }
    );

    return improved;
}

/**
 * AGGRESSIVE paragraph breaks - after every 1-2 sentences
 */
function addAggressiveParagraphBreaks(text: string): string {
    // Don't process if already has good paragraph structure
    if (text.includes('\n\n\n')) {
        return text;
    }

    // Split by sentence endings
    const sentences = text.split(/([.!?]+\s+)/);
    let result = '';
    let sentenceCount = 0;

    for (let i = 0; i < sentences.length; i++) {
        const part = sentences[i];
        result += part;

        // Check if this is an actual sentence ending
        if (part.match(/[.!?]+\s+/)) {
            const nextPart = sentences[i + 1];

            // Don't break if next part is very short (likely continuation)
            if (nextPart && nextPart.trim().length > 10) {
                sentenceCount++;

                // Add break after 1-2 sentences (ChatGPT style)
                if (sentenceCount >= 1) {
                    // Check if next sentence starts with capital letter
                    if (nextPart.trim().match(/^[A-ZÄÖÜ]/)) {
                        result += '\n\n';
                        sentenceCount = 0;
                    }
                }
            }
        }
    }

    return result.trim();
}

/**
 * Improves list formatting by adding spacing and converting inline lists to proper markdown
 */
function improveListFormatting(text: string): string {
    let improved = text;

    // Detect inline lists (e.g., "Schritt 1: ..., Schritt 2: ...")
    improved = improved.replace(
        /([^.\n]+:\s*[^.]+\.)\s+([^.\n]+:\s*[^.]+\.)/g,
        (_match, item1, item2) => {
            return `\n\n- ${item1.trim()}\n- ${item2.trim()}\n\n`;
        }
    );

    // Ensure spacing before lists
    improved = improved.replace(/([^\n])\n([-•*]\s)/g, '$1\n\n$2');

    // Ensure spacing after lists
    improved = improved.replace(/([-•*]\s[^\n]+)\n([^\n-•*])/g, '$1\n\n$2');

    return improved;
}

/**
 * Ensures code blocks have proper spacing
 */
function ensureSpacingAroundCodeBlocks(text: string): string {
    let improved = text;

    // Add spacing before code blocks
    improved = improved.replace(/([^\n])\n```/g, '$1\n\n```');

    // Add spacing after code blocks
    improved = improved.replace(/```\n([^\n])/g, '```\n\n$1');

    return improved;
}

/**
 * Cleanup excessive spacing (max 2 line breaks)
 */
function cleanupExcessiveSpacing(text: string): string {
    // Replace 3+ line breaks with exactly 2
    return text.replace(/\n{3,}/g, '\n\n');
}
