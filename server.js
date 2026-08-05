import express from 'express';
import cors from 'cors';
import multer from 'multer';
import mongoose from 'mongoose';
import path from 'path';
import fs from 'fs';
import * as dotenv from 'dotenv';
dotenv.config();

import { indexing } from './indexing_phase.js';
import { chatting } from './query_phase.js';
import { Session, Message } from './models.js';

const app = express();
const PORT = process.env.PORT || 5001;
const UPLOADS_DIR = './uploads';

// Ensure uploads directory exists on local disk
if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR);
}

// Connect to MongoDB Atlas (database: veritas_ai)
mongoose.connect(process.env.MONGODB_URI, { dbName: 'veritas_ai' })
  .then(() => console.log('Successfully connected to MongoDB Atlas: veritas_ai'))
  .catch(err => console.error('MongoDB Atlas connection error:', err));

// Configure Multer for disk storage uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, UPLOADS_DIR);
    },
    filename: (req, file, cb) => {
        cb(null, `${Date.now()}-${file.originalname}`);
    }
});
const upload = multer({ storage });

// Middlewares
app.use(cors());
app.use(express.json());

// Serve uploaded PDFs statically so the frontend can retrieve them
app.use('/uploads', express.static('uploads'));

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', message: 'Veritas AI Backend with MongoDB is running' });
});

// GET /api/sessions: Retrieve all workspaces
app.get('/api/sessions', async (req, res) => {
    try {
        let sessions = await Session.find().sort({ createdAt: -1 });
        if (sessions.length === 0) {
            const sessionId = new mongoose.Types.ObjectId();
            const defaultSession = new Session({
                _id: sessionId,
                title: 'General Workspace',
                pineconeNamespace: `user_default:session_${sessionId.toString()}`,
                files: []
            });
            await defaultSession.save();

            await new Message({
                sessionId: defaultSession._id,
                role: 'assistant',
                content: 'Welcome to your first workspace. Upload files and start querying!',
                snippets: []
            }).save();

            sessions = [defaultSession];
        }
        res.json({ success: true, sessions });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /api/sessions: Create a new workspace session
app.post('/api/sessions', async (req, res) => {
    const { title } = req.body;
    if (!title) {
        return res.status(400).json({ success: false, error: 'Workspace title is required' });
    }

    try {
        const sessionId = new mongoose.Types.ObjectId();
        const newSession = new Session({
            _id: sessionId,
            title: title.trim(),
            pineconeNamespace: `user_default:session_${sessionId.toString()}`,
            files: []
        });
        await newSession.save();
        
        // Add a default welcome message to the session's chat log in MongoDB
        await new Message({
            sessionId: newSession._id,
            role: 'assistant',
            content: `Welcome to your new workspace: "${newSession.title}". Upload files and start querying.`,
            snippets: []
        }).save();

        res.json({ success: true, session: newSession });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// DELETE /api/sessions/:id: Delete workspace, physical files, and database messages
app.delete('/api/sessions/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const session = await Session.findById(id);
        if (!session) {
            return res.status(404).json({ success: false, error: 'Workspace not found' });
        }

        // Delete PDFs physically from disk
        if (session.files && session.files.length > 0) {
            for (const file of session.files) {
                if (fs.existsSync(file.filePath)) {
                    fs.unlinkSync(file.filePath);
                    console.log(`Physically deleted: ${file.filePath}`);
                }
            }
        }

        // Remove from MongoDB
        await Session.findByIdAndDelete(id);
        await Message.deleteMany({ sessionId: id });

        res.json({ success: true, message: 'Workspace and files cleared successfully.' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/sessions/:id/messages: Fetch chat history
app.get('/api/sessions/:id/messages', async (req, res) => {
    try {
        const messages = await Message.find({ sessionId: req.params.id }).sort({ timestamp: 1 });
        res.json({ success: true, messages });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
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

        // Find the active session in MongoDB
        const session = await Session.findOne({ pineconeNamespace: namespace });
        if (!session) {
            return res.status(404).json({ success: false, error: 'Target workspace session not found' });
        }

        // Set up streaming response headers
        res.writeHead(200, {
            'Content-Type': 'application/json',
            'Transfer-Encoding': 'chunked'
        });

        const sendProgress = (step) => {
            res.write(JSON.stringify({ success: true, step }) + '\n');
        };

        console.log(`Saving upload to disk: "${req.file.path}". Target namespace: "${namespace}", docType: "${docType}"`);
        await indexing(req.file.path, req.file.originalname, docType || 'general', namespace, sendProgress);
        
        // Push file details into MongoDB Session model
        session.files.push({
            name: req.file.originalname,
            docType: docType || 'general',
            filePath: req.file.path
        });
        await session.save();

        res.end();
    } catch (error) {
        console.error('Error during upload and indexing:', error);
        if (res.headersSent) {
            res.write(JSON.stringify({ success: false, error: error.message }) + '\n');
            res.end();
        } else {
            res.status(500).json({ success: false, error: error.message });
        }
    }
});

// Query / QA Endpoint with Namespace, Metadata Filter, and DB logging support
app.post('/api/query', async (req, res) => {
    const { question, namespace, docTypeFilter } = req.body;
    if (!question) {
        return res.status(400).json({ success: false, error: 'Question is required' });
    }

    const ns = namespace || 'default';

    try {
        const session = await Session.findOne({ pineconeNamespace: ns });
        if (!session) {
            return res.status(404).json({ success: false, error: 'Workspace session not found' });
        }

        console.log(`Processing query: "${question}" in namespace: "${ns}", filter: "${docTypeFilter || 'none'}"`);
        const result = await chatting(question, ns, docTypeFilter);
        
        // Format snippets for MongoDB logging
        const snippets = (result.matches || []).map(m => ({
            docId: m.metadata.source_name || 'Document',
            page: m.metadata.page_number || 1,
            text: m.metadata.text || ''
        }));

        // Log user query to database
        await new Message({
            sessionId: session._id,
            role: 'user',
            content: question,
            snippets: []
        }).save();

        // Log assistant answer and active snippets citation to database
        const savedBotMsg = await new Message({
            sessionId: session._id,
            role: 'assistant',
            content: result.answer,
            snippets: snippets
        }).save();

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
