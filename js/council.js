/* ═══════════════════════════════════════════
   PLURAL — Council Mode
   "Unity With AI."
   ═══════════════════════════════════════════ */

import { streamChat, MODELS } from './api.js';
import { createUserMessage, createAssistantMessage, createCouncilResponse, renderMarkdown, scrollToBottom, showToast, createSourcesContainer } from './ui.js';
import { Storage } from './storage.js';
import { Icons } from './icons.js';

const AGENTS = [
  {
    key: 'STRATEGIST',
    model: MODELS.STRATEGIST,
    name: 'Agent-1 Strategist',
    icon: Icons.strategist,
    buildPrompt: (userMsg) =>
      `You are Agent-1: The Strategist. Analyze the user's inquiry from a high-level, long-term perspective. Focus on underlying dynamics, systemic impact, and foresight. Write in natural, clear, refined language. Speak directly without meta-commentary or introductory labels. Max 3 sentences.`,
  },
  {
    key: 'ANALYST',
    model: MODELS.ANALYST,
    name: 'Agent-2 Analyst',
    icon: Icons.analyst,
    buildPrompt: (userMsg) =>
      `You are Agent-2: The Analyst. Evaluate the query using rigorous logic, factual content, structure, and empirical feasibility. Deliver a precise, crisp, data-grounded analysis in direct, professional prose. No prefixes. Max 3 sentences.`,
  },
  {
    key: 'CREATIVE',
    model: MODELS.CREATIVE,
    name: 'Agent-3 Creative',
    icon: Icons.creative,
    buildPrompt: (userMsg) =>
      `You are Agent-3: The Creative. Propose a novel, unconventional, or lateral perspective on this topic. Challenge basic assumptions with high-concept creative thinking. Write fluidly and clearly. Max 3 sentences.`,
  },
  {
    key: 'DEVIL',
    model: MODELS.DEVIL,
    name: "Agent-4 Devil's Advocate",
    icon: Icons.devil,
    buildPrompt: (userMsg) =>
      `You are Agent-4: The Devil's Advocate. Critique the core assumptions of the prompt. Identify risks, pitfalls, logical weaknesses, or safety concerns. Be sharp, direct, and brutally honest without sounding robotic. Max 3 sentences.`,
  },
];

/* ─── Smart Routing — detect simple/casual messages ────────── */

