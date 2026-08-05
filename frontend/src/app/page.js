'use client';

import React, { useState } from 'react';

const PRESET_QUERIES = [
  'Summarize risks',
  'Compare vendor terms',
  'Extract milestones',
  'Check compliance'
];

export default function Home() {
  const [sources, setSources] = useState([
    { id: 'DOC-A-449', name: 'Q3 Market Analysis Report', desc: 'Detailed breakdown of sector performance and emerging trends in renewable energy.', rel: 75, active: false },
    { id: 'DOC-B-112', name: 'Competitor Strategy Deck', desc: 'Leaked internal presentation outlining expansion plans for APAC region.', rel: 99, active: true },
    { id: 'DOC-C-887', name: 'Global Supply Chain Audit', desc: 'Risk assessment of critical material shortages expected in Q4.', rel: 50, active: false },
    { id: 'science.pdf', name: 'science.pdf (Local PDF)', desc: 'Active document indexed in vector database.', rel: 100, active: true }
  ]);

  const [activeSnippets, setActiveSnippets] = useState([
    {
      docId: 'DOC-B-112',
      page: 14,
      text: '"...APAC expansion is scheduled to commence in early Q4, utilizing a penetrative pricing strategy designed to rapidly acquire market share from established regional incumbents..."'
    },
    {
      docId: 'DOC-C-887',
      page: 4,
      text: '"Risk of rare-earth element shortage projected at 60% probability by end of year, pending geopolitical stabilization."'
    }
  ]);

  const [draftText, setDraftText] = useState(
    'Based on the analyzed documents, the strategic outlook for Q4 indicates a significant pivot towards renewable integration, specifically driven by competitor movements in the APAC region.\n\nInternal analysis (DOC-A-449) suggests a 15% growth margin if supply chain constraints are mitigated. However, the leaked competitor strategy (DOC-B-112) reveals an aggressive pricing model that could undercut current projections.'
  );

  const [aiInference, setAiInference] = useState(
    'The combination of supply chain risks (DOC-C-887) and competitor APAC expansion (DOC-B-112) presents a high-probability threat to market share in key territories. Recommend immediate recalibration of Q4 logistics.'
  );

  const [question, setQuestion] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [indexingStatus, setIndexingStatus] = useState('');

  // Call Express RAG API
  const handleQuery = async (queryText) => {
    if (!queryText.trim()) return;
    setIsProcessing(true);
    try {
      const res = await fetch('http://localhost:5001/api/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: queryText })
      });
      const data = await res.json();
      if (data.success) {
        setDraftText(data.answer);
        
        // Update inference block
        if (data.answer.includes("I don't have enough information")) {
          setAiInference('No conclusive AI Inference can be drawn from the current document context for this query.');
        } else {
          setAiInference(`Synthesized reasoning based on the query: "${queryText}". The models retrieved highly relevant context chunks from the source document to formulate this answer.`);
        }

        // Update active snippets from matches
        if (data.matches && data.matches.length > 0) {
          const formattedSnippets = data.matches.slice(0, 3).map((match, index) => ({
            docId: 'science.pdf',
            page: index + 1, // mock page since langchain pdf parser output might split
            text: match.metadata.text || 'No text content available.'
          }));
          setActiveSnippets(formattedSnippets);
        } else {
          setActiveSnippets([]);
        }
      } else {
        alert('Query failed: ' + (data.error || 'Unknown error'));
      }
    } catch (err) {
      console.error(err);
      alert('Error connecting to backend server. Make sure the Express server is running on http://localhost:5001');
    } finally {
      setIsProcessing(false);
    }
  };

  // Trigger PDF Indexing
  const handleIndexPDF = async () => {
    setIndexingStatus('Indexing...');
    try {
      const res = await fetch('http://localhost:5001/api/index', {
        method: 'POST'
      });
      const data = await res.json();
      if (data.success) {
        setIndexingStatus('Success!');
        setTimeout(() => setIndexingStatus(''), 3000);
      } else {
        setIndexingStatus('Failed');
        alert('Indexing failed: ' + (data.error || 'Unknown error'));
      }
    } catch (err) {
      console.error(err);
      setIndexingStatus('Error');
      alert('Error connecting to backend server. Make sure the Express server is running on http://localhost:5001');
    }
  };

  const handlePresetClick = (preset) => {
    setQuestion(preset);
    handleQuery(preset);
  };

  return (
    <div className="bg-background text-on-surface font-body text-sm h-screen overflow-hidden flex flex-col">
      {/* TopNavBar */}
      <header className="bg-surface-container-low flex justify-between items-center px-container-padding h-16 w-full fixed top-0 z-50 backdrop-blur-md border-b border-outline-variant">
        <div className="flex items-center gap-8">
          <div className="text-lg font-bold text-primary tracking-tight">Veritas AI</div>
          <nav className="hidden md:flex items-center gap-6">
            <span className="text-on-surface-variant font-medium pb-1 hover:text-primary transition-colors duration-200 cursor-pointer">Vector Space</span>
            <span className="text-on-surface-variant font-medium pb-1 hover:text-primary transition-colors duration-200 cursor-pointer">Reader</span>
            <span className="text-on-surface-variant font-medium pb-1 hover:text-primary transition-colors duration-200 cursor-pointer">Knowledge Void</span>
            <span className="text-primary font-semibold border-b-2 border-primary pb-1 hover:text-primary transition-colors duration-200 cursor-pointer">Synthesis</span>
          </nav>
        </div>
        <div className="flex items-center gap-4">
          <button 
            onClick={handleIndexPDF} 
            disabled={indexingStatus === 'Indexing...'}
            className="bg-primary text-on-primary px-4 py-2 rounded font-semibold text-xs glow-button transition-all disabled:opacity-50"
          >
            {indexingStatus || 'Sync local PDF'}
          </button>
          <button className="text-on-surface-variant hover:text-primary transition-colors">
            <span className="material-symbols-outlined align-middle">settings</span>
          </button>
          <button className="text-on-surface-variant hover:text-primary transition-colors">
            <span className="material-symbols-outlined align-middle">help</span>
          </button>
          <div className="w-8 h-8 rounded-full bg-surface-container-high border border-outline-variant overflow-hidden flex items-center justify-center">
            <div className="w-6 h-6 rounded-full bg-primary-container flex items-center justify-center text-xs font-bold text-on-primary-container">
              AI
            </div>
          </div>
        </div>
      </header>

      {/* Main Workspace Grid */}
      <main className="workspace-grid flex-1">
        {/* Left Pane: Source Documents */}
        <section className="pane flex flex-col border-r border-outline-variant">
          <div className="p-4 border-b border-outline-variant sticky top-0 bg-background z-20 backdrop-blur-md">
            <h2 className="text-sm font-bold text-on-surface flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-lg">dataset</span>
              Active Sources
            </h2>
            <div className="text-xs text-outline mt-1 font-mono">{sources.length} Documents Available</div>
          </div>
          
          <div className="p-4 flex flex-col gap-4 overflow-y-auto flex-1">
            {sources.map((src) => (
              <div 
                key={src.id} 
                className={`glass-panel p-3 rounded cursor-pointer hover:border-primary transition-colors relative group ${src.active ? 'border-primary ring-1 ring-primary' : ''}`}
              >
                <div className="flex justify-between items-start mb-2">
                  <span className="text-xs font-mono text-primary-fixed-dim">{src.id}</span>
                  <span className="material-symbols-outlined text-outline text-sm">
                    {src.active ? 'visibility' : 'visibility_off'}
                  </span>
                </div>
                <h3 className="font-semibold text-on-surface mb-1 truncate">{src.name}</h3>
                <p className="text-xs text-on-surface-variant line-clamp-2 mb-2">{src.desc}</p>
                <div className="flex items-center gap-2">
                  <div className="h-1 flex-1 bg-surface-container-high rounded-full overflow-hidden">
                    <div className="h-full bg-primary" style={{ width: `${src.rel}%` }}></div>
                  </div>
                  <span className="text-xs font-mono text-primary">{src.rel}% Rel</span>
                </div>
              </div>
            ))}
          </div>
          
          <div className="p-4 border-t border-outline-variant bg-surface-container mt-auto">
            <button 
              onClick={handleIndexPDF}
              className="w-full flex items-center justify-center gap-2 py-2 border border-outline-variant rounded text-on-surface-variant hover:text-primary hover:border-primary transition-colors text-xs font-semibold"
            >
              <span className="material-symbols-outlined text-sm">add</span>
              Re-Index Source PDF
            </button>
          </div>
        </section>

        {/* Center Pane: Synthesis Area */}
        <section className="pane flex flex-col border-r border-outline-variant relative">
          <div className="p-6 border-b border-outline-variant sticky top-0 bg-background z-20 backdrop-blur-md flex justify-between items-center">
            <div>
              <h1 className="text-lg font-bold text-on-surface">Synthesis Draft</h1>
              <div className="text-xs text-primary mt-1 flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full bg-primary ${isProcessing ? 'animate-ping' : 'animate-pulse'}`}></span>
                {isProcessing ? 'Thinking...' : 'Live Generation'}
              </div>
            </div>
            <div className="flex gap-2">
              <button className="p-2 rounded bg-surface-container-high text-on-surface hover:text-primary transition-colors">
                <span className="material-symbols-outlined text-sm">history</span>
              </button>
              <button 
                onClick={() => {
                  const blob = new Blob([draftText], { type: 'text/plain' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = 'synthesis_draft.txt';
                  a.click();
                }}
                className="p-2 rounded bg-surface-container-high text-on-surface hover:text-primary transition-colors"
                title="Download Draft"
              >
                <span className="material-symbols-outlined text-sm">download</span>
              </button>
            </div>
          </div>
          
          {/* Main Draft Area */}
          <div className="flex-1 p-8 overflow-y-auto pb-40">
            <div className="max-w-2xl mx-auto space-y-6 text-base leading-relaxed text-on-surface">
              {draftText.split('\n\n').map((para, i) => (
                <p key={i} className="whitespace-pre-line">
                  {para}
                </p>
              ))}

              {/* AI Inference Banner */}
              {aiInference && (
                <div className="p-4 border-l-2 border-primary bg-surface-container-low rounded-r glass-panel my-6">
                  <h4 className="text-xs font-mono text-primary mb-2 flex items-center gap-2">
                    <span className="material-symbols-outlined text-base">psychology</span>
                    AI Inference
                  </h4>
                  <p className="text-sm text-on-surface">{aiInference}</p>
                </div>
              )}
            </div>
          </div>

          {/* Preset Command suggestions */}
          <div className="absolute bottom-24 left-1/2 -translate-x-1/2 flex gap-2 z-30 max-w-full overflow-x-auto px-4 py-1">
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

          {/* Query Bar */}
          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 bg-surface-container-highest rounded-full px-6 py-3 flex items-center gap-4 shadow-lg border border-outline-variant backdrop-blur-md z-30 w-11/12 max-w-xl">
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleQuery(question);
              }}
              disabled={isProcessing}
              className="bg-transparent border-none text-sm text-on-surface focus:outline-none focus:ring-0 placeholder:text-on-surface-variant flex-1"
              placeholder={isProcessing ? 'Waiting for response...' : 'Refine synthesis...'}
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
            <div className="text-xs text-outline font-mono mb-2 uppercase">Active Snippets ({activeSnippets.length})</div>
            
            {activeSnippets.map((snip, index) => (
              <div key={index} className="glass-panel p-4 rounded relative">
                <div className="absolute -left-3 top-4 w-3 border-t-2 border-primary border-dashed"></div>
                <div className="flex justify-between items-center mb-3">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 bg-surface-container text-primary text-xs font-mono rounded">
                      {snip.docId}
                    </span>
                    <span className="text-xs text-on-surface-variant font-mono">Page {snip.page}</span>
                  </div>
                  <button className="text-on-surface-variant hover:text-primary transition-colors">
                    <span className="material-symbols-outlined text-sm">open_in_new</span>
                  </button>
                </div>
                <p className="text-xs text-on-surface font-mono bg-surface-container-low p-2 rounded border border-outline-variant border-l-2 border-l-primary leading-relaxed whitespace-pre-wrap">
                  {snip.text}
                </p>
              </div>
            ))}

            {activeSnippets.length === 0 && (
              <div className="text-xs text-on-surface-variant italic text-center mt-8">
                No active source snippets referenced. Submit a query to see grounded context citations.
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
