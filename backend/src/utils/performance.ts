/**
 * Performance monitoring and optimization utilities
 */

export class PerformanceMonitor {
    private metrics: Map<string, number[]> = new Map();

    /**
     * Track execution time
     */
    async track<T>(label: string, fn: () => Promise<T>): Promise<T> {
        const start = performance.now();

        try {
            const result = await fn();
            const duration = performance.now() - start;

            this.recordMetric(label, duration);

            return result;
        } catch (error) {
            const duration = performance.now() - start;
            this.recordMetric(`${label}_error`, duration);
            throw error;
        }
    }

    /**
     * Record a metric
     */
    private recordMetric(label: string, value: number) {
        const metrics = this.metrics.get(label) || [];
        metrics.push(value);

        // Keep only last 100 measurements
        if (metrics.length > 100) {
            metrics.shift();
        }

        this.metrics.set(label, metrics);
    }

    /**
     * Get statistics for a metric
     */
    getStats(label: string) {
        const metrics = this.metrics.get(label) || [];

        if (metrics.length === 0) {
            return null;
        }

        const sorted = [...metrics].sort((a, b) => a - b);

        return {
            count: metrics.length,
            min: sorted[0],
            max: sorted[sorted.length - 1],
            avg: metrics.reduce((a, b) => a + b, 0) / metrics.length,
            p50: sorted[Math.floor(sorted.length * 0.5)],
            p95: sorted[Math.floor(sorted.length * 0.95)],
            p99: sorted[Math.floor(sorted.length * 0.99)],
        };
    }

    /**
     * Get all metrics
     */
    getAllStats() {
        const stats: any = {};

        for (const [label, _] of this.metrics) {
            stats[label] = this.getStats(label);
        }

        return stats;
    }

    /**
     * Clear metrics
     */
    clear() {
        this.metrics.clear();
    }
}

export const performanceMonitor = new PerformanceMonitor();

/**
 * Cache utility for expensive operations
 */
export class Cache<T> {
    private cache: Map<string, { value: T; timestamp: number }> = new Map();
    private ttl: number;

    constructor(ttlMs: number = 60000) {
        this.ttl = ttlMs;
    }

    /**
     * Get from cache
     */
    get(key: string): T | null {
        const entry = this.cache.get(key);

        if (!entry) {
            return null;
        }

        // Check if expired
        if (Date.now() - entry.timestamp > this.ttl) {
            this.cache.delete(key);
            return null;
        }

        return entry.value;
    }

    /**
     * Set in cache
     */
    set(key: string, value: T) {
        this.cache.set(key, {
            value,
            timestamp: Date.now(),
        });
    }

    /**
     * Clear cache
     */
    clear() {
        this.cache.clear();
    }

    /**
     * Get or compute
     */
    async getOrCompute(key: string, fn: () => Promise<T>): Promise<T> {
        const cached = this.get(key);

        if (cached !== null) {
            return cached;
        }

        const value = await fn();
        this.set(key, value);

        return value;
    }
}

/**
 * Memory leak detector (simple version)
 */
export class MemoryMonitor {
    private baseline: number = 0;

    /**
     * Set baseline memory usage
     */
    setBaseline() {
        if (global.gc) {
            global.gc();
        }
        this.baseline = process.memoryUsage().heapUsed;
    }

    /**
     * Check for leaks
     */
    checkLeak(): { leaked: boolean; delta: number; current: number } {
        const current = process.memoryUsage().heapUsed;
        const delta = current - this.baseline;

        // Consider it a leak if memory grew by more than 100MB
        const leaked = delta > 100 * 1024 * 1024;

        return {
            leaked,
            delta,
            current,
        };
    }

    /**
     * Get memory stats
     */
    getStats() {
        const usage = process.memoryUsage();

        return {
            rss: Math.round(usage.rss / 1024 / 1024) + 'MB',
            heapTotal: Math.round(usage.heapTotal / 1024 / 1024) + 'MB',
            heapUsed: Math.round(usage.heapUsed / 1024 / 1024) + 'MB',
            external: Math.round(usage.external / 1024 / 1024) + 'MB',
        };
    }
}

export const memoryMonitor = new MemoryMonitor();
