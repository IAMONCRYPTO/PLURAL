import Head from 'next/head';
import Link from 'next/link';
import { useState } from 'react';
import { Terminal, Cpu, ShieldAlert, Search, Settings, BookOpen, Copy, Check } from 'lucide-react';

export default function Home() {
  const [copied, setCopied] = useState(false);

  const copyCommand = () => {
    navigator.clipboard.writeText('npm install -g plural-code');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div>
      <Head>
        <title>Plural Code - Many minds. One codebase.</title>
        <meta name="description" content="Agentic AI coding assistant wrapping multi-agent orchestration, CLI TUI, and Electron desktop wrappers." />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <main style={{ backgroundColor: '#0A0A0F', minHeight: '100vh', padding: '60px 0' }}>
        <header className="container" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '60px' }}>
          <div style={{ fontWeight: '700', fontSize: '1.25rem' }}>
            PLURAL <span style={{ color: '#7C3AED' }}>CODE</span>
          </div>
          <Link href="/docs" className="docs-nav-link" style={{ color: '#06B6D4', fontWeight: '600' }}>
            Documentation
          </Link>
        </header>

        <section className="hero container">
          <h1 className="hero-title">Many minds. One codebase.</h1>
          <p className="hero-subtitle">
            A local agentic AI coding assistant that orchestrates specialized agents to write, review, and test code.
          </p>

          <div className="install-command">
            <span style={{ color: '#64748B' }}>$</span>
            <span>npm install -g plural-code</span>
            <button className="copy-btn" onClick={copyCommand}>
              {copied ? <Check size={16} /> : <Copy size={16} />}
            </button>
          </div>

          <div style={{ display: 'flex', justifyContent: 'center', gap: '20px' }}>
            <Link href="/docs" style={{ 
              backgroundColor: '#7C3AED', 
              color: '#FFF', 
              padding: '12px 24px', 
              borderRadius: '6px',
              fontWeight: '600'
            }}>
              Get Started
            </Link>
            <a href="#" style={{ 
              border: '1px solid #1E1E2E', 
              color: '#FFF', 
              padding: '12px 24px', 
              borderRadius: '6px',
              fontWeight: '600',
              backgroundColor: '#111118'
            }}>
              Download Desktop App
            </a>
          </div>
        </section>

        <section className="container" style={{ marginTop: '80px' }}>
          <h2 style={{ textAlign: 'center', marginBottom: '40px', fontSize: '1.75rem' }}>Features</h2>
          <div className="grid">
            <div className="card">
              <Cpu style={{ color: '#7C3AED', marginBottom: '15px' }} size={24} />
              <div className="card-title">Multi-Agent Workflow</div>
              <div className="card-desc">
                Planner, Coder, Reviewer, Executor, and Synthesizer agents discuss and inspect code modifications iteratively.
              </div>
            </div>

            <div className="card">
              <Terminal style={{ color: '#06B6D4', marginBottom: '15px' }} size={24} />
              <div className="card-title">Safe Terminal Access</div>
              <div className="card-desc">
                Run builds, tests, and linters automatically. Potentially destructive commands are intercepted and prompt for verification.
              </div>
            </div>

            <div className="card">
              <Search style={{ color: '#10B981', marginBottom: '15px' }} size={24} />
              <div className="card-title">Deep Research Mode</div>
              <div className="card-desc">
                Splits complex search queries into sub-questions, executes parallel web lookups, and aggregates structured summaries.
              </div>
            </div>

            <div className="card">
              <Settings style={{ color: '#F59E0B', marginBottom: '15px' }} size={24} />
              <div className="card-title">Dynamic Model Routing</div>
              <div className="card-desc">
                Mix and match models from NVIDIA NIM and OpenRouter per agent to fit speed, quality, and budget profiles.
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
