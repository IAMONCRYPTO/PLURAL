/* ═══════════════════════════════════════════
   PLURAL — Dev Mode Controller
   "We find what you missed."
   ═══════════════════════════════════════════ */

import { streamChat, MODELS } from './api.js';
import { Supabase } from './supabase.js';
import { Storage } from './storage.js';
import { renderMarkdown, scrollToBottom, showToast } from './ui.js';
import { getIcon } from './icons.js';

let isProcessing = false;
let activeReportText = '';
let activeScores = { ux: 0, tech: 0, sec: 0, growth: 0, overall: 0 };
let activeUrl = '';

export function isDevModeProcessing() {
  return isProcessing;
}

export function initDevMode() {
  // Bind run button
  const runBtn = document.getElementById('devRunBtn');
  if (runBtn) {
    runBtn.addEventListener('click', handleRunAnalysis);
  }

  // Bind actions
  const copyBtn = document.getElementById('devCopyBtn');
  if (copyBtn) {
    copyBtn.addEventListener('click', copyReportToClipboard);
  }

  const saveBtn = document.getElementById('devSaveBtn');
  if (saveBtn) {
    saveBtn.addEventListener('click', saveActiveReport);
  }
}

async function handleRunAnalysis() {
  if (isProcessing) return;

  const urlInput = document.getElementById('devUrlInput');
  const codeInput = document.getElementById('devCodeInput');
  const statusLog = document.getElementById('devStatusLog');
  const thinkingPanel = document.getElementById('devThinkingPanel');
  const reportCard = document.getElementById('devReportCard');
  
  const url = urlInput.value.trim();
  const code = codeInput.value.trim();

  if (!url && !code) {
    showToast('Please provide a URL, code, or both.', 'warning');
    return;
  }

  // Set processing state
  isProcessing = true;
  activeReportText = '';
  activeScores = { ux: 0, tech: 0, sec: 0, growth: 0, overall: 0 };
  activeUrl = url;

  // Reset UI
  statusLog.textContent = 'Initializing analysis...';
  statusLog.className = 'dev-status-log info';
  
  // Clear agent panels
  document.querySelectorAll('.dev-agent-card').forEach(card => {
    card.classList.remove('active', 'error');
    const content = card.querySelector('.dev-agent-content');
    if (content) {
      content.textContent = 'Waiting to analyze...';
      content.classList.add('streaming');
    }
  });

  // Hide report card, open thinking
  reportCard.style.display = 'none';
  thinkingPanel.classList.add('open');

  try {
    let websiteContent = 'No website URL provided for this audit.';
    
    // Fetch URL if provided
    if (url) {
      statusLog.textContent = 'Scraping webpage metadata & structure...';
      
      const res = await fetch('/api/fetch-html', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || 'Could not fetch URL. Check if site is public and try again.');
      }

      const meta = await res.json();
      websiteContent = `
URL: ${url}
Title: ${meta.title}
Meta Tags: ${JSON.stringify(meta.metaTags, null, 2)}
Scripts Count: ${meta.scriptCount}
Image Alt Tags: ${JSON.stringify(meta.imageAlts, null, 2)}
Form Inputs/Elements: ${JSON.stringify(meta.formElements, null, 2)}
Stylesheets/Links: ${JSON.stringify(meta.linkRefs, null, 2)}
HTML Skeleton:
${meta.htmlOutline}

Visible Body Text:
${meta.visibleText}
      `.trim();
    }

    const userCode = code || 'No code provided for this audit.';
    const agentOutputs = [];

    // Run Agents sequentially
    const agentConfigs = [
      {
        cardId: 'dev-agent-card-0',
        contentId: 'dev-agent-content-0',
        name: 'UX & Product Strategist',
        model: MODELS.STRATEGIST,
        buildPrompt: () => `You are Agent-1: The UX & Product Strategist.
Perform a deep, thorough, and highly detailed audit of the following website/code for:
- User experience problems
- Navigation issues
- Information architecture problems
- Missing features users would expect
- Conversion killers
- Mobile responsiveness issues

Website content: ${websiteContent}
Code provided: ${userCode}

List every issue you find. Reference exact elements.
Explain it in a super easy, clear, and beginner-friendly way.
Max 8 points.`
      },
      {
        cardId: 'dev-agent-card-1',
        contentId: 'dev-agent-content-1',
        name: 'Technical Analyst',
        model: MODELS.ANALYST,
        buildPrompt: (prev) => `You are Agent-2: The Technical Analyst.
Agent-1 found these UX issues:
${prev[0]}

Perform a deep, thorough, and highly detailed audit for technical problems:
- Broken HTML structure
- Missing meta tags / SEO issues
- Accessibility violations (WCAG)
- Performance red flags
- Console errors visible in code
- Security vulnerabilities in code
- Deprecated or bad code practices
- Missing error handling

Website content: ${websiteContent}
Code provided: ${userCode}

List every technical issue found. Reference exact code lines or elements where possible.
Explain the technical problems in a super simple, easy-to-understand way for non-developers.
Max 8 points.`
      },
      {
        cardId: 'dev-agent-card-2',
        contentId: 'dev-agent-content-2',
        name: 'Growth Analyst',
        model: MODELS.CLONE,
        buildPrompt: (prev) => `You are Agent-3: The Growth Analyst.
Agent-1 found: ${prev[0]}
Agent-2 found: ${prev[1]}

Perform a deep, thorough, and highly detailed audit for:
- Missing growth opportunities
- Features competitors have that this lacks
- Content gaps
- Trust signals missing (testimonials, social proof, badges)
- SEO opportunities being missed
- Copy/messaging improvements
- CTA improvements

Website content: ${websiteContent}
Code provided: ${userCode}

List every opportunity found.
Explain why it matters in a very simple, easy-to-understand way.
Max 8 points.`
      },
      {
        cardId: 'dev-agent-card-3',
        contentId: 'dev-agent-content-3',
        name: "Devil's Advocate",
        model: MODELS.DEVIL,
        buildPrompt: (prev) => `You are Agent-4: The Devil's Advocate.
Agent-1 found: ${prev[0]}
Agent-2 found: ${prev[1]}
Agent-3 found: ${prev[2]}

Find what ALL of them missed by running a deep audit for:
- Critical security vulnerabilities
- Data privacy issues
- Legal compliance problems (GDPR etc)
- Worst case failure scenarios
- Things that would make users leave instantly
- Anything that could get this site hacked

Website content: ${websiteContent}
Code provided: ${userCode}

Be brutally honest but explain the risks in an easy-to-understand layman style. Max 8 points.`
      }
    ];

    for (let i = 0; i < agentConfigs.length; i++) {
      const config = agentConfigs[i];
      const card = document.getElementById(config.cardId);
      const contentEl = document.getElementById(config.contentId);

      statusLog.textContent = `Agent-${i+1} (${config.name}) is analyzing...`;
      card.classList.add('active');
      contentEl.textContent = '';

      const prompt = config.buildPrompt(agentOutputs);
      const messages = [
        { role: 'system', content: prompt },
        { role: 'user', content: 'Begin your PLURAL Dev analysis now.' }
      ];

      try {
        const output = await streamChat(config.model, messages, {
          onChunk: (delta, full) => {
            contentEl.textContent = full;
            scrollToBottom(thinkingPanel);
          },
          onDone: (full) => {
            card.classList.remove('active');
            contentEl.classList.remove('streaming');
            contentEl.innerHTML = renderMarkdown(full);
          },
          onError: (err) => {
            card.classList.remove('active');
            card.classList.add('error');
            contentEl.textContent = `Agent unavailable: ${err.message}`;
          }
        });
        agentOutputs.push(output || '(no response)');
      } catch (err) {
        card.classList.remove('active');
        card.classList.add('error');
        contentEl.textContent = `Agent unavailable: ${err.message}`;
        agentOutputs.push('(agent unavailable)');
      }
    }

     // Run Final Synthesizer
    statusLog.textContent = 'Synthesizing final audit report...';
    const synthPrompt = `You are the Final Synthesizer for PLURAL DEV MODE.
    4 agents have analyzed this website/code:

    Agent-1 (UX Strategist): ${agentOutputs[0]}
    Agent-2 (Technical Analyst): ${agentOutputs[1]}
    Agent-3 (Growth Analyst): ${agentOutputs[2]}
    Agent-4 (Devil's Advocate): ${agentOutputs[3]}

    Create a complete structured audit report.
    IMPORTANT FORMATTING & CONTENT STYLE RULES:
    - The level of explanation must be SUPER EASY, friendly, and very clear (layman terms, no complex jargon). Explain everything so that a complete beginner understands it immediately.
    - Go DEEP and provide thorough, actionable analysis. Identify actual bugs, design flaws, glitches, broken features, and security loopholes from the agent outputs.
    - Use **bold** and bullet points clearly.

    CRITICAL SCORE CALCULATION RULES:
    - DO NOT give generic or safe ratings (like 7.0 for all scores). Each score must be computed dynamically.
    - Calculate realistic, diverse, and accurate ratings based on the actual issues found by the agents.
    - For example: if Agent-2 found critical code warnings/errors, rate Technical low (e.g., 3.5/10 or 4.5/10). If Agent-4 found security loop holes or GDPR non-compliance, rate Security low (e.g., 2.0/10). If the page UX has navigation friction, rate UX low. If the site is close to perfect, rate it high.
    - Output the ratings exactly in this list format:
    - UX: [computed score]/10
    - Technical: [computed score]/10
    - Security: [computed score]/10
    - Growth: [computed score]/10
    - Overall: [computed score]/10

    Audit structure:

    ## Critical Issues (fix immediately)
    [list]

    ## Important Issues (fix soon)
    [list]

    ## Opportunities (improve when possible)
    [list]

    ## Quick Wins (easy fixes, high impact)
    [list]

    ## Overall Score
    Rate the website/code out of 10 on:
    - UX: [computed score]/10
    - Technical: [computed score]/10
    - Security: [computed score]/10
    - Growth: [computed score]/10
    - Overall: [computed score]/10

    ## Top 3 Things To Fix First
    [prioritized action items]`;

    const finalMessages = [
      { role: 'system', content: synthPrompt },
      { role: 'user', content: 'Generate final PLURAL DEV report.' }
    ];

    const finalContentEl = document.getElementById('devFinalReportContent');
    finalContentEl.textContent = '';
    finalContentEl.classList.add('streaming');
    reportCard.style.display = 'block';

    await streamChat(MODELS.SYNTHESIZER, finalMessages, {
      onChunk: (delta, full) => {
        finalContentEl.textContent = full;
        scrollToBottom(thinkingPanel.parentElement);
      },
      onDone: (full) => {
        finalContentEl.classList.remove('streaming');
        finalContentEl.innerHTML = renderMarkdown(full);
        activeReportText = full;
        statusLog.textContent = 'Analysis complete.';
        statusLog.className = 'dev-status-log success';

        // Parse and render scores
        parseAndRenderScores(full);
      },
      onError: (err) => {
        finalContentEl.classList.remove('streaming');
        finalContentEl.textContent = `Synthesizer failed: ${err.message}`;
        statusLog.textContent = 'Synthesis failed.';
        statusLog.className = 'dev-status-log error';
      }
    });

  } catch (err) {
    statusLog.textContent = err.message || 'Analysis failed.';
    statusLog.className = 'dev-status-log error';
  } finally {
    isProcessing = false;
  }
}

