import { execute_command } from './terminal.js';
import fs from 'fs';
import path from 'path';

/**
 * Check if the given directory is inside a git repository.
 */
function isGitRepo(cwd) {
  try {
    return fs.existsSync(path.join(cwd, '.git'));
  } catch {
    return false;
  }
}

export async function git_status(cwd, runnerContext) {
  if (!isGitRepo(cwd)) return 'Not a git repository.';
  try {
    const res = await execute_command('git status -s', cwd, runnerContext);
    return res.stdout || 'Clean working directory.';
  } catch (e) {
    return `Git status error: ${e.message}`;
  }
}

export async function git_diff(cwd, runnerContext) {
  if (!isGitRepo(cwd)) return 'Not a git repository.';
  try {
    // Show both unstaged and staged changes
    const unstaged = await execute_command('git diff', cwd, runnerContext);
    const staged = await execute_command('git diff --cached', cwd, runnerContext);

    let output = '';
    if (unstaged.stdout) output += `--- Unstaged Changes ---\n${unstaged.stdout}\n`;
    if (staged.stdout) output += `--- Staged Changes ---\n${staged.stdout}\n`;
    return output || 'No changes to diff.';
  } catch (e) {
    return `Git diff error: ${e.message}`;
  }
}

export async function git_commit(message, cwd, runnerContext) {
  if (!isGitRepo(cwd)) throw new Error('Not a git repository.');
  try {
    // Use 'git add .' (scoped to cwd) instead of 'git add -A' (entire repo)
    await execute_command('git add .', cwd, runnerContext);

    // Use double-quoting with proper escaping for PowerShell safety
    const safeMsg = message.replace(/"/g, '\\"').replace(/`/g, '\\`').replace(/\$/g, '\\$');
    const res = await execute_command(`git commit -m "${safeMsg}"`, cwd, runnerContext);
    return res.stdout || res.stderr || 'Commit created.';
  } catch (e) {
    throw new Error(`Git commit failed: ${e.message}`);
  }
}

export async function git_branch(cwd, runnerContext) {
  if (!isGitRepo(cwd)) return 'Not a git repository.';
  try {
    const res = await execute_command('git branch -a', cwd, runnerContext);
    return res.stdout || 'No branches found.';
  } catch (e) {
    return `Git branch list error: ${e.message}`;
  }
}

export async function git_log(cwd, count = 10, runnerContext) {
  if (!isGitRepo(cwd)) return 'Not a git repository.';
  try {
    const limit = parseInt(count, 10) || 10;
    const res = await execute_command(`git log --oneline -n ${limit}`, cwd, runnerContext);
    return res.stdout || 'No commits found.';
  } catch (e) {
    return `Git log error: ${e.message}`;
  }
}
