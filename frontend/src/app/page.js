'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function Home() {
  const router = useRouter();
  const [isClient, setIsClient] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    setIsClient(true);
    const savedUser = localStorage.getItem('veritas_user');
    if (savedUser) {
      try {
        setCurrentUser(JSON.parse(savedUser));
        router.push('/dashboard');
      } catch (e) {
        console.error("Failed to parse user session", e);
      }
    }
  }, [router]);

  if (!isClient) {
    return (
      <div className="bg-[#0b1326] h-screen w-screen flex items-center justify-center text-primary font-mono animate-pulse">
        Loading Veritas AI...
      </div>
    );
  }

  return (
    <LandingPage onLoginSuccess={(user) => {
      localStorage.setItem('veritas_user', JSON.stringify(user));
      setCurrentUser(user);
      router.push('/dashboard');
    }} />
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
    <div className="w-full bg-[#0b1326] text-on-surface font-body relative flex flex-col justify-between min-h-screen">
      {/* Decorative glows */}
      <div className="absolute top-[-100px] left-[-100px] w-[500px] h-[500px] rounded-full bg-primary/5 blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-[-100px] right-[-100px] w-[500px] h-[500px] rounded-full bg-primary-fixed-dim/5 blur-[120px] pointer-events-none"></div>

      {/* Dynamic Background SVGs */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
        {/* Animated Network Node Grid SVG */}
        <svg className="absolute top-[15%] right-[5%] w-[400px] h-[400px] opacity-10 text-primary animate-[spin_120s_linear_infinite]" viewBox="0 0 100 100" fill="none" stroke="currentColor" strokeWidth="0.5">
          <circle cx="50" cy="50" r="45" strokeDasharray="3 3" />
          <circle cx="50" cy="50" r="30" strokeDasharray="2 1" />
          <line x1="50" y1="5" x2="50" y2="95" />
          <line x1="5" y1="50" x2="95" y2="50" />
          <circle cx="50" cy="5" r="2" fill="currentColor" />
          <circle cx="50" cy="95" r="2" fill="currentColor" />
          <circle cx="5" cy="50" r="2" fill="currentColor" />
          <circle cx="95" cy="50" r="2" fill="currentColor" />
          <circle cx="50" cy="50" r="4" fill="currentColor" />
        </svg>

        {/* Floating Matrix Dotted SVG Grid */}
        <svg className="absolute bottom-[20%] left-[8%] w-[300px] h-[300px] opacity-15 text-primary-fixed animate-[pulse_10s_ease-in-out_infinite]" viewBox="0 0 100 100" fill="none" stroke="currentColor" strokeWidth="0.7">
          <path d="M10,10 L90,10 M10,30 L90,30 M10,50 L90,50 M10,70 L90,70 M10,90 L90,90" />
          <path d="M10,10 L10,90 M30,10 L30,90 M50,10 L50,90 M70,10 L70,90 M90,10 L90,90" strokeDasharray="2 2" stroke="currentColor" />
        </svg>

        {/* Floating Abstract Molecular Structure */}
        <svg className="absolute top-[45%] left-[45%] w-[150px] h-[150px] opacity-10 text-primary-fixed-dim animate-[bounce_15s_infinite]" viewBox="0 0 100 100" fill="currentColor">
          <circle cx="20" cy="20" r="5" />
          <circle cx="80" cy="20" r="5" />
          <circle cx="50" cy="80" r="5" />
          <line x1="20" y1="20" x2="80" y2="20" stroke="currentColor" strokeWidth="1" />
          <line x1="80" y1="20" x2="50" y2="80" stroke="currentColor" strokeWidth="1" />
          <line x1="50" y1="80" x2="20" y2="20" stroke="currentColor" strokeWidth="1" />
        </svg>
      </div>

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
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-xs font-semibold text-primary font-mono">
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
        <div id="sandbox" className="flex-1 w-full max-w-xl">
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

      {/* Metrics Section */}
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
          <div className="glass-panel p-6 rounded-xl border border-outline-variant/60 hover:border-primary/50 transition-all group bg-[#0b1326]/50 backdrop-blur">
            <span className="material-symbols-outlined text-primary text-2xl group-hover:scale-110 transition-transform">lock</span>
            <h3 className="text-sm font-bold text-on-surface mt-4 mb-2">Isolated Workspaces</h3>
            <p className="text-xs text-outline leading-relaxed">Accounts are completely isolated in MongoDB Atlas. One user can never see or search another's workspaces.</p>
          </div>

          <div className="glass-panel p-6 rounded-xl border border-outline-variant/60 hover:border-primary/50 transition-all group bg-[#0b1326]/50 backdrop-blur">
            <span className="material-symbols-outlined text-primary text-2xl group-hover:scale-110 transition-transform">find_in_page</span>
            <h3 className="text-sm font-bold text-on-surface mt-4 mb-2">Source Page Citations</h3>
            <p className="text-xs text-outline leading-relaxed">Every answer is backed by a citation card. Click to open the physical PDF page directly in a new tab.</p>
          </div>

          <div className="glass-panel p-6 rounded-xl border border-outline-variant/60 hover:border-primary/50 transition-all group bg-[#0b1326]/50 backdrop-blur">
            <span className="material-symbols-outlined text-primary text-2xl group-hover:scale-110 transition-transform">filter_list</span>
            <h3 className="text-sm font-bold text-on-surface mt-4 mb-2">PDF Document Filters</h3>
            <p className="text-xs text-outline leading-relaxed">Scope query parameters instantly. Target a specific PDF or query across all files concurrently.</p>
          </div>

          <div className="glass-panel p-6 rounded-xl border border-outline-variant/60 hover:border-primary/50 transition-all group bg-[#0b1326]/50 backdrop-blur">
            <span className="material-symbols-outlined text-primary text-2xl group-hover:scale-110 transition-transform">analytics</span>
            <h3 className="text-sm font-bold text-on-surface mt-4 mb-2">Vector Ingestion</h3>
            <p className="text-xs text-outline leading-relaxed">Extract text, create high-dimensional embeddings, and upsert vectors to Pinecone under dedicated namespaces.</p>
          </div>
        </div>
      </section>

      {/* RAG Workflow Pipeline */}
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

      {/* FAQ Section */}
      <section className="max-w-3xl mx-auto w-full px-8 py-16 border-t border-outline-variant/20 z-10">
        <div className="text-center mb-10">
          <h2 className="text-2xl font-bold text-on-surface font-mono uppercase tracking-wider">Frequently Asked Questions</h2>
        </div>

        <div className="space-y-4">
          <details className="group border border-outline-variant/60 rounded-lg bg-[#0b1326]/50 p-4 transition-all">
            <summary className="flex justify-between items-center cursor-pointer text-xs font-bold font-mono text-on-surface select-none">
              <span>Is my PDF data shared with anyone else?</span>
              <span className="material-symbols-outlined group-open:rotate-180 transition-transform text-sm">expand_more</span>
            </summary>
            <p className="text-xs text-outline leading-relaxed mt-3 pt-3 border-t border-outline-variant/30 font-mono">
              No. Veritas AI enforces database-level user isolation. Workspaces are scoped using a secure `userId` key, and vectors are queried under unique Pinecone namespaces.
            </p>
          </details>

          <details className="group border border-outline-variant/60 rounded-lg bg-[#0b1326]/50 p-4 transition-all">
            <summary className="flex justify-between items-center cursor-pointer text-xs font-bold font-mono text-on-surface select-none">
              <span>How does the PDF Page link work?</span>
              <span className="material-symbols-outlined group-open:rotate-180 transition-transform text-sm">expand_more</span>
            </summary>
            <p className="text-xs text-outline leading-relaxed mt-3 pt-3 border-t border-outline-variant/30 font-mono">
              When indexing your file, the system keeps track of the original page number of each block. When a query is answered, clicking the link opens that PDF page directly using standard PDF hashes.
            </p>
          </details>

          <details className="group border border-outline-variant/60 rounded-lg bg-[#0b1326]/50 p-4 transition-all">
            <summary className="flex justify-between items-center cursor-pointer text-xs font-bold font-mono text-on-surface select-none">
              <span>What models are used?</span>
              <span className="material-symbols-outlined group-open:rotate-180 transition-transform text-sm">expand_more</span>
            </summary>
            <p className="text-xs text-outline leading-relaxed mt-3 pt-3 border-t border-outline-variant/30 font-mono">
              Veritas AI utilizes `gemini-embedding-001` for embedding vectors and `gemini-3.1-pro-preview` to answer questions securely and accurately.
            </p>
          </details>
        </div>
      </section>

      {/* Footer */}
      <footer className="px-8 py-6 border-t border-outline-variant/30 flex justify-between items-center max-w-7xl mx-auto w-full text-[10px] font-mono text-outline z-20">
        <div>VERITAS AI &copy; 2026. Built by Uma Sahni.</div>
        <div>POWERED BY GEMINI & PINECONE</div>
      </footer>

      {/* Auth Modal Overlay */}
      {showAuthModal && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-md z-[100] flex items-center justify-center p-4">
          <div className="bg-[#0b1326]/95 border border-outline-variant rounded-xl p-8 w-full max-w-md shadow-2xl relative z-[101]">
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
