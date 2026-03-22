/**
 * Auth-Middleware fuer sicheren Netzwerk-Zugriff
 *
 * Schuetzt API-Endpoints mit Token-basierter Authentifizierung.
 * Token wird in .env als API_ACCESS_TOKEN konfiguriert.
 * Ohne gesetzten Token ist der Zugriff offen (Entwicklungsmodus).
 */
import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import { RateLimiter } from '../utils/security';

// Rate Limiter: Max 100 Requests pro Minute pro IP
const apiRateLimiter = new RateLimiter();
const MAX_REQUESTS = 100;
const WINDOW_MS = 60 * 1000; // 1 Minute

/**
 * Token-basierte Auth-Middleware
 * Prueft Authorization-Header oder ?token= Query-Parameter
 */
export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
    const accessToken = process.env.API_ACCESS_TOKEN;

    // Kein Token konfiguriert = offener Zugriff (Entwicklung)
    if (!accessToken) {
        return next();
    }

    // Token aus Header oder Query extrahieren
    const authHeader = req.headers.authorization;
    const queryToken = req.query.token as string | undefined;

    let providedToken: string | null = null;

    if (authHeader?.startsWith('Bearer ')) {
        providedToken = authHeader.slice(7);
    } else if (queryToken) {
        providedToken = queryToken;
    }

    if (!providedToken || providedToken !== accessToken) {
        logger.warn('Unautorisierter Zugriff blockiert', {
            ip: req.ip,
            path: req.path,
            method: req.method,
        });
        res.status(401).json({ error: 'Nicht autorisiert. Token erforderlich.' });
        return;
    }

    next();
}

/**
 * Rate-Limiting Middleware
 * Schuetzt vor Brute-Force und API-Missbrauch
 */
export function rateLimitMiddleware(req: Request, res: Response, next: NextFunction): void {
    const identifier = req.ip || req.socket.remoteAddress || 'unknown';

    if (!apiRateLimiter.isAllowed(identifier, MAX_REQUESTS, WINDOW_MS)) {
        logger.warn('Rate-Limit ueberschritten', { ip: identifier, path: req.path });
        res.status(429).json({
            error: 'Zu viele Anfragen. Bitte warte einen Moment.',
            retryAfter: Math.ceil(WINDOW_MS / 1000),
        });
        return;
    }

    next();
}

/**
 * Admin-Auth Middleware (strenger)
 * Schuetzt Admin-Endpoints zusaetzlich
 */
export function adminAuthMiddleware(req: Request, res: Response, next: NextFunction): void {
    const adminToken = process.env.ADMIN_ACCESS_TOKEN || process.env.API_ACCESS_TOKEN;

    // Kein Token = offen (Entwicklung)
    if (!adminToken) {
        return next();
    }

    const authHeader = req.headers.authorization;
    let providedToken: string | null = null;

    if (authHeader?.startsWith('Bearer ')) {
        providedToken = authHeader.slice(7);
    }

    if (!providedToken || providedToken !== adminToken) {
        logger.warn('Unautorisierter Admin-Zugriff blockiert', {
            ip: req.ip,
            path: req.path,
        });
        res.status(403).json({ error: 'Admin-Zugriff verweigert.' });
        return;
    }

    next();
}

/**
 * Input-Sanitization Middleware
 * Bereinigt alle eingehenden Strings gegen XSS
 */
export function sanitizeMiddleware(req: Request, _res: Response, next: NextFunction): void {
    if (req.body && typeof req.body === 'object') {
        sanitizeObject(req.body);
    }
    next();
}

function sanitizeObject(obj: any): void {
    for (const key of Object.keys(obj)) {
        if (typeof obj[key] === 'string') {
            // Entferne gefaehrliche Muster, aber erhalte normalen Text
            obj[key] = obj[key]
                .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
                .replace(/javascript:/gi, '')
                .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '');
        } else if (typeof obj[key] === 'object' && obj[key] !== null) {
            sanitizeObject(obj[key]);
        }
    }
}
