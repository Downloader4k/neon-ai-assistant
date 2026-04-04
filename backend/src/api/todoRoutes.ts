import { Router } from 'express';
import { todoService } from '../services/db/todoService';
import { logger } from '../utils/logger';

const router = Router();

// GET /api/todos/:userId - Alle Todos abrufen
router.get('/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const { status, category, priority } = req.query;
        const todos = await todoService.getAll(userId, {
            status: status as string,
            category: category as string,
            priority: priority as string,
        });
        res.json(todos);
    } catch (error) {
        logger.error('Failed to get todos', { error });
        res.status(500).json({ error: 'Fehler beim Laden der Todos' });
    }
});

// GET /api/todos/:userId/stats - Statistiken
router.get('/:userId/stats', async (req, res) => {
    try {
        const stats = await todoService.getStats(req.params.userId);
        res.json(stats);
    } catch (error) {
        res.status(500).json({ error: 'Fehler beim Laden der Statistiken' });
    }
});

// GET /api/todos/:userId/categories - Alle Kategorien
router.get('/:userId/categories', async (req, res) => {
    try {
        const categories = await todoService.getCategories(req.params.userId);
        res.json(categories);
    } catch (error) {
        res.status(500).json({ error: 'Fehler beim Laden der Kategorien' });
    }
});

// POST /api/todos - Neues Todo erstellen
router.post('/', async (req, res) => {
    try {
        const { userId, title, description, category, priority, dueDate, autoCategories } = req.body;
        if (!userId || !title) {
            res.status(400).json({ error: 'userId und title sind erforderlich' });
            return;
        }

        let finalCategory = category;
        let finalPriority = priority;

        // AI auto-categorize if requested or no category given
        if (autoCategories !== false && !category) {
            const ai = await todoService.aiCategorize(title);
            finalCategory = ai.category;
            if (!priority) finalPriority = ai.priority;
        }

        const todo = await todoService.create({
            userId,
            title,
            description,
            category: finalCategory,
            priority: finalPriority,
            dueDate,
        });
        res.json(todo);
    } catch (error) {
        logger.error('Failed to create todo', { error });
        res.status(500).json({ error: 'Fehler beim Erstellen des Todos' });
    }
});

// PATCH /api/todos/:id - Todo aktualisieren
router.patch('/:id', async (req, res) => {
    try {
        const todo = await todoService.update(req.params.id, req.body);
        res.json(todo);
    } catch (error) {
        res.status(500).json({ error: 'Fehler beim Aktualisieren' });
    }
});

// PATCH /api/todos/:id/complete - Todo abschliessen
router.patch('/:id/complete', async (req, res) => {
    try {
        const todo = await todoService.complete(req.params.id);
        res.json(todo);
    } catch (error) {
        res.status(500).json({ error: 'Fehler beim Abschliessen' });
    }
});

// PATCH /api/todos/:id/reopen - Todo wieder oeffnen
router.patch('/:id/reopen', async (req, res) => {
    try {
        const todo = await todoService.reopen(req.params.id);
        res.json(todo);
    } catch (error) {
        res.status(500).json({ error: 'Fehler beim Wiedereroeffnen' });
    }
});

// DELETE /api/todos/:id - Todo loeschen
router.delete('/:id', async (req, res) => {
    try {
        await todoService.delete(req.params.id);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Fehler beim Loeschen' });
    }
});

export default router;
