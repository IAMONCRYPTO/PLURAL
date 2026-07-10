import fs from 'fs';
import path from 'path';

// Maximum file size (bytes) to read fully — 1 MB
const MAX_READ_SIZE = 1 * 1024 * 1024;
// How much to show when truncating
const TRUNCATED_PREVIEW = 50 * 1024; // 50 KB

/**
 * Check if a buffer contains null bytes (binary file indicator).
 * Scans the first 8KB of content.
 */
function isBinaryContent(buffer) {
  const checkLength = Math.min(buffer.length, 8192);
  for (let i = 0; i < checkLength; i++) {
    if (buffer[i] === 0) return true;
  }
  return false;
}

export async function read_file(filePath) {
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`File does not exist: ${filePath}`);
  }

  // Check file size before reading
  const stat = fs.statSync(resolved);

  // Binary detection: read raw buffer first
  const rawBuffer = fs.readFileSync(resolved);
  if (isBinaryContent(rawBuffer)) {
    return `[Binary file: ${filePath}, size: ${stat.size} bytes]`;
  }

  const content = rawBuffer.toString('utf8');

  // Truncate large files
  if (stat.size > MAX_READ_SIZE) {
    const sizeMB = (stat.size / (1024 * 1024)).toFixed(1);
    return content.substring(0, TRUNCATED_PREVIEW) +
      `\n\n[FILE TRUNCATED: ${sizeMB}MB total, showing first 50KB]`;
  }

  return content;
}

export async function write_file(filePath, content, runnerContext) {
  const resolved = path.resolve(filePath);
  const dir = path.dirname(resolved);
  
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Auto-backup if file already exists
  if (fs.existsSync(resolved)) {
    try {
      fs.copyFileSync(resolved, resolved + '.bak');
    } catch (e) {
      console.warn(`[FileOps] Could not create backup for ${filePath}: ${e.message}`);
    }
  }

  if (runnerContext && runnerContext.getConfig) {
    const config = runnerContext.getConfig();
    // Prompt permission for any file write if auto_approve_file_writes is false
    if (config.permissions && config.permissions.auto_approve_file_writes === false) {
      const approved = await runnerContext.approve('write_file', {
        path: filePath,
        exists: fs.existsSync(resolved)
      });
      if (!approved) {
        throw new Error('Permission denied: File write aborted by user.');
      }
    }
  }

  fs.writeFileSync(resolved, content, 'utf8');
  return `File written successfully: ${filePath}`;
}

export async function edit_file(filePath, oldStr, newStr, runnerContext) {
  const resolved = path.resolve(filePath);
  const content = await read_file(resolved);
  if (!content.includes(oldStr)) {
    throw new Error(`Target content to replace was not found in: ${filePath}`);
  }

  if (runnerContext && runnerContext.getConfig) {
    const config = runnerContext.getConfig();
    if (config.permissions && config.permissions.auto_approve_file_writes === false) {
      const approved = await runnerContext.approve('edit_file', {
        path: filePath,
        oldStr,
        newStr
      });
      if (!approved) {
        throw new Error('Permission denied: File edit aborted by user.');
      }
    }
  }

  // Auto-backup before editing
  try {
    fs.copyFileSync(resolved, resolved + '.bak');
  } catch (e) {
    console.warn(`[FileOps] Could not create backup for ${filePath}: ${e.message}`);
  }

  // Use .replace() (first occurrence only) instead of .replaceAll()
  // This prevents unintended mass-replacement of identical strings
  const updated = content.replace(oldStr, newStr);
  fs.writeFileSync(resolved, updated, 'utf8');
  return `File edited successfully: ${filePath}`;
}

export async function list_directory(dirPath) {
  const resolved = path.resolve(dirPath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Directory does not exist: ${dirPath}`);
  }
  const files = fs.readdirSync(resolved);
  return files.map(file => {
    const fullPath = path.join(resolved, file);
    const stat = fs.statSync(fullPath);
    return {
      name: file,
      isDirectory: stat.isDirectory(),
      size: stat.size
    };
  });
}

export async function search_files(pattern, dirPath = '.', includeGlob = null) {
  const resolvedDir = path.resolve(dirPath);
  if (!fs.existsSync(resolvedDir)) {
    throw new Error(`Directory does not exist: ${dirPath}`);
  }

  const results = [];
  const regex = new RegExp(pattern, 'i');
  const MAX_RESULTS = 50;

  function walk(currentDir) {
    const files = fs.readdirSync(currentDir);
    for (const file of files) {
      if (file === 'node_modules' || file === '.git' || file === 'dist' || file === 'build') continue;
      const fullPath = path.join(currentDir, file);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        walk(fullPath);
      } else {
        const ext = path.extname(file).toLowerCase();
        const skipExts = ['.png', '.jpg', '.jpeg', '.gif', '.ico', '.pdf', '.zip', '.tar', '.gz', '.mp4', '.mp3', '.exe', '.dll', '.bin', '.bak'];
        if (skipExts.includes(ext)) continue;

        // Skip large files
        if (stat.size > MAX_READ_SIZE) continue;

        try {
          const content = fs.readFileSync(fullPath, 'utf8');
          const lines = content.split('\n');
          for (let i = 0; i < lines.length; i++) {
            if (regex.test(lines[i])) {
              results.push({
                file: path.relative(resolvedDir, fullPath),
                line: i + 1,
                content: lines[i].trim()
              });
              if (results.length >= MAX_RESULTS) return;
            }
          }
        } catch (e) {
          // ignore unreadable files
        }
      }
    }
  }

  walk(resolvedDir);

  // Indicate if results were capped
  if (results.length >= MAX_RESULTS) {
    return { results, truncated: true, note: `Results capped at ${MAX_RESULTS}. Narrow your search pattern for more specific results.` };
  }
  return { results, truncated: false };
}

export async function delete_file(filePath, runnerContext) {
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`File does not exist: ${filePath}`);
  }

  if (runnerContext) {
    const approved = await runnerContext.approve('delete_file', { path: filePath });
    if (!approved) {
      throw new Error('Permission denied: File deletion aborted by user.');
    }
  } else {
    throw new Error('Permission denied: Deletion requires explicit user confirmation context.');
  }

  fs.unlinkSync(resolved);
  return `File deleted successfully: ${filePath}`;
}
