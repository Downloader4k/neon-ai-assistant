/**
 * Real-time response formatter for streaming AI responses
 * Adds proper spacing and formatting to make responses more readable
 * Works with TOKEN-LEVEL streaming (not line-level)
 */
export class ResponseFormatter {
    private buffer: string = '';
    private lastOutput: string = '';
    private inCodeBlock: boolean = false;

    /**
     * Process a chunk and return formatted output
     * Detects list items and adds line breaks in real-time
     */
    processChunk(chunk: string): string {
        // Add chunk to buffer
        this.buffer += chunk;

        // Check for code blocks
        const codeBlockMatches = this.buffer.match(/```/g);
        this.inCodeBlock = codeBlockMatches ? codeBlockMatches.length % 2 === 1 : false;

        // If in code block, pass through as-is
        if (this.inCodeBlock) {
            const output = this.buffer.substring(this.lastOutput.length);
            this.lastOutput = this.buffer;
            return output;
        }

        // Return only NEW content since last output
        const output = this.buffer.substring(this.lastOutput.length);
        this.lastOutput = this.buffer;

        return output;
    }

    /**
     * Flush remaining buffer (call at end of response)
     */
    flush(): string {
        const remaining = this.buffer.substring(this.lastOutput.length);
        this.reset();
        return remaining;
    }

    /**
     * Reset formatter state
     */
    reset(): void {
        this.buffer = '';
        this.lastOutput = '';
        this.inCodeBlock = false;
    }
}
