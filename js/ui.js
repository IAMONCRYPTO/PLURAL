/* ═══════════════════════════════════════════
   PLURAL — UI Helpers
   ═══════════════════════════════════════════ */

import { Icons, getIcon } from './icons.js';

/**
 * Lightweight markdown → HTML renderer.
 * Handles: headers, bold, italic, code blocks, inline code,
 * lists, blockquotes, links, line breaks.
 */
export function renderMarkdown(text) {
  if (!text) return '';

  let html = escapeHtml(text);

  // 1. Code blocks (``` ... ```)
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    return `<pre><code class="lang-${lang}">${code.trim()}</code></pre>`;
  });

  // 2. Inline code
  html = html.replace(/`([^`\n]+)`/g, '<code>$1</code>');

  // 3. Headers (Headlines and Subheadlines - H1 to H6)
  // Handles leading/trailing spaces, carriage returns (\r), and optional closing hashes (#)
  html = html.replace(/^[ \t]*######[ \t]+([^\r\n]+?)(?:[ \t]*#*)?\r?$/gm, '<h6>$1</h6>');
  html = html.replace(/^[ \t]*#####[ \t]+([^\r\n]+?)(?:[ \t]*#*)?\r?$/gm, '<h5>$1</h5>');
  html = html.replace(/^[ \t]*####[ \t]+([^\r\n]+?)(?:[ \t]*#*)?\r?$/gm, '<h4>$1</h4>');
  html = html.replace(/^[ \t]*###[ \t]+([^\r\n]+?)(?:[ \t]*#*)?\r?$/gm, '<h3>$1</h3>');
  html = html.replace(/^[ \t]*##[ \t]+([^\r\n]+?)(?:[ \t]*#*)?\r?$/gm, '<h2>$1</h2>');
  html = html.replace(/^[ \t]*#[ \t]+([^\r\n]+?)(?:[ \t]*#*)?\r?$/gm, '<h1>$1</h1>');

  // 4. Blockquotes
  html = html.replace(/^&gt;[ \t]+(.+)$/gm, '<blockquote>$1</blockquote>');

  // 5. Lists (Unordered)
  html = html.replace(/^[-*+][ \t]+(.+)$/gm, '<li>$1</li>');
  html = html.replace(/((?:<li>.+?<\/li>\n?)+)/g, '<ul>\n$1</ul>');

  // 6. Bold & Italic (Standard Markdown)
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  html = html.replace(/___(.+?)___/g, '<strong><em>$1</em></strong>');
  html = html.replace(/__(.+?)__/g, '<strong>$1</strong>');
  html = html.replace(/_(.+?)_/g, '<em>$1</em>');

  // 7. Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

  // 8. Paragraphs
  const lines = html.split('\n');
  const processedLines = lines.map(line => {
    const trimmed = line.trim();
    if (!trimmed) return '';
    if (/^<(?:h1|h2|h3|h4|h5|h6|li|ul|ol|blockquote|pre|code|hr)/.test(trimmed)) {
      return line;
    }
    return `<p>${line}</p>`;
  });
  
  html = processedLines.filter(l => l !== '').join('\n');

  return html;
}

/**
 * Escape HTML special characters.
 */
export function escapeHtml(str) {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return str.replace(/[&<>"']/g, c => map[c]);
}

/**
 * Create a user message element.
 */
export function createUserMessage(content, images = []) {
  const div = document.createElement('div');
  div.className = 'message user';

  let imagesHtml = '';
  if (images.length > 0) {
    imagesHtml = `<div class="message-images">${images.map(src =>
      `<img class="message-image" src="${src}" alt="Attached image" onclick="document.getElementById('lightboxImage').src=this.src;document.getElementById('imageLightbox').classList.add('active')">`
    ).join('')}</div>`;
  }

  div.innerHTML = `
    <div class="message-avatar">P</div>
    <div class="message-content">${imagesHtml}${escapeHtml(content)}</div>
  `;
  return div;
}

/**
 * Create an assistant message element with streamable content area.
 * Returns { element, contentEl }
 */
export function createAssistantMessage() {
  const div = document.createElement('div');
  div.className = 'message assistant';
  div.innerHTML = `
    <div class="message-avatar">✦</div>
    <div class="message-content streaming"></div>
    <div class="message-actions">
      <button class="share-to-x-btn" title="Share this on X">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 4s-.7 2.1-2 3.4c1.6 10-9.4 17.3-18 11.6 2.2.1 4.4-.6 6-2C3 15.5.5 9.6 3 5c2.2 2.6 5.6 4.1 9 4-.9-4.2 4-6.6 7-3.8 1.1 0 3-1.2 3-1.2z"/></svg>
        <span>Share</span>
      </button>
    </div>
  `;
  return {
    element: div,
    contentEl: div.querySelector('.message-content'),
  };
}

/**
 * Create a welcome screen for a mode.
 */
export function createWelcomeScreen(icon, title, subtitle) {
  const div = document.createElement('div');
  div.className = 'welcome-screen';
  div.innerHTML = `
    <div class="welcome-icon">${icon}</div>
    <div class="welcome-title">${title}</div>
    <div class="welcome-subtitle">${subtitle}</div>
  `;
  return div;
}

/**
 * Create the full Council thinking panel + final answer structure.
 * Returns { element, agentContentEls: [4], finalContentEl, thinkingPanel, toggleBtn }
 */
export function createCouncilResponse(hasVault = false) {
  const agents = [
    { icon: Icons.strategist, num: '1', role: 'Strategist', model: 'nvidia/llama-3.3-nemotron-super-49b-v1', defaultStatus: hasVault ? 'Agent-1 analyzing your vault...' : 'Flowing raw thinking' },
    { icon: Icons.analyst, num: '2', role: 'Analyst', model: 'nvidia/nemotron-3-ultra-550b-a55b', defaultStatus: hasVault ? 'Agent-2 cross-referencing...' : 'analyzing' },
    { icon: Icons.creative, num: '3', role: 'Creative', model: 'moonshotai/kimi-k2.6', defaultStatus: hasVault ? 'Agent-3 finding angles...' : 'innovative ideas' },
    { icon: Icons.devil, num: '4', role: 'Devil', model: 'nvidia/nemotron-3-super-120b-a12b', defaultStatus: hasVault ? 'Agent-4 finding gaps...' : 'brutal critique' },
  ];

  const wrapper = document.createElement('div');
  wrapper.className = 'council-response-wrapper';

  // Thinking panel
  const panel = document.createElement('div');
  panel.className = 'thinking-panel';
  panel.innerHTML = `
    <button class="thinking-toggle">
      <span class="thinking-toggle-arrow">▼</span>
      How agents thought (Sequential flow)
    </button>
    <div class="thinking-agents">
      ${agents.map((a, i) => `
        <div class="agent-card" id="agent-card-${i}">
          <div class="agent-card-inner">
            <div class="agent-card-header">
              <span class="agent-card-icon-num">${a.icon} Agent-${a.num}</span>
              <span class="agent-card-role">${a.role}</span>
            </div>
            <div class="agent-card-model">${a.model}</div>
            <div class="agent-card-content streaming" id="agent-content-${i}">${a.defaultStatus}</div>
          </div>
        </div>
      `).join('')}
    </div>
  `;

  // Final answer
  const finalAnswer = document.createElement('div');
  finalAnswer.className = 'final-answer';
  finalAnswer.innerHTML = `
    <div class="final-answer-header">
      <span>✦</span>
      <div>
        <div class="final-answer-title">Final Answer</div>
        <div class="final-answer-subtitle">${hasVault ? 'Synthesizing from your knowledge...' : 'Synthesized output'}</div>
      </div>
    </div>
    <div class="final-answer-content streaming" id="final-answer-content"></div>
    <div class="message-actions" style="margin-top: 12px; margin-right: 16px;">
      <button class="share-to-x-btn" title="Share this on X">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 4s-.7 2.1-2 3.4c1.6 10-9.4 17.3-18 11.6 2.2.1 4.4-.6 6-2C3 15.5.5 9.6 3 5c2.2 2.6 5.6 4.1 9 4-.9-4.2 4-6.6 7-3.8 1.1 0 3-1.2 3-1.2z"/></svg>
        <span>Share</span>
      </button>
    </div>
  `;

  wrapper.appendChild(panel);
  wrapper.appendChild(finalAnswer);

  // Toggle behavior (starts open by default in mockup)
  panel.classList.add('open');
  const toggleBtn = panel.querySelector('.thinking-toggle');
  const arrow = toggleBtn.querySelector('.thinking-toggle-arrow');
  
  toggleBtn.addEventListener('click', () => {
    panel.classList.toggle('open');
    arrow.textContent = panel.classList.contains('open') ? '▼' : '▶';
  });

  return {
    element: wrapper,
    agentCards: agents.map((_, i) => wrapper.querySelector(`#agent-card-${i}`)),
    agentContentEls: agents.map((_, i) => wrapper.querySelector(`#agent-content-${i}`)),
    finalAnswer,
    finalContentEl: wrapper.querySelector('#final-answer-content'),
    thinkingPanel: panel,
    toggleBtn,
  };
}

