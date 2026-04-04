/**
 * Skill Registry
 *
 * Central registry for all installed skills (builtin + external).
 * Handles skill discovery, installation, activation, and execution.
 */

import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../../utils/logger';
import {
    SkillManifest, InstalledSkill, BUILTIN_SKILLS,
    validateManifest, SkillCategory
} from './SkillManifest';
import { prisma } from '../db/prisma';

const SKILLS_DIR = path.join(process.cwd(), 'skills');
const SKILLS_DB_PREFIX = 'skill:';

class SkillRegistry {
    private skills = new Map<string, InstalledSkill>();
    private initialized = false;

    /**
     * Initialize the registry - load builtin + installed skills
     */
    async initialize(): Promise<void> {
        if (this.initialized) return;

        // Ensure skills directory exists
        if (!fs.existsSync(SKILLS_DIR)) {
            fs.mkdirSync(SKILLS_DIR, { recursive: true });
        }

        // Load builtin skills
        for (const manifest of BUILTIN_SKILLS) {
            this.skills.set(manifest.name, {
                manifest,
                installPath: 'builtin',
                enabled: true,
                installedAt: new Date(),
                updatedAt: new Date(),
                userSettings: {},
            });
        }

        // Load installed skills from skills directory
        await this.discoverSkills();

        // Load enabled/disabled state and settings from DB
        await this.loadStatesFromDB();

        this.initialized = true;
        logger.info(`[SkillRegistry] Initialized with ${this.skills.size} skills`);
    }

    /**
     * Discover skills in the skills directory
     */
    private async discoverSkills(): Promise<void> {
        try {
            const entries = fs.readdirSync(SKILLS_DIR, { withFileTypes: true });

            for (const entry of entries) {
                if (!entry.isDirectory()) continue;

                const manifestPath = path.join(SKILLS_DIR, entry.name, 'manifest.json');
                if (!fs.existsSync(manifestPath)) continue;

                try {
                    const manifestJson = fs.readFileSync(manifestPath, 'utf-8');
                    const manifest = JSON.parse(manifestJson) as SkillManifest;
                    const validation = validateManifest(manifest);

                    if (!validation.valid) {
                        logger.warn(`[SkillRegistry] Invalid manifest in ${entry.name}:`, validation.errors);
                        continue;
                    }

                    this.skills.set(manifest.name, {
                        manifest: { ...manifest, source: manifest.source || 'local' },
                        installPath: path.join(SKILLS_DIR, entry.name),
                        enabled: false, // Disabled by default until loaded from DB
                        installedAt: new Date(),
                        updatedAt: new Date(),
                        userSettings: {},
                    });

                    logger.info(`[SkillRegistry] Discovered skill: ${manifest.name} v${manifest.version}`);
                } catch (err) {
                    logger.warn(`[SkillRegistry] Failed to load manifest from ${entry.name}`, { err });
                }
            }
        } catch (error) {
            logger.error('[SkillRegistry] Failed to discover skills', { error });
        }
    }

    /**
     * Load skill states from database
     */
    private async loadStatesFromDB(): Promise<void> {
        try {
            const prefs = await prisma.userPreference.findMany({
                where: {
                    userId: 'system',
                    key: { startsWith: SKILLS_DB_PREFIX },
                },
            });

            for (const pref of prefs) {
                const skillName = pref.key.replace(SKILLS_DB_PREFIX, '').replace(':enabled', '').replace(':settings', '');
                const skill = this.skills.get(skillName);
                if (!skill) continue;

                if (pref.key.endsWith(':enabled')) {
                    skill.enabled = pref.value === 'true';
                } else if (pref.key.endsWith(':settings')) {
                    try {
                        skill.userSettings = JSON.parse(pref.value);
                    } catch { /* ignore */ }
                }
            }
        } catch (error) {
            logger.error('[SkillRegistry] Failed to load states from DB', { error });
        }
    }

