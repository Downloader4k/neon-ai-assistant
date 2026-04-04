import { Router } from 'express';
import { calendarService } from '../services/db/calendarService';
import { logger } from '../utils/logger';

const router = Router();

// GET /api/calendar/:userId - Alle Events abrufen
router.get('/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const { category } = req.query;
        const events = await calendarService.getAll(userId, {
            category: category as string,
        });
        res.json(events);
    } catch (error) {
        logger.error('Failed to get calendar events', { error });
        res.status(500).json({ error: 'Fehler beim Laden der Termine' });
    }
});

// GET /api/calendar/:userId/range - Events nach Zeitraum
router.get('/:userId/range', async (req, res) => {
    try {
        const { userId } = req.params;
        const { startDate, endDate } = req.query;
        if (!startDate || !endDate) {
            res.status(400).json({ error: 'startDate und endDate sind erforderlich' });
            return;
        }
        const events = await calendarService.getByDateRange(
            userId,
            new Date(startDate as string),
            new Date(endDate as string),
        );
        res.json(events);
    } catch (error) {
        logger.error('Failed to get calendar range', { error });
        res.status(500).json({ error: 'Fehler beim Laden der Termine' });
    }
});

// GET /api/calendar/:userId/upcoming - Naechste Termine
router.get('/:userId/upcoming', async (req, res) => {
    try {
        const days = parseInt(req.query.days as string) || 7;
        const events = await calendarService.getUpcoming(req.params.userId, days);
        res.json(events);
    } catch (error) {
        res.status(500).json({ error: 'Fehler beim Laden der naechsten Termine' });
    }
});

// GET /api/calendar/:userId/stats - Statistiken
router.get('/:userId/stats', async (req, res) => {
    try {
        const stats = await calendarService.getStats(req.params.userId);
        res.json(stats);
    } catch (error) {
        res.status(500).json({ error: 'Fehler beim Laden der Statistiken' });
    }
});

// GET /api/calendar/:userId/categories - Alle Kategorien
router.get('/:userId/categories', async (req, res) => {
    try {
        const categories = await calendarService.getCategories(req.params.userId);
        res.json(categories);
    } catch (error) {
        res.status(500).json({ error: 'Fehler beim Laden der Kategorien' });
    }
});

// POST /api/calendar - Neues Event erstellen
router.post('/', async (req, res) => {
    try {
        const { userId, title, description, startDate, endDate, location, category, color, isAllDay } = req.body;
        if (!userId || !title || !startDate) {
            res.status(400).json({ error: 'userId, title und startDate sind erforderlich' });
            return;
        }

        let finalCategory = category;
        let finalColor = color;

        // AI auto-categorize if no category given
        if (!category) {
            const ai = calendarService.aiCategorize(title);
            finalCategory = ai.category;
            if (!color) finalColor = ai.color;
        }

        const event = await calendarService.create({
            userId,
            title,
            description,
            startDate,
            endDate,
            location,
            category: finalCategory,
            color: finalColor,
            isAllDay,
        });
        res.json(event);
    } catch (error) {
        logger.error('Failed to create calendar event', { error });
        res.status(500).json({ error: 'Fehler beim Erstellen des Termins' });
    }
});

// PATCH /api/calendar/:id - Event aktualisieren
router.patch('/:id', async (req, res) => {
    try {
        const event = await calendarService.update(req.params.id, req.body);
        res.json(event);
    } catch (error: any) {
        logger.error('Calendar update error:', error?.message || error);
        res.status(500).json({ error: 'Fehler beim Bearbeiten', details: error?.message });
    }
});

// DELETE /api/calendar/:id - Event loeschen
router.delete('/:id', async (req, res) => {
    try {
        await calendarService.delete(req.params.id);
        res.json({ success: true });
    } catch (error: any) {
        logger.error('Calendar delete error:', error?.message || error);
        res.status(500).json({ error: 'Fehler beim Loeschen', details: error?.message });
    }
});

export default router;
