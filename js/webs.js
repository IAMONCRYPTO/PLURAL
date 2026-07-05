/* ═══════════════════════════════════════════
   PLURAL — WEBS (Idea to Website) Builder
   "Your idea. Fully built."
   ═══════════════════════════════════════════ */

import { streamChat } from './api.js';
import { Storage } from './storage.js';
import { Supabase } from './supabase.js';
import { showToast, renderMarkdown, scrollToBottom } from './ui.js';

let isProcessing = false;
let currentProject = null; // { id, name, html, version }
let chatMessages = []; // Local log of messages

export function isWebsProcessing() {
  return isProcessing;
}

/**
 * Initialize WEBS view, bind tabs, copy, open and download events.
 */
export function initWebs() {
  const view = document.getElementById('websView');
  if (!view) return;

  // Code Tab switching
  const tabs = view.querySelectorAll('.webs-tab');
  const codePres = view.querySelectorAll('.webs-code-pre');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      codePres.forEach(p => p.classList.remove('active'));

      tab.classList.add('active');
      const target = tab.dataset.tab;
      const targetPre = view.querySelector(`.webs-code-pre[data-code="${target}"]`);
      if (targetPre) targetPre.classList.add('active');
    });
  });

  // Code Copy
  const copyBtn = document.getElementById('websCopyBtn');
  if (copyBtn) {
    copyBtn.addEventListener('click', async () => {
      const activePre = view.querySelector('.webs-code-pre.active code');
      if (activePre) {
        try {
          await navigator.clipboard.writeText(activePre.textContent);
          showToast('Code copied to clipboard', 'success');
        } catch {
          showToast('Failed to copy code', 'error');
        }
      }
    });
  }

  // Open Preview in New Tab
  const openBtn = document.getElementById('websOpenBtn');
  if (openBtn) {
    openBtn.addEventListener('click', () => {
      if (!currentProject || !currentProject.html) return;
      const newTab = window.open();
      if (newTab) {
        newTab.document.open();
        newTab.document.write(currentProject.html);
        newTab.document.close();
      } else {
        showToast('Popup blocked! Please allow popups.', 'warning');
      }
    });
  }

  // Download ZIP
  const downloadBtn = document.getElementById('websDownloadZipBtn');
  if (downloadBtn) {
    downloadBtn.addEventListener('click', async () => {
      if (!currentProject || !currentProject.html) return;

      downloadBtn.disabled = true;
      downloadBtn.textContent = 'Generating ZIP...';

      try {
        if (typeof window.JSZip === 'undefined') {
          throw new Error('JSZip library not loaded yet.');
        }

        const zip = new window.JSZip();
        zip.file('index.html', currentProject.html);
        zip.file('README.md', `# Built with PLURAL WEBS\n\nProject Name: ${currentProject.name}\nVersion: ${currentProject.version}\n\nThink Plural.`);
        zip.folder('assets'); // empty folder

        const content = await zip.generateAsync({ type: 'blob' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(content);
        link.download = `${currentProject.name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}_webs_project.zip`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        showToast('ZIP downloaded successfully!', 'success');
      } catch (err) {
        console.error('ZIP Error:', err);
        showToast(`Failed to generate ZIP: ${err.message}`, 'error');
      } finally {
        downloadBtn.disabled = false;
        downloadBtn.textContent = '⬇️ Download ZIP';
      }
    });
  }

  // Mobile Tabs
  const mobileTabs = view.querySelectorAll('.webs-mobile-tab');
  const leftPanel = view.querySelector('.webs-left-panel');
  const middlePanel = view.querySelector('.webs-middle-panel');
  const rightPanel = view.querySelector('.webs-right-panel');

  mobileTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      mobileTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      const panel = tab.dataset.mobilePanel;
      leftPanel.style.display = panel === 'chat' ? 'flex' : 'none';
      middlePanel.style.display = panel === 'code' ? 'flex' : 'none';
      rightPanel.style.display = panel === 'preview' ? 'flex' : 'none';
    });
  });

  // Example clicks
  const examples = view.querySelectorAll('.webs-example-item');
  const input = document.getElementById('websInput');
  examples.forEach(item => {
    item.addEventListener('click', () => {
      if (input) {
        input.value = item.textContent;
        input.focus();
      }
    });
  });

  // Send trigger
  const buildBtn = document.getElementById('websBuildBtn');
  if (buildBtn) {
    buildBtn.addEventListener('click', handleWebsSubmit);
  }
  if (input) {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleWebsSubmit();
      }
    });
  }
}

