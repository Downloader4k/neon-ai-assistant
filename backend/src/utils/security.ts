/**
 * Security utilities for input sanitization and encryption
 */
import crypto from 'crypto';

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex');
const ALGORITHM = 'aes-256-cbc';

/**
 * Sanitize user input to prevent XSS
 */
export function sanitizeInput(input: string): string {
    return input
        .replace(/[<>]/g, '') // Remove angle brackets
        .replace(/javascript:/gi, '') // Remove javascript: protocol
        .replace(/on\w+\s*=/gi, '') // Remove event handlers
        .trim();
}

/**
 * Validate and sanitize SQL-like inputs (Prisma handles this, but extra safety)
 */
export function validateDatabaseInput(input: string): boolean {
    const dangerousPatterns = [
        /(\b(DROP|DELETE|UPDATE|INSERT|ALTER|CREATE)\b)/gi,
        /(--|\$|;|'|")/g,
    ];

    return !dangerousPatterns.some((pattern) => pattern.test(input));
}

/**
 * Encrypt sensitive data
 */
export function encrypt(text: string): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(
        ALGORITHM,
        Buffer.from(ENCRYPTION_KEY.slice(0, 32)),
        iv
    );

    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    return `${iv.toString('hex')}:${encrypted}`;
}

/**
 * Decrypt sensitive data
 */
export function decrypt(encryptedText: string): string {
    const parts = encryptedText.split(':');
    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = parts[1];

    const decipher = crypto.createDecipheriv(
        ALGORITHM,
        Buffer.from(ENCRYPTION_KEY.slice(0, 32)),
        iv
    );

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
}

/**
 * Hash passwords (though not used in current implementation)
 */
export function hashPassword(password: string): string {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
    return `${salt}:${hash}`;
}

/**
 * Verify password hash
 */
export function verifyPassword(password: string, hashedPassword: string): boolean {
    const [salt, hash] = hashedPassword.split(':');
    const verifyHash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
    return hash === verifyHash;
}

/**
 * Generate secure random token
 */
export function generateToken(length: number = 32): string {
    return crypto.randomBytes(length).toString('hex');
}

/**
 * Rate limiting helper (simple in-memory implementation)
 */
export class RateLimiter {
    private requests: Map<string, number[]> = new Map();

    /**
     * Check if request is allowed
     */
    isAllowed(identifier: string, maxRequests: number, windowMs: number): boolean {
        const now = Date.now();
        const requests = this.requests.get(identifier) || [];

        // Filter out old requests outside the window
        const recentRequests = requests.filter((timestamp) => now - timestamp < windowMs);

        if (recentRequests.length >= maxRequests) {
            return false;
        }

        // Add current request
        recentRequests.push(now);
        this.requests.set(identifier, recentRequests);

        return true;
    }

    /**
     * Clear old entries periodically
     */
    cleanup() {
        const now = Date.now();
        for (const [key, timestamps] of this.requests.entries()) {
            const recent = timestamps.filter((ts) => now - ts < 60000); // Keep last minute
            if (recent.length === 0) {
                this.requests.delete(key);
            } else {
                this.requests.set(key, recent);
            }
        }
    }
}

export const rateLimiter = new RateLimiter();

// Cleanup every minute
setInterval(() => rateLimiter.cleanup(), 60000);