    /**
     * Install a skill from a local directory
     */
    async installFromLocal(sourcePath: string): Promise<{ success: boolean; error?: string }> {
        const manifestPath = path.join(sourcePath, 'manifest.json');

        if (!fs.existsSync(manifestPath)) {
            return { success: false, error: 'Keine manifest.json gefunden' };
        }

        try {
            const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as SkillManifest;
            const validation = validateManifest(manifest);

            if (!validation.valid) {
                return { success: false, error: `Ungueltige Manifest: ${validation.errors.join(', ')}` };
            }

            // Check if already installed
            if (this.skills.has(manifest.name) && this.skills.get(manifest.name)?.manifest.source === 'builtin') {
                return { success: false, error: 'Builtin-Skills koennen nicht ueberschrieben werden' };
            }

            // Copy to skills directory
            const destPath = path.join(SKILLS_DIR, manifest.name);
            if (fs.existsSync(destPath)) {
                fs.rmSync(destPath, { recursive: true });
            }
            this.copyDirectory(sourcePath, destPath);

            // Register skill
            this.skills.set(manifest.name, {
                manifest: { ...manifest, source: 'local' },
                installPath: destPath,
                enabled: true,
                installedAt: new Date(),
                updatedAt: new Date(),
                userSettings: {},
            });

            // Save state
            await this.saveSkillState(manifest.name, true);

            logger.info(`[SkillRegistry] Installed skill: ${manifest.name} v${manifest.version}`);
            return { success: true };
        } catch (error) {
            logger.error('[SkillRegistry] Install failed', { error });
            return { success: false, error: 'Installation fehlgeschlagen' };
        }
    }

    /**
     * Install a skill from a GitHub URL
     */
    async installFromGitHub(repoUrl: string): Promise<{ success: boolean; error?: string }> {
        // Parse GitHub URL
        const match = repoUrl.match(/github\.com\/([^/]+)\/([^/]+)/);
        if (!match) {
            return { success: false, error: 'Ungueltige GitHub-URL' };
        }

        const [, owner, repo] = match;
        const cleanRepo = repo.replace('.git', '');

        try {
            // Download as ZIP
            const zipUrl = `https://github.com/${owner}/${cleanRepo}/archive/refs/heads/main.zip`;
            const response = await fetch(zipUrl);

            if (!response.ok) {
                // Try master branch
                const masterZipUrl = `https://github.com/${owner}/${cleanRepo}/archive/refs/heads/master.zip`;
                const masterResponse = await fetch(masterZipUrl);
                if (!masterResponse.ok) {
                    return { success: false, error: `GitHub-Repository nicht erreichbar (${response.status})` };
                }
            }

            // For now, return instructions - full ZIP extraction would need 'adm-zip' or similar
            return {
                success: false,
                error: `GitHub-Installation: Bitte lade das Repository manuell herunter und installiere es ueber den lokalen Pfad: git clone ${repoUrl} ${path.join(SKILLS_DIR, cleanRepo)}`,
            };
        } catch (error) {
            logger.error('[SkillRegistry] GitHub install failed', { error });
            return { success: false, error: 'GitHub-Download fehlgeschlagen' };
        }
    }

    /**
     * Uninstall a skill
     */
    async uninstall(skillName: string): Promise<{ success: boolean; error?: string }> {
        const skill = this.skills.get(skillName);
        if (!skill) {
            return { success: false, error: 'Skill nicht gefunden' };
        }

        if (skill.manifest.source === 'builtin') {
            return { success: false, error: 'Builtin-Skills koennen nicht deinstalliert werden' };
        }

        try {
            // Remove files
            if (fs.existsSync(skill.installPath)) {
                fs.rmSync(skill.installPath, { recursive: true });
            }

            // Remove from registry
            this.skills.delete(skillName);

            // Remove from DB
            await prisma.userPreference.deleteMany({
                where: {
                    userId: 'system',
                    key: { startsWith: `${SKILLS_DB_PREFIX}${skillName}:` },
                },
            });

            logger.info(`[SkillRegistry] Uninstalled skill: ${skillName}`);
            return { success: true };
        } catch (error) {
            logger.error('[SkillRegistry] Uninstall failed', { error });
            return { success: false, error: 'Deinstallation fehlgeschlagen' };
        }
    }

    /**
     * Enable/disable a skill
     */
    async toggleSkill(skillName: string, enabled: boolean): Promise<void> {
        const skill = this.skills.get(skillName);
        if (!skill) return;

        skill.enabled = enabled;
        await this.saveSkillState(skillName, enabled);

        logger.info(`[SkillRegistry] Skill ${skillName} ${enabled ? 'enabled' : 'disabled'}`);
    }

    /**
     * Update skill settings
     */
    async updateSettings(skillName: string, settings: Record<string, any>): Promise<void> {
        const skill = this.skills.get(skillName);
        if (!skill) return;

        skill.userSettings = { ...skill.userSettings, ...settings };

        try {
            await prisma.userPreference.upsert({
                where: {
                    userId_key: { userId: 'system', key: `${SKILLS_DB_PREFIX}${skillName}:settings` },
                },
                update: { value: JSON.stringify(skill.userSettings) },
                create: {
                    userId: 'system',
                    key: `${SKILLS_DB_PREFIX}${skillName}:settings`,
                    value: JSON.stringify(skill.userSettings),
                    category: 'skill_settings',
                },
            });
        } catch (error) {
            logger.error('[SkillRegistry] Failed to save settings', { error });
        }
    }

