
import Anthropic from '@anthropic-ai/sdk';
import dotenv from 'dotenv';
import path from 'path';

// Load env vars
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

async function testClaude() {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
        console.error('❌ ANTHROPIC_API_KEY is missing');
        return;
    }
    console.log('✅ API Key found:', apiKey.substring(0, 10) + '...');

    const client = new Anthropic({ apiKey });

    // The model currently in ClaudeService.ts
    const modelId = 'claude-sonnet-4-5-20250929';
    // Fallback/Standard model
    const standardModel = 'claude-3-5-sonnet-20240620';

    console.log(`\nTesting model: ${modelId}...`);
    try {
        const msg = await client.messages.create({
            model: modelId,
            max_tokens: 100,
            messages: [{ role: 'user', content: 'Hello, are you online?' }],
        });
        console.log('✅ Success with configured model!');
        console.log('Response:', msg.content[0].type === 'text' ? msg.content[0].text : 'Non-text response');
    } catch (err: any) {
        console.error('❌ Failed with configured model:', err.message);

        console.log(`\nTesting standard model: ${standardModel}...`);
        try {
            const msg2 = await client.messages.create({
                model: standardModel,
                max_tokens: 100,
                messages: [{ role: 'user', content: 'Hello, are you online?' }],
            });
            console.log('✅ Success with standard model!');
            console.log('Response:', msg2.content[0].type === 'text' ? msg2.content[0].text : 'Non-text response');
        } catch (err2: any) {
            console.error('❌ Failed with standard model:', err2.message);
        }
    }
}

testClaude();
