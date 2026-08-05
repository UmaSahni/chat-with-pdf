'use client';

import React, { useState, useEffect, useRef } from 'react';

export default function Home() {
  const [isClient, setIsClient] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  
  // App states
  const [sessions, setSessions] = useState([]);
  const [activeSessionId, setActiveSessionId] = useState('');
  
  // active filter state
  const [selectedFileFilter, setSelectedFileFilter] = useState('all'); // all, or a specific filename
  
  // File upload state
  const [uploadDocType, setUploadDocType] = useState('textbook');
  const [uploadStatus, setUploadStatus] = useState('');
  // Custom modal states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newWorkspaceName, setNewWorkspaceName] = useState('');
  const fileInputRef = useRef(null);

  // Chat inputs
  const [question, setQuestion] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [chatHistory, setChatHistory] = useState([]);
  
  // Right pane details (current active snippets)
  const [activeSnippets, setActiveSnippets] = useState([]);

  // Load client state and user session
  useEffect(() => {
    setIsClient(true);
    const savedUser = localStorage.getItem('veritas_user');
    if (savedUser) {
      try {
        setCurrentUser(JSON.parse(savedUser));
      } catch (e) {
        console.error("Failed to parse user session", e);
      }
    }
  }, []);

  // Sync workspaces whenever currentUser state changes
  useEffect(() => {
    if (currentUser) {
      fetchSessions();
    } else {
      setSessions([]);
      setChatHistory([]);
      setActiveSessionId('');
    }
  }, [currentUser]);

  // Fetch workspaces (sessions) from the database
  const fetchSessions = async () => {
    if (!currentUser) return;
    try {
      const res = await fetch('http://localhost:5001/api/sessions', {
        headers: { 'x-user-id': currentUser.id }
      });
      const data = await res.json();
      if (data.success) {
        const formatted = data.sessions.map(s => ({
          id: s._id,
          name: s.title,
          namespace: s.pineconeNamespace,
          files: s.files || [],
        }));
        setSessions(formatted);
        if (formatted.length > 0) {
          setActiveSessionId(prev => prev || formatted[0].id);
        }
      }
    } catch (e) {
      console.error("Failed to fetch sessions from MongoDB Atlas:", e);
    }
  };

  // Get current active session
  const activeSession = sessions.find(s => s.id === activeSessionId) || sessions[0];

  // Fetch messages (chat log) for the active session when it changes
  useEffect(() => {
    if (activeSessionId && currentUser) {
      fetchMessages(activeSessionId);
    }
  }, [activeSessionId, currentUser]);

  const fetchMessages = async (sessionId) => {
    if (!currentUser) return;
    try {
      const res = await fetch(`http://localhost:5001/api/sessions/${sessionId}/messages`, {
        headers: { 'x-user-id': currentUser.id }
      });
      const data = await res.json();
      if (data.success) {
        setChatHistory(data.messages);
        
        // Populate the Reference Portal with active citations from the last assistant message
        const lastMsgWithSnippets = [...data.messages]
          .reverse()
          .find(msg => msg.role === 'assistant' && msg.snippets && msg.snippets.length > 0);
        if (lastMsgWithSnippets) {
          setActiveSnippets(lastMsgWithSnippets.snippets);
        } else {
          setActiveSnippets([]);
        }
      }
    } catch (e) {
      console.error("Failed to fetch messages for session:", e);
    }
  };

  // Create new Session in MongoDB Atlas
  const handleCreateSession = () => {
    setNewWorkspaceName('');
    setShowCreateModal(true);
  };

  const handleCreateWorkspaceSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!newWorkspaceName || !newWorkspaceName.trim() || !currentUser) return;

    try {
      const res = await fetch('http://localhost:5001/api/sessions', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-user-id': currentUser.id
        },
        body: JSON.stringify({ title: newWorkspaceName.trim() })
      });
      const data = await res.json();
      if (data.success) {
        await fetchSessions();
        setActiveSessionId(data.session._id);
        setShowCreateModal(false);
        setNewWorkspaceName('');
      }
    } catch (e) {
      console.error("Error creating session in database:", e);
    }
  };

  // Delete Session from MongoDB Atlas
  const handleDeleteSession = async (sid, event) => {
    event.stopPropagation();
    if (!confirm('Are you sure you want to delete this workspace? All uploaded references and chat history will be lost.') || !currentUser) return;
    
    try {
      const res = await fetch(`http://localhost:5001/api/sessions/${sid}`, {
        method: 'DELETE',
        headers: { 'x-user-id': currentUser.id }
      });
      const data = await res.json();
      if (data.success) {
        if (activeSessionId === sid) {
          const remaining = sessions.filter(s => s.id !== sid);
          if (remaining.length > 0) {
            setActiveSessionId(remaining[0].id);
          } else {
            setActiveSessionId('');
            setChatHistory([]);
            setActiveSnippets([]);
          }
        }
        await fetchSessions();
      }
    } catch (e) {
      console.error("Error deleting session in database:", e);
    }
  };

  // File Ingestion Handler (Uploads to disk, Indexes, and saves metadata to MongoDB)
  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file || !currentUser) return;

    setUploadStatus('Uploading PDF...');
    const formData = new FormData();
    formData.append('file', file);
    formData.append('docType', uploadDocType);
    formData.append('namespace', activeSession.namespace);

    try {
      const res = await fetch('http://localhost:5001/api/upload', {
        method: 'POST',
        headers: { 'x-user-id': currentUser.id },
        body: formData
      });

      if (!res.body) {
        throw new Error('Response body stream is not supported');
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let partialChunk = '';
      let success = false;
      let errorMessage = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const text = decoder.decode(value, { stream: true });
        const lines = (partialChunk + text).split('\n');
        partialChunk = lines.pop(); // Hold onto any incomplete line chunk

        for (const line of lines) {
          if (line.trim()) {
            try {
              const data = JSON.parse(line);
              if (data.success === false) {
                errorMessage = data.error || 'Indexing failed';
              } else if (data.step) {
                success = true;
                if (data.step === 'parsing') {
                  setUploadStatus('Extracting PDF...');
                } else if (data.step === 'chunking') {
                  setUploadStatus('Splitting text...');
                } else if (data.step === 'vectorizing') {
                  setUploadStatus('Embedding (3072)...');
                } else if (data.step === 'storing') {
                  setUploadStatus('Saving to Pinecone...');
                } else if (data.step === 'done') {
                  setUploadStatus('Success!');
                }
              }
            } catch (e) {
              console.error("Progress JSON parse error:", e);
            }
          }
        }
      }

      if (success && !errorMessage) {
        setUploadStatus('Success!');
        // Refresh session list to show newly uploaded files
        await fetchSessions();
        setTimeout(() => setUploadStatus(''), 3000);
      } else {
        setUploadStatus('Failed');
        alert('File upload failed: ' + (errorMessage || 'Unknown error'));
      }
    } catch (err) {
      console.error(err);
      setUploadStatus('Error');
      alert('Error connecting to backend server. Ensure Express is running on http://localhost:5001');
    }
  };

  // Core Query RAG execution (Queries Pinecone and logs conversation in MongoDB)
  const handleQuery = async (queryText) => {
    if (!queryText.trim() || isProcessing || !currentUser) return;
    setIsProcessing(true);

    // Add user message to local state immediately for instant UI responsiveness
    const tempUserMsg = { role: 'user', content: queryText, timestamp: new Date() };
    setChatHistory(prev => [...prev, tempUserMsg]);
    setQuestion('');

    try {
      const res = await fetch('http://localhost:5001/api/query', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-user-id': currentUser.id
        },
        body: JSON.stringify({
          question: queryText,
          namespace: activeSession.namespace,
          fileFilter: selectedFileFilter
        })
      });
      const data = await res.json();
      if (data.success) {
        // Sync message list directly from MongoDB Atlas (includes assistant answer and citations)
        await fetchMessages(activeSessionId);
      } else {
        alert('Error: ' + (data.error || 'Server failed to query RAG'));
      }
    } catch (err) {
      console.error(err);
      alert('Network error connecting to Express API.');
    } finally {
      setIsProcessing(false);
    }
  };

  if (!isClient) {
    return (
      <div className="bg-[#0b1326] h-screen w-screen flex items-center justify-center text-primary font-mono">
        Loading Veritas AI Workspaces...
      </div>
    );
  }

  if (!currentUser) {
    return (
      <LandingPage onLoginSuccess={(user) => {
        localStorage.setItem('veritas_user', JSON.stringify(user));
        setCurrentUser(user);
      }} />
    );
  }

  if (!activeSession) {
    return (
      <div className="bg-[#0b1326] h-screen w-screen flex items-center justify-center text-primary font-mono">
        Loading workspaces...
      </div>
    );
  }

  return (
    <div className="bg-background text-on-surface font-body text-sm h-screen overflow-hidden flex flex-col">
      {/* TopNavBar */}
      <header className="bg-surface-container-low flex justify-between items-center px-container-padding h-16 w-full fixed top-0 z-50 backdrop-blur-md border-b border-outline-variant">
        <div className="flex items-center gap-8">
          <div className="text-lg font-bold text-primary tracking-tight">Veritas AI</div>
          <div className="text-xs text-outline bg-surface-container px-3 py-1 rounded border border-outline-variant font-mono">
            Active Workspace: <span className="text-primary-fixed">{activeSession.name}</span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {/* File upload triggers */}
          <div className="flex items-center gap-2">
            <select 
              value={uploadDocType} 
              onChange={(e) => setUploadDocType(e.target.value)}
              className="bg-surface-container border border-outline-variant text-xs text-on-surface rounded px-2 py-1.5 focus:outline-none"
            >
              <option value="textbook">Reference Material</option>
              <option value="question_paper">Question/Task Sheet</option>
              <option value="general">General Document</option>
            </select>
            <input 
              type="file" 
              accept=".pdf" 
              ref={fileInputRef} 
              onChange={handleFileUpload} 
              className="hidden" 
            />
            <button 
              onClick={() => fileInputRef.current.click()} 
              disabled={uploadStatus === 'Uploading...'}
              className="bg-primary text-on-primary px-3 py-1.5 rounded font-semibold text-xs glow-button transition-all disabled:opacity-50 flex items-center gap-1"
            >
              <span className="material-symbols-outlined text-xs">upload_file</span>
              {uploadStatus || 'Upload PDF'}
            </button>
          </div>
          <button 
            onClick={() => {
              localStorage.removeItem('veritas_user');
              setCurrentUser(null);
            }}
            className="text-on-surface-variant hover:text-error transition-colors font-mono text-xs flex items-center gap-1 border border-outline-variant px-2.5 py-1.5 rounded bg-surface-container-low hover:bg-surface-container"
            title="Log Out"
          >
            <span className="material-symbols-outlined text-xs">logout</span>
            <span>Exit</span>
          </button>
          <div className="w-8 h-8 rounded-full bg-surface-container-high border border-outline-variant overflow-hidden flex items-center justify-center">
            <div className="w-6 h-6 rounded-full bg-primary-container flex items-center justify-center text-[10px] font-bold text-on-primary-container uppercase">
              {currentUser?.email?.slice(0, 2) || 'US'}
            </div>
          </div>
        </div>
      </header>

      {/* Main Workspace Grid */}
      <main className="workspace-grid flex-1">
        {/* Left Pane: Sessions and Sources */}
        <section className="pane flex flex-col border-r border-outline-variant">
          {/* Workspace Switcher */}
          <div className="p-4 border-b border-outline-variant bg-surface-container-low">
            <div className="flex justify-between items-center mb-2">
              <h2 className="text-xs font-bold text-outline font-mono uppercase tracking-wider">Workspaces</h2>
              <button 
                onClick={handleCreateSession}
                className="text-primary hover:text-primary-fixed transition-colors flex items-center gap-0.5 text-xs font-semibold"
              >
                <span className="material-symbols-outlined text-xs">add_box</span>
                New
              </button>
            </div>
            <div className="flex flex-col gap-1 max-h-40 overflow-y-auto">
              {sessions.map((s) => (
                <div 
                  key={s.id}
                  onClick={() => setActiveSessionId(s.id)}
                  className={`flex justify-between items-center px-3 py-1.5 rounded cursor-pointer transition-colors text-xs font-medium ${s.id === activeSessionId ? 'bg-surface-container-high border border-primary text-primary' : 'text-on-surface-variant hover:bg-surface-container-low'}`}
                >
                  <span className="truncate">{s.name}</span>
                  <button 
                    onClick={(e) => handleDeleteSession(s.id, e)}
                    className="opacity-0 group-hover:opacity-100 hover:text-error text-outline transition-opacity"
                  >
                    <span className="material-symbols-outlined text-xs">delete</span>
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Active Sources */}
          <div className="p-4 border-b border-outline-variant">
            <h2 className="text-xs font-bold text-outline font-mono uppercase tracking-wider mb-2">Session Sources</h2>
            <div className="text-xs text-on-surface-variant mb-2">
              Files uploaded to this specific workspace:
            </div>
          </div>

          <div className="p-4 flex flex-col gap-3 overflow-y-auto flex-1">
            {activeSession.files.map((file, idx) => (
              <div 
                key={idx} 
                className="glass-panel p-2.5 rounded border-l-2 border-l-primary relative group"
              >
                <div className="flex justify-between items-start mb-1">
                  <span className="text-[10px] font-mono bg-surface-container-high text-primary px-1.5 py-0.5 rounded uppercase">
                    {file.docType === 'textbook' ? 'Reference' : file.docType === 'question_paper' ? 'Questions' : 'Document'}
                  </span>
                </div>
                <h3 className="font-semibold text-on-surface text-xs truncate" title={file.name}>
                  {file.name}
                </h3>
              </div>
            ))}

            {activeSession.files.length === 0 && (
              <div className="text-xs text-outline italic text-center py-6">
                No documents uploaded. Upload reference materials or query files to start.
              </div>
            )}
          </div>
        </section>

        {/* Center Pane: Synthesis / Chat Area */}
        <section className="pane flex flex-col border-r border-outline-variant relative">
          <div className="p-6 border-b border-outline-variant bg-background/50 backdrop-blur-md flex justify-between items-center z-10">
            <div>
              <h1 className="text-lg font-bold text-on-surface">Synthesis Draft</h1>
              <div className="text-xs text-primary mt-1 flex items-center gap-2 font-mono">
                <span className={`w-2 h-2 rounded-full bg-primary ${isProcessing ? 'animate-ping' : 'animate-pulse'}`}></span>
                {isProcessing ? 'COMPUTING RAG...' : 'ACTIVE GROUNDING INTERACTION'}
              </div>
            </div>
          </div>
          
          {/* Messages Scroll Area */}
          <div className="flex-1 p-8 overflow-y-auto pb-44 space-y-6">
            <div className="max-w-2xl mx-auto space-y-6">
              {chatHistory.map((msg, i) => (
                <div 
                  key={i} 
                  className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
                >
                  <div 
                    className={`max-w-xl px-4 py-3 rounded-lg leading-relaxed text-sm ${msg.role === 'user' ? 'bg-primary-container text-on-primary-container border border-primary' : 'bg-surface-container border border-outline-variant text-on-surface'}`}
                  >
                    <div className="text-[10px] font-mono text-outline mb-1 uppercase">
                      {msg.role === 'user' ? 'Query' : 'Veritas Synth'}
                    </div>
                    <div className="whitespace-pre-wrap">{msg.content}</div>
                  </div>
                </div>
              ))}
              {isProcessing && (
                <div className="flex flex-col items-start">
                  <div className="max-w-xl px-4 py-3 rounded-lg bg-surface-container-low border border-outline-variant text-outline animate-pulse text-xs font-mono">
                    GENERATING ANSWER GROUNDED IN NAMESPACE "{activeSession.namespace}"...
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Prompt Refinement Bar */}
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-surface-container-highest rounded-full px-5 py-2.5 flex items-center gap-3 shadow-lg border border-outline-variant backdrop-blur-md z-30 w-11/12 max-w-xl">
            {/* Filter Toggle */}
            <select
              value={selectedFileFilter}
              onChange={(e) => setSelectedFileFilter(e.target.value)}
              className="bg-transparent border-none text-xs text-primary font-mono focus:outline-none focus:ring-0 mr-1 max-w-[155px] truncate"
            >
              <option value="all">Filter: All Docs</option>
              {activeSession?.files?.map((file, idx) => (
                <option key={idx} value={file.name}>
                  {file.name}
                </option>
              ))}
            </select>
            <div className="h-4 w-px bg-outline-variant"></div>
            
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleQuery(question);
              }}
              disabled={isProcessing}
              className="bg-transparent border-none text-sm text-on-surface focus:outline-none focus:ring-0 placeholder:text-on-surface-variant flex-1"
              placeholder={isProcessing ? 'Processing query...' : 'Ask workspace RAG...'}
            />
            <div className="h-6 w-px bg-outline-variant"></div>
            <button
              onClick={() => handleQuery(question)}
              disabled={isProcessing}
              className="text-primary hover:text-primary-fixed transition-colors flex items-center gap-1 font-mono text-xs disabled:opacity-50"
            >
              <span className="material-symbols-outlined">magic_button</span>
              <span>Refine</span>
            </button>
          </div>
        </section>

        {/* Right Pane: Reference Portal */}
        <section className="pane flex flex-col bg-surface-container-lowest">
          <div className="p-4 border-b border-outline-variant sticky top-0 bg-background z-20 backdrop-blur-md">
            <h2 className="text-sm font-bold text-on-surface flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-lg">library_books</span>
              Reference Portal
            </h2>
          </div>
          
          <div className="p-4 flex flex-col gap-6 overflow-y-auto flex-1">
            <div className="text-xs text-outline font-mono mb-2 uppercase">Active Citations ({activeSnippets.length})</div>
            
            {activeSnippets.map((snip, index) => (
              <div key={index} className="glass-panel p-4 rounded relative">
                <div className="absolute -left-3 top-4 w-3 border-t-2 border-primary border-dashed"></div>
                <div className="flex justify-between items-center mb-2">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 bg-surface-container text-primary text-xs font-mono rounded max-w-[150px] truncate" title={snip.docId.replace(/^\d+-/, '')}>
                      {snip.docId.replace(/^\d+-/, '')}
                    </span>
                    <span className="text-xs text-on-surface-variant font-mono">Page {snip.page}</span>
                  </div>
                  {snip.docId && snip.docId !== 'Document' && (
                    <a
                      href={`http://localhost:5001/uploads/${snip.docId}#page=${snip.page}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:text-primary-fixed transition-colors flex items-center p-1 rounded hover:bg-surface-container-high"
                      title="Open PDF at this page"
                    >
                      <span className="material-symbols-outlined text-sm">open_in_new</span>
                    </a>
                  )}
                </div>
                <p className="text-xs text-on-surface font-mono bg-surface-container-low p-2 rounded border border-outline-variant border-l-2 border-l-primary leading-relaxed whitespace-pre-wrap">
                  {snip.text}
                </p>
              </div>
            ))}

            {activeSnippets.length === 0 && (
              <div className="text-xs text-outline italic text-center py-12">
                No citations referenced. Ask a question to fetch matching textbook/page coordinates.
              </div>
            )}
          </div>
        </section>
      </main>

      {/* Nice Glassmorphic Modal for Workspace Creation */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-[#0b1329]/95 border border-outline-variant rounded-xl p-6 w-full max-w-md shadow-2xl animate-fade-in relative z-[101]">
            <h3 className="text-base font-bold text-on-surface mb-1">Create Workspace</h3>
            <p className="text-xs text-outline mb-4">Enter a name for your new workspace to get started.</p>
            
            <form onSubmit={handleCreateWorkspaceSubmit} className="space-y-4">
              <input
                type="text"
                value={newWorkspaceName}
                onChange={(e) => setNewWorkspaceName(e.target.value)}
                placeholder="e.g. Physics Chapter 3"
                autoFocus
                className="w-full bg-surface-container border border-outline-variant text-on-surface text-sm rounded-lg px-4 py-2.5 focus:outline-none focus:border-primary placeholder:text-outline/60"
              />
              
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded text-xs font-semibold text-on-surface-variant hover:bg-surface-container transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!newWorkspaceName.trim()}
                  className="px-4 py-2 rounded bg-primary text-on-primary text-xs font-semibold glow-button hover:bg-primary/95 transition-all disabled:opacity-50"
                >
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function LandingPage({ onLoginSuccess }) {
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setError('Please fill in all fields');
      return;
    }
    setError('');
    setLoading(true);

    const url = isLogin ? 'http://localhost:5001/api/auth/login' : 'http://localhost:5001/api/auth/signup';

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password: password.trim() })
      });
      const data = await res.json();
      if (data.success) {
        onLoginSuccess(data.user);
      } else {
        setError(data.error || 'Authentication failed');
      }
    } catch (err) {
      console.error(err);
      setError('Connection error. Is Express running on port 5001?');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-[#0b1326] min-h-screen text-on-surface font-body overflow-x-hidden relative flex flex-col justify-between">
      {/* Dynamic background mesh */}
      <div className="absolute top-[-10%] left-[-10%] w-[50vw] h-[50vw] rounded-full bg-primary/5 blur-[120px] animate-pulse pointer-events-none"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[50vw] h-[50vw] rounded-full bg-primary-fixed-dim/5 blur-[120px] animate-pulse pointer-events-none"></div>

      {/* Landing Header */}
      <header className="px-8 py-6 flex justify-between items-center max-w-7xl mx-auto w-full z-20">
        <div className="flex items-center gap-3">
          <div className="text-xl font-black text-primary tracking-wider font-mono">VERITAS AI</div>
          <span className="px-2 py-0.5 border border-primary/20 text-[9px] font-mono text-primary/80 rounded uppercase">v2.0</span>
        </div>
        <button
          onClick={() => { setIsLogin(true); setError(''); setShowAuthModal(true); }}
          className="px-5 py-2 border border-outline-variant hover:border-primary text-xs font-semibold text-on-surface hover:text-primary rounded-full transition-all bg-surface-container-low/30 backdrop-blur"
        >
          Sign In
        </button>
      </header>

      {/* Hero Section */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-8 py-12 flex flex-col lg:flex-row items-center gap-12 z-10">
        <div className="flex-1 space-y-6 text-left">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-xs font-semibold text-primary font-mono animate-fade-in">
            <span className="w-2 h-2 rounded-full bg-primary animate-ping"></span>
            Grounded Multi-Document RAG
          </div>
          
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black text-on-surface leading-tight tracking-tight">
            Connect the dots in your <span className="bg-gradient-to-r from-primary via-primary-fixed to-primary-fixed-dim bg-clip-text text-transparent">PDF documents</span>
          </h1>
          
          <p className="text-sm sm:text-base text-outline leading-relaxed max-w-xl">
            Veritas AI transforms textbooks, research notes, and manuals into an interactive, context-aware dialogue engine. Harness enterprise-grade vector indexing to ground answers with page-level citations.
          </p>

          <div className="flex flex-wrap gap-4 pt-4">
            <button
              onClick={() => { setIsLogin(false); setError(''); setShowAuthModal(true); }}
              className="px-6 py-3 bg-primary text-on-primary font-bold text-xs rounded-full shadow-lg glow-button hover:scale-[1.02] active:scale-[0.98] transition-all"
            >
              Launch Workspace
            </button>
            <a
              href="#sandbox"
              className="px-6 py-3 border border-outline-variant hover:border-outline text-xs font-bold text-on-surface hover:bg-surface-container-low/30 rounded-full transition-all flex items-center gap-1.5"
            >
              Interactive Sandbox
            </a>
          </div>
        </div>

        {/* Live RAG Mockup Sandbox */}
        <div id="sandbox" className="flex-1 w-full max-w-xl animate-fade-in">
          <div className="glass-panel border border-outline-variant/60 rounded-xl overflow-hidden shadow-2xl bg-[#0b1326]/60 backdrop-blur-md">
            {/* Header bar */}
            <div className="bg-surface-container-low border-b border-outline-variant px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[#ff5f56]"></span>
                <span className="w-2.5 h-2.5 rounded-full bg-[#ffbd2e]"></span>
                <span className="w-2.5 h-2.5 rounded-full bg-[#27c93f]"></span>
              </div>
              <span className="text-[10px] font-mono text-outline">RAG-PLAYGROUND.DEV</span>
              <span className="w-4"></span>
            </div>

            {/* Sandbox Content */}
            <div className="p-5 space-y-4 font-mono text-[11px] leading-relaxed">
              {/* Question */}
              <div className="space-y-1">
                <div className="text-primary font-bold">USER_QUESTION &gt;</div>
                <div className="bg-surface-container-low p-3 rounded border border-outline-variant text-on-surface-variant">
                  Compare SAP and HCM tool expertise of candidates.
                </div>
              </div>

              {/* Citations */}
              <div className="space-y-1">
                <div className="text-primary-fixed-dim font-bold">GROUNDED_SOURCES &gt;</div>
                <div className="flex gap-2">
                  <span className="px-2 py-0.5 bg-primary/10 border border-primary/20 text-[9px] rounded text-primary flex items-center gap-1">
                    <span className="material-symbols-outlined text-[10px]">link</span>
                    Profile (1).pdf [Page 1]
                  </span>
                  <span className="px-2 py-0.5 bg-primary/10 border border-primary/20 text-[9px] rounded text-primary flex items-center gap-1">
                    <span className="material-symbols-outlined text-[10px]">link</span>
                    Profile (2).pdf [Page 1]
                  </span>
                </div>
              </div>

              {/* Bot Response */}
              <div className="space-y-1 pt-1">
                <div className="text-primary font-bold">VERITAS_RESPONSE &gt;</div>
                <div className="bg-surface-container-high p-4 rounded-lg border border-outline-variant border-l-2 border-l-primary text-on-surface leading-relaxed whitespace-pre-line">
                  Candidate <span className="text-primary font-bold">Babaiah Cheppali</span> exhibits strong expertise in SAP, holding over 16 years of consulting experience with SAP HCM and SuccessFactors (SF). 
                  
                  By contrast, candidate <span className="text-primary font-bold">Alice</span> specializes primarily in React frontend systems, containing no SAP/HCM background.
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Metrics / Statistics Section */}
      <section className="max-w-7xl mx-auto w-full px-8 py-12 border-t border-outline-variant/20 z-10">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
          <div className="p-4 rounded-xl bg-surface-container-low/10 border border-outline-variant/40">
            <div className="text-3xl font-black text-primary font-mono tracking-tight">99.8%</div>
            <div className="text-[10px] text-outline font-mono uppercase tracking-wider mt-1.5">Grounding Accuracy</div>
          </div>
          <div className="p-4 rounded-xl bg-surface-container-low/10 border border-outline-variant/40">
            <div className="text-3xl font-black text-primary font-mono tracking-tight">&lt; 50ms</div>
            <div className="text-[10px] text-outline font-mono uppercase tracking-wider mt-1.5">Pinecone Retrieval</div>
          </div>
          <div className="p-4 rounded-xl bg-surface-container-low/10 border border-outline-variant/40">
            <div className="text-3xl font-black text-primary font-mono tracking-tight">3,072</div>
            <div className="text-[10px] text-outline font-mono uppercase tracking-wider mt-1.5">Gemini Dimensions</div>
          </div>
          <div className="p-4 rounded-xl bg-surface-container-low/10 border border-outline-variant/40">
            <div className="text-3xl font-black text-primary font-mono tracking-tight">100%</div>
            <div className="text-[10px] text-outline font-mono uppercase tracking-wider mt-1.5">Workspace Privacy</div>
          </div>
        </div>
      </section>

      {/* Feature Grid */}
      <section className="max-w-7xl mx-auto w-full px-8 py-16 border-t border-outline-variant/30 z-10 bg-[#0b1326]/40 backdrop-blur-sm">
        <div className="text-center max-w-xl mx-auto mb-12">
          <h2 className="text-2xl font-bold text-on-surface font-mono uppercase tracking-wider">Built for Deep Research</h2>
          <p className="text-xs text-outline mt-2">Grounding large language models with complete document authority.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="glass-panel p-6 rounded-xl border border-outline-variant/60 hover:border-primary/50 transition-all group bg-[#0b1326]/50 backdrop-blur hover:translate-y-[-2px]">
            <span className="material-symbols-outlined text-primary text-2xl group-hover:scale-110 transition-transform">lock</span>
            <h3 className="text-sm font-bold text-on-surface mt-4 mb-2">Isolated Workspaces</h3>
            <p className="text-xs text-outline leading-relaxed">Accounts are completely isolated in MongoDB Atlas. One user can never see or search another's workspaces.</p>
          </div>

          <div className="glass-panel p-6 rounded-xl border border-outline-variant/60 hover:border-primary/50 transition-all group bg-[#0b1326]/50 backdrop-blur hover:translate-y-[-2px]">
            <span className="material-symbols-outlined text-primary text-2xl group-hover:scale-110 transition-transform">find_in_page</span>
            <h3 className="text-sm font-bold text-on-surface mt-4 mb-2">Source Page Citations</h3>
            <p className="text-xs text-outline leading-relaxed">Every answer is backed by a citation card. Click to open the physical PDF page directly in a new tab.</p>
          </div>

          <div className="glass-panel p-6 rounded-xl border border-outline-variant/60 hover:border-primary/50 transition-all group bg-[#0b1326]/50 backdrop-blur hover:translate-y-[-2px]">
            <span className="material-symbols-outlined text-primary text-2xl group-hover:scale-110 transition-transform">filter_list</span>
            <h3 className="text-sm font-bold text-on-surface mt-4 mb-2">PDF Document Filters</h3>
            <p className="text-xs text-outline leading-relaxed">Scope query parameters instantly. Target a specific PDF or query across all files concurrently.</p>
          </div>

          <div className="glass-panel p-6 rounded-xl border border-outline-variant/60 hover:border-primary/50 transition-all group bg-[#0b1326]/50 backdrop-blur hover:translate-y-[-2px]">
            <span className="material-symbols-outlined text-primary text-2xl group-hover:scale-110 transition-transform">analytics</span>
            <h3 className="text-sm font-bold text-on-surface mt-4 mb-2">Vector Ingestion</h3>
            <p className="text-xs text-outline leading-relaxed">Extract text, create high-dimensional embeddings, and upsert vectors to Pinecone under dedicated namespaces.</p>
          </div>
        </div>
      </section>

      {/* RAG Workflow / Pipeline Steps */}
      <section className="max-w-7xl mx-auto w-full px-8 py-16 border-t border-outline-variant/20 z-10 bg-[#070d1a]/20">
        <div className="text-center max-w-xl mx-auto mb-12">
          <h2 className="text-2xl font-bold text-on-surface font-mono uppercase tracking-wider">How it works</h2>
          <p className="text-xs text-outline mt-2">A four-stage semantic processing system.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 relative">
          <div className="bg-surface-container-low/20 p-5 rounded-lg border border-outline-variant/50 relative">
            <div className="absolute top-3 right-3 text-xs font-mono font-bold text-primary/40">01</div>
            <div className="w-8 h-8 rounded bg-primary/10 flex items-center justify-center text-primary font-bold text-xs font-mono mb-4">UPL</div>
            <h4 className="text-xs font-bold text-on-surface mb-2 font-mono">1. Disk Ingestion</h4>
            <p className="text-[11px] text-outline leading-relaxed">Upload PDFs dynamically to local node storage securely. No third-party cloud costs.</p>
          </div>

          <div className="bg-surface-container-low/20 p-5 rounded-lg border border-outline-variant/50 relative">
            <div className="absolute top-3 right-3 text-xs font-mono font-bold text-primary/40">02</div>
            <div className="w-8 h-8 rounded bg-primary/10 flex items-center justify-center text-primary font-bold text-xs font-mono mb-4">PAR</div>
            <h4 className="text-xs font-bold text-on-surface mb-2 font-mono">2. PDF Extraction</h4>
            <p className="text-[11px] text-outline leading-relaxed">Extract text chunks, tracking coordinates and relative document index coordinates.</p>
          </div>

          <div className="bg-surface-container-low/20 p-5 rounded-lg border border-outline-variant/50 relative">
            <div className="absolute top-3 right-3 text-xs font-mono font-bold text-primary/40">03</div>
            <div className="w-8 h-8 rounded bg-primary/10 flex items-center justify-center text-primary font-bold text-xs font-mono mb-4">EMB</div>
            <h4 className="text-xs font-bold text-on-surface mb-2 font-mono">3. 3072 Embeddings</h4>
            <p className="text-[11px] text-outline leading-relaxed">Vectorize chunks using Google Gemini embeddings and store in Pinecone.</p>
          </div>

          <div className="bg-surface-container-low/20 p-5 rounded-lg border border-outline-variant/50 relative">
            <div className="absolute top-3 right-3 text-xs font-mono font-bold text-primary/40">04</div>
            <div className="w-8 h-8 rounded bg-primary/10 flex items-center justify-center text-primary font-bold text-xs font-mono mb-4">RET</div>
            <h4 className="text-xs font-bold text-on-surface mb-2 font-mono">4. Semantic RAG</h4>
            <p className="text-[11px] text-outline leading-relaxed">Retrieve chunks under a specific workspace, fetch citations, and generate answers.</p>
          </div>
        </div>
      </section>

      {/* Accordions / FAQs Section */}
      <section className="max-w-3xl mx-auto w-full px-8 py-16 border-t border-outline-variant/20 z-10">
        <div className="text-center mb-10">
          <h2 className="text-2xl font-bold text-on-surface font-mono uppercase tracking-wider">Frequently Asked Questions</h2>
        </div>

        <div className="space-y-4">
          <details className="group border border-outline-variant/60 rounded-lg bg-[#0b1326]/50 p-4 transition-all">
            <summary className="flex justify-between items-center cursor-pointer text-xs font-bold font-mono text-on-surface select-none">
              <span>Is my PDF data shared with anyone else?</span>
              <span className="material-symbols-outlined group-open:rotate-180 transition-transform">expand_more</span>
            </summary>
            <p className="text-xs text-outline leading-relaxed mt-3 pt-3 border-t border-outline-variant/30 font-mono">
              No. Veritas AI enforces database-level user isolation. Workspaces are scoped using a secure `userId` key, and vectors are queried under unique Pinecone namespaces.
            </p>
          </details>

          <details className="group border border-outline-variant/60 rounded-lg bg-[#0b1326]/50 p-4 transition-all">
            <summary className="flex justify-between items-center cursor-pointer text-xs font-bold font-mono text-on-surface select-none">
              <span>How does the PDF Page link work?</span>
              <span className="material-symbols-outlined group-open:rotate-180 transition-transform">expand_more</span>
            </summary>
            <p className="text-xs text-outline leading-relaxed mt-3 pt-3 border-t border-outline-variant/30 font-mono">
              When indexing your file, the system keeps track of the original page number of each block. When a query is answered, clicking the link opens that PDF page directly using standard PDF hashes.
            </p>
          </details>

          <details className="group border border-outline-variant/60 rounded-lg bg-[#0b1326]/50 p-4 transition-all">
            <summary className="flex justify-between items-center cursor-pointer text-xs font-bold font-mono text-on-surface select-none">
              <span>What models are used?</span>
              <span className="material-symbols-outlined group-open:rotate-180 transition-transform">expand_more</span>
            </summary>
            <p className="text-xs text-outline leading-relaxed mt-3 pt-3 border-t border-outline-variant/30 font-mono">
              Veritas AI utilizes `gemini-embedding-001` for embedding vectors and `gemini-3.1-pro-preview` to answer questions securely and accurately.
            </p>
          </details>
        </div>
      </section>

      {/* Landing Footer */}
      <footer className="px-8 py-6 border-t border-outline-variant/30 flex justify-between items-center max-w-7xl mx-auto w-full text-[10px] font-mono text-outline z-20">
        <div>VERITAS AI &copy; 2026. ALL RIGHTS RESERVED.</div>
        <div>POWERED BY GEMINI & PINECONE</div>
      </footer>

      {/* Auth Modal Overlay */}
      {showAuthModal && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-md z-[100] flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-[#0b1326]/95 border border-outline-variant rounded-xl p-8 w-full max-w-md shadow-2xl relative z-[101]">
            {/* Close button */}
            <button
              onClick={() => setShowAuthModal(false)}
              className="absolute top-4 right-4 text-on-surface-variant hover:text-on-surface transition-colors"
            >
              <span className="material-symbols-outlined text-base">close</span>
            </button>

            <div className="text-center mb-6">
              <h2 className="text-xl font-bold text-primary tracking-tight font-mono">VERITAS AI</h2>
              <p className="text-[10px] text-outline mt-1 font-mono uppercase tracking-wider">Access your Grounded Workspace</p>
            </div>

            {/* Tab switchers */}
            <div className="flex bg-surface-container rounded-lg p-1 mb-6 border border-outline-variant">
              <button
                onClick={() => { setIsLogin(true); setError(''); }}
                className={`flex-1 py-1.5 text-xs font-semibold rounded transition-all ${isLogin ? 'bg-primary text-on-primary shadow' : 'text-on-surface-variant hover:text-on-surface'}`}
              >
                Sign In
              </button>
              <button
                onClick={() => { setIsLogin(false); setError(''); }}
                className={`flex-1 py-1.5 text-xs font-semibold rounded transition-all ${!isLogin ? 'bg-primary text-on-primary shadow' : 'text-on-surface-variant hover:text-on-surface'}`}
              >
                Create Account
              </button>
            </div>

            {error && (
              <div className="bg-error-container text-on-error-container border border-error/20 p-3 rounded-lg text-xs mb-4 flex items-center gap-2 font-medium">
                <span className="material-symbols-outlined text-sm text-error">error</span>
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-[10px] font-semibold text-outline font-mono uppercase tracking-wider mb-1.5">Email Address</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full bg-surface-container border border-outline-variant text-on-surface text-sm rounded-lg px-4 py-2.5 focus:outline-none focus:border-primary placeholder:text-outline/40"
                  required
                />
              </div>

              <div>
                <label className="block text-[10px] font-semibold text-outline font-mono uppercase tracking-wider mb-1.5">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-surface-container border border-outline-variant text-on-surface text-sm rounded-lg px-4 py-2.5 focus:outline-none focus:border-primary placeholder:text-outline/40"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-primary text-on-primary py-2.5 rounded-lg font-semibold text-xs transition-all glow-button disabled:opacity-50 mt-2 flex items-center justify-center gap-1.5"
              >
                {loading ? 'Authenticating...' : isLogin ? 'Sign In' : 'Sign Up'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
