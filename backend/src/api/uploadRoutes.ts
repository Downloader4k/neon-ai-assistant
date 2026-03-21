import { Router, Request, Response } from 'express';
import multer from 'multer';
const pdf = require('pdf-parse');
import { logger } from '../utils/logger';

const router = Router();

// Configure multer for memory storage
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB limit
    },
});

/**
 * POST /api/upload
 * Uploads a file and extracts text content
 */
router.post('/', upload.single('file'), async (req: Request, res: Response): Promise<void> => {
    try {
        if (!req.file) {
            res.status(400).json({ error: 'No file uploaded' });
            return;
        }

        const { mimetype, buffer, originalname } = req.file;
        logger.info(`File uploaded: ${originalname} (${mimetype})`);

        let textContent = '';

        if (mimetype === 'application/pdf') {
            try {
                const pdfData = await pdf(buffer);
                textContent = pdfData.text;
            } catch (pdfError) {
                logger.error('Error parsing PDF', { error: pdfError });
                res.status(500).json({ error: 'Failed to parse PDF file' });
                return;
            }
        } else if (mimetype === 'text/plain' || mimetype === 'text/markdown' || mimetype === 'application/json') {
            textContent = buffer.toString('utf-8');
        } else {
            // Try to read as text for other types, or reject?
            // For now, let's try to read as text and see
            textContent = buffer.toString('utf-8');
            logger.warn('Unknown mimetype, attempting to read as text', { mimetype });
        }

        // Clean up text (optional basic cleanup)
        textContent = textContent.trim();

        res.json({
            filename: originalname,
            mimetype,
            size: buffer.length,
            text: textContent
        });

    } catch (error) {
        logger.error('Upload error', { error });
        res.status(500).json({ error: 'Internal server error during upload' });
    }
});

export const uploadRoutes = router;
