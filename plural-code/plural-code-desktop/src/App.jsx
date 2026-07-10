import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import remarkGfm from 'remark-gfm';
import {
  FolderOpen, Folder, Settings, Send, RefreshCw,
  AlertTriangle, X, ChevronDown, ChevronRight,
  Info, AlertCircle, GitCompare, GitBranch, GitCommit,
  Minus, Square, Eye, EyeOff, Plus, Play, Check,
  Search, FileCode, Edit, Trash2, HelpCircle, HardDrive, Terminal
} from 'lucide-react';
// logo is served dynamically from public folder at '/logo.png'

// Providers and Models
const PROVIDERS = [
  { id: 'nvidia', label: 'NVIDIA NIM' },
  { id: 'openrouter', label: 'OpenRouter' }
];

const NVIDIA_MODELS = [
  { id: 'nvidia/llama-3.3-nemotron-super-49b-v1.5', label: 'Nemotron Super 49B' },
  { id: 'nvidia/llama-3.1-nemotron-ultra-253b-v1', label: 'Nemotron Ultra 253B' },
  { id: 'deepseek-ai/deepseek-v4-flash', label: 'DeepSeek V4 Flash' },
  { id: 'deepseek-ai/deepseek-v4-pro', label: 'DeepSeek V4 Pro' },
  { id: 'minimaxai/minimax-m2.7', label: 'MiniMax M2.7 (230B)' },
  { id: 'qwen/qwen3.5-397b-a17b', label: 'Qwen 3.5 (397B)' },
  { id: 'mistralai/mistral-large-3-675b-instruct-2512', label: 'Mistral Large 3 (675B)' },
  { id: 'meta/llama-4-maverick-17b-128e-instruct', label: 'Llama 4 Maverick' },
  { id: 'moonshotai/kimi-k2.6', label: 'Kimi K2.6' },
  { id: 'mistralai/mistral-nemotron', label: 'Mistral Nemotron' },
  { id: 'stepfun-ai/step-3.7-flash', label: 'Step 3.7 Flash' }
];

const OPENROUTER_MODELS = [
  { id: 'anthropic/claude-sonnet-5', label: 'Claude Sonnet 5' },
  { id: 'anthropic/claude-opus-4.8', label: 'Claude Opus 4.8' },
  { id: 'openai/gpt-5.5', label: 'GPT-5.5' },
  { id: 'google/gemini-3.1-pro', label: 'Gemini 3.1 Pro' },
  { id: 'google/gemini-3.5-flash', label: 'Gemini 3.5 Flash' },
  { id: 'qwen/qwen3.7-max', label: 'Qwen 3.7 Max' },
  { id: 'deepseek/deepseek-v4-flash', label: 'DeepSeek V4 Flash' },
  { id: 'deepseek/deepseek-v4-pro', label: 'DeepSeek V4 Pro' },
  { id: 'meta-llama/llama-3.3-70b-instruct', label: 'Llama 3.3 (70B)' }
];

