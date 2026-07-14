import { Storage } from './storage.js';

export const MODELS = {
  STRATEGIST: 'nvidia/llama-3.3-nemotron-super-49b-v1',
  ANALYST:    'nvidia/nemotron-3-ultra-550b-a55b',
  CREATIVE:   'meta/llama-3.3-70b-instruct',
  DEVIL:      'nvidia/nemotron-3-super-120b-a12b',
  SYNTHESIZER:'nvidia/llama-3.3-nemotron-super-49b-v1',
  CLONE:      'meta/llama-3.3-70b-instruct',
  TWIN:       'nvidia/llama-3.3-nemotron-super-49b-v1',
};

/**
 * Stream a chat completion from NVIDIA NIM via our backend proxy.
 * @param {string} model - Model identifier
 * @param {Array} messages - OpenAI-format messages array
 * @param {Object} callbacks - { onChunk(delta, fullText), onDone(fullText), onError(err) }
 * @returns {Promise<string>} Full accumulated response text
 */
export async function streamChat(model, messages, { onChunk, onDone, onError, images } = {}) {
  let fullText = '';

  try {
    const userId = Storage.getUserId() || 'anonymous';
    const personalKey = localStorage.getItem(`nvidia_api_key_${userId}`);
    
    const headers = { 'Content-Type': 'application/json' };
    if (personalKey) {
      headers['X-NVIDIA-API-KEY'] = personalKey;
    }

    const res = await fetch('/api/chat', {
      method: 'POST',
      headers,
      body: JSON.stringify({ model, messages, stream: true, images }),
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => 'Unknown error');
      throw new Error(`API ${res.status}: ${errBody.slice(0, 200)}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;

        if (trimmed === 'data: [DONE]') {
          onDone?.(fullText);
          return fullText;
        }

        try {
          const json = JSON.parse(trimmed.slice(6));
          const delta = json.choices?.[0]?.delta?.content;
          if (delta) {
            fullText += delta;
            onChunk?.(delta, fullText);
          }
        } catch {
          // skip malformed chunks
        }
      }
    }

    onDone?.(fullText);
    return fullText;
  } catch (err) {
    onError?.(err);
    throw err;
  }
}