function parseAndRenderScores(reportText) {
  const uxMatch = reportText.match(/UX(?:\s*Score)?\**\s*:\s*(\d+(?:\.\d+)?)\s*\/10/i);
  const techMatch = reportText.match(/Tech(?:nical)?(?:\s*Score)?\**\s*:\s*(\d+(?:\.\d+)?)\s*\/10/i);
  const secMatch = reportText.match(/Sec(?:urity)?(?:\s*Score)?\**\s*:\s*(\d+(?:\.\d+)?)\s*\/10/i);
  const growthMatch = reportText.match(/Growth(?:\s*Score)?\**\s*:\s*(\d+(?:\.\d+)?)\s*\/10/i);
  const overallMatch = reportText.match(/Overall(?:\s*Score|Rating)?\**\s*:\s*(\d+(?:\.\d+)?)\s*\/10/i);

  activeScores.ux = uxMatch ? parseFloat(uxMatch[1]) : 8.0;
  activeScores.tech = techMatch ? parseFloat(techMatch[1]) : 7.5;
  activeScores.sec = secMatch ? parseFloat(secMatch[1]) : 8.5;
  activeScores.growth = growthMatch ? parseFloat(growthMatch[1]) : 7.0;
  activeScores.overall = overallMatch ? parseFloat(overallMatch[1]) : 7.8;

  // Set visual progress bars
  setBarValue('dev-ux-bar', activeScores.ux);
  setBarValue('dev-tech-bar', activeScores.tech);
  setBarValue('dev-sec-bar', activeScores.sec);
  setBarValue('dev-growth-bar', activeScores.growth);

  // Set overall value
  const overallEl = document.getElementById('devOverallValue');
  if (overallEl) {
    overallEl.textContent = `${activeScores.overall.toFixed(1)}/10`;
  }
}

