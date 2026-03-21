/**
 * Plugin system infrastructure
 */

export interface Plugin {
    id: string;
    name: string;
    version: string;
    author: string;
    description: string;
    permissions: string[];
    entryPoint: string;
}

export interface PluginContext {
    api: {
        sendMessage: (message: string) => Promise<void>;
        getMemories: (query: string) => Promise<any[]>;
        createMemory: (content: string) => Promise<void>;
        search: (query: string) => Promise<any[]>;
    };
    ui: {
        showNotification: (message: string) => void;
        showModal: (content: any) => void;
    };
}

export class PluginManager {
    private plugins: Map<string, Plugin> = new Map();
    private loadedPlugins: Map<string, any> = new Map();

    /**
     * Register a plugin
     */
    async registerPlugin(plugin: Plugin) {
        if (this.plugins.has(plugin.id)) {
            throw new Error(`Plugin ${plugin.id} already registered`);
        }

        // Validate permissions
        this.validatePermissions(plugin.permissions);

        this.plugins.set(plugin.id, plugin);
        console.log(`Plugin registered: ${plugin.name} v${plugin.version}`);
    }

    /**
     * Load a plugin by its registered ID
     */
    async loadPlugin(pluginId: string) {
        const plugin = this.plugins.get(pluginId);
        if (!plugin) {
            throw new Error(`Plugin ${pluginId} not found`);
        }

        if (this.loadedPlugins.has(pluginId)) {
            console.log(`Plugin ${plugin.name} already loaded`);
            return this.loadedPlugins.get(pluginId);
        }

        try {
            const module = await import(plugin.entryPoint);
            const PluginClass = module.default || module;

            const instance = typeof PluginClass === 'function'
                ? new PluginClass()
                : PluginClass;

            this.loadedPlugins.set(pluginId, instance);

            if (typeof instance.onLoad === 'function') {
                await instance.onLoad();
            }

            console.log(`Plugin loaded: ${plugin.name} v${plugin.version}`);
            return instance;
        } catch (error) {
            console.error(`Failed to load plugin ${pluginId}:`, error);
            throw error;
        }
    }

    /**
     * Unload a plugin
     */
    async unloadPlugin(pluginId: string) {
        const instance = this.loadedPlugins.get(pluginId);
        if (!instance) {
            return;
        }

        if (instance.onUnload) {
            await instance.onUnload();
        }

        this.loadedPlugins.delete(pluginId);
        console.log(`Plugin unloaded: ${pluginId}`);
    }

    /**
     * Get all registered plugins
     */
    getPlugins(): Plugin[] {
        return Array.from(this.plugins.values());
    }

    /**
     * Validate plugin permissions
     */
    private validatePermissions(permissions: string[]) {
        const allowedPermissions = [
            'messages.read',
            'messages.write',
            'memories.read',
            'memories.write',
            'search',
            'notifications',
            'ui.modal',
        ];

        for (const perm of permissions) {
            if (!allowedPermissions.includes(perm)) {
                throw new Error(`Invalid permission: ${perm}`);
            }
        }
    }
}

export const pluginManager = new PluginManager();

// Example plugin
export const examplePlugin: Plugin = {
    id: 'example-plugin',
    name: 'Example Plugin',
    version: '1.0.0',
    author: 'NEON Team',
    description: 'An example plugin demonstrating the plugin API',
    permissions: ['messages.read', 'notifications'],
    entryPoint: './plugins/example/index.js',
};