/**
 * Handle webs build submission
 */
async function handleWebsSubmit() {
  const input = document.getElementById('websInput');
  if (!input) return;
  const text = input.value.trim();
  if (!text || isProcessing) return;

  input.value = '';
  await runWebs(text);
}

/**
 * Core WEBS Pipeline
 */
export async function runWebs(userText) {
  if (isProcessing) return;
  isProcessing = true;

  const chatContainer = document.getElementById('websChatMessages');
  const input = document.getElementById('websInput');
  const buildBtn = document.getElementById('websBuildBtn');

  // Disable controls
  if (input) input.disabled = true;
  if (buildBtn) {
    buildBtn.disabled = true;
    buildBtn.textContent = 'Building...';
  }

  // Remove empty state
  const emptyState = document.getElementById('websEmptyState');
  if (emptyState) emptyState.remove();

  // Create User Message Bubble
  const userDiv = document.createElement('div');
  userDiv.className = 'webs-msg user';
  userDiv.innerHTML = `<div class="webs-msg-content">${escapeHtml(userText)}</div>`;
  chatContainer.appendChild(userDiv);
  scrollToBottom(chatContainer);

  // Active status cards wrapper reset
  const agentCards = document.getElementById('websThinkingPanel');
  if (agentCards) agentCards.style.display = 'block';

  // 1. Strategist Setup
  updateAgentUI(0, 'active', 'Thinking website structure...');
  const strategistPrompt = currentProject 
    ? `You are Agent-1: The Strategist for WEBS.\n\nWe are UPDATING an existing website project.\n\nCurrent HTML Code:\n${currentProject.html}\n\nUser request for modifications:\n"${userText}"\n\nPlan the updates carefully:\n- Describe structure modifications needed\n- Specify content additions or UI improvements\n- Outline style updates (CSS) and script updates (JS)\n\nWrite a clear planning document. NO CODE yet.`
    : `You are Agent-1: The Strategist for WEBS.\n\nUser wants to build: "${userText}"\n\nPlan the complete website structure:\n- Page sections needed\n- Navigation structure\n- Content hierarchy\n- What API integrations needed\n- Overall layout plan\n\nWrite a clear structure plan. NO CODE yet. Be specific and detailed.`;

  let strategistOutput = '';
  try {
    strategistOutput = await streamChat('nvidia/llama-3.3-nemotron-super-49b-v1', [
      { role: 'system', content: strategistPrompt },
      { role: 'user', content: `Start planning details for: ${userText}` }
    ], {
      onChunk: (delta, full) => {
        updateAgentUI(0, 'active', full);
        scrollToBottom(chatContainer);
      }
    });
    updateAgentUI(0, 'done', 'Structure plan completed.');
  } catch (err) {
    console.error('Agent-1 Strategist failed:', err);
    updateAgentUI(0, 'error', `Unavailable: ${err.message}`);
    strategistOutput = 'Fallback: Build simple single page with standard layout.';
  }

  // 2. Analyst Setup
  updateAgentUI(1, 'active', 'Writing base code...');
  const userApiKey = localStorage.getItem(`nvidia_api_key_${Storage.getUserId()}`) || '';
  const analystPrompt = currentProject
    ? `You are Agent-2: The Analyst for WEBS.\n\nWe are UPDATING an existing website.\n\nCurrent HTML Code:\n${currentProject.html}\n\nStrategist planned these changes:\n${strategistOutput}\n\nUser Request: "${userText}"\n\nWrite the updated base HTML structure code incorporating changes. Keep CSS variables consistent. If API integrations are requested, use the user's key: "${userApiKey}". Return full updated base HTML code. ONLY code.`
    : `You are Agent-2: The Analyst for WEBS.\n\nStrategist planned this structure:\n${strategistOutput}\n\nUser Request: "${userText}"\n\nNow write the complete base HTML structure:\n- Semantic HTML5\n- Proper meta tags\n- If user needs API integration, use fetch() calls with base url "https://integrate.api.nvidia.com/v1" and API Key: "${userApiKey}"\n- Add CSS variables for theming\n- Add JS event listeners structure\n\nWrite HTML with inline CSS variables and JS structure. Return full working code.`;

  let analystOutput = '';
  try {
    analystOutput = await streamChat('nvidia/nemotron-3-ultra-550b-a55b', [
      { role: 'system', content: analystPrompt },
      { role: 'user', content: 'Generate base HTML code.' }
    ], {
      onChunk: (delta, full) => {
        updateAgentUI(1, 'active', 'Writing base code: ' + full.slice(0, 100) + '...');
        scrollToBottom(chatContainer);
      }
    });
    updateAgentUI(1, 'done', 'Base HTML code completed.');
  } catch (err) {
    console.error('Agent-2 Analyst failed:', err);
    updateAgentUI(1, 'error', `Unavailable: ${err.message}`);
    analystOutput = currentProject ? currentProject.html : `<!DOCTYPE html><html><head><title>Webs</title></head><body><h1>Base Layout</h1></body></html>`;
  }

  // 3. Creative Setup
  updateAgentUI(2, 'active', 'Enhancing stylesheets & designs...');
  const creativePrompt = `You are Agent-3: The Creative for WEBS.
  
  Take the base HTML and enhance it with modern, stunning styles:
  - Add premium responsive CSS grids and layouts
  - Add gradient backgrounds, modern styling, cards, navbars, and buttons
  - Add micro-interactions, smooth hover transitions, and animations
  - Ensure beautiful dark theme typography and color schemes matching the concept
  
  Base Input Code:
  ${analystOutput}
  
  Return the complete updated HTML with all CSS styles embedded inside a <style> block. Do not write markdown description, return only complete HTML.`;

  let creativeOutput = '';
  try {
    creativeOutput = await streamChat('nvidia/llama-3.3-nemotron-super-49b-v1', [
      { role: 'system', content: creativePrompt },
      { role: 'user', content: 'Apply creative styles to HTML.' }
    ], {
      onChunk: (delta, full) => {
        updateAgentUI(2, 'active', 'Styling UI...');
        scrollToBottom(chatContainer);
      }
    });
    updateAgentUI(2, 'done', 'Stunning design styles applied.');
  } catch (err) {
    console.error('Agent-3 Creative failed:', err);
    updateAgentUI(2, 'error', `Unavailable: ${err.message}`);
    creativeOutput = analystOutput;
  }

  // 4. Devil Setup
  updateAgentUI(3, 'active', 'Reviewing and debugging code...');
  const devilPrompt = `You are Agent-4: The Devil for WEBS.
  
  Review this complete code brutally:
  - Fix any unclosed tags, incorrect tag hierarchy
  - Solve any JS logic or syntax issues, missing event handlers
  - Resolve CSS overlapping bugs or layout breaks
  - Ensure the API calls using NVIDIA key "${userApiKey}" work properly in the scripts
  - Clean up any rendering console blocks
  
  Input HTML:
  ${creativeOutput}
  
  Return the COMPLETE debugged HTML with all issues resolved.`;

  let devilOutput = '';
  try {
    devilOutput = await streamChat('nvidia/nemotron-3-super-120b-a12b', [
      { role: 'system', content: devilPrompt },
      { role: 'user', content: 'Verify and fix all bugs.' }
    ], {
      onChunk: (delta, full) => {
        updateAgentUI(3, 'active', 'Debugging elements...');
        scrollToBottom(chatContainer);
      }
    });
    updateAgentUI(3, 'done', 'Bugs and syntax issues fixed.');
  } catch (err) {
    console.error('Agent-4 Devil failed:', err);
    updateAgentUI(3, 'error', `Unavailable: ${err.message}`);
    devilOutput = creativeOutput;
  }

  // 5. Synthesizer Setup
  updateAgentUI(4, 'active', 'Assembling final page code...');
  const synthPrompt = `You are the Final Synthesizer for WEBS.
  
  Take the reviewed code and package it:
  - Add page loading fade-in layout
  - Clean up formatting and console logs
  - Keep styling completely cohesive
  - Ensure it is a valid single HTML file containing style and script tags
  
  Code Input:
  ${devilOutput}
  
  CRITICAL: Return ONLY the final compiled HTML code starting with <!DOCTYPE html> and ending with </html>. Do not write any explanations.`;

  let synthOutput = '';
  try {
    synthOutput = await streamChat('nvidia/llama-3.3-nemotron-super-49b-v1', [
      { role: 'system', content: synthPrompt },
      { role: 'user', content: 'Output final HTML code.' }
    ], {
      onChunk: (delta, full) => {
        updateAgentUI(4, 'active', 'Generating clean output code...');
        scrollToBottom(chatContainer);
      }
    });
    updateAgentUI(4, 'done', 'Final website compiled successfully.');
  } catch (err) {
    console.error('Agent-5 Synthesizer failed:', err);
    updateAgentUI(4, 'error', `Unavailable: ${err.message}`);
    synthOutput = devilOutput;
  }

  // Parse HTML/CSS/JS and render Preview
  const cleanHtml = extractRawHtml(synthOutput);
  if (cleanHtml) {
    const nextVersion = currentProject ? currentProject.version + 1 : 1;
    const projName = currentProject ? currentProject.name : (userText.slice(0, 30) || 'My Web Project');
    
    currentProject = {
      id: currentProject ? currentProject.id : uuidv4(),
      name: projName,
      html: cleanHtml,
      version: nextVersion
    };

    // Load preview and code tabs
    loadCodeAndPreview(cleanHtml);

    // Save project locally and in Supabase
    Storage.addWebsProject(currentProject);
    await Supabase.saveWebsProject(Storage.getUserId(), currentProject.id, currentProject.name, currentProject.html, currentProject.version);

    // Create assistant message bubble
    const assistantDiv = document.createElement('div');
    assistantDiv.className = 'webs-msg assistant';
    
    let messageText = `✨ **Version ${nextVersion} ready**`;
    if (userApiKey && userText.toLowerCase().includes('ai')) {
      messageText += `\n\n> ⚠️ *Your personal NVIDIA API key is exposed in the front-end code for the fetch() requests. For production deploy, move it to a backend proxy.*`;
    }
    
    assistantDiv.innerHTML = `<div class="webs-msg-content">${renderMarkdown(messageText)}</div>`;
    chatContainer.appendChild(assistantDiv);
    
    // Save to chat log
    chatMessages.push({ role: 'user', content: userText });
    chatMessages.push({ role: 'assistant', content: messageText });
    
    // Save chat log under a standard storage prefix
    Storage.save(KEYS_WEBS_CHAT(currentProject.id), chatMessages);
  } else {
    showToast('Failed to compile valid HTML code', 'error');
  }

  // Reset statuses
  setTimeout(() => {
    for (let i = 0; i < 5; i++) {
      const card = document.getElementById(`webs-agent-${i}`);
      const status = document.getElementById(`webs-status-${i}`);
      if (card) card.className = 'webs-agent-card';
      if (status) status.textContent = 'Waiting...';
    }
    if (agentCards) agentCards.style.display = 'none';
  }, 4000);

  // Enable controls
  if (input) input.disabled = false;
  if (buildBtn) {
    buildBtn.disabled = false;
    buildBtn.textContent = '🌐 Build It';
  }
  isProcessing = false;
  scrollToBottom(chatContainer);
}