function setBarValue(elementId, score) {
  const bar = document.getElementById(elementId);
  if (!bar) return;
  const pct = (score / 10) * 100;
  bar.style.width = `${pct}%`;
  
  // Update inner text value
  const valSpan = bar.parentElement.previousElementSibling.querySelector('.dev-score-num');
  if (valSpan) {
    valSpan.textContent = `${score.toFixed(1)}/10`;
  }
}

async function copyReportToClipboard() {
  if (!activeReportText) return;
  try {
    await navigator.clipboard.writeText(activeReportText);
    showToast('Report copied to clipboard', 'success');
  } catch (err) {
    showToast('Could not copy report', 'error');
  }
}

async function saveActiveReport() {
  if (!activeReportText) return;
  const userId = Storage.getUserId();
  if (userId === 'anonymous') {
    showToast('Please log in to save audits.', 'warning');
    return;
  }

  showToast('Saving audit report...', 'info');

  try {
    await Supabase.saveDevReport(userId, activeUrl, activeReportText, activeScores);
    showToast('Report saved successfully', 'success');
    await loadDevReports();
  } catch (err) {
    showToast(`Save failed: ${err.message}`, 'error');
  }
}

export async function loadDevReports() {
  const listEl = document.getElementById('devPastReportsList');
  if (!listEl) return;

  const userId = Storage.getUserId();
  if (userId === 'anonymous') {
    listEl.innerHTML = `<div style="padding: 12px; font-size: 13px; color: var(--text-dim);">Login to see past audits</div>`;
    return;
  }

  try {
    const reports = await Supabase.fetchDevReports();
    if (reports.length === 0) {
      listEl.innerHTML = `<div style="padding: 12px; font-size: 13px; color: var(--text-dim);">No past audits yet</div>`;
      return;
    }

    listEl.innerHTML = reports.map(r => {
      const date = new Date(r.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      const label = r.url ? r.url.replace(/^https?:\/\/(www\.)?/, '').slice(0, 22) + (r.url.length > 22 ? '...' : '') : 'Code Only Analysis';
      return `
        <div class="dev-report-item" data-report-id="${r.id}">
          <div class="dev-report-item-info">
            <span class="dev-report-item-title">${label}</span>
            <span class="dev-report-item-date">${date}</span>
          </div>
          <button class="dev-report-item-delete" data-del-id="${r.id}">${getIcon('close')}</button>
        </div>
      `;
    }).join('');

    // Bind item click
    listEl.querySelectorAll('.dev-report-item').forEach(item => {
      item.addEventListener('click', async (e) => {
        if (e.target.closest('.dev-report-item-delete')) return;
        const reportId = item.dataset.reportId;
        const report = reports.find(r => r.id === reportId);
        if (report) {
          loadSavedReportIntoUI(report);
        }
      });
    });

    // Bind delete click
    listEl.querySelectorAll('.dev-report-item-delete').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const reportId = btn.dataset.delId;
        try {
          await Supabase.deleteDevReport(reportId);
          showToast('Audit report deleted', 'success');
          await loadDevReports();
        } catch (err) {
          showToast(`Delete failed: ${err.message}`, 'error');
        }
      });
    });

  } catch (err) {
    console.error('Failed to fetch dev reports:', err.message);
  }
}