// Tool call collapsible element
function ToolCallItem({ tc }) {
  const [open, setOpen] = useState(false);
  const name = tc.name;
  const args = tc.arguments || {};
  const status = tc.status || 'running'; // running, success, error

  let icon = <Info size={13} className="tool-call-icon" />;
  let label = name;
  let summary = '';

  if (name.includes('file')) {
    icon = <FileCode size={13} className="tool-call-icon" style={{ color: 'var(--accent)' }} />;
    label = name === 'read_file' ? 'Read' : name === 'write_file' ? 'Write' : 'Edit';
    summary = args.path || '';
  } else if (name.includes('command')) {
    icon = <Terminal size={13} className="tool-call-icon" style={{ color: 'var(--accent-green)' }} />;
    label = 'Run';
    summary = args.command || '';
  } else if (name.includes('git')) {
    icon = <GitCompare size={13} className="tool-call-icon" style={{ color: 'var(--accent-yellow)' }} />;
    label = 'Git';
    summary = name.replace('git_', '');
  } else if (name.includes('search')) {
    icon = <Search size={13} className="tool-call-icon" style={{ color: 'var(--accent)' }} />;
    label = 'Search';
    summary = args.query || args.pattern || '';
  }

  return (
    <div className="tool-call-block">
      <div className="tool-call-header" onClick={() => setOpen(!open)}>
        <div className="tool-call-left">
          {icon}
          <span className="tool-call-name">{label}</span>
          <span className="tool-call-arg">{summary}</span>
        </div>
        <div className="tool-call-left" style={{ gap: '10px' }}>
          <span className={`tool-call-status ${status}`}>{status}</span>
          {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </div>
      </div>
      {open && (
        <pre className="tool-call-body">
          {status === 'running' && `Running function args: ${JSON.stringify(args, null, 2)}`}
          {status === 'success' && (tc.result || 'Success')}
          {status === 'error' && (tc.error || 'Failed')}
        </pre>
      )}
    </div>
  );
}

export default function App() {
  // App State
  const [activeProject, setActiveProject] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [currentSessionId, setCurrentSessionId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [thinkingState, setThinkingState] = useState(null);
  const [activeThinkingTimer, setActiveThinkingTimer] = useState(0);

  // Config & API Keys
  const [config, setConfig] = useState({ provider: 'nvidia', model: 'deepseek-ai/deepseek-v4-flash', permissions: { auto_approve_file_writes: false, auto_approve_safe_commands: true } });
  const [keys, setKeys] = useState({ nvidia: '', openrouter: '', tavily: '' });
  const [modelsList, setModelsList] = useState(NVIDIA_MODELS);
  const [modelPickerOpen, setModelPickerOpen] = useState(false);

  // Modals & Panels
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState('keys');
  const [showPassword, setShowPassword] = useState({});
  const [approvalRequest, setApprovalRequest] = useState(null);
  const [showGitPanel, setShowGitPanel] = useState(true);

  // Git Info
  const [gitStatusText, setGitStatusText] = useState('Clean');
  const [gitBranchName, setGitBranchName] = useState('main');
  const [commitMessage, setCommitMessage] = useState('');

  // Refs for scroll
  const chatContainerRef = useRef(null);
  const chatEndRef = useRef(null);
  const [userScrolledUp, setUserScrolledUp] = useState(false);
  const thinkingTimerRef = useRef(null);

  // Load config & keys on mount
  useEffect(() => {
    async function loadConfig() {
      try {
        if (window.pluralAPI) {
          const cfg = await window.pluralAPI.getConfig();
          setConfig(cfg);
          
          const nvidia = await window.pluralAPI.getApiKey('nvidia') || '';
          const openrouter = await window.pluralAPI.getApiKey('openrouter') || '';
          const tavily = await window.pluralAPI.getApiKey('tavily') || '';
          setKeys({ nvidia, openrouter, tavily });

          // Retrieve dynamic models safely
          try {
            const activeKey = cfg.provider === 'openrouter' ? openrouter : nvidia;
            if (activeKey) {
              const list = await window.pluralAPI.fetchModels(cfg.provider, activeKey);
              if (list && list.length > 0) {
                setModelsList(list);
                return;
              }
            }
          } catch (modelErr) {
            console.warn("Failed to fetch dynamic models, using fallbacks:", modelErr);
          }
          
          // Fallback static list
          setModelsList(cfg.provider === 'openrouter' ? OPENROUTER_MODELS : NVIDIA_MODELS);
        }
      } catch (err) {
        console.error("loadConfig error:", err);
      }
    }
    loadConfig();
  }, []);

  // Titlebar controls
  const handleMinimize = () => window.pluralAPI?.minimize();
  const handleMaximize = () => window.pluralAPI?.maximize();
  const handleClose = () => window.pluralAPI?.close();

  // Thinking Timer count-up
  useEffect(() => {
    if (loading) {
      thinkingTimerRef.current = setInterval(() => {
        setActiveThinkingTimer(prev => prev + 1);
      }, 1000);
    } else {
      clearInterval(thinkingTimerRef.current);
      setActiveThinkingTimer(0);
    }
    return () => clearInterval(thinkingTimerRef.current);
  }, [loading]);

  // Wire up IPC event listeners
  useEffect(() => {
    if (!window.pluralAPI) return;

    const unsubText = window.pluralAPI.onAgentText((text) => {
      setMessages(prev => {
        const last = prev[prev.length - 1];
        if (last && last.type === 'text') {
          const updated = [...prev];
          updated[updated.length - 1] = { ...last, text: last.text + text };
          return updated;
        } else {
          return [...prev, { type: 'text', text }];
        }
      });
    });

    const unsubThinking = window.pluralAPI.onThinking(({ agent, iteration }) => {
      setThinkingState({ agent, iteration });
      setMessages(prev => {
        const last = prev[prev.length - 1];
        if (last && last.type === 'thinking' && last.agent === agent) {
          const updated = [...prev];
          updated[updated.length - 1] = { ...last, iteration };
          return updated;
        } else {
          return [...prev, { type: 'thinking', agent, iteration, toolCalls: [] }];
        }
      });
    });

    const unsubToolCall = window.pluralAPI.onToolCall(({ id, name, arguments: args }) => {
      setMessages(prev => {
        const updated = [...prev];
        const lastThinkingIdx = updated.map(m => m.type).lastIndexOf('thinking');
        if (lastThinkingIdx !== -1) {
          const thinkingMsg = updated[lastThinkingIdx];
          thinkingMsg.toolCalls = [...(thinkingMsg.toolCalls || []), { id, name, arguments: args, status: 'running' }];
        }
        return updated;
      });
    });

    const unsubToolResult = window.pluralAPI.onToolResult(({ id, name, result, error }) => {
      setMessages(prev => {
        const updated = [...prev];
        const lastThinkingIdx = updated.map(m => m.type).lastIndexOf('thinking');
        if (lastThinkingIdx !== -1) {
          const thinkingMsg = updated[lastThinkingIdx];
          thinkingMsg.toolCalls = (thinkingMsg.toolCalls || []).map(tc => {
            if (tc.id === id) {
              return { ...tc, status: error ? 'error' : 'success', result, error };
            }
            return tc;
          });
        }
        return updated;
      });
    });

    const unsubStdout = window.pluralAPI.onStdout((data) => {
      setMessages(prev => [...prev, { type: 'stdout', text: data }]);
    });

    const unsubStderr = window.pluralAPI.onStderr((data) => {
      setMessages(prev => [...prev, { type: 'stderr', text: data }]);
    });

    const unsubDone = window.pluralAPI.onTaskDone((stats) => {
      setLoading(false);
      setThinkingState(null);
      setMessages(prev => [...prev, { type: 'done', stats }]);
      refreshGit();
    });

    const unsubApproval = window.pluralAPI.onApprovalRequest(({ type, details }) => {
      setApprovalRequest({ type, details });
    });

    const unsubError = window.pluralAPI.onAgentError((errMessage) => {
      setLoading(false);
      setThinkingState(null);
      setMessages(prev => [...prev, { type: 'system', text: errMessage, level: 'error' }]);
    });

    return () => {
      unsubText();
      unsubThinking();
      unsubToolCall();
      unsubToolResult();
      unsubStdout();
      unsubStderr();
      unsubDone();
      unsubApproval();
      unsubError();
    };
  }, []);

  // Git state loading
  const refreshGit = async () => {
    if (window.pluralAPI && activeProject) {
      const branch = await window.pluralAPI.gitBranch(activeProject);
      const status = await window.pluralAPI.gitStatus(activeProject);
      setGitBranchName(branch.replace('*', '').trim());
      setGitStatusText(status || 'Clean');
    }
  };

  useEffect(() => {
    refreshGit();
    
    // Load session history when workspace changes
    async function loadProjectSession() {
      if (window.pluralAPI && activeProject) {
        try {
          const session = await window.pluralAPI.loadSession(activeProject);
          if (session && session.history && session.history.length > 0) {
            const formattedMessages = session.history.map(msg => ({
              type: msg.role === 'user' ? 'user' : 'text',
              text: msg.text,
              timestamp: msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''
            }));
            setMessages(formattedMessages);
          } else {
            setMessages([{ type: 'system', text: `Loaded Workspace: ${activeProject}`, level: 'info' }]);
          }
        } catch (err) {
          console.error("Failed to load session:", err);
          setMessages([{ type: 'system', text: `Loaded Workspace: ${activeProject}`, level: 'info' }]);
        }
      } else {
        setMessages([]);
      }
    }
    loadProjectSession();
  }, [activeProject]);

  // Scroll to bottom helper
  useEffect(() => {
    if (!userScrolledUp) {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, userScrolledUp]);

  const handleChatScroll = useCallback(() => {
    const el = chatContainerRef.current;
    if (!el) return;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setUserScrolledUp(distFromBottom > 100);
  }, []);

  const jumpToLatest = () => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    setUserScrolledUp(false);
  };

  const handleSelectDirectory = async () => {
    if (!window.pluralAPI) return;
    const dir = await window.pluralAPI.selectDirectory();
    if (dir) {
      setActiveProject(dir);
      setMessages([{ type: 'system', text: `Loaded Workspace: ${dir}`, level: 'info' }]);
    }
  };

  const handleSend = async () => {
    if (!input.trim() || !activeProject || loading) return;
    const promptText = input.trim();
    setInput('');
    setLoading(true);
    setUserScrolledUp(false);
    
    setMessages(prev => [...prev, { type: 'user', text: promptText, timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }]);

    try {
      if (window.pluralAPI) {
        await window.pluralAPI.addSessionMessage(activeProject, 'user', promptText);
      }

      const coreHistory = messages
        .filter(m => m.type === 'user' || m.type === 'text')
        .map(m => ({
          role: m.type === 'user' ? 'user' : 'assistant',
          text: m.text
        }));

      if (window.pluralAPI) {
        const result = await window.pluralAPI.startTask(activeProject, promptText, coreHistory);
        if (result && result.success && result.response) {
          await window.pluralAPI.addSessionMessage(activeProject, 'assistant', result.response);
        }
      }
    } catch (e) {
      console.error("handleSend error:", e);
      setLoading(false);
    }
  };

  const handleCancel = async () => {
    if (window.pluralAPI) {
      await window.pluralAPI.cancelTask();
    }
  };

  const handleApproval = (approved) => {
    if (window.pluralAPI) {
      window.pluralAPI.sendApproval(approved);
      setApprovalRequest(null);
    }
  };

  const handleProviderChange = async (providerId) => {
    // Instantly load the fallback list for that provider so the selects show correct models
    const fallbackList = providerId === 'openrouter' ? OPENROUTER_MODELS : NVIDIA_MODELS;
    setModelsList(fallbackList);

    // Also select default models for that provider to satisfy "minimum 4 models, one for each agent"
    if (providerId === 'openrouter') {
      setConfig(prev => ({
        ...prev,
        provider: 'openrouter',
        agent_models: {
          planner: 'anthropic/claude-opus-4-8',
          coder: 'anthropic/claude-sonnet-4',
          reviewer: 'google/gemini-3.1-pro',
          integrator: 'openai/gpt-5.5'
        }
      }));
    } else {
      setConfig(prev => ({
        ...prev,
        provider: 'nvidia',
        agent_models: {
          planner: 'nvidia/llama-3.3-nemotron-super-49b-v1.5',
          coder: 'deepseek-ai/deepseek-v4-flash',
          reviewer: 'nvidia/llama-3.1-nemotron-ultra-253b-v1',
          integrator: 'z-ai/glm-5.2'
        }
      }));
    }

    // Try to fetch dynamic list if key is available
    const activeKey = providerId === 'openrouter' ? keys.openrouter : keys.nvidia;
    if (activeKey && window.pluralAPI) {
      try {
        const list = await window.pluralAPI.fetchModels(providerId, activeKey);
        if (list && list.length > 0) {
          setModelsList(list);
        }
      } catch (e) {
        console.error(e);
      }
    }
  };

  const handleSaveSettings = async () => {
    if (window.pluralAPI) {
      await window.pluralAPI.setApiKey('nvidia', keys.nvidia);
      await window.pluralAPI.setApiKey('openrouter', keys.openrouter);
      await window.pluralAPI.setApiKey('tavily', keys.tavily);
      await window.pluralAPI.saveConfig(config);
      setSettingsOpen(false);

      // Reload models
      const activeKey = config.provider === 'openrouter' ? keys.openrouter : keys.nvidia;
      const list = await window.pluralAPI.fetchModels(config.provider, activeKey);
      if (list && list.length > 0) {
        setModelsList(list);
      } else {
        setModelsList(config.provider === 'openrouter' ? OPENROUTER_MODELS : NVIDIA_MODELS);
      }
    }
  };

  const handleAgentModelChange = async (agentRole, modelId) => {
    try {
      const updatedConfig = {
        ...config,
        agent_models: {
          ...(config?.agent_models || {}),
          [agentRole]: modelId
        }
      };
      setConfig(updatedConfig);
      if (window.pluralAPI) {
        await window.pluralAPI.saveConfig(updatedConfig);
      }
    } catch (err) {
      console.error("handleAgentModelChange error:", err);
      setMessages(prev => [...prev, { type: 'system', text: `Failed to save model change: ${err.message}`, level: 'error' }]);
    }
  };

  const handleCommit = async () => {
    if (!commitMessage.trim() || !activeProject) return;
    try {
      await window.pluralAPI.gitCommit(activeProject, commitMessage);
      setCommitMessage('');
      refreshGit();
      setMessages(prev => [...prev, { type: 'system', text: `Created commit successfully.`, level: 'info' }]);
    } catch (e) {
      setMessages(prev => [...prev, { type: 'system', text: `Commit failed: ${e.message}`, level: 'error' }]);
    }
  };

  // Helper format model label
  const getShortModelLabel = (modelId) => {
    if (!modelId) return 'Select Model';
    const parts = modelId.split('/');
    return parts[parts.length - 1];
  };

  const currentModelId = config.agent_models?.coder || config.model || 'deepseek-ai/deepseek-v4-flash';
  const currentModelLabel = getShortModelLabel(currentModelId);
  const projectName = activeProject ? activeProject.split(/[\\/]/).pop() : '';

  return (
    <div className="app-shell">
      {/* Titlebar */}
      <div className="titlebar">
        <div className="titlebar-brand">
          <img src="logo.png" className="titlebar-logo" alt="Plural Logo" />
          <div className="titlebar-text">PLURAL <span>CODE</span></div>
        </div>
        <div className="titlebar-path">{activeProject || 'No Workspace Loaded'}</div>
        <div className="titlebar-controls">
          <button className="titlebar-btn" onClick={handleMinimize}><Minus size={14} /></button>
          <button className="titlebar-btn" onClick={handleMaximize}><Square size={11} /></button>
          <button className="titlebar-btn close" onClick={handleClose}><X size={14} /></button>
        </div>
      </div>

      <div className="app-container">
        {/* Left Sidebar */}
        <div className="sidebar">
          <div className="sidebar-header">
            <button className="new-task-btn" onClick={async () => {
              setMessages([]);
              if (window.pluralAPI && activeProject) {
                await window.pluralAPI.clearSessionHistory(activeProject);
              }
            }}>
              <Plus size={14} /> New Task
            </button>
            <button className="search-btn">
              <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Search size={13} /> Search files...
              </span>
              <span className="search-btn-shortcut">Ctrl+K</span>
            </button>
          </div>
          
          <div className="sidebar-divider" />

          <div className="sidebar-project">
            <button className="project-chip" onClick={handleSelectDirectory}>
              <FolderOpen size={14} className="project-chip-icon" />
              <span className="project-chip-name">{projectName || 'Open Project'}</span>
              <ChevronDown size={12} style={{ color: 'var(--text-muted)' }} />
            </button>
          </div>

          <div className="sidebar-sessions" style={{ flex: '1 1 auto', minHeight: '0' }}>
            <div className="sidebar-divider" style={{ margin: '0 0 12px 0' }} />
            <div style={{ fontSize: '11px', fontWeight: '600', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '8px' }}>Conversations</div>
            <div className="session-item active">
              <span className="session-title">{projectName ? `Workspace: ${projectName}` : 'Empty Chat'}</span>
              <span className="session-time">Active</span>
            </div>
          </div>

          <div className="sidebar-divider" style={{ margin: '8px 16px' }} />

          <div className="sidebar-agents" style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '8px', flexShrink: 0 }}>
            <div style={{ fontSize: '10.5px', fontWeight: '600', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '4px' }}>Agent Models</div>
            {[
              { id: 'planner', name: 'Chief Planner', color: '#7C3AED' },
              { id: 'coder', name: 'Builder / Coder', color: '#06B6D4' },
              { id: 'reviewer', name: 'Reviewer / QA', color: '#F59E0B' },
              { id: 'integrator', name: 'Final Integrator', color: '#EC4899' }
            ].map(agent => {
              const currentModelId = config.agent_models?.[agent.id] || '';
              return (
                <div key={agent.id} className="agent-row-select">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11.5px', fontWeight: '500', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: agent.color, flexShrink: 0 }} />
                    {agent.name.split(' ')[0]}
                  </div>
                  <select
                    className="agent-select-element"
                    value={currentModelId}
                    onChange={e => handleAgentModelChange(agent.id, e.target.value)}
                  >
                    {modelsList.map(m => (
                      <option key={m.id} value={m.id}>
                        {getShortModelLabel(m.id)}
                      </option>
                    ))}
                  </select>
                </div>
              );
            })}
          </div>

          <div className="sidebar-footer">
            <div className="user-profile">
              <div className="user-avatar">P</div>
              <div className="user-name">Developer</div>
            </div>
            <button className="settings-btn" onClick={() => setSettingsOpen(true)}>
              <Settings size={15} />
            </button>
          </div>
        </div>

        {/* Center Panel (Chat) */}
        <div className="chat-panel">
          <div className="chat-header">
            <div className="chat-header-title">{projectName ? `Coding inside ${projectName}` : 'Interactive Assistant'}</div>
            <button className="new-task-btn" style={{ width: 'auto', padding: '6px 12px' }} onClick={() => setShowGitPanel(!showGitPanel)}>
              <GitCompare size={14} /> Git Panel
            </button>
          </div>

          <div className="chat-messages" ref={chatContainerRef} onScroll={handleChatScroll}>
            {messages.length === 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '16px', color: 'var(--text-muted)' }}>
                <img src="logo.png" style={{ width: '110px', height: '145px', opacity: 0.9, filter: 'drop-shadow(0 0 20px rgba(255, 255, 255, 0.12))', objectFit: 'contain' }} alt="Logo" />
                <div style={{ fontSize: '13px', textAlign: 'center' }}>
                  Plural Code Engine is Rebuilt & Online.<br />
                  Select a workspace to start editing files.
                </div>
              </div>
            )}

            {messages.map((m, idx) => {
              if (m.type === 'user') {
                return (
                  <div key={idx} className="msg-user">
                    <div className="msg-user-bubble">{m.text}</div>
                    <div className="msg-timestamp">{m.timestamp}</div>
                  </div>
                );
              }

              if (m.type === 'thinking') {
                const elapsedStr = activeThinkingTimer > 0 && loading && idx === messages.length - 1
                  ? `${activeThinkingTimer}s`
                  : `${m.toolCalls?.length || 0} calls`;
                
                return (
                  <div key={idx} className="agent-thinking-card">
                     <div className="agent-thinking-header">
                       <div className="agent-thinking-left">
                         {loading && idx === messages.length - 1 && <div className="agent-thinking-spinner" />}
                         <span>
                           {m.agent === 'Planner' && 'Chief Planner (Thinking)'}
                           {m.agent === 'Coder' && `Builder / Coder (Executing Tools -- ${elapsedStr})`}
                           {m.agent === 'Reviewer' && 'Reviewer / QA (Analyzing changes)'}
                           {m.agent === 'Integrator' && 'Final Integrator (Merging & Synthesizing)'}
                         </span>
                       </div>
                       <div className="agent-thinking-left" style={{ gap: '8px' }}>
                         <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Pass {m.iteration}</span>
                       </div>
                     </div>
                    {m.toolCalls && m.toolCalls.length > 0 && (
                      <div className="agent-thinking-body">
                        {m.toolCalls.map((tc, tcIdx) => (
                          <ToolCallItem key={tc.id || tcIdx} tc={tc} />
                        ))}
                      </div>
                    )}
                  </div>
                );
              }

              if (m.type === 'text') {
                return (
                  <div key={idx} className="agent-text-block">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        code({ node, inline, className, children, ...props }) {
                          const match = /language-(\w+)/.exec(className || '');
                          const codeString = String(children).replace(/\n$/, '');
                          if (!inline && match) {
                            return (
                              <div className="code-block-wrapper">
                                <div className="code-block-header">
                                  <span className="code-lang">{match[1]}</span>
                                  <button
                                    className="copy-btn"
                                    onClick={() => {
                                      navigator.clipboard.writeText(codeString);
                                    }}
                                  >
                                    Copy
                                  </button>
                                </div>
                                <SyntaxHighlighter
                                  style={oneDark}
                                  language={match[1]}
                                  PreTag="div"
                                  customStyle={{ margin: 0, borderRadius: '0 0 8px 8px', fontSize: '13px' }}
                                  {...props}
                                >
                                  {codeString}
                                </SyntaxHighlighter>
                              </div>
                            );
                          }
                          return (
                            <code className={className} {...props}>
                              {children}
                            </code>
                          );
                        }
                      }}
                    >
                      {m.text}
                    </ReactMarkdown>
                    {loading && idx === messages.length - 1 && (
                      <span className="streaming-cursor">▊</span>
                    )}
                  </div>
                );
              }

              if (m.type === 'system') {
                const isError = m.level === 'error';
                return (
                  <div key={idx} className={`msg-system ${isError ? 'error' : ''}`}>
                    <div className="msg-system-icon">
                      {isError ? <AlertCircle size={16} style={{ color: 'var(--accent-red)' }} />
                        : <Info size={16} style={{ color: 'var(--accent)' }} />}
                    </div>
                    <div className="msg-system-text">{m.text}</div>
                  </div>
                );
              }

              if (m.type === 'stdout') {
                return <pre key={idx} className="msg-stdout">{m.text}</pre>;
              }

              if (m.type === 'stderr') {
                return <pre key={idx} className="msg-stderr">{m.text}</pre>;
              }

              if (m.type === 'done') {
                const mins = Math.floor(m.stats.duration / 60000);
                const secs = Math.ceil((m.stats.duration % 60000) / 1000);
                const durationStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;

                return (
                  <div key={idx} className="stats-card">
                    <div className="stats-card-header">Task Completed</div>
                    <div className="stats-grid">
                      <div className="stats-item">
                        <span className="stats-label">Time Taken</span>
                        <span className="stats-val">{durationStr}</span>
                      </div>
                      <div className="stats-item">
                        <span className="stats-label">Tools Used</span>
                        <span className="stats-val">{m.stats.toolCalls || 0}</span>
                      </div>
                      <div className="stats-item">
                        <span className="stats-label">Files Edited</span>
                        <span className="stats-val">{(m.stats.filesWritten || []).length}</span>
                      </div>
                    </div>
                  </div>
                );
              }

              return null;
            })}

            {userScrolledUp && messages.length > 3 && (
              <button className="jump-btn" onClick={jumpToLatest}>
                Jump to latest
              </button>
            )}

            <div ref={chatEndRef} />
          </div>

          {/* Input Bar */}
          <div className="chat-input-area">
            <div className="chat-input-wrapper">
              <button className="attach-btn" disabled={!activeProject}>
                <Plus size={16} />
              </button>
              
              <textarea
                className="chat-input"
                placeholder="Ask Plural Code to build, fix, or write code..."
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                rows={1}
                style={{ resize: 'none', overflow: 'hidden', minHeight: '24px', maxHeight: '150px' }}
                onInput={e => {
                  e.target.style.height = 'auto';
                  e.target.style.height = Math.min(e.target.scrollHeight, 150) + 'px';
                }}
                disabled={!activeProject || loading}
              />

              <div className="chat-input-actions">
                {loading && (
                  <button className="new-task-btn" style={{ padding: '4px 10px', background: 'var(--accent-red)', color: '#fff', border: 'none', borderRadius: '14px', fontSize: '11px' }} onClick={handleCancel}>
                    Cancel
                  </button>
                )}

                <div className="full-access-toggle active">
                  <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: 'currentColor' }} />
                  Full Access
                </div>

                <button className="send-btn" onClick={handleSend} disabled={!activeProject || loading || !input.trim()}>
                  <Send size={13} />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Right Git Panel */}
        {showGitPanel && (
          <div className="git-panel">
            <div className="git-panel-header">
              <span className="git-panel-title">Git Operations</span>
              <button className="settings-btn" onClick={refreshGit}><RefreshCw size={12} /></button>
            </div>
            <div className="git-panel-body">
              <div>
                <div className="git-section-title">Current Branch</div>
                <div className="branch-select-chip">
                  <GitBranch size={13} style={{ color: 'var(--accent)' }} />
                  {gitBranchName}
                </div>
              </div>

              <div>
                <div className="git-section-title">Changes Status</div>
                {gitStatusText === 'Clean' ? (
                  <div className="git-changes-empty">Clean working directory.</div>
                ) : (
                  <pre style={{ background: 'rgba(0,0,0,0.2)', padding: '10px', borderRadius: '4px', fontFamily: 'var(--font-mono)', fontSize: '11px', whiteSpace: 'pre-wrap', color: 'var(--text-secondary)' }}>
                    {gitStatusText}
                  </pre>
                )}
              </div>

              <div>
                <div className="git-section-title">Stage & Commit</div>
                <div className="git-commit-form">
                  <input
                    type="text"
                    className="git-commit-input"
                    placeholder="Commit message..."
                    value={commitMessage}
                    onChange={e => setCommitMessage(e.target.value)}
                    disabled={!activeProject}
                  />
                  <button className="git-commit-btn" onClick={handleCommit} disabled={!activeProject || !commitMessage.trim()}>
                    Commit changes
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Settings Modal */}
      {settingsOpen && (
        <div className="modal-overlay" onClick={() => setSettingsOpen(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">Settings</div>
              <button className="modal-close-btn" onClick={() => setSettingsOpen(false)}><X size={15} /></button>
            </div>
            
            <div className="modal-tabs">
              <button className={`modal-tab ${settingsTab === 'keys' ? 'active' : ''}`} onClick={() => setSettingsTab('keys')}>API Keys</button>
              <button className={`modal-tab ${settingsTab === 'models' ? 'active' : ''}`} onClick={() => setSettingsTab('models')}>Models</button>
              <button className={`modal-tab ${settingsTab === 'permissions' ? 'active' : ''}`} onClick={() => setSettingsTab('permissions')}>Permissions</button>
            </div>

            <div className="modal-body">
              {settingsTab === 'keys' && (
                <>
                  {[
                    { key: 'nvidia', label: 'NVIDIA NIM API Key' },
                    { key: 'openrouter', label: 'OpenRouter API Key' },
                    { key: 'tavily', label: 'Tavily Search API Key' }
                  ].map(item => (
                    <div className="form-group" key={item.key}>
                      <div className="form-label">
                        {item.label}
                        <span className={`form-status ${keys[item.key] ? 'connected' : 'missing'}`}>
                          {keys[item.key] ? 'Configured' : 'Missing'}
                        </span>
                      </div>
                      <div className="form-input-wrap">
                        <input
                          type={showPassword[item.key] ? 'text' : 'password'}
                          className="form-input"
                          value={keys[item.key]}
                          onChange={e => setKeys(prev => ({ ...prev, [item.key]: e.target.value }))}
                          placeholder={`Enter key...`}
                        />
                        <button className="form-eye" onClick={() => setShowPassword(prev => ({ ...prev, [item.key]: !prev[item.key] }))}>
                          {showPassword[item.key] ? <EyeOff size={13} /> : <Eye size={13} />}
                        </button>
                      </div>
                    </div>
                  ))}
                </>
              )}

              {settingsTab === 'models' && (
                <>
                  <div className="form-group">
                    <div className="form-label">Active Provider</div>
                    <select
                      className="form-select"
                      value={config.provider}
                      onChange={e => handleProviderChange(e.target.value)}
                    >
                      {PROVIDERS.map(p => (
                        <option key={p.id} value={p.id}>{p.label}</option>
                      ))}
                    </select>
                  </div>

                  {[
                    { role: 'planner', label: 'Chief Planner' },
                    { role: 'coder', label: 'Builder / Coder' },
                    { role: 'reviewer', label: 'Reviewer / QA' },
                    { role: 'integrator', label: 'Final Integrator' }
                  ].map(agent => (
                    <div className="form-group" key={agent.role}>
                      <div className="form-label">{agent.label} Model</div>
                      <select
                        className="form-select"
                        value={config.agent_models?.[agent.role] || ''}
                        onChange={e => setConfig(prev => ({
                          ...prev,
                          agent_models: {
                            ...prev.agent_models,
                            [agent.role]: e.target.value
                          }
                        }))}
                      >
                        {modelsList.map(m => (
                          <option key={m.id} value={m.id}>{m.label || m.id}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </>
              )}

              {settingsTab === 'permissions' && (
                <>
                  <div className="form-group">
                    <div className="form-label">Auto-approve safe commands</div>
                    <select
                      className="form-select"
                      value={config.permissions?.auto_approve_safe_commands ? 'true' : 'false'}
                      onChange={e => setConfig(prev => ({
                        ...prev,
                        permissions: {
                          ...prev.permissions,
                          auto_approve_safe_commands: e.target.value === 'true'
                        }
                      }))}
                    >
                      <option value="true">Enabled</option>
                      <option value="false">Disabled</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <div className="form-label">Auto-approve file writes</div>
                    <select
                      className="form-select"
                      value={config.permissions?.auto_approve_file_writes ? 'true' : 'false'}
                      onChange={e => setConfig(prev => ({
                        ...prev,
                        permissions: {
                          ...prev.permissions,
                          auto_approve_file_writes: e.target.value === 'true'
                        }
                      }))}
                    >
                      <option value="true">Enabled</option>
                      <option value="false">Disabled</option>
                    </select>
                  </div>
                </>
              )}
            </div>

            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setSettingsOpen(false)}>Cancel</button>
              <button className="btn btn-accent" onClick={handleSaveSettings}>Save Settings</button>
            </div>
          </div>
        </div>
      )}

      {/* Permission Approval Modal */}
      {approvalRequest && (
        <div className="modal-overlay">
          <div className="modal" style={{ width: '460px' }}>
            <div style={{ padding: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: '600', color: 'var(--accent-yellow)', fontSize: '13.5px', marginBottom: '14px' }}>
                <AlertTriangle size={16} />
                Permission Required
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', background: 'var(--bg-app)', border: '1px solid var(--border)', borderRadius: '6px', padding: '12px', color: 'var(--text-primary)', whiteSpace: 'pre-wrap', lineHeight: '1.5', marginBottom: '18px' }}>
                {approvalRequest.type === 'execute_command' && `$ ${approvalRequest.details.command}`}
                {approvalRequest.type === 'write_file' && `Write content to: ${approvalRequest.details.path}`}
                {approvalRequest.type === 'edit_file' && `Edit matches inside: ${approvalRequest.details.path}`}
                {approvalRequest.type === 'delete_file' && `Delete file: ${approvalRequest.details.path}`}
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button className="btn btn-secondary" onClick={() => handleApproval(false)}>Deny</button>
                <button className="btn btn-accent" onClick={() => handleApproval(true)}>Allow</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
