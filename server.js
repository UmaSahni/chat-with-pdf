import express from 'express';
import cors from 'cors';
import multer from 'multer';
import * as dotenv from 'dotenv';
dotenv.config();

import { indexing } from './indexing_phase.js';
import { chatting } from './query_phase.js';

const app = express();
const PORT = process.env.PORT || 5001;

// Configure Multer for In-Memory uploads
const upload = multer({ storage: multer.memoryStorage() });

// Middlewares
app.use(cors());
app.use(express.json());

// Routes
app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', message: 'Veritas AI Backend is running' });
});

// Dynamic File Upload & Ingestion Endpoint
app.post('/api/upload', upload.single('file'), async (req, res) => {
    try {
        const { docType, namespace } = req.body;
        if (!req.file) {
            return res.status(400).json({ success: false, error: 'No file uploaded' });
        }
        if (!namespace) {
            return res.status(400).json({ success: false, error: 'Namespace is required' });
        }

        console.log(`Received upload: "${req.file.originalname}", size: ${req.file.size} bytes. Target namespace: "${namespace}", docType: "${docType}"`);
        await indexing(req.file.buffer, req.file.originalname, docType || 'general', namespace);
        
        res.json({ 
            success: true, 
            message: `File "${req.file.originalname}" indexed successfully in namespace "${namespace}".` 
        });
    } catch (error) {
        console.error('Error during upload and indexing:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Query / QA Endpoint with Namespace and Metadata Filter support
app.post('/api/query', async (req, res) => {
    const { question, namespace, docTypeFilter } = req.body;
    if (!question) {
        return res.status(400).json({ success: false, error: 'Question is required' });
    }

    const ns = namespace || 'default';

    try {
        console.log(`Processing query: "${question}" in namespace: "${ns}", filter: "${docTypeFilter || 'none'}"`);
        const result = await chatting(question, ns, docTypeFilter);
        res.json({
            success: true,
            answer: result.answer,
            matches: result.matches
        });
    } catch (error) {
        console.error('Error during query:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`Backend server is running on http://localhost:${PORT}`);
});