function loadSavedReportIntoUI(report) {
  const thinkingPanel = document.getElementById('devThinkingPanel');
  const reportCard = document.getElementById('devReportCard');
  const finalContentEl = document.getElementById('devFinalReportContent');
  const statusLog = document.getElementById('devStatusLog');
  
  // Set values
  activeReportText = report.report;
  activeScores = report.scores || { ux: 7, tech: 7, sec: 7, growth: 7, overall: 7 };
  activeUrl = report.url || '';

  // Set Inputs
  document.getElementById('devUrlInput').value = report.url || '';
  document.getElementById('devCodeInput').value = '';

  // Update Status
  statusLog.textContent = 'Loaded past audit report.';
  statusLog.className = 'dev-status-log success';

  // Hide thinking panel, show report card
  thinkingPanel.classList.remove('open');
  reportCard.style.display = 'block';

  // Set markdown content
  finalContentEl.innerHTML = renderMarkdown(report.report);

  // Set Visual Bars
  setBarValue('dev-ux-bar', activeScores.ux || 7);
  setBarValue('dev-tech-bar', activeScores.tech || 7);
  setBarValue('dev-sec-bar', activeScores.sec || 7);
  setBarValue('dev-growth-bar', activeScores.growth || 7);

  const overallEl = document.getElementById('devOverallValue');
  if (overallEl) {
    overallEl.textContent = `${(activeScores.overall || 7).toFixed(1)}/10`;
  }
}
