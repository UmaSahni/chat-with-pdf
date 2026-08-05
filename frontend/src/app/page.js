'use client';

import React, { useState, useEffect, useRef } from 'react';

const PRESET_QUERIES = [
  'Summarize risks',
  'Compare vendor terms',
  'Extract milestones',
  'Check compliance'
];

export default function Home() {
  const [isClient, setIsClient] = useState(false);
  
  // App states
  const [sessions, setSessions] = useState([]);
  const [activeSessionId, setActiveSessionId] = useState('');
  
  // active filter state
  const [docTypeFilter, setDocTypeFilter] = useState('all'); // all, textbook, question_paper
  
  // File upload state
  const [uploadDocType, setUploadDocType] = useState('textbook');
  const [uploadStatus, setUploadStatus] = useState('');
  const fileInputRef = useRef(null);

  // Chat inputs
  const [question, setQuestion] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  
  // Right pane details (current active snippets)
  const [activeSnippets, setActiveSnippets] = useState([]);

  // Ensure client-side only execution for localStorage
  useEffect(() => {
    setIsClient(true);
    const savedSessions = localStorage.getItem('veritas_ai_sessions');
    if (savedSessions) {
      try {
        const parsed = JSON.parse(savedSessions);
        setSessions(parsed);
        if (parsed.length > 0) {
          setActiveSessionId(parsed[0].id);
        }
      } catch (e) {
        console.error("Failed to parse sessions", e);
        initializeDefaultSessions();
      }
    } else {
      initializeDefaultSessions();
    }
  }, []);

  const initializeDefaultSessions = () => {
    const defaultSessions = [
      {
        id: 'session_physics_101',
        name: 'Physics Exam Prep',
        namespace: 'user_default:session_physics_101',
        files: [
          { name: 'science_textbook.pdf', docType: 'textbook', rel: 100 }
        ],
        chatHistory: [
          { 
            role: 'assistant', 
            content: 'Hello! I am ready to analyze your Physics materials. Upload your textbooks and question papers, and ask me to cross-reference or solve specific questions.',
            snippets: []
          }
        ]
      },
      {
        id: 'session_law_202',
        name: 'Laws & Crime Study',
        namespace: 'user_default:session_law_202',
        files: [],
        chatHistory: [
          { 
            role: 'assistant', 
            content: 'Welcome to your Law study workspace. Upload case documents or criminal codes, and ask me to summarize clauses or check compliance.',
            snippets: []
          }
        ]
      }
    ];
    setSessions(defaultSessions);
    setActiveSessionId(defaultSessions[0].id);
    localStorage.setItem('veritas_ai_sessions', JSON.stringify(defaultSessions));
  };

  // Helper to persist sessions to local storage
  const saveSessionsToDisk = (updatedSessions) => {
    setSessions(updatedSessions);
    localStorage.setItem('veritas_ai_sessions', JSON.stringify(updatedSessions));
  };

  // Get current active session
  const activeSession = sessions.find(s => s.id === activeSessionId) || sessions[0];

  // Update active snippets when active session changes or chat selection changes
  useEffect(() => {
    if (activeSession && activeSession.chatHistory) {
      const lastMsgWithSnippets = [...activeSession.chatHistory]
        .reverse()
        .find(msg => msg.snippets && msg.snippets.length > 0);
      if (lastMsgWithSnippets) {
        setActiveSnippets(lastMsgWithSnippets.snippets);
      } else {
        setActiveSnippets([]);
      }
    }
  }, [activeSessionId, sessions]);

  // Create new Session
  const handleCreateSession = () => {
    const name = prompt('Enter a name for your new workspace:');
    if (!name || !name.trim()) return;
    
    const newSessionId = `session_${Date.now()}`;
    const newSession = {
      id: newSessionId,
      name: name.trim(),
      namespace: `user_default:${newSessionId}`,
      files: [],
      chatHistory: [
        {
          role: 'assistant',
          content: `Welcome to your new workspace: "${name}". Upload files and start querying.`,
          snippets: []
        }
      ]
    };
    const updated = [...sessions, newSession];
    saveSessionsToDisk(updated);
    setActiveSessionId(newSessionId);
  };

  // Delete Session
  const handleDeleteSession = (sid, event) => {
    event.stopPropagation();
    if (!confirm('Are you sure you want to delete this workspace? All uploaded references and chat history will be lost.')) return;
    
    const updated = sessions.filter(s => s.id !== sid);
    saveSessionsToDisk(updated);
    if (activeSessionId === sid && updated.length > 0) {
      setActiveSessionId(updated[0].id);
    }
  };

  // File Ingestion Handler
  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setUploadStatus('Uploading...');
    const formData = new FormData();
    formData.append('file', file);
    formData.append('docType', uploadDocType);
    formData.append('namespace', activeSession.namespace);

    try {
      const res = await fetch('http://localhost:5001/api/upload', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (data.success) {
        setUploadStatus('Success!');
        
        // Add file to active session files list
        const updatedFiles = [
          ...activeSession.files,
          { name: file.name, docType: uploadDocType, rel: 100 }
        ];
        
        const updatedSessions = sessions.map(s => {
          if (s.id === activeSessionId) {
            return { ...s, files: updatedFiles };
          }
          return s;
        });
        
        saveSessionsToDisk(updatedSessions);
        setTimeout(() => setUploadStatus(''), 3000);
      } else {
        setUploadStatus('Failed');
        alert('File upload failed: ' + (data.error || 'Unknown error'));
      }
    } catch (err) {
      console.error(err);
      setUploadStatus('Error');
      alert('Error connecting to backend server. Ensure Express is running on http://localhost:5001');
    }
  };

  // Core Query RAG execution
  const handleQuery = async (queryText) => {
    if (!queryText.trim() || isProcessing) return;
    setIsProcessing(true);

    // Add user message to history
    const userMsg = { role: 'user', content: queryText };
    const updatedHistoryWithUser = [...activeSession.chatHistory, userMsg];
    
    let updatedSessions = sessions.map(s => {
      if (s.id === activeSessionId) {
        return { ...s, chatHistory: updatedHistoryWithUser };
      }
      return s;
    });
    saveSessionsToDisk(updatedSessions);
    setQuestion('');

    try {
      const res = await fetch('http://localhost:5001/api/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: queryText,
          namespace: activeSession.namespace,
          docTypeFilter: docTypeFilter
        })
      });
      const data = await res.json();
      if (data.success) {
        // Format snippets for reference portal
        const snippets = (data.matches || []).map((match, i) => ({
          docId: match.metadata.source_name || 'Document',
          page: match.metadata.page_number || i + 1,
          text: match.metadata.text || 'No snippet text.'
        }));

        const botMsg = { 
          role: 'assistant', 
          content: data.answer,
          snippets: snippets
        };

        updatedSessions = sessions.map(s => {
          if (s.id === activeSessionId) {
            return { 
              ...s, 
              chatHistory: [...updatedHistoryWithUser, botMsg] 
            };
          }
          return s;
        });
        saveSessionsToDisk(updatedSessions);
        setActiveSnippets(snippets);
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

  const handlePresetClick = (preset) => {
    handleQuery(preset);
  };

  if (!isClient || !activeSession) {
    return (
      <div className="bg-[#0b1326] h-screen w-screen flex items-center justify-center text-primary font-mono">
        Loading Veritas AI Workspaces...
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
              <option value="textbook">Textbook</option>
              <option value="question_paper">Question Paper</option>
              <option value="general">General PDF</option>
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
          <button className="text-on-surface-variant hover:text-primary transition-colors">
            <span className="material-symbols-outlined align-middle">settings</span>
          </button>
          <div className="w-8 h-8 rounded-full bg-surface-container-high border border-outline-variant overflow-hidden flex items-center justify-center">
            <div className="w-6 h-6 rounded-full bg-primary-container flex items-center justify-center text-xs font-bold text-on-primary-container">
              US
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
                    {file.docType}
                  </span>
                </div>
                <h3 className="font-semibold text-on-surface text-xs truncate" title={file.name}>
                  {file.name}
                </h3>
              </div>
            ))}

            {activeSession.files.length === 0 && (
              <div className="text-xs text-outline italic text-center py-6">
                No documents uploaded. Upload a textbook or question paper to start.
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
              {activeSession.chatHistory.map((msg, i) => (
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

          {/* Preset Queries suggestions */}
          <div className="absolute bottom-28 left-1/2 -translate-x-1/2 flex gap-2 z-30 max-w-full overflow-x-auto px-4 py-1">
            {PRESET_QUERIES.map((preset) => (
              <button
                key={preset}
                onClick={() => handlePresetClick(preset)}
                className="px-3 py-1.5 rounded-full bg-surface-container-high border border-outline-variant text-xs font-medium text-on-surface-variant hover:border-primary hover:text-primary transition-all whitespace-nowrap"
              >
                {preset}
              </button>
            ))}
          </div>

          {/* Prompt Refinement Bar */}
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-surface-container-highest rounded-full px-5 py-2.5 flex items-center gap-3 shadow-lg border border-outline-variant backdrop-blur-md z-30 w-11/12 max-w-xl">
            {/* Filter Toggle */}
            <select
              value={docTypeFilter}
              onChange={(e) => setDocTypeFilter(e.target.value)}
              className="bg-transparent border-none text-xs text-primary font-mono focus:outline-none focus:ring-0 mr-1"
            >
              <option value="all">Filter: All</option>
              <option value="textbook">Filter: Books Only</option>
              <option value="question_paper">Filter: Exam Papers</option>
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
                    <span className="px-2 py-0.5 bg-surface-container text-primary text-xs font-mono rounded max-w-[120px] truncate" title={snip.docId}>
                      {snip.docId}
                    </span>
                    <span className="text-xs text-on-surface-variant font-mono">Page {snip.page}</span>
                  </div>
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
    </div>
  );
}