/**
 * Update Agent Card class states
 */
function updateAgentUI(idx, state, text) {
  const card = document.getElementById(`webs-agent-${idx}`);
  const status = document.getElementById(`webs-status-${idx}`);

  if (card) {
    card.className = `webs-agent-card ${state}`;
  }
  if (status) {
    status.textContent = text.length > 80 ? text.slice(0, 80) + '...' : text;
  }
}

/**
 * Extract HTML code from response markdown fences
 */
function extractRawHtml(str) {
  let clean = str.trim();
  
  if (clean.includes('```html')) {
    const split = clean.split('```html');
    if (split[1]) {
      clean = split[1].split('```')[0].trim();
    }
  } else if (clean.includes('```')) {
    const split = clean.split('```');
    if (split[1]) {
      clean = split[1].split('```')[0].trim();
    }
  }
  
  if (clean.startsWith('<!DOCTYPE html>') || clean.startsWith('<html')) {
    return clean;
  }
  
  const idx = clean.indexOf('<!DOCTYPE');
  if (idx !== -1) {
    return clean.slice(idx);
  }
  return clean;
}

/**
 * Load HTML, extract CSS/JS and load in iFrame Preview
 */
export function loadCodeAndPreview(htmlCode) {
  const codeHtml = document.getElementById('codeHtml');
  const codeCss = document.getElementById('codeCss');
  const codeJs = document.getElementById('codeJs');
  const iframe = document.getElementById('websPreviewIframe');
  const openBtn = document.getElementById('websOpenBtn');
  const downloadBtn = document.getElementById('websDownloadZipBtn');
  const loader = document.getElementById('websIframeLoader');

  if (!codeHtml || !codeCss || !codeJs || !iframe) return;

  const cssRegex = /<style[^>]*>([\s\S]*?)<\/style>/i;
  const cssMatch = htmlCode.match(cssRegex);
  const cssText = cssMatch ? cssMatch[1].trim() : '/* No explicit style tags found */';

  const jsRegex = /<script[^>]*>([\s\S]*?)<\/script>/gi;
  let jsText = '';
  let match;
  while ((match = jsRegex.exec(htmlCode)) !== null) {
    jsText += (jsText ? '\n\n' : '') + match[1].trim();
  }
  if (!jsText) jsText = '// No explicit script tags found';

  codeHtml.textContent = htmlCode;
  codeCss.textContent = cssText;
  codeJs.textContent = jsText;

  if (typeof window.hljs !== 'undefined') {
    window.hljs.highlightElement(codeHtml);
    window.hljs.highlightElement(codeCss);
    window.hljs.highlightElement(codeJs);
  }

  if (loader) loader.style.display = 'flex';
  iframe.style.opacity = '0';

  setTimeout(() => {
    iframe.srcdoc = htmlCode;
    iframe.onload = () => {
      if (loader) loader.style.display = 'none';
      iframe.style.opacity = '1';
      iframe.style.transition = 'opacity 0.3s ease-in-out';
    };
  }, 400);

  if (openBtn) openBtn.disabled = false;
  if (downloadBtn) downloadBtn.disabled = false;
}

