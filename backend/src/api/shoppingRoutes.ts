import { Router } from 'express';
import { shoppingService } from '../services/db/shoppingService';
import { logger } from '../utils/logger';

const router = Router();

// GET /api/shopping/:userId - Alle Items abrufen
router.get('/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const { isPurchased, store, category, listId } = req.query;
        const items = await shoppingService.getItems(userId, {
            isPurchased: isPurchased !== undefined ? isPurchased === 'true' : undefined,
            store: store as string,
            category: category as string,
            listId: listId as string,
        });
        res.json(items);
    } catch (error) {
        logger.error('Failed to get shopping items', { error });
        res.status(500).json({ error: 'Fehler beim Laden der Einkaufsliste' });
    }
});

// GET /api/shopping/:userId/stores - Alle Laeden
router.get('/:userId/stores', async (req, res) => {
    try {
        const stores = await shoppingService.getStores(req.params.userId);
        res.json(stores);
    } catch (error) {
        res.status(500).json({ error: 'Fehler beim Laden der Laeden' });
    }
});

// GET /api/shopping/:userId/categories - Alle Kategorien
router.get('/:userId/categories', async (req, res) => {
    try {
        const categories = await shoppingService.getCategories(req.params.userId);
        res.json(categories);
    } catch (error) {
        res.status(500).json({ error: 'Fehler beim Laden der Kategorien' });
    }
});

// GET /api/shopping/:userId/lists - Alle Einkaufslisten
router.get('/:userId/lists', async (req, res) => {
    try {
        const lists = await shoppingService.getLists(req.params.userId);
        res.json(lists);
    } catch (error) {
        res.status(500).json({ error: 'Fehler beim Laden der Listen' });
    }
});

// POST /api/shopping/item - Einzelnes Item hinzufuegen
router.post('/item', async (req, res) => {
    try {
        const { userId, name, quantity, category, store, listId } = req.body;
        if (!userId || !name) {
            res.status(400).json({ error: 'userId und name sind erforderlich' });
            return;
        }
        const item = await shoppingService.addItem({ userId, name, quantity, category, store, listId });
        res.json(item);
    } catch (error) {
        logger.error('Failed to add shopping item', { error });
        res.status(500).json({ error: 'Fehler beim Hinzufuegen' });
    }
});

// POST /api/shopping/items - Mehrere Items hinzufuegen (Batch)
router.post('/items', async (req, res) => {
    try {
        const { userId, items, listId } = req.body;
        if (!userId || !items || !Array.isArray(items)) {
            res.status(400).json({ error: 'userId und items[] sind erforderlich' });
            return;
        }
        const created = await shoppingService.addItems(userId, items, listId);
        res.json(created);
    } catch (error) {
        logger.error('Failed to add shopping items', { error });
        res.status(500).json({ error: 'Fehler beim Hinzufuegen' });
    }
});

// POST /api/shopping/list - Neue Einkaufsliste erstellen
router.post('/list', async (req, res) => {
    try {
        const { userId, name, store } = req.body;
        if (!userId || !name) {
            res.status(400).json({ error: 'userId und name sind erforderlich' });
            return;
        }
        const list = await shoppingService.createList(userId, name, store);
        res.json(list);
    } catch (error) {
        res.status(500).json({ error: 'Fehler beim Erstellen der Liste' });
    }
});

// PATCH /api/shopping/item/:id - Item bearbeiten
router.patch('/item/:id', async (req, res) => {
    try {
        const { name, quantity, category, store } = req.body;
        const item = await shoppingService.updateItem(req.params.id, { name, quantity, category, store });
        res.json(item);
    } catch (error: any) {
        logger.error('Update error:', error?.message || error);
        res.status(500).json({ error: 'Fehler beim Bearbeiten', details: error?.message });
    }
});

// PATCH /api/shopping/item/:id/toggle - Gekauft/Nicht gekauft umschalten
router.patch('/item/:id/toggle', async (req, res) => {
    try {
        const item = await shoppingService.togglePurchased(req.params.id);
        res.json(item);
    } catch (error: any) {
        logger.error('Toggle error:', error?.message || error);
        res.status(500).json({ error: 'Fehler beim Umschalten', details: error?.message });
    }
});

// DELETE /api/shopping/item/:id - Item loeschen
router.delete('/item/:id', async (req, res) => {
    try {
        await shoppingService.deleteItem(req.params.id);
        res.json({ success: true });
    } catch (error: any) {
        logger.error('Delete error:', error?.message || error);
        res.status(500).json({ error: 'Fehler beim Loeschen', details: error?.message });
    }
});

// DELETE /api/shopping/:userId/purchased - Alle gekauften Items entfernen
router.delete('/:userId/purchased', async (req, res) => {
    try {
        await shoppingService.clearPurchased(req.params.userId);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Fehler beim Aufraeumen' });
    }
});

// DELETE /api/shopping/list/:id - Einkaufsliste loeschen
router.delete('/list/:id', async (req, res) => {
    try {
        await shoppingService.deleteList(req.params.id);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Fehler beim Loeschen der Liste' });
    }
});

export default router;
