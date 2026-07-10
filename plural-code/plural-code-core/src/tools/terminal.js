import { spawn } from 'child_process';
import { platform } from 'os';

const DESTRUCTIVE_KEYWORDS = ['rm', 'rmdir', 'drop', 'delete', 'truncate', 'push', 'force', 'reset', 'format'];

// Maximum characters to keep from stdout/stderr before truncation
const MAX_OUTPUT_SIZE = 50000;

// Default timeout (ms) — configurable via config.permissions.command_timeout_ms
const DEFAULT_TIMEOUT_MS = 120000;

export async function execute_command(command, cwd, runnerContext) {
  const normalizedCmd = command.toLowerCase().trim();

  let requiresApproval = false;
  
  if (runnerContext && runnerContext.getConfig) {
    const config = runnerContext.getConfig();
    const destructiveKeywords = config.permissions?.require_confirmation_for || DESTRUCTIVE_KEYWORDS;
    
    // Check if any destructive word exists as a whole-word token in the command
    const tokens = normalizedCmd.split(/[\s|&;()]+/);
    for (const kw of destructiveKeywords) {
      if (tokens.includes(kw)) {
        requiresApproval = true;
        break;
      }
    }
  } else {
    const tokens = normalizedCmd.split(/[\s|&;()]+/);
    requiresApproval = DESTRUCTIVE_KEYWORDS.some(kw => tokens.includes(kw));
  }

  if (requiresApproval && runnerContext) {
    console.log(`[Safety] Intercepted potentially destructive command: "${command}"`);
    const approved = await runnerContext.approve('execute_command', { command });
    if (!approved) {
      throw new Error(`Permission denied: Command execution aborted by user: "${command}"`);
    }
  } else if (requiresApproval) {
    throw new Error(`Permission denied: Destructive command execution blocked without user approval channel.`);
  }

  // Read configurable timeout
  let timeoutMs = DEFAULT_TIMEOUT_MS;
  if (runnerContext && runnerContext.getConfig) {
    const config = runnerContext.getConfig();
    if (config.permissions?.command_timeout_ms) {
      timeoutMs = config.permissions.command_timeout_ms;
    }
  }

  return new Promise((resolve, reject) => {
    const isWin = platform() === 'win32';
    const shell = isWin ? 'powershell.exe' : 'sh';
    const args = isWin ? ['-NoProfile', '-Command', command] : ['-c', command];

    const proc = spawn(shell, args, { cwd: cwd || process.cwd() });

    let stdoutData = '';
    let stderrData = '';
    let stdoutTruncated = false;
    let stderrTruncated = false;

    // Configurable timeout with proper Windows process tree killing
    const timeout = setTimeout(() => {
      if (isWin) {
        // Use taskkill on Windows to kill the entire process tree
        try {
          spawn('taskkill', ['/T', '/F', '/PID', String(proc.pid)], { stdio: 'ignore' });
        } catch (e) {
          proc.kill('SIGKILL');
        }
      } else {
        proc.kill('SIGKILL');
      }
      // Resolve with timeout info instead of rejecting — let the LLM decide what to do
      resolve({
        code: -1,
        stdout: stdoutData,
        stderr: stderrData + `\n[TIMEOUT: Command killed after ${timeoutMs / 1000}s]`
      });
    }, timeoutMs);

    proc.stdout.on('data', (data) => {
      const text = data.toString();
      if (!stdoutTruncated) {
        stdoutData += text;
        if (stdoutData.length > MAX_OUTPUT_SIZE) {
          const total = stdoutData.length;
          stdoutData = stdoutData.substring(0, MAX_OUTPUT_SIZE) +
            `\n[OUTPUT TRUNCATED - showing first ${MAX_OUTPUT_SIZE} of ${total} chars]`;
          stdoutTruncated = true;
        }
      }
      if (runnerContext && runnerContext.onStdout) {
        runnerContext.onStdout(text);
      }
    });

    proc.stderr.on('data', (data) => {
      const text = data.toString();
      if (!stderrTruncated) {
        stderrData += text;
        if (stderrData.length > MAX_OUTPUT_SIZE) {
          const total = stderrData.length;
          stderrData = stderrData.substring(0, MAX_OUTPUT_SIZE) +
            `\n[OUTPUT TRUNCATED - showing first ${MAX_OUTPUT_SIZE} of ${total} chars]`;
          stderrTruncated = true;
        }
      }
      if (runnerContext && runnerContext.onStderr) {
        runnerContext.onStderr(text);
      }
    });

    // Non-zero exit is NOT an error — always resolve, let the LLM interpret
    proc.on('close', (code) => {
      clearTimeout(timeout);
      resolve({
        code: code ?? -1,
        stdout: stdoutData,
        stderr: stderrData
      });
    });

    proc.on('error', (err) => {
      clearTimeout(timeout);
      reject(new Error(`Failed to start command: ${err.message}`));
    });
  });
}
