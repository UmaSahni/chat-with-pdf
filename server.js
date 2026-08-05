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
import bcrypt from 'bcryptjs';
import { User, Session, Message } from './models.js';

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
// Smart static PDF resolution route to resolve files with/without timestamp prefix
app.get('/uploads/:filename', (req, res) => {
    const filename = req.params.filename;
    const directPath = path.join(UPLOADS_DIR, filename);

    // 1. Try to serve directly
    if (fs.existsSync(directPath)) {
        return res.sendFile(path.resolve(directPath));
    }

    // 2. Fallback: Search for timestamp-prefixed files (e.g. 1785953089462-Profile.pdf)
    try {
        const files = fs.readdirSync(UPLOADS_DIR);
        const matchedFile = files.find(f => f === filename || f.endsWith(`-${filename}`));
        if (matchedFile) {
            return res.sendFile(path.resolve(path.join(UPLOADS_DIR, matchedFile)));
        }
    } catch (err) {
        console.error("Error during uploads directory fallback search:", err);
    }

    res.status(404).send(`Cannot GET /uploads/${filename}`);
});

app.use('/uploads', express.static('uploads'));

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', message: 'Veritas AI Backend with MongoDB is running' });
});

// Auth Signup Endpoint
app.post('/api/auth/signup', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ success: false, error: 'Email and password are required' });
    }
    try {
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ success: false, error: 'Email is already registered' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const user = new User({
            email,
            password: hashedPassword
        });
        await user.save();

        res.json({ success: true, user: { id: user._id, email: user.email } });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Auth Login Endpoint
app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ success: false, error: 'Email and password are required' });
    }
    try {
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(400).json({ success: false, error: 'Invalid email or password' });
        }

        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            return res.status(400).json({ success: false, error: 'Invalid email or password' });
        }

        res.json({ success: true, user: { id: user._id, email: user.email } });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/sessions: Retrieve all workspaces for the logged-in user
app.get('/api/sessions', async (req, res) => {
    const userId = req.headers['x-user-id'];
    if (!userId) {
        return res.status(401).json({ success: false, error: 'Unauthorized: Missing User ID' });
    }

    try {
        let sessions = await Session.find({ userId }).sort({ createdAt: -1 });
        if (sessions.length === 0) {
            const sessionId = new mongoose.Types.ObjectId();
            const defaultSession = new Session({
                _id: sessionId,
                userId,
                title: 'General Workspace',
                pineconeNamespace: `user_${userId}:session_${sessionId.toString()}`,
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

// POST /api/sessions: Create a new workspace session for the logged-in user
app.post('/api/sessions', async (req, res) => {
    const userId = req.headers['x-user-id'];
    const { title } = req.body;
    if (!userId) {
        return res.status(401).json({ success: false, error: 'Unauthorized: Missing User ID' });
    }
    if (!title) {
        return res.status(400).json({ success: false, error: 'Workspace title is required' });
    }

    try {
        const sessionId = new mongoose.Types.ObjectId();
        const newSession = new Session({
            _id: sessionId,
            userId,
            title: title.trim(),
            pineconeNamespace: `user_${userId}:session_${sessionId.toString()}`,
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
    const userId = req.headers['x-user-id'];
    if (!userId) {
        return res.status(401).json({ success: false, error: 'Unauthorized: Missing User ID' });
    }

    try {
        const { id } = req.params;
        const session = await Session.findOne({ _id: id, userId });
        if (!session) {
            return res.status(404).json({ success: false, error: 'Workspace not found or unauthorized' });
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

// GET /api/sessions/:id/messages: Fetch chat history for authorized session
app.get('/api/sessions/:id/messages', async (req, res) => {
    const userId = req.headers['x-user-id'];
    if (!userId) {
        return res.status(401).json({ success: false, error: 'Unauthorized: Missing User ID' });
    }

    try {
        const { id } = req.params;
        const session = await Session.findOne({ _id: id, userId });
        if (!session) {
            return res.status(404).json({ success: false, error: 'Workspace session not found or unauthorized' });
        }

        const messages = await Message.find({ sessionId: id }).sort({ timestamp: 1 });
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
        await indexing(req.file.path, req.file.filename, docType || 'general', namespace, sendProgress);
        
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
    const { question, namespace, fileFilter } = req.body;
    if (!question) {
        return res.status(400).json({ success: false, error: 'Question is required' });
    }

    const ns = namespace || 'default';

    try {
        const session = await Session.findOne({ pineconeNamespace: ns });
        if (!session) {
            return res.status(404).json({ success: false, error: 'Workspace session not found' });
        }

        console.log(`Processing query: "${question}" in namespace: "${ns}", fileFilter: "${fileFilter || 'none'}"`);
        const result = await chatting(question, ns, fileFilter);
        
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