    /**
     * Get all skills (for UI)
     */
    getAll(): InstalledSkill[] {
        return Array.from(this.skills.values());
    }

    /**
     * Get skills by category
     */
    getByCategory(category: SkillCategory): InstalledSkill[] {
        return this.getAll().filter(s => s.manifest.category === category);
    }

    /**
     * Get enabled skills
     */
    getEnabled(): InstalledSkill[] {
        return this.getAll().filter(s => s.enabled);
    }

    /**
     * Get a specific skill
     */
    get(name: string): InstalledSkill | undefined {
        return this.skills.get(name);
    }

    /**
     * Find skills matching a message (for SkillProcessor)
     */
    findMatchingSkills(message: string): InstalledSkill[] {
        const matches: InstalledSkill[] = [];
        const lower = message.toLowerCase();

        for (const skill of this.skills.values()) {
            if (!skill.enabled || !skill.manifest.triggers) continue;

            for (const trigger of skill.manifest.triggers) {
                let matched = false;

                switch (trigger.type) {
                    case 'keyword':
                        matched = lower.includes(trigger.pattern.toLowerCase());
                        break;
                    case 'regex':
                        try {
                            matched = new RegExp(trigger.pattern, 'i').test(message);
                        } catch { /* invalid regex */ }
                        break;
                    case 'command':
                        matched = lower.startsWith(trigger.pattern.toLowerCase());
                        break;
                }

                if (matched) {
                    matches.push(skill);
                    break;
                }
            }
        }

        return matches.sort((a, b) => {
            const aPriority = Math.max(...(a.manifest.triggers?.map(t => t.priority || 0) || [0]));
            const bPriority = Math.max(...(b.manifest.triggers?.map(t => t.priority || 0) || [0]));
            return bPriority - aPriority;
        });
    }

    /**
     * Rate a skill
     */
    async rateSkill(skillName: string, rating: number): Promise<void> {
        const skill = this.skills.get(skillName);
        if (!skill) return;

        // Simple average for now
        const currentRating = skill.manifest.rating || 0;
        const currentDownloads = skill.manifest.downloads || 1;
        skill.manifest.rating = (currentRating * currentDownloads + rating) / (currentDownloads + 1);
        skill.manifest.downloads = currentDownloads + 1;

        try {
            await prisma.userPreference.upsert({
                where: {
                    userId_key: { userId: 'system', key: `${SKILLS_DB_PREFIX}${skillName}:rating` },
                },
                update: { value: JSON.stringify({ rating: skill.manifest.rating, downloads: skill.manifest.downloads }) },
                create: {
                    userId: 'system',
                    key: `${SKILLS_DB_PREFIX}${skillName}:rating`,
                    value: JSON.stringify({ rating: skill.manifest.rating, downloads: skill.manifest.downloads }),
                    category: 'skill_ratings',
                },
            });
        } catch (error) {
            logger.error('[SkillRegistry] Failed to save rating', { error });
        }
    }

    // Helpers

    private async saveSkillState(skillName: string, enabled: boolean): Promise<void> {
        try {
            await prisma.userPreference.upsert({
                where: {
                    userId_key: { userId: 'system', key: `${SKILLS_DB_PREFIX}${skillName}:enabled` },
                },
                update: { value: String(enabled) },
                create: {
                    userId: 'system',
                    key: `${SKILLS_DB_PREFIX}${skillName}:enabled`,
                    value: String(enabled),
                    category: 'skill_states',
                },
            });
        } catch (error) {
            logger.error('[SkillRegistry] Failed to save skill state', { error });
        }
    }

    private copyDirectory(src: string, dest: string): void {
        fs.mkdirSync(dest, { recursive: true });
        const entries = fs.readdirSync(src, { withFileTypes: true });

        for (const entry of entries) {
            const srcPath = path.join(src, entry.name);
            const destPath = path.join(dest, entry.name);

            if (entry.isDirectory()) {
                this.copyDirectory(srcPath, destPath);
            } else {
                fs.copyFileSync(srcPath, destPath);
            }
        }
    }
}

export const skillRegistry = new SkillRegistry();
