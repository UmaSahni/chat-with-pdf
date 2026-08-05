import express from 'express';
import cors from 'cors';
import * as dotenv from 'dotenv';
dotenv.config();

import { indexing } from './indexing_phase.js';
import { chatting } from './query_phase.js';

const app = express();
const PORT = process.env.PORT || 5001;

// Middlewares
app.use(cors());
app.use(express.json());

// Routes
app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', message: 'Veritas AI Backend is running' });
});

app.post('/api/index', async (req, res) => {
    try {
        console.log('Starting indexing process...');
        await indexing();
        console.log('Indexing completed successfully.');
        res.json({ success: true, message: 'Indexing completed successfully.' });
    } catch (error) {
        console.error('Error during indexing:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/query', async (req, res) => {
    const { question } = req.body;
    if (!question) {
        return res.status(400).json({ success: false, error: 'Question is required' });
    }

    try {
        console.log(`Processing query: "${question}"`);
        const result = await chatting(question);
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
