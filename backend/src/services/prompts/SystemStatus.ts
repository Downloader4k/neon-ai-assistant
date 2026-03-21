export const systemStatus = {
    version: '1.0.0',
    environment: 'web-only', // no electron
    backendStack: 'node-express-prisma-chroma',
    aiStack: 'ollama-gemma3-claude',
    recentChanges: [
        'Backend cleaned: Removed Zep, migrated to pure Prisma/Chroma',
        'Frontend cleaned: Removed Electron, migrated to pure Vite/React',
        'Security fixed: npm audit ran',
        'Performance: Optimized for Gemma 3 (4b) local model'
    ],
    capabilities: [
        'Coding (General)',
        'Vision (LLaVA)',
        'Memory (Long-term)',
        'Web Search (Planned)',
        'Image Generation (Planned)',
        'Smart Home (Planned)'
    ]
};
