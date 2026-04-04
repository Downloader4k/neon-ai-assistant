/**
 * Skill Manifest System
 *
 * Defines the manifest format for NEON skills/plugins.
 * Each skill has a manifest.json that describes:
 * - Metadata (name, version, description, author)
 * - Entry point
 * - Required permissions
 * - Configuration schema
 * - Trigger patterns
 */

export interface SkillManifest {
    // Required fields
    name: string;                    // Unique skill identifier (e.g., "weather")
    version: string;                 // Semver (e.g., "1.0.0")
    description: string;             // Short description
    entry: string;                   // Entry file (e.g., "index.js" or "index.py")

    // Optional metadata
    displayName?: string;            // Human-readable name
    author?: string;                 // Author name
    homepage?: string;               // URL to skill homepage
    icon?: string;                   // Icon name (lucide icon) or URL
    category?: SkillCategory;        // Category for marketplace
    tags?: string[];                 // Tags for search

    // Runtime configuration
    runtime?: 'node' | 'python' | 'shell';  // Execution runtime
    permissions?: SkillPermission[]; // Required permissions
    triggers?: SkillTrigger[];       // Message trigger patterns
    settings?: SkillSettingDef[];    // User-configurable settings

    // Marketplace metadata
    rating?: number;                 // Average rating (0-5)
    downloads?: number;              // Download count
    verified?: boolean;              // Verified by NEON team
    source?: 'builtin' | 'local' | 'github' | 'marketplace';
    sourceUrl?: string;              // GitHub URL or local path
}

export type SkillCategory =
    | 'productivity'
    | 'communication'
    | 'entertainment'
    | 'knowledge'
    | 'tools'
    | 'lifestyle'
    | 'development'
    | 'custom';

export type SkillPermission =
    | 'network'          // HTTP/WebSocket access
    | 'filesystem'       // File read/write
    | 'database'         // DB access
    | 'execute'          // Code execution
    | 'notifications'    // Send notifications
    | 'memory'           // Access memory system
    | 'llm'              // Use AI models
    | 'system';          // System commands

export interface SkillTrigger {
    type: 'keyword' | 'regex' | 'command';
    pattern: string;     // Keyword, regex, or command name (e.g., "/weather")
    priority?: number;   // Higher = checked first (default: 0)
}

export interface SkillSettingDef {
    key: string;
    label: string;
    type: 'text' | 'number' | 'boolean' | 'select' | 'password';
    default?: any;
    options?: Array<{ label: string; value: string }>;  // For 'select' type
    description?: string;
    required?: boolean;
}

export interface InstalledSkill {
    manifest: SkillManifest;
    installPath: string;
    enabled: boolean;
    installedAt: Date;
    updatedAt: Date;
    userSettings: Record<string, any>;
}

/**
 * Validate a skill manifest
 */
export function validateManifest(manifest: any): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!manifest.name || typeof manifest.name !== 'string') {
        errors.push('name ist erforderlich (string)');
    } else if (!/^[a-z0-9-]+$/.test(manifest.name)) {
        errors.push('name darf nur Kleinbuchstaben, Zahlen und Bindestriche enthalten');
    }

    if (!manifest.version || typeof manifest.version !== 'string') {
        errors.push('version ist erforderlich (string, z.B. "1.0.0")');
    }

    if (!manifest.description || typeof manifest.description !== 'string') {
        errors.push('description ist erforderlich (string)');
    }

    if (!manifest.entry || typeof manifest.entry !== 'string') {
        errors.push('entry ist erforderlich (string, z.B. "index.js")');
    }

    const validPermissions: SkillPermission[] = [
        'network', 'filesystem', 'database', 'execute', 'notifications', 'memory', 'llm', 'system'
    ];
    if (manifest.permissions) {
        for (const perm of manifest.permissions) {
            if (!validPermissions.includes(perm)) {
                errors.push(`Unbekannte Permission: ${perm}`);
            }
        }

        // Warn about dangerous permissions
        if (manifest.permissions.includes('system')) {
            errors.push('WARNUNG: "system" Permission erlaubt Systemzugriff');
        }
    }

    return {
        valid: errors.filter(e => !e.startsWith('WARNUNG')).length === 0,
        errors,
    };
}

/**
 * Default builtin skill manifests
 */
export const BUILTIN_SKILLS: SkillManifest[] = [
    {
        name: 'weather',
        version: '1.0.0',
        displayName: 'Wetter',
        description: 'Aktuelle Wettervorhersage fuer jeden Ort',
        entry: 'WeatherService.ts',
        author: 'NEON',
        icon: 'CloudSun',
        category: 'lifestyle',
        runtime: 'node',
        permissions: ['network'],
        triggers: [
            { type: 'keyword', pattern: 'wetter', priority: 10 },
            { type: 'command', pattern: '/wetter', priority: 20 },
        ],
        settings: [
            { key: 'defaultCity', label: 'Standard-Stadt', type: 'text', default: 'Berlin' },
        ],
        source: 'builtin',
        verified: true,
        rating: 4.5,
        downloads: 0,
    },
    {
        name: 'knowledge-base',
        version: '1.0.0',
        displayName: 'Wissensdatenbank',
        description: 'Lade PDFs und Dokumente hoch fuer RAG-basierte Antworten',
        entry: 'service.ts',
        author: 'NEON',
        icon: 'BookOpen',
        category: 'knowledge',
        runtime: 'node',
        permissions: ['network', 'filesystem', 'database'],
        triggers: [
            { type: 'command', pattern: '/recherche', priority: 10 },
        ],
        source: 'builtin',
        verified: true,
        rating: 4.8,
        downloads: 0,
    },
    {
        name: 'web-search',
        version: '1.0.0',
        displayName: 'Web-Suche',
        description: 'DuckDuckGo und Wikipedia Suche',
        entry: 'WebSearchService.ts',
        author: 'NEON',
        icon: 'Globe',
        category: 'knowledge',
        runtime: 'node',
        permissions: ['network'],
        triggers: [
            { type: 'command', pattern: '/suche', priority: 10 },
        ],
        source: 'builtin',
        verified: true,
        rating: 4.2,
        downloads: 0,
    },
    {
        name: 'code-execution',
        version: '1.0.0',
        displayName: 'Code-Ausfuehrung',
        description: 'Fuehre JavaScript, Python und PowerShell Code sicher aus',
        entry: 'CodeExecutionService.ts',
        author: 'NEON',
        icon: 'Terminal',
        category: 'development',
        runtime: 'node',
        permissions: ['execute'],
        triggers: [
            { type: 'command', pattern: '/code', priority: 10 },
        ],
        source: 'builtin',
        verified: true,
        rating: 4.0,
        downloads: 0,
    },
];
