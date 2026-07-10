import Head from 'next/head';
import Link from 'next/link';
import { useState } from 'react';
import { 
  BookOpen, 
  Terminal, 
  Settings, 
  Cpu, 
  ShieldAlert, 
  Search, 
  HelpCircle,
  FileCode,
  Layers,
  Sparkles
} from 'lucide-react';

export default function Docs() {
  const [activeSection, setActiveSection] = useState('getting-started');

  const renderContent = () => {
    switch (activeSection) {
      case 'getting-started':
        return (
          <div className="docs-section">
            <h1 className="docs-title">Getting Started</h1>
            <p>Plural Code is a local developer environment agentic assistant designed to pair-program with you. It automates coding tasks by orchestrating multiple specialized LLM agents in a loop.</p>
            
            <h2>Installation</h2>
            <p>Install the CLI globally on your machine using npm:</p>
            <pre><code>npm install -g plural-code</code></pre>

            <h2>First-Time Setup</h2>
            <p>Initialize your environment config and save your API keys safely to your OS keychain/credential manager:</p>
            <pre><code>pc init</code></pre>
            <div className="info-box">
              <strong>API Keys Setup:</strong> You will be prompted to enter your NVIDIA NIM API Key (required for default model routing), OpenRouter API Key (optional fallback), and Tavily Web Search API Key (optional for search research).
            </div>

            <h2>Your First Request</h2>
            <p>Navigate to any directory and run `pc` to launch the interactive shell:</p>
            <pre><code>cd my-codebase
pc</code></pre>
            <p>Type your request in the prompt: <code>&gt; Create a React button component with purple text and hover effects</code></p>
          </div>
        );

      case 'concepts':
        return (
          <div className="docs-section">
            <h1 className="docs-title">Core Concepts</h1>
            <p>Plural Code runs a collaborative loop among five specialized agents to write, review, and test code changes.</p>

            <h2>How the Five Agents Work Together</h2>
            <ul>
              <li style={{ marginBottom: '15px' }}>
                <strong>Planner:</strong> Breaks down your task, analyzes your existing codebase directories, and outlines a step-by-step implementation plan.
              </li>
              <li style={{ marginBottom: '15px' }}>
                <strong>Coder:</strong> Follows the plan to make precise code changes. Executes file read/write operations and command runs.
              </li>
              <li style={{ marginBottom: '15px' }}>
                <strong>Reviewer:</strong> Inspects generated code diffs for bugs, logic gaps, safety violations, and compilation issues. If problems are found, it provides detailed feedback to the Coder.
              </li>
              <li style={{ marginBottom: '15px' }}>
                <strong>Executor:</strong> Runs tests, linters, and verification builds on your local terminal environment.
              </li>
              <li style={{ marginBottom: '15px' }}>
                <strong>Synthesizer:</strong> Collates metrics (files modified, lines added/removed) and outputs a comprehensive activity log.
              </li>
            </ul>

            <h2>Safety & Permissions</h2>
            <p>Your security is paramount. The Coder and Executor are running locally on your hardware. Plural Code monitors commands for dangerous keywords like <code>rm</code>, <code>drop</code>, or <code>truncate</code>. Destructive actions will always trigger a prompt asking for explicit confirmation.</p>
          </div>
        );

      case 'cli-reference':
        return (
          <div className="docs-section">
            <h1 className="docs-title">CLI Reference</h1>
            <p>Documentation of all commands and global options supported by the Plural Code command-line interface.</p>

            <h2>Slash Commands</h2>
            <p>While in the interactive TUI shell, prefix inputs with <code>/</code> to execute assistant controls:</p>
            <ul>
              <li style={{ marginBottom: '10px' }}><code>/model &lt;agent&gt; &lt;model-id&gt;</code> - Swaps active model for an agent (planner, coder, reviewer, executor, synthesizer).</li>
              <li style={{ marginBottom: '10px' }}><code>/provider &lt;nvidia|openrouter&gt;</code> - Changes default global provider completions.</li>
              <li style={{ marginBottom: '10px' }}><code>/search &lt;query&gt;</code> - Triggers a Tavily search lookup.</li>
              <li style={{ marginBottom: '10px' }}><code>/research &lt;query&gt;</code> - Activates multi-step deep research mode.</li>
              <li style={{ marginBottom: '10px' }}><code>/diff</code> - Compiles git diff for all pending edits.</li>
              <li style={{ marginBottom: '10px' }}><code>/commit "&lt;msg&gt;"</code> - Adds files and commits edits to local git branch.</li>
              <li style={{ marginBottom: '10px' }}><code>/clear</code> - Clears the current session context memory.</li>
              <li style={{ marginBottom: '10px' }}><code>/help</code> - Prints all active shell commands.</li>
              <li style={{ marginBottom: '10px' }}><code>/exit</code> - Closes the assistant shell session.</li>
            </ul>

            <h2>Config File Structure</h2>
            <p>Non-sensitive preferences are saved under <code>~/.pluralcode/config.json</code>:</p>
            <pre><code>{`{
  "provider": "nvidia",
  "agent_models": {
    "planner": "nvidia/llama-3.3-nemotron-super-49b-v1.5",
    "coder": "deepseek-ai/deepseek-v3.1",
    "reviewer": "nvidia/llama-3.1-nemotron-ultra-253b-v1",
    "executor": "moonshotai/kimi-k2.6",
    "synthesizer": "z-ai/glm5"
  },
  "permissions": {
    "auto_approve_safe_commands": true,
    "auto_approve_file_writes": false,
    "require_confirmation_for": ["rm", "delete", "push", "drop"]
  }
}`}</code></pre>
          </div>
        );

      case 'desktop-guide':
        return (
          <div className="docs-section">
            <h1 className="docs-title">Desktop Guide</h1>
            <p>The Plural Code Desktop application wraps the core engine in a three-panel interface designed for complex project workspace environments.</p>

            <h2>UI Walkthrough</h2>
            <ul>
              <li style={{ marginBottom: '10px' }}><strong>Left Panel (Sidebar):</strong> Choose projects via folder picker, toggle global settings panels, and explore folders.</li>
              <li style={{ marginBottom: '10px' }}><strong>Center Panel (Chat Room):</strong> Input coding directions and watch live agent-discussion activity logs.</li>
              <li style={{ marginBottom: '10px' }}><strong>Right Panel (Diff Viewer):</strong> View green additions and red deletions, with accept/reject approvals.</li>
            </ul>

            <h2>Settings</h2>
            <p>Use the settings drawer to update API keys and model provider routing. Key changes are immediately written to your keychain.</p>
          </div>
        );

      case 'tools':
        return (
          <div className="docs-section">
            <h1 className="docs-title">Tools & Capabilities</h1>
            <p>Specialized actions the coding assistants execute to inspect your project files and resolve errors.</p>

            <h2>File Operations</h2>
            <p>Core actions available to code creation loops:</p>
            <ul>
              <li><code>read_file(path)</code> - Extracts full code contents.</li>
              <li><code>write_file(path, content)</code> - Generates new files.</li>
              <li><code>edit_file(path, oldStr, newStr)</code> - Targets precise line blocks for updates.</li>
              <li><code>list_directory(path)</code> - Lists directories.</li>
              <li><code>delete_file(path)</code> - Removes target files (requires confirmation).</li>
            </ul>

            <h2>Deep Research Mode</h2>
            <p>Decomposes fuzzy topics into exactly 3 sub-questions, queries Google/Tavily for sources, checks search depth, and synthesizes a formatted report.</p>
          </div>
        );

      case 'faq':
        return (
          <div className="docs-section">
            <h1 className="docs-title">FAQ</h1>
            
            <h2>Where are session logs stored?</h2>
            <p>Session memory history logs are written locally under <code>~/.pluralcode/sessions/&lt;project-hash&gt;.json</code>.Differentiate folders using SHA-256 hashes.</p>

            <h2>Can I run this without internet?</h2>
            <p>The code orchestration runs locally, but calling the default LLM providers (NVIDIA NIM/OpenRouter) requires an active internet connection to execute reasoning cycles.</p>

            <h2>How are API keys secured?</h2>
            <p>Keys are stored using the OS Keychain/Credential manager (via <code>keytar</code>). If keychain storage fails, keys fall back to a base64 obfuscated file locally.</p>
          </div>
        );
      
      default:
        return null;
    }
  };

  return (
    <div>
      <Head>
        <title>Plural Code - Documentation</title>
        <meta name="description" content="Technical guide and CLI/Desktop manuals for Plural Code." />
      </Head>

      <div className="docs-layout">
        {/* Docs Navigation Sidebar */}
        <div className="docs-sidebar">
          <div style={{ marginBottom: '40px', fontWeight: '700', fontSize: '1.2rem', color: '#FFF' }}>
            <Link href="/" style={{ color: '#FFF' }}>
              PLURAL <span style={{ color: '#7C3AED' }}>CODE</span>
            </Link>
          </div>

          <div className="docs-nav-section">
            <div className="docs-nav-title">Guides</div>
            <button 
              className={`docs-nav-link ${activeSection === 'getting-started' ? 'active' : ''}`}
              style={{ background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', width: '100%' }}
              onClick={() => setActiveSection('getting-started')}
            >
              Getting Started
            </button>
            <button 
              className={`docs-nav-link ${activeSection === 'concepts' ? 'active' : ''}`}
              style={{ background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', width: '100%' }}
              onClick={() => setActiveSection('concepts')}
            >
              Core Concepts
            </button>
          </div>

          <div className="docs-nav-section">
            <div className="docs-nav-title">Manuals</div>
            <button 
              className={`docs-nav-link ${activeSection === 'cli-reference' ? 'active' : ''}`}
              style={{ background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', width: '100%' }}
              onClick={() => setActiveSection('cli-reference')}
            >
              CLI Reference
            </button>
            <button 
              className={`docs-nav-link ${activeSection === 'desktop-guide' ? 'active' : ''}`}
              style={{ background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', width: '100%' }}
              onClick={() => setActiveSection('desktop-guide')}
            >
              Desktop Guide
            </button>
          </div>

          <div className="docs-nav-section">
            <div className="docs-nav-title">Features</div>
            <button 
              className={`docs-nav-link ${activeSection === 'tools' ? 'active' : ''}`}
              style={{ background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', width: '100%' }}
              onClick={() => setActiveSection('tools')}
            >
              Tools & Capabilities
            </button>
            <button 
              className={`docs-nav-link ${activeSection === 'faq' ? 'active' : ''}`}
              style={{ background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', width: '100%' }}
              onClick={() => setActiveSection('faq')}
            >
              FAQ
            </button>
          </div>
        </div>

        {/* Content Viewer Panel */}
        <div className="docs-content">
          {renderContent()}
        </div>
      </div>
    </div>
  );
}