/**
 * Create typing indicator dots.
 */
export function createTypingIndicator() {
  const div = document.createElement('div');
  div.className = 'typing-indicator';
  div.innerHTML = `
    <div class="typing-dot"></div>
    <div class="typing-dot"></div>
    <div class="typing-dot"></div>
  `;
  return div;
}

/**
 * Scroll a container to the bottom.
 */
export function scrollToBottom(container) {
  if (!container) return;
  requestAnimationFrame(() => {
    container.scrollTop = container.scrollHeight;
  });
}

/**
 * Show a toast notification.
 */
export function showToast(message, type = 'error') {
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  const icons = { error: getIcon('error'), success: getIcon('success'), warning: getIcon('warning'), info: getIcon('info') };
  toast.innerHTML = `<span class="toast-icon">${icons[type] || getIcon('warning')}</span> ${escapeHtml(message)}`;
  container.appendChild(toast);

  setTimeout(() => toast.remove(), 4000);
}

/**
 * Auto-resize a textarea to fit its content.
 */
export function autoResizeTextarea(textarea) {
  textarea.style.height = 'auto';
  textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
}

/**
 * Create a sources and references container badge strip.
 */
export function createSourcesContainer(sources) {
  if (!sources || sources.length === 0) return null;
  const container = document.createElement('div');
  container.className = 'sources-container';
  container.innerHTML = `
    <div class="sources-title">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -2px;">
        <circle cx="12" cy="12" r="10"/>
        <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/>
        <path d="M2 12h20"/>
      </svg>
      Sources & References
    </div>
    <div class="sources-list">
      ${sources.map((s, i) => `
        <a class="source-badge" href="${s.url}" target="_blank" title="${s.title}">
          <span>[${i+1}]</span>
          <span>${s.title.length > 22 ? s.title.slice(0, 22) + '…' : s.title}</span>
        </a>
      `).join('')}
    </div>
  `;
  return container;
}