function isSimpleMessage(text) {
  const lower = text.toLowerCase().trim();
  const wordCount = lower.split(/\s+/).length;

  // Greeting patterns
  const greetings = /^(hi+|hello+|hey+|yo+|sup|hola|namaste|hii+|hey+\s*there|what'?s?\s*up|wassup|howdy|salaam|ola)/i;
  
  // Common casual / small-talk patterns
  const casual = /^(good\s*(morning|evening|night|afternoon|day)|how\s*are\s*you|how'?s?\s*it\s*going|kya\s*hal|kaise\s*ho|sab\s*theek|thanks?|thank\s*you|thx|ty|dhanyawad|shukriya|bye|goodbye|see\s*you|later|cya|ok|okay|sure|yes|no|yeah|yep|nah|haan|nahi|hmm+|lol|haha|nice|cool|great|awesome|acha+|theek|sahi|wow|damn|bhai+|yaar|dude|bro)/i;
  
  // Meta questions about the platform
  const meta = /^(who\s*are\s*you|what\s*(are|is)\s*(you|this|plural)|what\s*can\s*you\s*do|help|test|testing|introduce\s*yourself)/i;

  // Direct retrieval or general information/action queries
  const directQueries = /^(tell|show|search|find|give|what|who|where|when|why|how|news|weather|latest|today|write|explain|translate|calculate|create)/i;

  // If it's a short query (up to 5 words) and matches direct patterns, route directly to synthesizer
  if (wordCount <= 5) {
    if (greetings.test(lower) || casual.test(lower) || meta.test(lower) || directQueries.test(lower)) {
      return true;
    }
    // Generic short queries of 2 words or less always go direct
    if (wordCount <= 2) return true;
  }

  // Slightly longer casual or greeting messages
  if (wordCount <= 8 && (greetings.test(lower) || casual.test(lower))) {
    return true;
  }

  return false;
}

/* ─── Synthesizer Prompts ──────────────────────────────────── */

const DIRECT_SYNTH_PROMPT = `You are PLURAL, a premium AI workspace.
Analyze the user's message and respond in high-quality, natural, and editorial prose.
- If it is a casual greeting or small-talk, respond warmly, conversationally, and match their energy (you can use Hinglish if they do). Keep it to 1-3 sentences.
- If they are asking for news, weather, or real-time info, synthesize a clean, natural briefing based on the provided search context. Focus on telling the actual news topics in an informative, engaging editorial style. Do NOT output disclaimers like "(Example, Not Live)", "(not live)", or discuss content limitations/synthetic nature. Just present the stories directly.
- Avoid all robotic commentary, introductory prefixes, or formatting disclaimers. 
- Do NOT use structural headings, bullet points, or blockquotes unless they are genuinely needed for complex data lists. Prefer flowing, high-quality paragraphs.
- Output ONLY the final response to the user.`;

function buildSynthesizerPrompt(agentOutputs) {
  return `You are the Final Synthesizer for PLURAL, a premium multi-agent AI collaboration workspace.

4 expert agents have analyzed the user's question from different angles:

**[Strategist]** (strategic outlook): ${agentOutputs[0]}
**[Analyst]** (logical analysis): ${agentOutputs[1]}
**[Creative]** (creative angle): ${agentOutputs[2]}
**[Devil's Advocate]** (critical critique): ${agentOutputs[3]}

YOUR JOB: Synthesize these perspectives into ONE polished, brilliant final answer for the user.

FORMATTING RULES:
- Write in clean, flowing, high-quality editorial prose, matching Claude's writing depth.
- Use markdown formatting (headings, lists, bold text) ONLY if the complexity warrants it. If the response can be explained in elegant paragraphs, do not force headings or lists.
- Keep paragraphs natural, engaging, and professional.
- Do NOT include any introductory or meta-commentary phrases (e.g. do not say "Here is a synthesized response..."). Start directly with your content.`;
}

let isProcessing = false;

export function isCouncilProcessing() {
  return isProcessing;
}

/**
 * Run the Council pipeline.
 * Simple messages → direct to Synthesizer.
 * Complex messages → 4 agents sequentially → Synthesizer.
 */
export async function runCouncil(userText, chatMessages, currentChatId, images = [], searchContext = null, searchResults = []) {
  if (isProcessing) return;
  isProcessing = true;

  const container = document.getElementById('chatMessages');

  // Add user message
  container.appendChild(createUserMessage(userText, images));
  scrollToBottom(container);

  // ── SMART ROUTING: bypass agents for simple messages ──
  if (isSimpleMessage(userText)) {
    await runDirectResponse(userText, chatMessages, currentChatId, container, images, searchContext, searchResults);
    isProcessing = false;
    return;
  }

  // ── FULL COUNCIL: complex messages ──
  await runFullCouncil(userText, chatMessages, currentChatId, container, images, searchContext, searchResults);
  isProcessing = false;
}

/**
 * Direct response — simple messages go straight to Synthesizer.
 */
async function runDirectResponse(userText, chatMessages, currentChatId, container, images = [], searchContext = null, searchResults = []) {
  const { element, contentEl } = createAssistantMessage();
  container.appendChild(element);
  scrollToBottom(container);

  const vaultContent = Storage.getVaultContextString();
  const hasVault = vaultContent.length > 0;
  
  let systemPrompt = DIRECT_SYNTH_PROMPT;
  if (hasVault) {
    systemPrompt = `User's Knowledge Vault:\n${vaultContent}\n\nUse this as context. Reference it directly when relevant.\n\n${DIRECT_SYNTH_PROMPT}`;
  }

  let userPrompt = userText;
  if (searchContext) {
    userPrompt = `[Web Search Context]\n${searchContext}\n\nUser Question: ${userText}`;
  }

  const messages = [
    { role: 'system', content: systemPrompt },
    ...chatMessages.slice(-10).map(m => ({ role: m.role, content: m.content })),
    { role: 'user', content: userPrompt },
  ];

  try {
    await streamChat(MODELS.SYNTHESIZER, messages, {
      images,
      onChunk: (delta, full) => {
        contentEl.textContent = full;
        scrollToBottom(container);
      },
      onDone: (full) => {
        contentEl.classList.remove('streaming');
        contentEl.innerHTML = renderMarkdown(full);
        
        // Append clickable web search sources under the content
        if (searchResults && searchResults.length > 0) {
          const sourcesContainer = createSourcesContainer(searchResults);
          if (sourcesContainer) {
            contentEl.appendChild(sourcesContainer);
            scrollToBottom(container);
          }
        }
      },
      onError: (err) => {
        contentEl.classList.remove('streaming');
        contentEl.innerHTML = `<p>Error: ${err.message}</p>`;
      },
    });
  } catch (err) {
    showToast('Response failed', 'error');
  }

  // Save to history (no agentOutputs = simple message)
  chatMessages.push({ role: 'user', content: userText });
  chatMessages.push({ 
    role: 'assistant', 
    content: contentEl.textContent,
    sources: searchResults && searchResults.length > 0 ? searchResults : undefined
  });
  Storage.saveMessages('council', currentChatId, chatMessages);
  scrollToBottom(container);
}

/**
 * Full Council pipeline — 4 agents → Synthesizer.
 */
async function runFullCouncil(userText, chatMessages, currentChatId, container, images = [], searchContext = null, searchResults = []) {
  const vaultContent = Storage.getVaultContextString();
  const hasVault = vaultContent.length > 0;

  // Create council response UI (pass hasVault to show custom thinking statuses)
  const council = createCouncilResponse(hasVault);
  container.appendChild(council.element);
  scrollToBottom(container);

  // Open thinking panel so user can watch
  council.thinkingPanel.classList.add('open');

  const agentOutputs = [];
  
  let userPrompt = userText;
  if (searchContext) {
    userPrompt = `[Web Search Context]\n${searchContext}\n\nUser Question: ${userText}`;
  }

  // ── Run 4 agents in parallel ──
  const agentPromises = AGENTS.map(async (agent, i) => {
    const card = council.agentCards[i];
    const contentEl = council.agentContentEls[i];

    contentEl.textContent = '';
    card.classList.add('active');

    let systemPrompt = agent.buildPrompt(userText);
    if (hasVault) {
      systemPrompt = `User's Knowledge Vault:\n${vaultContent}\n\nUse this as context. Reference it directly when relevant.\n\n${systemPrompt}`;
    }

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];

    try {
      const output = await streamChat(agent.model, messages, {
        images,
        onChunk: (delta, full) => {
          contentEl.textContent = full;
          scrollToBottom(container);
        },
        onDone: (full) => {
          card.classList.remove('active');
          contentEl.classList.remove('streaming');
          contentEl.innerHTML = renderMarkdown(full);
        },
        onError: (err) => {
          card.classList.remove('active');
          console.error(`${agent.name} failed:`, err);
        },
      });
      return output || '(no response)';
    } catch (err) {
      card.classList.remove('active');
      contentEl.classList.remove('streaming');
      card.classList.add('error');
      contentEl.textContent = `Agent unavailable: ${err.message?.slice(0, 80) || 'Unknown error'}`;
      showToast(`${agent.name} failed`, 'warning');
      return '(agent unavailable)';
    }
  });

  const outputs = await Promise.all(agentPromises);
  agentOutputs.push(...outputs);

  council.thinkingPanel.classList.remove('open');
  council.finalAnswer.style.display = '';
  scrollToBottom(container);

  // ── Run Synthesizer ──
  const synthPrompt = buildSynthesizerPrompt(agentOutputs);
  let finalSynthPrompt = synthPrompt;
  if (hasVault) {
    finalSynthPrompt = `User's Knowledge Vault:\n${vaultContent}\n\nUse this as context. Reference it directly when relevant.\n\n${synthPrompt}`;
  }

  const synthMessages = [
    { role: 'system', content: finalSynthPrompt },
    { role: 'user', content: userPrompt },
  ];

  try {
    await streamChat(MODELS.SYNTHESIZER, synthMessages, {
      images,
      onChunk: (delta, full) => {
        council.finalContentEl.textContent = full;
        scrollToBottom(container);
      },
      onDone: (full) => {
        council.finalContentEl.classList.remove('streaming');
        council.finalContentEl.innerHTML = renderMarkdown(full);
        
        // Append clickable sources under final answer
        if (searchResults && searchResults.length > 0) {
          const sourcesContainer = createSourcesContainer(searchResults);
          if (sourcesContainer) {
            council.finalContentEl.appendChild(sourcesContainer);
            scrollToBottom(container);
          }
        }
      },
      onError: (err) => {
        council.finalContentEl.classList.remove('streaming');
        council.finalContentEl.textContent = `Synthesizer error: ${err.message}`;
      },
    });
  } catch (err) {
    council.finalContentEl.classList.remove('streaming');
    council.finalContentEl.innerHTML = `<p>Synthesizer failed: ${err.message}</p>`;
    showToast('Synthesizer failed', 'error');
  }

  // ── Save to history ──
  chatMessages.push({ role: 'user', content: userText });
  chatMessages.push({
    role: 'assistant',
    content: council.finalContentEl.textContent,
    agentOutputs,
    sources: searchResults && searchResults.length > 0 ? searchResults : undefined
  });
  Storage.saveMessages('council', currentChatId, chatMessages);
  scrollToBottom(container);
}

/**
 * Render saved council chat history into the container.
 */
export function renderCouncilHistory(messages) {
  const container = document.getElementById('chatMessages');

  for (const msg of messages) {
    if (msg.role === 'user') {
      container.appendChild(createUserMessage(msg.content));
    } else if (msg.role === 'assistant') {
      if (msg.agentOutputs) {
        // Full council response
        const council = createCouncilResponse();
        msg.agentOutputs.forEach((output, i) => {
          council.agentCards[i].style.display = '';
          council.agentContentEls[i].classList.remove('streaming');
          council.agentContentEls[i].innerHTML = renderMarkdown(output);
        });
        council.finalAnswer.style.display = '';
        council.finalContentEl.classList.remove('streaming');
        council.finalContentEl.innerHTML = renderMarkdown(msg.content);

        // Render sources if cached in history
        if (msg.sources && msg.sources.length > 0) {
          const sourcesContainer = createSourcesContainer(msg.sources);
          if (sourcesContainer) {
            council.finalContentEl.appendChild(sourcesContainer);
          }
        }

        container.appendChild(council.element);
      } else {
        // Simple direct response
        const div = document.createElement('div');
        div.className = 'message assistant';
        div.innerHTML = `<div class="message-avatar">✦</div><div class="message-content">${renderMarkdown(msg.content)}</div>`;
        
        // Render sources if cached in history
        if (msg.sources && msg.sources.length > 0) {
          const sourcesContainer = createSourcesContainer(msg.sources);
          if (sourcesContainer) {
            div.querySelector('.message-content').appendChild(sourcesContainer);
          }
        }
        
        container.appendChild(div);
      }
    }
  }
}
