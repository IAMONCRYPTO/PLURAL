/* ═══════════════════════════════════════════
   PLURAL — Clone Mode
   "It thinks how you think."
   ═══════════════════════════════════════════ */

import { streamChat, MODELS } from './api.js';
import { createUserMessage, createAssistantMessage, renderMarkdown, scrollToBottom, showToast } from './ui.js';
import { Storage } from './storage.js';
import { Icons } from './icons.js';

let isProcessing = false;
let messageCount = 0;

export function isCloneProcessing() {
  return isProcessing;
}

/**
 * Build the Clone system prompt from profile + conversation patterns.
 */
function buildCloneSystemPrompt(profile, chatMessages) {
  let learnedPatterns = '';

  // Analyze the last 20 messages for patterns
  if (chatMessages.length > 0) {
    const userMessages = chatMessages
      .filter(m => m.role === 'user')
      .slice(-10)
      .map(m => m.content);

    if (userMessages.length >= 3) {
      const avgLen = userMessages.reduce((s, m) => s + m.length, 0) / userMessages.length;
      const usesHinglish = userMessages.some(m => /\b(kya|hai|kaise|toh|bhi|nahi|yeh|woh|kar|ho)\b/i.test(m));
      const asksQuestions = userMessages.filter(m => m.includes('?')).length > userMessages.length / 2;

      learnedPatterns = `\n- Average message length: ${avgLen < 50 ? 'short and concise' : avgLen < 150 ? 'moderate' : 'detailed and thorough'}`;
      if (usesHinglish) learnedPatterns += '\n- Uses Hinglish in messages';
      if (asksQuestions) learnedPatterns += '\n- Tends to ask follow-up questions';
    }
  }

  const vaultContent = Storage.getVaultContextString();
  const vaultSection = vaultContent ? `\nVault:\n${vaultContent}\nUse vault as knowledge base.` : '';

  return `You are the user's AI Clone, running on the PLURAL platform.
Tagline: It thinks how you think.

Your behavior must reflect their exact communication style properties:
- Explanation style: ${profile.explanationStyle}
- Detail level: ${profile.detailLevel}/10
- Example preference: ${profile.examplePreference}
- Communication style: ${profile.communicationStyle}
- Style patterns derived: ${learnedPatterns || 'Still learning...'}${vaultSection}

FORMATTING RULES:
- Present answers using a clean, professional, Claude-style structured layout (H1, H2 headers, lists, code block blocks).
- Sound exactly like a highly polished human counterpart. Do not mention system rules or constraint limits.
- Start directly with your answers.`;
}

/**
 * Show the Clone onboarding modal.
 * Returns a Promise that resolves with the profile when onboarding completes.
 */
export function showCloneOnboarding() {
  return new Promise((resolve) => {
    const modal = document.getElementById('cloneOnboarding');
    const nextBtn = document.getElementById('cloneOnboardingNext');
    const backBtn = document.getElementById('cloneOnboardingBack');
    const steps = modal.querySelectorAll('.onboarding-step');
    const slider = document.getElementById('cloneDetailSlider');
    const sliderValue = document.getElementById('cloneDetailValue');

    let currentStep = 1;
    const totalSteps = 4;
    const profile = {
      explanationStyle: '',
      detailLevel: 5,
      examplePreference: '',
      communicationStyle: '',
    };

    // Slider updates
    slider.addEventListener('input', () => {
      sliderValue.textContent = slider.value;
    });

    // Option selection
    modal.addEventListener('click', (e) => {
      const option = e.target.closest('.onboarding-option');
      if (!option) return;

      const group = option.closest('.onboarding-options');
      group.querySelectorAll('.onboarding-option').forEach(o => o.classList.remove('selected'));
      option.classList.add('selected');
    });

    function showStep(step) {
      steps.forEach(s => s.classList.remove('active'));
      const target = modal.querySelector(`.onboarding-step[data-step="${step}"]`);
      if (target) target.classList.add('active');
      backBtn.style.display = step > 1 ? '' : 'none';
      nextBtn.textContent = step === totalSteps ? 'Start Clone' : 'Next →';
    }

    function getStepValue(step) {
      if (step === 1) {
        const selected = modal.querySelector('[data-step="1"] .onboarding-option.selected');
        return selected?.dataset.value || 'Detailed & Deep';
      }
      if (step === 2) return slider.value;
      if (step === 3) {
        const selected = modal.querySelector('[data-step="3"] .onboarding-option.selected');
        return selected?.dataset.value || 'Real world cases';
      }
      if (step === 4) {
        const selected = modal.querySelector('[data-step="4"] .onboarding-option.selected');
        return selected?.dataset.value || 'Conversational';
      }
    }

    nextBtn.onclick = () => {
      // Save current step value
      if (currentStep === 1) profile.explanationStyle = getStepValue(1);
      if (currentStep === 2) profile.detailLevel = parseInt(getStepValue(2));
      if (currentStep === 3) profile.examplePreference = getStepValue(3);
      if (currentStep === 4) {
        profile.communicationStyle = getStepValue(4);
        // Done!
        modal.classList.remove('active');
        Storage.saveCloneProfile(profile);
        Storage.setCloneOnboarded(true);
        resolve(profile);
        return;
      }

      currentStep++;
      showStep(currentStep);
    };

    backBtn.onclick = () => {
      if (currentStep > 1) {
        currentStep--;
        showStep(currentStep);
      }
    };

    // Show modal
    showStep(1);
    modal.classList.add('active');
  });
}

