'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

export default function Dashboard() {
  const router = useRouter();
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
    if (!savedUser) {
      router.push('/');
    } else {
      try {
        setCurrentUser(JSON.parse(savedUser));
      } catch (e) {
        console.error("Failed to parse user session", e);
        router.push('/');
      }
    }
  }, [router]);

  // Sync workspaces whenever currentUser state changes
  useEffect(() => {
    if (currentUser) {
      fetchSessions();
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

  if (!isClient || !currentUser) {
    return (
      <div className="bg-[#0b1326] h-screen w-screen flex items-center justify-center text-primary font-mono animate-pulse">
        Loading Veritas AI Workspaces...
      </div>
    );
  }

  if (!activeSession) {
    return (
      <div className="bg-[#0b1326] h-screen w-screen flex items-center justify-center text-primary font-mono animate-pulse">
        Loading workspaces...
      </div>
    );
  }

  return (
    <div className="bg-background text-on-surface font-body text-sm h-screen w-screen overflow-hidden flex flex-col">
      {/* TopNavBar */}
      <header className="bg-surface-container-low flex justify-between items-center px-container-padding h-16 w-full fixed top-0 z-50 backdrop-blur-md border-b border-outline-variant">
        <div className="flex items-center gap-8">
          <div className="text-lg font-bold text-primary tracking-tight font-mono">VERITAS AI</div>
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
              router.push('/');
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
                className="bg-primary/10 border border-primary/20 text-primary hover:bg-primary hover:text-on-primary text-xs font-semibold px-2.5 py-1 rounded transition-colors flex items-center gap-1"
              >
                <span className="material-symbols-outlined text-[10px]">add</span>
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
            {(activeSession?.files || []).map((file, idx) => (
              <div 
                key={idx} 
                className="glass-panel p-2.5 rounded border-l-2 border-l-primary relative group"
              >
                <div className="flex justify-between items-start mb-1">
                  <span className="text-[10px] font-mono bg-surface-container-high text-primary px-1.5 py-0.5 rounded uppercase">
                    {file.docType === 'textbook' ? 'Reference' : file.docType === 'question_paper' ? 'Questions' : 'Document'}
                  </span>
                </div>
                <div className="text-xs font-bold text-on-surface truncate pr-6" title={file.name}>
                  {file.name}
                </div>
                <div className="text-[10px] text-outline mt-1 font-mono">
                  Uploaded {new Date(file.uploadedAt).toLocaleDateString()}
                </div>
              </div>
            ))}

            {(activeSession?.files || []).length === 0 && (
              <div className="text-xs text-outline italic text-center py-8">
                No documents uploaded. Upload reference materials or query files to start.
              </div>
            )}
          </div>
        </section>

        {/* Center Pane: Chat Ingest Interface */}
        <section className="pane flex flex-col relative !overflow-hidden">
          {/* Active Work Session Banner */}
          <div className="bg-surface-container px-6 py-3 border-b border-outline-variant flex justify-between items-center">
            <div className="flex flex-col">
              <h2 className="text-sm font-bold text-on-surface tracking-tight">{activeSession.name}</h2>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse"></span>
                <span className="text-[10px] font-mono text-outline uppercase tracking-wider">Active Grounding Interaction</span>
              </div>
            </div>
          </div>

          {/* Chat message display area */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {chatHistory.map((msg, i) => (
              <div 
                key={i} 
                className={`flex flex-col max-w-[85%] ${msg.role === 'user' ? 'ml-auto items-end animate-fade-in' : 'mr-auto items-start animate-fade-in'}`}
              >
                {/* Sender Tag */}
                <div className="text-[10px] text-outline font-mono uppercase tracking-wider mb-1 px-1">
                  {msg.role === 'user' ? 'Query' : 'Veritas Synth'}
                </div>
                {/* Content Bubble */}
                <div 
                  className={`p-4 rounded-xl text-sm leading-relaxed border ${
                    msg.role === 'user' 
                      ? 'bg-primary text-on-primary border-primary shadow-lg rounded-tr-none' 
                      : 'bg-surface-container border-outline-variant shadow rounded-tl-none text-on-surface'
                  }`}
                >
                  <p className="whitespace-pre-line">{msg.content}</p>
                </div>
                
                {/* Grounding citation tags in bot responses */}
                {msg.role === 'assistant' && msg.snippets && msg.snippets.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2 px-1">
                    {msg.snippets.map((snip, idx) => (
                      <span 
                        key={idx} 
                        className="px-2 py-0.5 bg-primary/10 border border-primary/20 text-[9px] font-mono rounded text-primary flex items-center gap-1 select-none"
                        title={snip.docId}
                      >
                        <span className="material-symbols-outlined text-[10px]">link</span>
                        {snip.docId.replace(/^\d+-/, '')} (Page {snip.page})
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
            
            {isProcessing && (
              <div className="flex flex-col items-start max-w-[85%] animate-pulse mr-auto">
                <div className="text-[10px] text-outline font-mono uppercase tracking-wider mb-1 px-1">
                  Generating answer grounded in namespace
                </div>
                <div className="bg-surface-container border border-outline-variant p-4 rounded-xl rounded-tl-none text-xs text-outline font-mono">
                  "{activeSession.namespace}"...
                </div>
              </div>
            )}
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
              disabled={isProcessing || !question.trim()}
              className="text-primary hover:text-primary-fixed hover:scale-105 active:scale-95 transition-all flex items-center gap-1 text-xs font-semibold disabled:opacity-40"
            >
              <span className="material-symbols-outlined text-sm align-middle">temp_preferences_custom</span>
              <span>Refine</span>
            </button>
          </div>
        </section>

        {/* Right Pane: Reference Portal */}
        <section className="pane flex flex-col border-l border-outline-variant">
          <div className="p-4 border-b border-outline-variant bg-surface-container-low flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-base">quick_reference_all</span>
            <h2 className="text-xs font-bold text-on-surface font-mono uppercase tracking-wider">Reference Portal</h2>
          </div>
          
          <div className="p-4 border-b border-outline-variant">
            <div className="text-[10px] text-outline font-mono uppercase tracking-wider">
              Active Citations ({activeSnippets.length})
            </div>
          </div>

          <div className="p-4 flex flex-col gap-4 overflow-y-auto flex-1 relative">
            {activeSnippets.map((snip, idx) => (
              <div 
                key={idx} 
                className="glass-panel p-3 rounded-lg border border-outline-variant relative animate-fade-in pl-5"
              >
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
          <div className="bg-[#0b1326]/95 border border-outline-variant rounded-xl p-6 w-full max-w-md shadow-2xl animate-fade-in relative z-[101]">
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
