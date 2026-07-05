/* ═══════════════════════════════════════════
   PLURAL — Twin Mode
   "You, but smarter."
   ═══════════════════════════════════════════ */

import { streamChat, MODELS } from './api.js';
import { createUserMessage, createAssistantMessage, renderMarkdown, scrollToBottom, showToast, createSourcesContainer } from './ui.js';
import { Storage } from './storage.js';
import { Icons } from './icons.js';

let isProcessing = false;
let twinActive = false;

export function isTwinProcessing() {
  return isProcessing;
}

export function isTwinActive() {
  return twinActive;
}

export function setTwinActive(val) {
  twinActive = val;
}

/**
 * Build the Twin system prompt.
 */
function buildTwinSystemPrompt(profile, chatMessages) {
  const historySnippets = chatMessages
    .slice(-15)
    .map(m => `${m.role === 'user' ? 'User' : 'Twin'}: ${m.content.slice(0, 100)}`)
    .join('\n');

  return `You are the user's AI Twin, running on the PLURAL platform.
Tagline: You, but smarter.
You are NOT a simple assistant. You are their second, smarter brain.
You challenge conventional arguments, analyze flaws, and act as a critical sounding board.
You remember details from this conversation and write in a deep, analytical, human-like structure (similar to Claude's response patterns).

Your parameters:
- Honesty & Brutal Critique Level: ${profile?.honestyLevel ?? 7}/10
- Profession/Domain/Field: ${profile?.profession || 'Not shared yet'}
- Main user goal: ${profile?.goal || 'Not shared yet'}
- User struggle points: ${profile?.struggle || 'Not shared yet'}
- Preferred communication style: ${profile?.commStyle || 'Not shared yet'}

Recent context history:
${historySnippets || '(fresh conversation)'}

FORMATTING RULES:
- Use H1/H2 headlines, lists, and bold highlights for structure.
- Never write meta-talk or fluff like "I am your AI Twin...". Speak directly, critically, and cleanly.`;
}

/**
 * Show the Twin onboarding modal.
 * Returns a Promise that resolves with the profile, or rejects if "Maybe Later".
 */
export function showTwinOnboarding() {
  return new Promise((resolve, reject) => {
    const modal = document.getElementById('twinOnboarding');
    const enableBtn = document.getElementById('twinOnboardingEnable');
    const laterBtn = document.getElementById('twinOnboardingLater');
    const stepNextBtn = document.getElementById('twinOnboardingStepNext');
    const stepBackBtn = document.getElementById('twinOnboardingStepBack');
    const stepActions = document.getElementById('twinStepActions');
    const steps = modal.querySelectorAll('.onboarding-step');
    const honestySlider = document.getElementById('twinHonestySlider');
    const honestyValue = document.getElementById('twinHonestyValue');

    let currentStep = 0;
    const profile = { goal: '', struggle: '', profession: '', commStyle: '', honestyLevel: 7 };

    honestySlider.addEventListener('input', () => {
      honestyValue.textContent = honestySlider.value;
    });

    function showStep(step) {
      steps.forEach(s => s.classList.remove('active'));
      const target = modal.querySelector(`.onboarding-step[data-step="${step}"]`);
      if (target) target.classList.add('active');

      if (step === 0) {
        stepActions.style.display = 'none';
      } else {
        stepActions.style.display = '';
        stepBackBtn.style.display = step > 1 ? '' : 'none';
        stepNextBtn.textContent = step === 5 ? 'Activate Twin' : 'Next →';
      }
    }

    laterBtn.onclick = () => {
      modal.classList.remove('active');
      reject(new Error('later'));
    };

    enableBtn.onclick = () => {
      currentStep = 1;
      showStep(1);
    };

    stepNextBtn.onclick = () => {
      if (currentStep === 1) {
        profile.goal = document.getElementById('twinGoal').value.trim() || 'Explore and grow';
      }
      if (currentStep === 2) {
        profile.struggle = document.getElementById('twinStruggle').value.trim() || 'Not shared';
      }
      if (currentStep === 3) {
        profile.profession = document.getElementById('twinProfession').value.trim() || 'Not shared';
      }
      if (currentStep === 4) {
        profile.commStyle = document.getElementById('twinCommStyle').value.trim() || 'Not shared';
      }
      if (currentStep === 5) {
        profile.honestyLevel = parseInt(honestySlider.value);
        // Done!
        modal.classList.remove('active');
        Storage.saveTwinProfile(profile);
        Storage.setTwinOnboarded(true);
        resolve(profile);
        return;
      }

      currentStep++;
      showStep(currentStep);
    };

    stepBackBtn.onclick = () => {
      if (currentStep > 1) {
        currentStep--;
        showStep(currentStep);
      }
    };

    showStep(0);
    modal.classList.add('active');
  });
}

