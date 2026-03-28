import { Router } from 'express';
import { prisma } from '../services/db/prisma';

const router = Router();

// GET /api/profiles - Alle Profile laden
router.get('/', async (_req, res) => {
    try {
        const users = await prisma.user.findMany({
            select: { id: true, name: true, avatar: true },
            orderBy: { createdAt: 'asc' },
        });
        res.json(users);
    } catch (error) {
        console.error('Failed to load profiles:', error);
        res.status(500).json({ error: 'Profile konnten nicht geladen werden' });
    }
});

// POST /api/profiles - Neues Profil erstellen
router.post('/', async (req, res) => {
    try {
        const { id, name, avatar } = req.body;
        if (!name) {
            return res.status(400).json({ error: 'Name ist erforderlich' });
        }
        const user = await prisma.user.create({
            data: {
                id: id || `user-${Date.now()}`,
                name,
                avatar: avatar || '👤',
            },
            select: { id: true, name: true, avatar: true },
        });
        res.json(user);
    } catch (error) {
        console.error('Failed to create profile:', error);
        res.status(500).json({ error: 'Profil konnte nicht erstellt werden' });
    }
});

// PUT /api/profiles/:id - Profil aktualisieren
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { name, avatar } = req.body;
        const data: any = {};
        if (name !== undefined) data.name = name;
        if (avatar !== undefined) data.avatar = avatar;

        const user = await prisma.user.update({
            where: { id },
            data,
            select: { id: true, name: true, avatar: true },
        });
        res.json(user);
    } catch (error) {
        console.error('Failed to update profile:', error);
        res.status(500).json({ error: 'Profil konnte nicht aktualisiert werden' });
    }
});

// DELETE /api/profiles/:id - Profil loeschen (nicht default-user)
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        if (id === 'default-user') {
            return res.status(400).json({ error: 'Standard-Profil kann nicht geloescht werden' });
        }
        await prisma.user.delete({ where: { id } });
        res.json({ success: true });
    } catch (error) {
        console.error('Failed to delete profile:', error);
        res.status(500).json({ error: 'Profil konnte nicht geloescht werden' });
    }
});

export { router as profileRoutes };
