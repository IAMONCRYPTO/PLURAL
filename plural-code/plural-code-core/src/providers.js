import { getApiKey, getConfig } from './config.js';

// ────────────────────────────────────────────────────────
// Per-role temperature mapping
// ────────────────────────────────────────────────────────
const ROLE_TEMPERATURES = {
  planner: 0.3,
  coder: 0.1,
  reviewer: 0.0,
  integrator: 0.2
};

// Status codes that are safe to retry (server-side / rate-limit errors)
const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

// ────────────────────────────────────────────────────────
// Fetch Available Models
// ────────────────────────────────────────────────────────

export async function fetchAvailableModels(provider, apiKey) {
  const url = provider === 'openrouter' 
    ? 'https://openrouter.ai/api/v1/models'
    : 'https://integrate.api.nvidia.com/v1/models';
  
  if (!apiKey) return [];

  try {
    const res = await fetch(url, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(15000) // 15-second timeout
    });
    if (!res.ok) throw new Error(`HTTP error ${res.status}`);
    const data = await res.json();
    if (!data || !Array.isArray(data.data)) return [];

    const blacklist = ['z-ai/glm-5.1', 'z-ai/glm5'];

    return data.data
      .filter(m => !blacklist.includes(m.id))
      .map(m => {
        let label = m.name || m.id;
        return { id: m.id, label: label };
      });
  } catch (e) {
    console.error(`[Provider] Failed to fetch models for ${provider}:`, e);
    return [];
  }
}

// ────────────────────────────────────────────────────────
// Core LLM Call — with retry, timeout, per-role temperature
// ────────────────────────────────────────────────────────

export async function callLLM(messages, tools, configObj, agentRole = 'coder') {
  const config = configObj || getConfig();
  const provider = config.provider || 'nvidia';
  
  // Extract model for specific agent role, default to coder model
  let model = 'deepseek-ai/deepseek-v4-flash';
  if (config.agent_models && config.agent_models[agentRole]) {
    model = config.agent_models[agentRole];
  } else if (config.model) {
    model = config.model;
  }

  // Only fetch the API key we actually need
  const apiKey = await getApiKey(provider === 'openrouter' ? 'openrouter' : 'nvidia');

  if (!apiKey) {
    throw new Error(`API key for provider '${provider}' is missing. Please set it in Settings.`);
  }

  const url = provider === 'openrouter'
    ? 'https://openrouter.ai/api/v1/chat/completions'
    : 'https://integrate.api.nvidia.com/v1/chat/completions';

  // Per-role temperature
  const temperature = ROLE_TEMPERATURES[agentRole] ?? 0.1;

  const body = {
    model: model,
    messages: messages,
    temperature: temperature
  };

  if (tools && tools.length > 0) {
    body.tools = tools;
  }

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`
  };

  if (provider === 'openrouter') {
    headers['HTTP-Referer'] = 'https://pluralcode.dev';
    headers['X-Title'] = 'Plural Code Assistant';
  }

  console.log(`[Provider] Requesting: ${url}`);
  console.log(`[Provider] Agent: ${agentRole} | Model: ${model} | Temp: ${temperature}`);

  // ── Retry loop with exponential backoff ──
  let lastError = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const delayMs = BASE_DELAY_MS * Math.pow(2, attempt - 1);
      console.warn(`[Provider] Retry ${attempt}/${MAX_RETRIES} after ${delayMs}ms delay...`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(90000) // 90-second timeout per request
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[Provider] ERROR ${response.status} from ${url}`);
        console.error(`[Provider] Response body: ${errorText}`);

        // Don't retry client errors (400, 401, 403, 404)
        if (response.status >= 400 && response.status < 500 && !RETRYABLE_STATUS_CODES.has(response.status)) {
          if (response.status === 404) {
            throw new Error(`Model '${model}' not found on provider '${provider === 'nvidia' ? 'NVIDIA NIM' : 'OpenRouter'}'. Check Settings > Models to select a valid model.`);
          }
          throw new Error(`API call failed: status ${response.status} - ${errorText}`);
        }

        // Retryable error — store and continue loop
        if (RETRYABLE_STATUS_CODES.has(response.status)) {
          lastError = new Error(`API call failed: status ${response.status} - ${errorText}`);
          if (attempt < MAX_RETRIES) {
            console.warn(`[Provider] Retryable error ${response.status}, will retry...`);
            continue;
          }
          throw lastError;
        }

        throw new Error(`API call failed: status ${response.status} - ${errorText}`);
      }

      // ── Success — parse response ──
      const data = await response.json();

      if (!data || !data.choices || data.choices.length === 0) {
        throw new Error('API returned empty choices.');
      }

      const choice = data.choices[0];
      if (!choice || !choice.message) {
        throw new Error('API returned malformed choice: missing message.');
      }

      const msg = choice.message;

      // Extract token usage if present
      const usage = data.usage || null;
      if (usage) {
        console.log(`[Provider] Tokens — prompt: ${usage.prompt_tokens || '?'}, completion: ${usage.completion_tokens || '?'}, total: ${usage.total_tokens || '?'}`);
      }

      return {
        content: msg.content || '',
        tool_calls: msg.tool_calls || [],
        usage: usage
      };

    } catch (err) {
      // AbortError = timeout
      if (err.name === 'AbortError' || err.name === 'TimeoutError') {
        lastError = new Error(`LLM request timed out after 90 seconds (attempt ${attempt + 1}/${MAX_RETRIES + 1})`);
        if (attempt < MAX_RETRIES) {
          console.warn(`[Provider] Request timed out, will retry...`);
          continue;
        }
        throw lastError;
      }

      // Network / fetch errors are retryable
      if (err.message?.includes('fetch') || err.message?.includes('network') || err.code === 'ECONNRESET') {
        lastError = err;
        if (attempt < MAX_RETRIES) {
          console.warn(`[Provider] Network error: ${err.message}, will retry...`);
          continue;
        }
      }

      throw err;
    }
  }

  // Should not reach here, but safety net
  throw lastError || new Error('LLM call failed after all retries.');
}