/**
 * Run a Twin mode chat turn.
 */
export async function runTwin(userText, chatMessages, currentChatId, images = [], searchContext = null, searchResults = []) {
  if (isProcessing) return;
  isProcessing = true;

  const container = document.getElementById('chatMessages');
  const profile = Storage.getTwinProfile();

  // Add user message
  container.appendChild(createUserMessage(userText, images));
  scrollToBottom(container);

  // Build conversation context
  const systemPrompt = buildTwinSystemPrompt(profile, chatMessages);
  
  let userPrompt = userText;
  if (searchContext) {
    userPrompt = `[Web Search Context]\n${searchContext}\n\nUser Question: ${userText}`;
  }

  const contextMessages = [
    { role: 'system', content: systemPrompt },
    ...chatMessages.slice(-20).map(m => ({ role: m.role, content: m.content })),
    { role: 'user', content: userPrompt },
  ];

  // Create assistant message
  const { element, contentEl } = createAssistantMessage();
  // Twin uses brain SVG avatar
  element.querySelector('.message-avatar').innerHTML = Icons.twin;
  container.appendChild(element);
  scrollToBottom(container);

  try {
    await streamChat(MODELS.TWIN, contextMessages, {
      images,
      onChunk: (delta, full) => {
        contentEl.textContent = full;
        scrollToBottom(container);
      },
      onDone: (full) => {
        contentEl.classList.remove('streaming');
        contentEl.innerHTML = renderMarkdown(full);

        // Render search citations if available
        if (searchResults && searchResults.length > 0) {
          const sourcesContainer = createSourcesContainer(searchResults);
          if (sourcesContainer) {
            contentEl.appendChild(sourcesContainer);
            scrollToBottom(container);
          }
        }

        // Save to history
        chatMessages.push({ role: 'user', content: userText });
        chatMessages.push({ 
          role: 'assistant', 
          content: full,
          sources: searchResults && searchResults.length > 0 ? searchResults : undefined
        });
        Storage.saveMessages('council', currentChatId, chatMessages);
      },
      onError: (err) => {
        contentEl.classList.remove('streaming');
        contentEl.innerHTML = `<p>Twin error: ${err.message}</p>`;
        showToast('Twin response failed', 'error');
      },
    });
  } catch (err) {
    // Already handled
  }

  isProcessing = false;
}

/**
 * Send the initial Twin greeting.
 */
export function sendTwinGreeting(chatMessages, currentChatId) {
  const container = document.getElementById('chatMessages');
  const greeting = "I am your AI Twin. I don't know anything about you yet, but I will. Let's talk.";

  const div = document.createElement('div');
  div.className = 'message assistant';
  div.innerHTML = `
    <div class="message-avatar">${Icons.twin}</div>
    <div class="message-content">${greeting}</div>
  `;
  container.appendChild(div);
  scrollToBottom(container);

  chatMessages.push({ role: 'assistant', content: greeting });
  Storage.saveMessages('council', currentChatId, chatMessages);
}

/**
 * Render saved Twin chat history.
 */
export function renderTwinHistory(messages) {
  const container = document.getElementById('chatMessages');

  for (const msg of messages) {
    if (msg.role === 'user') {
      container.appendChild(createUserMessage(msg.content));
    } else if (msg.role === 'assistant') {
      const div = document.createElement('div');
      div.className = 'message assistant';
      div.innerHTML = `
        <div class="message-avatar">${Icons.twin}</div>
        <div class="message-content">${renderMarkdown(msg.content)}</div>
      `;
      
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
