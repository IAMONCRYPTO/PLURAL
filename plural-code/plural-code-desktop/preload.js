const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pluralAPI', {
  // Titlebar controls
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),

  // Project select
  selectDirectory: () => ipcRenderer.invoke('select-project-directory'),
  listProjectFiles: (dirPath) => ipcRenderer.invoke('list-project-files', dirPath),

  // Config management
  getConfig: () => ipcRenderer.invoke('get-app-config'),
  saveConfig: (config) => ipcRenderer.invoke('save-app-config', config),
  getApiKey: (service) => ipcRenderer.invoke('get-api-key', service),
  setApiKey: (service, value) => ipcRenderer.invoke('set-api-key', { service, value }),
  deleteApiKey: (service) => ipcRenderer.invoke('delete-api-key', service),

  // Session memory & chat history
  loadSession: (projectPath) => ipcRenderer.invoke('load-session', projectPath),
  saveSession: (projectPath, sessionData) => ipcRenderer.invoke('save-session', { projectPath, sessionData }),
  addSessionMessage: (projectPath, role, text) => ipcRenderer.invoke('add-session-message', { projectPath, role, text }),
  clearSessionHistory: (projectPath) => ipcRenderer.invoke('clear-session-history', projectPath),
  listAllSessions: () => ipcRenderer.invoke('list-all-sessions'),

  // Models API
  fetchModels: (provider, apiKey) => ipcRenderer.invoke('fetch-models', { provider, apiKey }),

  // Git tools
  gitStatus: (projectPath) => ipcRenderer.invoke('get-git-status', projectPath),
  gitDiff: (projectPath) => ipcRenderer.invoke('get-git-diff', projectPath),
  gitCommit: (projectPath, message) => ipcRenderer.invoke('run-git-commit', { projectPath, message }),
  gitLog: (projectPath, count) => ipcRenderer.invoke('get-git-log', { projectPath, count }),
  gitBranch: (projectPath) => ipcRenderer.invoke('get-git-branch', projectPath),

  // Task Runner
  startTask: (projectPath, request, history) => ipcRenderer.invoke('start-agent-run', { projectPath, request, history }),
  cancelTask: () => ipcRenderer.invoke('cancel-agent-run'),
  sendApproval: (approved) => ipcRenderer.send('send-approval-response', approved),

  // Subscriptions
  onAgentText: (cb) => {
    const fn = (event, text) => cb(text);
    ipcRenderer.on('agent-text', fn);
    return () => ipcRenderer.removeListener('agent-text', fn);
  },
  onThinking: (cb) => {
    const fn = (event, stats) => cb(stats);
    ipcRenderer.on('agent-thinking', fn);
    return () => ipcRenderer.removeListener('agent-thinking', fn);
  },
  onToolCall: (cb) => {
    const fn = (event, call) => cb(call);
    ipcRenderer.on('agent-tool-call', fn);
    return () => ipcRenderer.removeListener('agent-tool-call', fn);
  },
  onToolResult: (cb) => {
    const fn = (event, res) => cb(res);
    ipcRenderer.on('agent-tool-result', fn);
    return () => ipcRenderer.removeListener('agent-tool-result', fn);
  },
  onStdout: (cb) => {
    const fn = (event, data) => cb(data);
    ipcRenderer.on('agent-stdout', fn);
    return () => ipcRenderer.removeListener('agent-stdout', fn);
  },
  onStderr: (cb) => {
    const fn = (event, data) => cb(data);
    ipcRenderer.on('agent-stderr', fn);
    return () => ipcRenderer.removeListener('agent-stderr', fn);
  },
  onTaskDone: (cb) => {
    const fn = (event, stats) => cb(stats);
    ipcRenderer.on('agent-task-done', fn);
    return () => ipcRenderer.removeListener('agent-task-done', fn);
  },
  onApprovalRequest: (cb) => {
    const fn = (event, req) => cb(req);
    ipcRenderer.on('request-user-approval', fn);
    return () => ipcRenderer.removeListener('request-user-approval', fn);
  },
  onAgentError: (cb) => {
    const fn = (event, errMessage) => cb(errMessage);
    ipcRenderer.on('agent-error', fn);
    return () => ipcRenderer.removeListener('agent-error', fn);
  }
});
