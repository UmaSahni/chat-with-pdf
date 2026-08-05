import mongoose from 'mongoose';

const SessionSchema = new mongoose.Schema({
  title: { type: String, required: true },
  pineconeNamespace: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  files: [{
    name: { type: String, required: true },
    docType: { type: String, required: true },
    filePath: { type: String, required: true },
    uploadedAt: { type: Date, default: Date.now }
  }]
});

const MessageSchema = new mongoose.Schema({
  sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Session', required: true, index: true },
  role: { type: String, enum: ['user', 'assistant'], required: true },
  content: { type: String, required: true },
  snippets: [{
    docId: { type: String },
    page: { type: Number },
    text: { type: String }
  }],
  timestamp: { type: Date, default: Date.now }
});

export const Session = mongoose.model('Session', SessionSchema);
export const Message = mongoose.model('Message', MessageSchema);
