import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { 
  Agent, 
  getConfig, 
  saveConfig, 
  getApiKey, 
  setApiKey, 
  deleteApiKey,
  fetchAvailableModels,
  git,
  search,
  loadSession,
  saveSession,
  addSessionMessage,
  clearSessionHistory,
  listAllSessions
} from 'plural-code-core';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow = null;
let activeAgent = null;
let activeApprovalResolve = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    backgroundColor: '#1a1a1a',
    frame: false, // frameless window for ZCODE titlebar style
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.webContents.session.clearCache();
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }

  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, 'dist/index.html'));
  }
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Window controls
ipcMain.on('window-minimize', () => {
  mainWindow?.minimize();
});
ipcMain.on('window-maximize', () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow?.maximize();
  }
});
ipcMain.on('window-close', () => {
  mainWindow?.close();
});

// Project selection
ipcMain.handle('select-project-directory', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });
  return result.filePaths[0] || null;
});

// Recursive file listing for ZCODE file tree explorer
ipcMain.handle('list-project-files', async (event, dirPath) => {
  if (!dirPath || !fs.existsSync(dirPath)) return null;
  
  function getDirectoryTree(currentPath) {
    const name = path.basename(currentPath);
    const result = { name, path: currentPath, isDirectory: true, children: [] };
    try {
      const list = fs.readdirSync(currentPath);
      for (const item of list) {
        if (item === 'node_modules' || item === '.git' || item === 'dist' || item === 'build' || item === '.next' || item === 'out') continue;
        const fullPath = path.join(currentPath, item);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          result.children.push(getDirectoryTree(fullPath));
        } else {
          result.children.push({ name: item, path: fullPath, isDirectory: false });
        }
      }
    } catch (e) {
      // ignore unreadable
    }
    result.children.sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      return a.name.localeCompare(b.name);
    });
    return result;
  }

  try {
    return getDirectoryTree(dirPath);
  } catch (err) {
    console.error('Error listing directory tree:', err);
    return null;
  }
});

// Config storage
ipcMain.handle('get-app-config', async () => {
  return getConfig();
});

ipcMain.handle('save-app-config', async (event, config) => {
  saveConfig(config);
  return { success: true };
});

ipcMain.handle('get-api-key', async (event, service) => {
  return await getApiKey(service);
});

ipcMain.handle('set-api-key', async (event, { service, value }) => {
  await setApiKey(service, value);
  return { success: true };
});

ipcMain.handle('delete-api-key', async (event, service) => {
  await deleteApiKey(service);
  return { success: true };
});

// Dynamic models API
ipcMain.handle('fetch-models', async (event, { provider, apiKey }) => {
  return await fetchAvailableModels(provider, apiKey);
});

// Git operations
ipcMain.handle('get-git-status', async (event, projectPath) => {
  return await git.git_status(projectPath);
});

ipcMain.handle('get-git-diff', async (event, projectPath) => {
  return await git.git_diff(projectPath);
});

ipcMain.handle('run-git-commit', async (event, { projectPath, message }) => {
  return await git.git_commit(message, projectPath);
});

ipcMain.handle('get-git-log', async (event, { projectPath, count }) => {
  return await git.git_log(projectPath, count);
});

ipcMain.handle('get-git-branch', async (event, projectPath) => {
  return await git.git_branch(projectPath);
});

// Run task agentic loop
ipcMain.handle('start-agent-run', async (event, { projectPath, request, history }) => {
  activeAgent = new Agent(projectPath, {
    config: getConfig(),
    approve: async ({ type, details }) => {
      mainWindow.webContents.send('request-user-approval', { type, details });
      return new Promise((resolve) => {
        activeApprovalResolve = resolve;
      });
    },
    onText: (text) => {
      mainWindow.webContents.send('agent-text', text);
    },
    onThinking: ({ iteration, toolCallCount }) => {
      mainWindow.webContents.send('agent-thinking', { iteration, toolCallCount });
    },
    onToolCall: ({ id, name, arguments: args }) => {
      mainWindow.webContents.send('agent-tool-call', { id, name, arguments: args });
    },
    onToolResult: ({ id, name, result, error }) => {
      mainWindow.webContents.send('agent-tool-result', { id, name, result, error });
    },
    onStdout: (data) => {
      mainWindow.webContents.send('agent-stdout', data);
    },
    onStderr: (data) => {
      mainWindow.webContents.send('agent-stderr', data);
    },
    onDone: (stats) => {
      mainWindow.webContents.send('agent-task-done', stats);
    },
    onError: (errMessage) => {
      mainWindow.webContents.send('agent-error', errMessage);
    }
  });

  try {
    const response = await activeAgent.run(request, history);
    return { success: true, response };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Session memory & chat history handlers
ipcMain.handle('load-session', async (event, projectPath) => {
  return loadSession(projectPath);
});

ipcMain.handle('save-session', async (event, { projectPath, sessionData }) => {
  saveSession(projectPath, sessionData);
  return { success: true };
});

ipcMain.handle('add-session-message', async (event, { projectPath, role, text }) => {
  addSessionMessage(projectPath, role, text);
  return { success: true };
});

ipcMain.handle('clear-session-history', async (event, projectPath) => {
  clearSessionHistory(projectPath);
  return { success: true };
});

ipcMain.handle('list-all-sessions', async () => {
  return listAllSessions();
});

// Cancel run
ipcMain.handle('cancel-agent-run', async () => {
  if (activeAgent) {
    activeAgent.cancel();
    return { success: true };
  }
  return { success: false };
});

// Resolve approvals
ipcMain.on('send-approval-response', (event, approved) => {
  if (activeApprovalResolve) {
    activeApprovalResolve(approved);
    activeApprovalResolve = null;
  }
});
