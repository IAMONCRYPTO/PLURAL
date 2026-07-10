import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';

const SESSIONS_DIR = path.join(os.homedir(), '.pluralcode', 'sessions');

// Maximum messages per session history
const MAX_HISTORY_SIZE = 100;

export function initSessionsDir() {
  if (!fs.existsSync(SESSIONS_DIR)) {
    fs.mkdirSync(SESSIONS_DIR, { recursive: true });
  }
}

export function getProjectHash(projectPath) {
  const normalized = path.resolve(projectPath).toLowerCase().replace(/\\/g, '/');
  return crypto.createHash('sha256').update(normalized).digest('hex').substring(0, 16);
}

export function getSessionPath(projectPath) {
  initSessionsDir();
  const hash = getProjectHash(projectPath);
  return path.join(SESSIONS_DIR, `${hash}.json`);
}

export function loadSession(projectPath) {
  const sessionFile = getSessionPath(projectPath);
  let session;

  if (!fs.existsSync(sessionFile)) {
    session = {
      projectPath: path.resolve(projectPath),
      projectName: path.basename(path.resolve(projectPath)),
      created: new Date().toISOString(),
      lastAccessed: new Date().toISOString(),
      history: [],
      filesSummary: {}
    };
  } else {
    try {
      session = JSON.parse(fs.readFileSync(sessionFile, 'utf8'));
    } catch (e) {
      session = {
        projectPath: path.resolve(projectPath),
        projectName: path.basename(path.resolve(projectPath)),
        created: new Date().toISOString(),
        lastAccessed: new Date().toISOString(),
        history: [],
        filesSummary: {}
      };
    }
  }

  // Update lastAccessed timestamp
  session.lastAccessed = new Date().toISOString();

  // Ensure projectName is set
  if (!session.projectName) {
    session.projectName = path.basename(path.resolve(projectPath));
  }

  saveSession(projectPath, session);
  return session;
}

export function saveSession(projectPath, sessionData) {
  const sessionFile = getSessionPath(projectPath);
  fs.writeFileSync(sessionFile, JSON.stringify(sessionData, null, 2), 'utf8');
}

export function addSessionMessage(projectPath, role, text) {
  const session = loadSession(projectPath);

  // FIFO eviction: if at capacity, remove the oldest message
  while (session.history.length >= MAX_HISTORY_SIZE) {
    session.history.shift();
  }

  session.history.push({
    timestamp: new Date().toISOString(),
    role,
    text
  });
  session.lastAccessed = new Date().toISOString();
  saveSession(projectPath, session);
}

export function getSessionHistory(projectPath) {
  const session = loadSession(projectPath);
  return session.history;
}

export function clearSessionHistory(projectPath) {
  const session = loadSession(projectPath);
  session.history = [];
  saveSession(projectPath, session);
}

/**
 * List all sessions from the sessions directory.
 * Returns an array of session summaries for the sidebar.
 */
export function listAllSessions() {
  initSessionsDir();

  try {
    const files = fs.readdirSync(SESSIONS_DIR).filter(f => f.endsWith('.json'));
    const sessions = [];

    for (const file of files) {
      try {
        const fullPath = path.join(SESSIONS_DIR, file);
        const data = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
        sessions.push({
          hash: file.replace('.json', ''),
          projectPath: data.projectPath || 'Unknown',
          projectName: data.projectName || path.basename(data.projectPath || 'Unknown'),
          created: data.created || null,
          lastAccessed: data.lastAccessed || null,
          messageCount: (data.history || []).length
        });
      } catch (e) {
        // Skip corrupt session files
        continue;
      }
    }

    // Sort by lastAccessed descending (most recent first)
    sessions.sort((a, b) => {
      const da = a.lastAccessed ? new Date(a.lastAccessed) : new Date(0);
      const db = b.lastAccessed ? new Date(b.lastAccessed) : new Date(0);
      return db - da;
    });

    return sessions;
  } catch (e) {
    console.error('[Session] Failed to list sessions:', e);
    return [];
  }
}