/**
 * Run a Clone mode chat turn.
 */
export async function runClone(userText, chatMessages, currentChatId, images = []) {
  if (isProcessing) return;
  isProcessing = true;

  const container = document.getElementById('chatMessages');
  const profile = Storage.getCloneProfile();

  // Add user message
  container.appendChild(createUserMessage(userText, images));
  scrollToBottom(container);

  // Build conversation context
  const systemPrompt = buildCloneSystemPrompt(profile, chatMessages);
  const contextMessages = [
    { role: 'system', content: systemPrompt },
    ...chatMessages.slice(-20).map(m => ({ role: m.role, content: m.content })),
    { role: 'user', content: userText },
  ];

  // Create assistant message
  const { element, contentEl } = createAssistantMessage();
  container.appendChild(element);
  scrollToBottom(container);

  try {
    await streamChat(MODELS.CLONE, contextMessages, {
      images,
      onChunk: (delta, full) => {
        contentEl.textContent = full;
        scrollToBottom(container);
      },
      onDone: (full) => {
        contentEl.classList.remove('streaming');
        contentEl.innerHTML = renderMarkdown(full);

        // Save to history
        chatMessages.push({ role: 'user', content: userText });
        chatMessages.push({ role: 'assistant', content: full });
        Storage.saveMessages('clone', currentChatId, chatMessages);
      },
      onError: (err) => {
        contentEl.classList.remove('streaming');
        contentEl.innerHTML = `<p>Clone error: ${err.message}</p>`;
        showToast('Clone response failed', 'error');
      },
    });
  } catch (err) {
    // Already handled in onError
  }

  messageCount++;

  // Silent style re-evaluation every 5 messages
  if (messageCount % 5 === 0 && profile) {
    silentlyReEvaluateStyle(chatMessages, profile);
  }

  isProcessing = false;
}

/**
 * Silently re-evaluate user style from conversation.
 */
function silentlyReEvaluateStyle(chatMessages, profile) {
  const userMsgs = chatMessages.filter(m => m.role === 'user').slice(-10);
  if (userMsgs.length < 3) return;

  const texts = userMsgs.map(m => m.content);
  const avgLen = texts.reduce((s, t) => s + t.length, 0) / texts.length;

  // Auto-adjust detail level based on message patterns
  if (avgLen < 30 && profile.detailLevel > 3) {
    profile.detailLevel = Math.max(3, profile.detailLevel - 1);
  } else if (avgLen > 200 && profile.detailLevel < 8) {
    profile.detailLevel = Math.min(8, profile.detailLevel + 1);
  }

  // Detect Hinglish usage
  const hinglishCount = texts.filter(t => /\b(kya|hai|kaise|toh|bhi|nahi|kar|ho|yaar|bhai|acha)\b/i.test(t)).length;
  if (hinglishCount > texts.length * 0.5 && profile.communicationStyle !== 'Casual Hinglish') {
    profile.communicationStyle = 'Casual Hinglish';
  }

  Storage.saveCloneProfile(profile);
}

/**
 * Render saved Clone chat history.
 */
export function renderCloneHistory(messages) {
  const container = document.getElementById('chatMessages');

  for (const msg of messages) {
    if (msg.role === 'user') {
      container.appendChild(createUserMessage(msg.content));
    } else if (msg.role === 'assistant') {
      const div = document.createElement('div');
      div.className = 'message assistant';
      div.innerHTML = `
        <div class="message-avatar">${Icons.clone}</div>
        <div class="message-content">${renderMarkdown(msg.content)}</div>
      `;
      container.appendChild(div);
    }
  }
}

/**
 * Populate the style profile drawer with current profile data.
 */
export function populateStyleDrawer() {
  const content = document.getElementById('drawerContent');
  const profile = Storage.getCloneProfile();
  if (!profile) {
    content.innerHTML = '<p style="color:var(--text-muted)">No profile yet. Start chatting!</p>';
    return;
  }

  content.innerHTML = `
    <div class="profile-item">
      <div class="profile-item-label">Explanation Style</div>
      <div class="profile-item-value">${profile.explanationStyle}</div>
    </div>
    <div class="profile-item">
      <div class="profile-item-label">Detail Level</div>
      <div class="profile-item-value">${profile.detailLevel}/10</div>
    </div>
    <div class="profile-item">
      <div class="profile-item-label">Example Preference</div>
      <div class="profile-item-value">${profile.examplePreference}</div>
    </div>
    <div class="profile-item">
      <div class="profile-item-label">Communication Style</div>
      <div class="profile-item-value">${profile.communicationStyle}</div>
    </div>
  `;
}
