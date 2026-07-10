import fs from 'fs';
import path from 'path';
import os from 'os';

let keytar = null;
try {
  keytar = await import('keytar').then(m => m.default || m);
} catch (e) {
  // keytar not available, fallback active
}

const CONFIG_DIR = path.join(os.homedir(), '.pluralcode');
const CONFIG_PATH = path.join(CONFIG_DIR, 'config.json');
const FALLBACK_KEYS_PATH = path.join(CONFIG_DIR, '.keys.json');

const DEFAULT_CONFIG = {
  provider: 'nvidia',
  agent_models: {
    planner: 'nvidia/llama-3.3-nemotron-super-49b-v1.5',
    coder: 'deepseek-ai/deepseek-v4-flash',
    reviewer: 'nvidia/llama-3.1-nemotron-ultra-253b-v1',
    integrator: 'nvidia/llama-3.1-nemotron-ultra-253b-v1'
  },
  permissions: {
    auto_approve_safe_commands: true,
    auto_approve_file_writes: false,
    require_confirmation_for: ['rm', 'delete', 'push', 'drop']
  }
};

export function initConfigDir() {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
  if (!fs.existsSync(CONFIG_PATH)) {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(DEFAULT_CONFIG, null, 2), 'utf8');
  }
}

export function getConfig() {
  initConfigDir();
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    
    let dirty = false;
    
    // Restore agent_models mapping if missing or formatted in older structure
    if (!parsed.agent_models) {
      parsed.agent_models = { ...DEFAULT_CONFIG.agent_models };
      dirty = true;
    }

    if (parsed.model) {
      parsed.agent_models.coder = parsed.model;
      delete parsed.model;
      dirty = true;
    }

    // Auto-heal old or deprecated model strings
    for (const key of Object.keys(parsed.agent_models)) {
      const modelVal = parsed.agent_models[key] || '';
      if (modelVal === 'deepseek-ai/deepseek-v3.1') {
        parsed.agent_models[key] = 'deepseek-ai/deepseek-v4-flash';
        dirty = true;
      }

      if (parsed.provider === 'openrouter') {
        if (modelVal === 'anthropic/claude-opus-4-8') {
          parsed.agent_models[key] = 'anthropic/claude-opus-4.8';
          dirty = true;
        }
        if (modelVal.startsWith('deepseek-ai/')) {
          parsed.agent_models[key] = modelVal.replace('deepseek-ai/', 'deepseek/');
          dirty = true;
        }
      }
    }
    
    if (dirty) {
      saveConfig(parsed);
    }
    
    return parsed;
  } catch (e) {
    return { ...DEFAULT_CONFIG };
  }
}

export function saveConfig(config) {
  initConfigDir();
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');
}

export async function getApiKey(serviceName) {
  initConfigDir();
  const keyName = serviceName.toUpperCase() + '_API_KEY';
  
  if (keytar) {
    try {
      const val = await keytar.getPassword('plural-code', keyName);
      if (val) return val;
    } catch (e) {
      // Fallback
    }
  }

  if (fs.existsSync(FALLBACK_KEYS_PATH)) {
    try {
      const content = fs.readFileSync(FALLBACK_KEYS_PATH, 'utf8');
      const keysObj = JSON.parse(content);
      const obfuscated = keysObj[keyName];
      if (obfuscated) {
        return Buffer.from(obfuscated, 'base64').toString('utf8');
      }
    } catch (e) {
      return null;
    }
  }
  return process.env[keyName] || null;
}

export async function setApiKey(serviceName, value) {
  initConfigDir();
  const keyName = serviceName.toUpperCase() + '_API_KEY';

  if (keytar) {
    try {
      await keytar.setPassword('plural-code', keyName, value);
      return;
    } catch (e) {
      // Fallback
    }
  }

  let keysObj = {};
  if (fs.existsSync(FALLBACK_KEYS_PATH)) {
    try {
      keysObj = JSON.parse(fs.readFileSync(FALLBACK_KEYS_PATH, 'utf8'));
    } catch (e) {
      keysObj = {};
    }
  }
  keysObj[keyName] = Buffer.from(value, 'utf8').toString('base64');
  fs.writeFileSync(FALLBACK_KEYS_PATH, JSON.stringify(keysObj, null, 2), 'utf8');
}

export async function deleteApiKey(serviceName) {
  initConfigDir();
  const keyName = serviceName.toUpperCase() + '_API_KEY';

  if (keytar) {
    try {
      await keytar.deletePassword('plural-code', keyName);
      return;
    } catch (e) {
      // Fallback
    }
  }

  if (fs.existsSync(FALLBACK_KEYS_PATH)) {
    try {
      const keysObj = JSON.parse(fs.readFileSync(FALLBACK_KEYS_PATH, 'utf8'));
      delete keysObj[keyName];
      fs.writeFileSync(FALLBACK_KEYS_PATH, JSON.stringify(keysObj, null, 2), 'utf8');
    } catch (e) {
      // Ignore
    }
  }
}