/**
 * Load a saved project
 */
export function loadWebsProject(project) {
  currentProject = project;
  chatMessages = Storage.load(KEYS_WEBS_CHAT(project.id), []);

  const chatContainer = document.getElementById('websChatMessages');
  if (chatContainer) {
    chatContainer.innerHTML = '';
    
    if (chatMessages.length === 0) {
      const emptyDiv = document.createElement('div');
      emptyDiv.className = 'webs-msg assistant';
      emptyDiv.innerHTML = `<div class="webs-msg-content">🌐 Loaded **${project.name}** (Version ${project.version}). You can request modifications in the chat!</div>`;
      chatContainer.appendChild(emptyDiv);
    } else {
      chatMessages.forEach(msg => {
        const div = document.createElement('div');
        div.className = `webs-msg ${msg.role}`;
        div.innerHTML = `<div class="webs-msg-content">${msg.role === 'user' ? escapeHtml(msg.content) : renderMarkdown(msg.content)}</div>`;
        chatContainer.appendChild(div);
      });
    }
    scrollToBottom(chatContainer);
  }

  loadCodeAndPreview(project.html);
}

/**
 * Clear current active webs workspace project
 */
export function createNewWebsProject() {
  currentProject = null;
  chatMessages = [];

  const chatContainer = document.getElementById('websChatMessages');
  if (chatContainer) {
    chatContainer.innerHTML = `
      <div class="webs-empty-state" id="websEmptyState">
        <div class="webs-empty-icon">🌐</div>
        <div class="webs-empty-title">What do you want to build?</div>
        <div class="webs-examples">
          <div class="webs-example-item">Portfolio website for a photographer</div>
          <div class="webs-example-item">Landing page for my tech startup</div>
          <div class="webs-example-item">AI Chatbot UI with dark mode</div>
          <div class="webs-example-item">SaaS Dashboard with chart mockups</div>
        </div>
      </div>
    `;

    const examples = chatContainer.querySelectorAll('.webs-example-item');
    const input = document.getElementById('websInput');
    examples.forEach(item => {
      item.addEventListener('click', () => {
        if (input) {
          input.value = item.textContent;
          input.focus();
        }
      });
    });
  }

  const codeHtml = document.getElementById('codeHtml');
  const codeCss = document.getElementById('codeCss');
  const codeJs = document.getElementById('codeJs');
  const iframe = document.getElementById('websPreviewIframe');
  const openBtn = document.getElementById('websOpenBtn');
  const downloadBtn = document.getElementById('websDownloadZipBtn');

  if (codeHtml) codeHtml.textContent = '<!-- Code will generate here -->';
  if (codeCss) codeCss.textContent = '/* CSS styles extracted from generate */';
  if (codeJs) codeJs.textContent = '// Javascript scripts extracted from generate';
  if (iframe) iframe.srcdoc = '';

  if (openBtn) openBtn.disabled = true;
  if (downloadBtn) downloadBtn.disabled = true;
}

function KEYS_WEBS_CHAT(pid) {
  return `plural_${Storage.getUserId()}_webs_chat_${pid}`;
}

/**
 * Generate standard UUID v4
 */
function uuidv4() {
  return ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
    (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
  );
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
