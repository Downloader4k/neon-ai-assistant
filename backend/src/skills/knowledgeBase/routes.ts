import express, { Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { knowledgeBaseService } from './service';
import { logger } from '../../utils/logger';

const router = express.Router();

// Configure storage for file uploads
const uploadDir = path.join(process.cwd(), 'data', 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (_req, _file, cb) => {
        cb(null, uploadDir);
    },
    filename: (_req, file, cb) => {
        // Sanitize filename
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ storage: storage });

/**
 * GET /api/skills/knowledge-base/list
 * List all indexed documents
 */
router.get('/list', async (_req: Request, res: Response) => {
    try {
        const docs = await knowledgeBaseService.listDocuments();
        res.json({ success: true, documents: docs });
    } catch (error) {
        logger.error('Error listing documents', error);
        res.status(500).json({ success: false, error: 'Failed to list documents' });
    }
});

/**
 * POST /api/skills/knowledge-base/upload
 * Upload a document to index
 */
router.post('/upload', upload.single('file'), async (req: Request, res: Response) => {
    try {
        if (!req.file) {
            res.status(400).json({ success: false, error: 'No file uploaded' });
            return;
        }

        const filePath = req.file.path;
        const originalName = req.file.originalname;
        const mimeType = req.file.mimetype;

        await knowledgeBaseService.ingestFile(filePath, originalName, mimeType);

        // Cleanup: remove file after ingestion? 
        // For now keep it as "source of truth" or until user deletes.
        // Actually, maybe we should delete it IF we trust the vector store entirely.
        // Let's keep it for now.

        res.json({ success: true, message: `File ${originalName} indexed successfully` });
    } catch (error) {
        logger.error('Error uploading/ingesting file', error);
        res.status(500).json({ success: false, error: 'Failed to ingest file' });
    }
});

/**
 * POST /api/skills/knowledge-base/delete
 * Delete a document by filename
 */
router.post('/delete', async (req: Request, res: Response) => {
    try {
        const { filename } = req.body;
        if (!filename) {
            res.status(400).json({ success: false, error: 'Filename required' });
            return;
        }

        await knowledgeBaseService.deleteDocument(filename);
        res.json({ success: true, message: `Deleted ${filename}` });
    } catch (error) {
        logger.error('Error deleting document', error);
        res.status(500).json({ success: false, error: 'Failed to delete document' });
    }
});

/**
 * GET /api/skills/knowledge-base/query
 * Test query endpoint
 */
router.get('/query', async (req: Request, res: Response) => {
    try {
        const query = req.query.q as string;
        if (!query) {
            res.status(400).json({ success: false, error: 'Query parameter q required' });
            return;
        }

        const results = await knowledgeBaseService.query(query);
        res.json({ success: true, results });
    } catch (error) {
        logger.error('Error querying knowledge base', error);
        res.status(500).json({ success: false, error: 'Query failed' });
    }
});

export default router;
