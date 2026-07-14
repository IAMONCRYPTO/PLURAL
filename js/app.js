/* ═══════════════════════════════════════════
   PLURAL — Main App Controller
   "Think Plural."
   ═══════════════════════════════════════════ */

import { Storage } from './storage.js';
import { Supabase } from './supabase.js';
import { initSidebar, setActiveMode, updateChatList } from './sidebar.js';
import { runCouncil, renderCouncilHistory, isCouncilProcessing } from './council.js';
import { runClone, renderCloneHistory, showCloneOnboarding, isCloneProcessing, populateStyleDrawer } from './clone.js';
import { runTwin, renderTwinHistory, showTwinOnboarding, sendTwinGreeting, isTwinProcessing, isTwinActive, setTwinActive } from './twin.js';
import { createWelcomeScreen, scrollToBottom, autoResizeTextarea, showToast, renderMarkdown, createUserMessage, createAssistantMessage } from './ui.js';
import { streamChat, MODELS } from './api.js';
import { initDevMode, loadDevReports } from './dev.js';
import { Icons, getIcon } from './icons.js';
import { initLanding } from './landing.js';


/* ─── State ────────────────────────────────── */
let currentMode = 'council';
let currentChatId = null;
let chatMessages = [];
let vaultChatMessages = [];
let isInitialLoad = true;

/* ─── DOM Refs ─────────────────────────────── */
const appLayout          = document.getElementById('appLayout');
const chatContainer   = document.getElementById('chatMessages');
const messageInput    = document.getElementById('messageInput');
const sendBtn         = document.getElementById('sendBtn');
const modeTitle       = document.getElementById('modeTitle');
const modeSubtitle    = document.getElementById('modeSubtitle');
const modeBadges      = document.getElementById('modeBadges');
const twinToggleBar      = document.getElementById('twinToggleBar');
const twinToggleCheckbox = document.getElementById('twinToggleCheckbox');
const twinActiveBadge    = document.getElementById('twinActiveBadge');
const styleProfileBtn = document.getElementById('styleProfileBtn');
const settingsModal = document.getElementById('settingsModal');
const settingsName = document.getElementById('settingsName');
const settingsLang = document.getElementById('settingsLang');
const settingsApiKey = document.getElementById('settingsApiKey');
const settingsCloseBtn = document.getElementById('settingsCloseBtn');
const settingsSaveBtn = document.getElementById('settingsSaveBtn');
const btnSettingsGuideToggle = document.getElementById('btnSettingsGuideToggle');
const settingsGuideContent = document.getElementById('settingsGuideContent');
const settingsBtn = document.getElementById('settingsBtn');
const headerSettingsBtn = document.getElementById('headerSettingsBtn');
const drawerOverlay   = document.getElementById('drawerOverlay');
const drawer          = document.getElementById('styleProfileDrawer');
const drawerClose     = document.getElementById('drawerClose');

/* ─── Image Upload Refs ────────────────────── */
const imageAttachBtn    = document.getElementById('imageAttachBtn');
const imageFileInput    = document.getElementById('imageFileInput');
const imagePreviewStrip = document.getElementById('imagePreviewStrip');
const webSearchToggleBtn = document.getElementById('webSearchToggleBtn');
let isWebSearchEnabled = false;
const imageLightbox     = document.getElementById('imageLightbox');
let pendingImages = []; // Array of base64 data URLs

/* ─── Auth Refs ────────────────────────────── */
const authScreen       = document.getElementById('authScreen');
const authForm         = document.getElementById('authForm');
const authEmail        = document.getElementById('authEmail');
const authPassword     = document.getElementById('authPassword');
const authErrorMsg     = document.getElementById('authErrorMsg');
const authInfoMsg      = document.getElementById('authInfoMsg');
const loginBtn         = document.getElementById('loginBtn');
const signupBtn        = document.getElementById('signupBtn');
const logoutBtn        = document.getElementById('logoutBtn');
const userEmailDisplay = document.getElementById('userEmailDisplay');

/* ─── Vault Refs ───────────────────────────── */
const chatView              = document.getElementById('chatView');
const vaultView             = document.getElementById('vaultView');
const devModeView           = document.getElementById('devModeView');
const vaultAddPdfBtn        = document.getElementById('vaultAddPdfBtn');
const vaultPdfInput         = document.getElementById('vaultPdfInput');
const vaultAddUrlBtn        = document.getElementById('vaultAddUrlBtn');
const vaultAddNoteBtn       = document.getElementById('vaultAddNoteBtn');
const vaultFormContainer    = document.getElementById('vaultFormContainer');
const vaultUrlForm          = document.getElementById('vaultUrlForm');
const vaultUrlInput         = document.getElementById('vaultUrlInput');
const vaultConfirmUrlBtn    = document.getElementById('vaultConfirmUrlBtn');
const vaultCancelUrlBtn     = document.getElementById('vaultCancelUrlBtn');
const vaultNoteForm         = document.getElementById('vaultNoteForm');
const vaultNoteInput        = document.getElementById('vaultNoteInput');
const vaultConfirmNoteBtn   = document.getElementById('vaultConfirmNoteBtn');
const vaultCancelNoteBtn    = document.getElementById('vaultCancelNoteBtn');
const vaultStatusLog        = document.getElementById('vaultStatusLog');
const vaultCount            = document.getElementById('vaultCount');
const vaultItemsList        = document.getElementById('vaultItemsList');
const vaultStatusBadge      = document.getElementById('vaultStatusBadge');
const vaultChatMessagesDiv  = document.getElementById('vaultChatMessages');
const vaultMessageInput     = document.getElementById('vaultMessageInput');
const vaultSendBtn          = document.getElementById('vaultSendBtn');

/* ═══════════════════════════════════════════
   PREMIUM INTERACTION UTILITIES (3D & RIPPLES)
   ═══════════════════════════════════════════ */

function init3DMessagePhysics(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.addEventListener('mousemove', (e) => {
    const bubble = e.target.closest('.message-content');
    if (!bubble) return;

    const rect = bubble.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    // Calculate rotation angles (max tilt 10 degrees)
    const rotateX = ((centerY - y) / centerY) * 10;
    const rotateY = ((x - centerX) / centerX) * 10;

    bubble.style.transform = `translateY(-6px) translateZ(35px) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;
  });

  container.addEventListener('mouseleave', (e) => {
    const bubble = e.target.closest('.message-content');
    if (bubble) bubble.style.transform = '';
  });
}

function initRippleEffect() {
  document.body.addEventListener('click', (e) => {
    const target = e.target.closest('button, .chat-item, .mode-btn, .new-chat-btn');
    if (!target) return;

    const ripple = document.createElement('span');
    ripple.className = 'ripple-effect';
    
    const rect = target.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    ripple.style.left = `${x}px`;
    ripple.style.top = `${y}px`;
    
    target.style.position = 'relative';
    target.style.overflow = 'hidden';
    target.appendChild(ripple);
    
    setTimeout(() => {
      ripple.remove();
    }, 600);
  });
}

/* ═══════════════════════════════════════════
   INITIALIZATION
   ═══════════════════════════════════════════ */

function init() {
  // Initialize Landing Page
  initLanding();

  // Initialize 3D Message Physics & Tactile Ripple Effects
  init3DMessagePhysics('chatMessages');
  init3DMessagePhysics('vaultChatMessages');
  initRippleEffect();

  // Share to X click handler
  const bindShareToX = (containerId) => {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.addEventListener('click', (e) => {
      const btn = e.target.closest('.share-to-x-btn');
      if (!btn) return;

      const messageEl = btn.closest('.message') || btn.closest('.final-answer') || btn.closest('.council-response-wrapper');
      if (!messageEl) return;

      const contentEl = messageEl.querySelector('.message-content') || messageEl.querySelector('.final-answer-content');
      if (!contentEl) return;

      const textOnly = contentEl.innerText.replace(/Share\s*$/i, '').trim();
      const truncated = textOnly.length > 180 ? textOnly.slice(0, 177) + '...' : textOnly;

      const tweetText = `Plural AI Council synthesis:\n\n"${truncated}"\n\n`;
      const tweetUrl = `https://x.com/intent/tweet?text=${encodeURIComponent(tweetText)}&url=${encodeURIComponent('https://x.com/eth_ansh')}`;
      window.open(tweetUrl, '_blank');
    });
  };

  bindShareToX('chatMessages');
  bindShareToX('vaultChatMessages');

  // Initialize sidebar
  initSidebar({
    onMode: handleModeChange,
    onChat: handleChatSelect,
    onNew:  handleNewChat,
  });

  // Input handling (normal chat)
  messageInput.addEventListener('input', () => {
    autoResizeTextarea(messageInput);
    sendBtn.disabled = !messageInput.value.trim() && pendingImages.length === 0;
  });

  messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  });

  sendBtn.addEventListener('click', handleSend);

  // Twin toggle
  if (twinToggleCheckbox) {
    twinToggleCheckbox.addEventListener('change', handleTwinToggle);
  }

  // Web search toggle
  if (webSearchToggleBtn) {
    isWebSearchEnabled = localStorage.getItem('isWebSearchEnabled') === 'true';
    if (isWebSearchEnabled) {
      webSearchToggleBtn.classList.add('active');
    }
    webSearchToggleBtn.addEventListener('click', () => {
      isWebSearchEnabled = !isWebSearchEnabled;
      localStorage.setItem('isWebSearchEnabled', isWebSearchEnabled);
      webSearchToggleBtn.classList.toggle('active', isWebSearchEnabled);
      showToast(isWebSearchEnabled ? 'Web Search Enabled' : 'Web Search Disabled', 'info');
    });
  }

  // Style profile drawer
  styleProfileBtn.addEventListener('click', openStyleDrawer);
  drawerClose.addEventListener('click', closeStyleDrawer);
  drawerOverlay.addEventListener('click', closeStyleDrawer);

  // ── Theme Switcher Setup ──
  const themeToggleBtn = document.getElementById('themeToggleBtn');
  
  const setTheme = (theme) => {
    const root = document.documentElement;
    const logoImgs = document.querySelectorAll('.landing-logo-img, .sidebar-brand-img, .auth-logo-img');
    
    if (theme === 'dark') {
      root.classList.add('theme-amoled');
      localStorage.setItem('plural_theme', 'dark');
      if (themeToggleBtn) {
        themeToggleBtn.querySelector('.moon-path').style.display = 'none';
        themeToggleBtn.querySelector('.sun-circle').style.display = 'block';
        themeToggleBtn.querySelectorAll('.sun-line').forEach(l => l.style.display = 'block');
        themeToggleBtn.title = 'Switch to Cosmic Theme';
      }
      logoImgs.forEach(img => {
        img.src = 'assets/logo-white.png';
      });
    } else {
      root.classList.remove('theme-amoled');
      localStorage.setItem('plural_theme', 'cosmic');
      if (themeToggleBtn) {
        themeToggleBtn.querySelector('.moon-path').style.display = 'block';
        themeToggleBtn.querySelector('.sun-circle').style.display = 'none';
        themeToggleBtn.querySelectorAll('.sun-line').forEach(l => l.style.display = 'none');
        themeToggleBtn.title = 'Switch to AMOLED Dark Theme';
      }
      logoImgs.forEach(img => {
        img.src = 'assets/logo-primary.png';
      });
    }
  };

  const initTheme = () => {
    const savedTheme = localStorage.getItem('plural_theme') || 'cosmic';
    setTheme(savedTheme);
  };

  if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', () => {
      const currentTheme = localStorage.getItem('plural_theme') || 'cosmic';
      const nextTheme = currentTheme === 'cosmic' ? 'dark' : 'cosmic';
      setTheme(nextTheme);
      showToast(`${nextTheme === 'dark' ? 'AMOLED Dark' : 'Cosmic Dark'} Theme Activated`, 'info');
    });
  }

  initTheme();

  // Settings modal toggle
  const openSettings = async () => {
    const session = await Supabase.getSession();
    if (!session || !session.user) {
      showToast('You must be logged in to view settings', 'warning');
      return;
    }
    
    // Populate settings from session user metadata or local storage
    const user = session.user;
    const metadata = user.user_metadata || {};
    
    settingsName.value = metadata.name || '';
    settingsLang.value = metadata.language || 'English';
    settingsApiKey.value = localStorage.getItem(`nvidia_api_key_${user.id}`) || metadata.nvidia_api_key || '';
    
    settingsModal.classList.add('active');
  };

  if (settingsBtn) settingsBtn.addEventListener('click', openSettings);
  if (headerSettingsBtn) headerSettingsBtn.addEventListener('click', openSettings);

  if (settingsCloseBtn) {
    settingsCloseBtn.addEventListener('click', () => {
      settingsModal.classList.remove('active');
    });
  }

  if (btnSettingsGuideToggle) {
    btnSettingsGuideToggle.addEventListener('click', (e) => {
      e.preventDefault();
      const isHidden = settingsGuideContent.classList.toggle('hidden');
      const arrow = btnSettingsGuideToggle.querySelector('.guide-toggle-arrow');
      if (arrow) arrow.textContent = isHidden ? '▼' : '▲';
    });
  }

  if (settingsSaveBtn) {
    settingsSaveBtn.addEventListener('click', async () => {
      const name = settingsName.value.trim();
      const language = settingsLang.value;
      const apiKey = settingsApiKey.value.trim();

      if (!name) {
        showToast('Please enter your name', 'warning');
        return;
      }
      if (!apiKey) {
        showToast('NVIDIA API Key is required', 'warning');
        return;
      }
      if (!apiKey.startsWith('nvapi-')) {
        showToast('Invalid key format. NVIDIA keys start with "nvapi-"', 'warning');
        return;
      }

      settingsSaveBtn.disabled = true;
      settingsSaveBtn.textContent = 'Saving...';

      try {
        const session = await Supabase.getSession();
        await Supabase.updateUserMetadata({
          name,
          language,
          nvidia_api_key: apiKey,
          onboarded: true
        });

        // Cache key in local storage
        localStorage.setItem(`nvidia_api_key_${session.user.id}`, apiKey);

        settingsModal.classList.remove('active');
        showToast('Settings saved successfully', 'success');
      } catch (err) {
        showToast(`Failed to save settings: ${err.message}`, 'error');
      } finally {
        settingsSaveBtn.disabled = false;
        settingsSaveBtn.textContent = 'Save Changes ✓';
      }
    });
  }

  // Bind Auth Listeners
  signupBtn.addEventListener('click', handleSignUp);
  authForm.addEventListener('submit', handleLogin);
  logoutBtn.addEventListener('click', handleLogout);

  // Supabase Auth State Change Listener
  Supabase.onAuthStateChange(handleAuthStateChange);

  // Bind Vault Listeners
  initVaultListeners();

  // Initialize Dev Mode Listeners
  initDevMode();

  // ── Image Upload Listeners ──
  if (imageAttachBtn && imageFileInput) {
    imageAttachBtn.addEventListener('click', () => imageFileInput.click());
    imageFileInput.addEventListener('change', handleImageSelect);
  }

  // ── Image Lightbox close ──
  if (imageLightbox) {
    imageLightbox.addEventListener('click', () => imageLightbox.classList.remove('active'));
  }

  // ── Mobile keyboard-aware input bar ──
  setupMobileKeyboardHandler();
}

/**
 * Use visualViewport API to push the input bar above the virtual keyboard on mobile.
 */
function setupMobileKeyboardHandler() {
  const inputBar = document.querySelector('.input-bar');
  if (!inputBar || !window.visualViewport) return;

  const isMobile = () => window.innerWidth <= 768;

  function onViewportResize() {
    if (!isMobile()) {
      inputBar.style.bottom = '';
      return;
    }

    // The keyboard height is the difference between window height and viewport height
    const keyboardHeight = window.innerHeight - window.visualViewport.height;

    if (keyboardHeight > 50) {
      // Keyboard is open — lift the input bar above it
      inputBar.style.bottom = keyboardHeight + 'px';
    } else {
      // Keyboard is closed
      inputBar.style.bottom = '0px';
    }

    // Auto-scroll chat to bottom so user sees latest messages
    scrollToBottom();
  }

  window.visualViewport.addEventListener('resize', onViewportResize);
  window.visualViewport.addEventListener('scroll', onViewportResize);
}

/* ═══════════════════════════════════════════
   IMAGE UPLOAD HANDLERS
   ═══════════════════════════════════════════ */

function compressImage(file, maxWidth = 1024, maxHeight = 1024, quality = 0.75) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        // Convert to highly optimized JPEG Base64
        const compressedBase64 = canvas.toDataURL('image/jpeg', quality);
        resolve(compressedBase64);
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function handleImageSelect(e) {
  const files = Array.from(e.target.files);
  if (!files.length) return;

  files.forEach(async (file) => {
    if (!file.type.startsWith('image/')) return;
    
    try {
      const compressedDataUrl = await compressImage(file);
      pendingImages.push(compressedDataUrl);
      updateImagePreview();
      sendBtn.disabled = false;
    } catch (err) {
      console.error('[Image Compression Failed]:', err);
      showToast('Failed to process image file', 'error');
    }
  });

  // Reset file input so user can re-select same file
  imageFileInput.value = '';
}

function updateImagePreview() {
  if (!imagePreviewStrip) return;

  if (pendingImages.length === 0) {
    imagePreviewStrip.classList.remove('has-images');
    imagePreviewStrip.innerHTML = '';
    return;
  }

  imagePreviewStrip.classList.add('has-images');
  imagePreviewStrip.innerHTML = pendingImages.map((src, i) => `
    <div class="image-preview-item" data-index="${i}">
      <img src="${src}" alt="Preview">
      <button class="image-preview-remove" data-remove="${i}" title="Remove">&times;</button>
    </div>
  `).join('');

  // Bind remove buttons
  imagePreviewStrip.querySelectorAll('.image-preview-remove').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.remove);
      pendingImages.splice(idx, 1);
      updateImagePreview();
      if (!pendingImages.length && !messageInput.value.trim()) {
        sendBtn.disabled = true;
      }
    });
  });
}

function clearPendingImages() {
  pendingImages = [];
  updateImagePreview();
}

/* ═══════════════════════════════════════════
   AUTHENTICATION LIFE CYCLE
   ═══════════════════════════════════════════ */

let isAppBooted = false;

async function handleAuthStateChange(event, session) {
  if (session && session.user) {
    // User is logged in
    Storage.setUserId(session.user.id);
    userEmailDisplay.textContent = session.user.email;

    // Cache key in local storage from user metadata
    const metadata = session.user.user_metadata || {};
    if (metadata.nvidia_api_key) {
      localStorage.setItem(`nvidia_api_key_${session.user.id}`, metadata.nvidia_api_key);
    }

    // Only boot the initial view if transitioning from the Auth Screen or first load.
    // Explicitly check the event type (SIGNED_IN or INITIAL_SESSION) and ensure we boot only once.
    if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && !isAppBooted) {
      isAppBooted = true;
      authScreen.style.display = 'none';

      const landingPage = document.getElementById('landingPage');
      if (landingPage) {
        landingPage.style.display = 'none';
      }

      // Immediately boot current view to show cached local chats instantly!
      switchMode('council');

      // Check user onboarding state
      await checkUserOnboarding(session);

      // Silent background sync
      (async () => {
        try {
          await Storage.syncFromSupabase();
          // Refresh UI elements with synced cloud data
          const activeMode = document.querySelector('.mode-btn.active')?.dataset.mode || 'council';
          if (activeMode !== 'vault' && activeMode !== 'dev') {
            updateChatList(activeMode);
            // If the current chat in view is the active one, reload messages to match synced cloud data
            const currentChatId = Storage.getCurrentChatId(activeMode);
            if (currentChatId) {
              loadChat(activeMode, currentChatId);
            }
          }
          await reloadVaultItems();
          await loadDevReports();
        } catch (err) {
          console.warn('Silent sync failed:', err.message);
        }
      })();
    }
  } else {
    // Definitive sign out resets the boot state and returns to login
    if (event === 'SIGNED_OUT' || !session) {
      isAppBooted = false;
      Storage.setUserId('anonymous');
      authScreen.style.display = 'flex';
    }
  }
}

async function checkUserOnboarding(session) {
  if (!session || !session.user) return;
  const metadata = session.user.user_metadata || {};
  const localOnboarded = localStorage.getItem(`onboarded_local_${session.user.id}`) === 'true';
  if (!metadata.onboarded && !localOnboarded) {
    await showUserOnboardingModal(session);
  }
}

function showUserOnboardingModal(session) {
  return new Promise((resolve) => {
    const modal = document.getElementById('userOnboarding');
    const onboardName = document.getElementById('onboardName');
    const onboardLang = document.getElementById('onboardLang');
    const onboardApiKey = document.getElementById('onboardApiKey');
    const onboardBack = document.getElementById('onboardBack');
    const onboardNext = document.getElementById('onboardNext');
    const btnGuideToggle = document.getElementById('btnGuideToggle');
    const guideContent = document.getElementById('guideContent');
    const arrow = btnGuideToggle.querySelector('.guide-toggle-arrow');
    const steps = modal.querySelectorAll('.onboarding-step');

    let currentStep = 1;

    // Toggle guide visibility
    btnGuideToggle.onclick = (e) => {
      e.preventDefault();
      const isHidden = guideContent.classList.toggle('hidden');
      arrow.textContent = isHidden ? '▼' : '▲';
    };

    function showStep(step) {
      steps.forEach(s => s.classList.remove('active'));
      const target = modal.querySelector(`.onboarding-step[data-step="${step}"]`);
      if (target) target.classList.add('active');

      onboardBack.style.display = step > 1 ? '' : 'none';
      onboardNext.textContent = step === 2 ? 'Finish Setup ✓' : 'Next →';
    }

    onboardBack.onclick = () => {
      if (currentStep > 1) {
        currentStep--;
        showStep(currentStep);
      }
    };

    onboardNext.onclick = async () => {
      if (currentStep === 1) {
        const name = onboardName.value.trim();
        if (!name) {
          showToast('Please enter your name', 'warning');
          return;
        }
        currentStep = 2;
        showStep(2);
      } else if (currentStep === 2) {
        const apiKey = onboardApiKey.value.trim();
        const name = onboardName.value.trim();
        const language = onboardLang.value;

        if (!apiKey) {
          showToast('NVIDIA API Key is required', 'warning');
          return;
        }
        if (!apiKey.startsWith('nvapi-')) {
          showToast('Invalid key format. NVIDIA keys start with "nvapi-"', 'warning');
          return;
        }

        console.log('[Onboarding]: Finish Setup clicked, input data:', { name, language, keyLength: apiKey.length });
        onboardNext.disabled = true;
        onboardNext.textContent = 'Saving profile...';

        try {
          console.log('[Onboarding]: Calling Supabase.updateUserMetadata...');
          await Supabase.updateUserMetadata({
            name,
            language,
            nvidia_api_key: apiKey,
            onboarded: true
          });
          console.log('[Onboarding]: Supabase update returned successfully.');

          // Save local backup key
          localStorage.setItem(`nvidia_api_key_${session.user.id}`, apiKey);

          modal.classList.remove('active');
          showToast(`Welcome ${name}! Setup complete.`, 'success');
          resolve();
        } catch (err) {
          console.error('[Onboarding]: Error occurred during profile save, using offline local fallback:', err);
          
          // Save backup locally so user can continue immediately
          localStorage.setItem(`nvidia_api_key_${session.user.id}`, apiKey);
          localStorage.setItem(`onboarded_local_${session.user.id}`, 'true');
          
          modal.classList.remove('active');
          showToast(`Welcome ${name}! Setup complete (Local Fallback).`, 'success');
          resolve();
        }
      }
    };

    showStep(1);
    modal.classList.add('active');
  });
}

function formatAuthError(err) {
  if (!err) return 'Authentication failed.';
  if (typeof err === 'string') return err;
  
  let msg = err.message;
  
  // If message is an object, stringify it
  if (typeof msg === 'object' && msg !== null) {
    try {
      msg = JSON.stringify(msg);
    } catch {
      msg = '';
    }
  }
  
  if (!msg || msg === '{}' || msg.trim() === '') {
    if (err.status === 500 || err.status_code === 500) {
      return 'Supabase Server Error (500). Please check if custom SMTP settings are incorrect in your Supabase Dashboard.';
    }
    return 'Authentication server error. Check your connection or settings.';
  }
  
  // User-friendly messages
  if (msg.includes('confirm your email') || msg.includes('Email not confirmed')) {
    return 'Email verification is required. Please check your inbox for the confirmation link.';
  }
  if (msg.includes('Error sending confirmation mail') || msg.includes('confirmation mail')) {
    return 'Error sending verification email. Check your custom SMTP/Email settings in the Supabase Dashboard.';
  }
  if (msg.includes('Invalid login credentials') || msg.includes('invalid_credentials')) {
    return 'Invalid email address or password. Please try again.';
  }
  
  return msg;
}

async function handleLogin(e) {
  e.preventDefault();
  const email = authEmail.value.trim();
  const password = authPassword.value;

  authErrorMsg.textContent = '';
  authInfoMsg.textContent = '';
  loginBtn.disabled = true;
  loginBtn.textContent = 'Logging in...';

  try {
    await Supabase.signIn(email, password);
  } catch (err) {
    authErrorMsg.textContent = formatAuthError(err);
    loginBtn.disabled = false;
    loginBtn.textContent = 'Login';
  }
}

async function handleSignUp(e) {
  e.preventDefault();
  const email = authEmail.value.trim();
  const password = authPassword.value;

  if (!email || !password) {
    authErrorMsg.textContent = 'Please fill in both email and password.';
    return;
  }

  authErrorMsg.textContent = '';
  authInfoMsg.textContent = '';
  signupBtn.disabled = true;
  signupBtn.textContent = 'Signing up...';

  try {
    await Supabase.signUp(email, password);
    authInfoMsg.textContent = 'Sign up successful! Please check your email for a verification link (Also check your spam folder).';
  } catch (err) {
    authErrorMsg.textContent = formatAuthError(err);
  } finally {
    signupBtn.disabled = false;
    signupBtn.textContent = 'Sign Up';
  }
}

async function handleLogout() {
  try {
    await Supabase.signOut();
    Storage.setUserId('anonymous');
    window.location.reload();
  } catch (err) {
    showToast('Logout failed', 'error');
  }
}

/* ═══════════════════════════════════════════
   MODE MANAGEMENT
   ═══════════════════════════════════════════ */

function handleModeChange(mode) {
  if (isTwinActive()) {
    deactivateTwin();
  }
  switchMode(mode);
}

function switchMode(mode) {
  currentMode = mode;
  const websView = document.getElementById('websView');

  // Toggle layout panels
  if (mode === 'vault') {
    chatView.style.display = 'none';
    devModeView.style.display = 'none';
    vaultView.style.display = 'flex';
    styleProfileBtn.style.display = 'none';
    twinToggleBar.classList.add('hidden');
    appLayout.className = 'app-layout mode-vault';
  } else if (mode === 'dev') {
    chatView.style.display = 'none';
    vaultView.style.display = 'none';
    devModeView.style.display = 'flex';
    styleProfileBtn.style.display = 'none';
    twinToggleBar.classList.add('hidden');
    appLayout.className = 'app-layout mode-dev';
    loadDevReports();
  } else {
    vaultView.style.display = 'none';
    devModeView.style.display = 'none';
    chatView.style.display = 'flex';
    
    // Update layout class
    appLayout.className = 'app-layout';
    if (mode === 'clone') appLayout.classList.add('mode-clone');

    // Update header
    updateModeHeader(mode);

    // Show/hide mode-specific UI
    twinToggleBar.classList.toggle('hidden', mode !== 'council');
    styleProfileBtn.style.display = mode === 'clone' ? '' : 'none';

    // Load or create chat for this mode
    if (isInitialLoad) {
      isInitialLoad = false;
      createAndLoadNewChat(mode);
    } else {
      const existingChatId = Storage.getCurrentChatId(mode);
      const chatList = Storage.getChatList(mode);

      if (existingChatId && chatList.find(c => c.id === existingChatId)) {
        loadChat(mode, existingChatId);
      } else if (chatList.length > 0) {
        loadChat(mode, chatList[0].id);
      } else {
        createAndLoadNewChat(mode);
      }
    }
  }

  // Update sidebar
  setActiveMode(mode);
}

function updateModeHeader(mode) {
  const configs = {
    council: { title: 'The Council', subtitle: 'Unity With AI.', icon: Icons.council },
    clone:   { title: 'AI Clone',    subtitle: 'It thinks how you think.', icon: Icons.clone },
  };
  const config = configs[mode] || configs.council;

  if (modeTitle) modeTitle.textContent = config.title;
  if (modeSubtitle) modeSubtitle.textContent = config.subtitle;

  // Update header left icon
  const iconEl = document.querySelector('.mode-header-icon');
  if (iconEl) iconEl.innerHTML = config.icon;

  // Badges
  if (modeBadges) {
    modeBadges.innerHTML = '';
    if (mode === 'clone' && Storage.isCloneOnboarded()) {
      modeBadges.innerHTML = '<span class="badge badge-cyan">✦ Clone Active</span>';
    }
  }
}

/* ═══════════════════════════════════════════
   CHAT MANAGEMENT
   ═══════════════════════════════════════════ */

function handleChatSelect(mode, chatId) {
  loadChat(mode, chatId);
}

function handleNewChat(mode) {
  const targetMode = mode || currentMode;
  createAndLoadNewChat(targetMode);
}

function createAndLoadNewChat(mode) {
  const chat = Storage.createChat(mode);
  loadChat(mode, chat.id);
}

function loadChat(mode, chatId) {
  currentChatId = chatId;
  Storage.setCurrentChatId(mode, chatId);
  chatMessages = Storage.getMessages(mode, chatId);

  // Clear chat container
  chatContainer.innerHTML = '';

  if (chatMessages.length === 0) {
    showWelcomeScreen(mode);
  } else {
    renderHistory(mode, chatMessages);
    scrollToBottom(chatContainer);
  }

  updateChatList(mode);
}

function showWelcomeScreen(mode) {
  const configs = {
    council: { icon: Icons.council, title: 'The Council', sub: 'Ask anything. Four AI minds will debate and synthesize the best answer for you.' },
    clone:   { icon: Icons.clone, title: 'AI Clone',    sub: 'Your personal AI that adapts to your communication style. It thinks how you think.' },
  };
  const c = configs[mode] || configs.council;

  if (isTwinActive()) {
    chatContainer.appendChild(createWelcomeScreen(Icons.twin, 'AI Twin', 'You, but smarter. Your second brain that knows you and challenges you.'));
  } else {
    chatContainer.appendChild(createWelcomeScreen(c.icon, c.title, c.sub));
  }
}

function renderHistory(mode, messages) {
  const effectiveMode = (mode === 'council' && isTwinActive()) ? 'twin' : mode;

  switch (effectiveMode) {
    case 'council': renderCouncilHistory(messages); break;
    case 'clone':   renderCloneHistory(messages); break;
    case 'twin':    renderTwinHistory(messages); break;
    default:        renderCouncilHistory(messages);
  }
}

async function generateTopicTitle(messageText) {
  try {
    const title = await streamChat(MODELS.SYNTHESIZER, [
      {
        role: 'system',
        content: 'Generate a short, concise, professional topic name (3-5 words maximum) for a chat conversation based on the user prompt. Do not use quotes, punctuation, or extra words. Output only the title.'
      },
      { role: 'user', content: messageText }
    ]);
    if (title) return title.trim().replace(/^["']|["']$/g, '');
  } catch (e) {
    console.warn('Failed to generate topic title:', e);
  }
  return messageText.slice(0, 50) + (messageText.length > 50 ? '…' : '');
}

async function triggerTopicNaming(mode, chatId, messageText) {
  const summarizedTitle = await generateTopicTitle(messageText);
  if (summarizedTitle) {
    Storage.renameChat(mode, chatId, summarizedTitle);
    updateChatList(mode);
  }
}

/* ═══════════════════════════════════════════
   SEND MESSAGE
   ═══════════════════════════════════════════ */

function showSearchStatusIndicator(query) {
  const container = document.getElementById('chatMessages');
  if (!container) return;
  const div = document.createElement('div');
  div.className = 'search-status-indicator';
  div.id = 'searchStatusIndicator';
  div.innerHTML = `
    <div class="search-status-badge">
      <svg class="search-status-icon-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="11" cy="11" r="8"/>
        <line x1="21" y1="21" x2="16.65" y2="16.65"/>
      </svg>
      Searching the web for "${escapeHtml(query)}"...
    </div>
  `;
  container.appendChild(div);
  scrollToBottom(container);
}

function hideSearchStatusIndicator() {
  const div = document.getElementById('searchStatusIndicator');
  if (div) div.remove();
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function handleSend() {
  const text = messageInput.value.trim();
  const images = [...pendingImages]; // snapshot before clearing

  if (!text && !images.length) return;
  if (isCouncilProcessing() || isCloneProcessing() || isTwinProcessing()) return;

  const isFirstMessage = (chatMessages.length === 0);

  // Clear input and images
  messageInput.value = '';
  autoResizeTextarea(messageInput);
  sendBtn.disabled = true;
  clearPendingImages();

  // Remove welcome screen
  const welcome = chatContainer.querySelector('.welcome-screen');
  if (welcome) welcome.remove();

  // ── Web Search Interceptor ──
  let searchContext = null;
  let searchResults = [];

  if (isWebSearchEnabled && text && currentMode !== 'clone') {
    try {
      showSearchStatusIndicator(text);
      const searchRes = await fetch(`/api/search?q=${encodeURIComponent(text)}`);
      if (searchRes.ok) {
        searchResults = await searchRes.json();
        if (searchResults && searchResults.length > 0) {
          searchContext = searchResults.map((r, i) => `[Source ${i+1}]: ${r.title}\nURL: ${r.url}\nInformation: ${r.snippet}`).join('\n---\n');
        }
      }
    } catch (e) {
      console.warn('Web search failed:', e);
    } finally {
      hideSearchStatusIndicator();
    }
  }

  try {
    if (currentMode === 'clone') {
      if (!Storage.isCloneOnboarded()) {
        await showCloneOnboarding();
        updateModeHeader('clone');
      }
      await runClone(text, chatMessages, currentChatId, images);
    } else if (currentMode === 'council' && isTwinActive()) {
      await runTwin(text, chatMessages, currentChatId, images, searchContext, searchResults);
    } else {
      await runCouncil(text, chatMessages, currentChatId, images, searchContext, searchResults);
    }
  } catch (err) {
    showToast('Failed to send message', 'error');
    console.error('Send error:', err);
  }

  updateChatList(currentMode);

  if (isFirstMessage && text) {
    triggerTopicNaming(currentMode, currentChatId, text);
  }
}

/* ═══════════════════════════════════════════
   TWIN TOGGLE
   ═══════════════════════════════════════════ */

async function handleTwinToggle() {
  const isChecked = twinToggleCheckbox.checked;

  if (!isChecked) {
    deactivateTwin();
    loadChat('council', currentChatId);
  } else {
    if (!Storage.isTwinOnboarded()) {
      try {
        await showTwinOnboarding();
      } catch {
        twinToggleCheckbox.checked = false;
        return;
      }
    }
    activateTwin();
  }
}

function activateTwin() {
  setTwinActive(true);
  if (twinToggleCheckbox) twinToggleCheckbox.checked = true;
  if (twinActiveBadge) twinActiveBadge.style.display = '';
  appLayout.classList.add('mode-twin');

  modeTitle.textContent = 'AI Twin';
  modeSubtitle.textContent = 'You, but smarter.';
  modeBadges.innerHTML = '<span class="badge badge-purple">✦ Twin Active</span>';

  // If the current chat has messages, keep it and just re-render.
  // Otherwise, if it is a fresh chat, send the greeting.
  if (chatMessages.length === 0) {
    createAndLoadNewChat('council');
    chatContainer.innerHTML = '';
    sendTwinGreeting(chatMessages, currentChatId);
  } else {
    loadChat('council', currentChatId);
  }
}

function deactivateTwin() {
  setTwinActive(false);
  if (twinToggleCheckbox) twinToggleCheckbox.checked = false;
  if (twinActiveBadge) twinActiveBadge.style.display = 'none';
  appLayout.classList.remove('mode-twin');
  updateModeHeader('council');
}

/* ═══════════════════════════════════════════
   KNOWLEDGE VAULT OPERATIONS
   ═══════════════════════════════════════════ */

function initVaultListeners() {
  // Add PDF
  vaultAddPdfBtn.addEventListener('click', () => vaultPdfInput.click());
  vaultPdfInput.addEventListener('change', handlePdfUpload);

  // Add URL
  vaultAddUrlBtn.addEventListener('click', () => {
    hideAllVaultForms();
    vaultFormContainer.style.display = 'block';
    vaultUrlForm.style.display = 'flex';
  });
  vaultConfirmUrlBtn.addEventListener('click', handleUrlExtraction);
  vaultCancelUrlBtn.addEventListener('click', hideAllVaultForms);

  // Add Note
  vaultAddNoteBtn.addEventListener('click', () => {
    hideAllVaultForms();
    vaultFormContainer.style.display = 'block';
    vaultNoteForm.style.display = 'flex';
  });
  vaultConfirmNoteBtn.addEventListener('click', handleNoteSave);
  vaultCancelNoteBtn.addEventListener('click', hideAllVaultForms);

  // Vault Chat Input Sizing
  vaultMessageInput.addEventListener('input', () => {
    autoResizeTextarea(vaultMessageInput);
    vaultSendBtn.disabled = !vaultMessageInput.value.trim();
  });

  vaultMessageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleVaultChatSend();
    }
  });

  vaultSendBtn.addEventListener('click', handleVaultChatSend);
}

function hideAllVaultForms() {
  vaultFormContainer.style.display = 'none';
  vaultUrlForm.style.display = 'none';
  vaultNoteForm.style.display = 'none';
  vaultUrlInput.value = '';
  vaultNoteInput.value = '';
}

function logVaultStatus(msg, type = 'info') {
  vaultStatusLog.textContent = msg;
  vaultStatusLog.className = `vault-status-log ${type}`;
}

async function reloadVaultItems() {
  try {
    const items = await Supabase.fetchVault();
    Storage.setVaultItems(items);

    // Update count display
    vaultCount.textContent = items.length;

    // Update status badge
    if (items.length > 0) {
      vaultStatusBadge.className = 'vault-status-badge active';
      vaultStatusBadge.textContent = `Vault Active — ${items.length} item${items.length > 1 ? 's' : ''}`;
    } else {
      vaultStatusBadge.className = 'vault-status-badge empty';
      vaultStatusBadge.textContent = 'Vault Empty';
    }

    // Render items list
    if (items.length === 0) {
      vaultItemsList.innerHTML = `<div style="padding: 12px; text-align: center; color: var(--text-dim); font-size: 12.5px;">Vault is empty.</div>`;
      return;
    }

    const typeIcons = { pdf: getIcon('pdf'), url: getIcon('link'), note: getIcon('note') };

    vaultItemsList.innerHTML = items.map(item => `
      <div class="vault-item-card" data-item-id="${item.id}">
        <div class="vault-item-info">
          <span class="vault-item-icon">${typeIcons[item.type] || getIcon('pdf')}</span>
          <span class="vault-item-name" title="${item.name}">${item.name}</span>
        </div>
        <span class="vault-item-del-btn" data-del-id="${item.id}" title="Remove item">${getIcon('close')}</span>
      </div>
    `).join('');

    // Bind delete clicks
    vaultItemsList.querySelectorAll('.vault-item-del-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const itemId = btn.dataset.delId;
        logVaultStatus('Deleting item...', 'info');
        try {
          await Supabase.deleteVaultItem(itemId);
          logVaultStatus('Item deleted.', 'success');
          await reloadVaultItems();
        } catch (err) {
          logVaultStatus(`Delete failed: ${err.message}`, 'error');
        }
      });
    });
  } catch (err) {
    console.error('Failed to load vault items:', err.message);
  }
}

// ── Upload 1: PDF File ──
async function handlePdfUpload(e) {
  const file = e.target.files[0];
  if (!file) return;

  const userId = Storage.getUserId();
  if (userId === 'anonymous') {
    logVaultStatus('Please login first to save items.', 'error');
    showToast('Login required to save to vault', 'error');
    return;
  }

  const items = Storage.getVaultItems();
  if (items.length >= 10) {
    logVaultStatus('Vault full! Maximum 10 items allowed.', 'error');
    showToast('Vault full (max 10 items)', 'error');
    return;
  }

  logVaultStatus(`Reading ${file.name}...`, 'info');

  try {
    const text = await extractTextFromPdf(file);
    if (!text || !text.trim()) {
      throw new Error('No text found. If this is a scanned image PDF, please use a digital text PDF instead.');
    }

    logVaultStatus('Saving to vault...', 'info');
    console.log('[Vault] Saving PDF, userId:', userId);
    await Supabase.addVaultItem(userId, 'pdf', file.name, text);
    logVaultStatus(`${file.name} — extracted successfully`, 'success');
    await reloadVaultItems();
  } catch (err) {
    console.error('[Vault] PDF save failed:', err);
    logVaultStatus(`Could not extract: ${err.message}`, 'error');
    showToast(`Vault save failed: ${err.message}`, 'error');
  }

  // Clear input
  vaultPdfInput.value = '';
}

async function extractTextFromPdf(file) {
  const arrayBuffer = await file.arrayBuffer();
  // PDFJS is loaded in window
  const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let text = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    if (content && content.items) {
      const pageText = content.items
        .map(item => item.str || '')
        .join(' ')
        .replace(/\s+/g, ' ');
      text += pageText + '\n';
    }
  }
  return text;
}

// ── Upload 2: URL Link ──
async function handleUrlExtraction() {
  const url = vaultUrlInput.value.trim();
  if (!url) return;

  const userId = Storage.getUserId();
  if (userId === 'anonymous') {
    logVaultStatus('Please login first to save items.', 'error');
    showToast('Login required to save to vault', 'error');
    return;
  }

  const items = Storage.getVaultItems();
  if (items.length >= 10) {
    logVaultStatus('Vault full! Maximum 10 items allowed.', 'error');
    return;
  }

  logVaultStatus(`Extracting ${url}...`, 'info');
  hideAllVaultForms();

  try {
    const res = await fetch('/api/extract-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      throw new Error(errJson.error || `Server status ${res.status}`);
    }

    const { text } = await res.json();
    if (!text || !text.trim()) {
      throw new Error('No readable text content extracted.');
    }

    // Domain name helper
    let domain = 'Website';
    try {
      domain = new URL(url).hostname;
    } catch {
      domain = url;
    }

    logVaultStatus('Saving URL contents...', 'info');
    console.log('[Vault] Saving URL, userId:', userId, 'domain:', domain);
    await Supabase.addVaultItem(userId, 'url', domain, text);
    logVaultStatus(`${domain} — extracted successfully`, 'success');
    vaultUrlInput.value = '';
    await reloadVaultItems();
  } catch (err) {
    console.error('[Vault] URL save failed:', err);
    logVaultStatus(`Could not extract: ${err.message}`, 'error');
    showToast(`Vault save failed: ${err.message}`, 'error');
  }
}

// ── Upload 3: Note/Text ──
async function handleNoteSave() {
  const note = vaultNoteInput.value.trim();
  if (!note) return;

  const userId = Storage.getUserId();
  console.log('[Vault] Saving note, userId:', userId);
  if (userId === 'anonymous') {
    logVaultStatus('Please login first to save items.', 'error');
    showToast('Login required to save to vault', 'error');
    return;
  }

  const items = Storage.getVaultItems();
  if (items.length >= 10) {
    logVaultStatus('Vault full! Maximum 10 items allowed.', 'error');
    return;
  }

    logVaultStatus('Saving note...', 'info');
    hideAllVaultForms();

    try {
      const name = note.slice(0, 30) + (note.length > 30 ? '...' : '');
      console.log('[Vault] Calling Supabase.addVaultItem with:', { userId, type: 'note', name });
      const result = await Supabase.addVaultItem(userId, 'note', name, note);
      console.log('[Vault] Save result:', result);
      logVaultStatus('Note saved successfully', 'success');
      vaultNoteInput.value = '';
      await reloadVaultItems();
    } catch (err) {
      console.error('[Vault] Save failed:', err);
      logVaultStatus(`Failed: ${err.message}`, 'error');
      showToast(`Vault save failed: ${err.message}`, 'error');
    }
}

// ── Vault Chat Handler ──
async function handleVaultChatSend() {
  const text = vaultMessageInput.value.trim();
  if (!text) return;

  vaultMessageInput.value = '';
  autoResizeTextarea(vaultMessageInput);
  vaultSendBtn.disabled = true;

  // Clear welcome screen if exists
  const welcome = vaultChatMessagesDiv.querySelector('.welcome-screen');
  if (welcome) welcome.remove();

  // Add User Message UI
  vaultChatMessagesDiv.appendChild(createUserMessage(text));
  scrollToBottom(vaultChatMessagesDiv);

  // Create Assistant Message
  const { element, contentEl } = createAssistantMessage();
  vaultChatMessagesDiv.appendChild(element);
  scrollToBottom(vaultChatMessagesDiv);

  const vaultContent = Storage.getVaultContextString();
  const finalPrompt = `User's Knowledge Vault:\n${vaultContent}\n\nUse this vault as context to answer the user's question directly. Reference items when helpful.\n\nAnswer the user's question: ${text}`;

  const messages = [
    { 
      role: 'system', 
      content: `You are the PLURAL Knowledge Vault Assistant, a premium, analytical AI running on the PLURAL platform.
Your purpose is to answer the user's questions utilizing their provided Knowledge Vault context.

FORMATTING RULES:
- Use structured, professional Markdown layout.
- Use # headlines for main categories, and ## subheadlines for sub-topics.
- Use bold highlights and lists to group points.
- Never write meta-talk or fluff like "Based on the vault context...". Start directly with the answer in a professional, Claude-like voice.` 
    },
    ...vaultChatMessages.slice(-10),
    { role: 'user', content: finalPrompt }
  ];

  try {
    const output = await streamChat(MODELS.SYNTHESIZER, messages, {
      onChunk: (delta, full) => {
        contentEl.textContent = full;
        scrollToBottom(vaultChatMessagesDiv);
      },
      onDone: (full) => {
        contentEl.classList.remove('streaming');
        contentEl.innerHTML = renderMarkdown(full);
        
        vaultChatMessages.push({ role: 'user', content: text });
        vaultChatMessages.push({ role: 'assistant', content: full });
      },
      onError: (err) => {
        contentEl.classList.remove('streaming');
        contentEl.innerHTML = `<p>Response failed: ${err.message}</p>`;
      }
    });
  } catch (err) {
    showToast('Vault response failed', 'error');
  }
}

/* ═══════════════════════════════════════════
   STYLE PROFILE DRAWER
   ═══════════════════════════════════════════ */

function openStyleDrawer() {
  populateStyleDrawer();
  drawer.classList.add('open');
  drawerOverlay.classList.add('open');
}

function closeStyleDrawer() {
  drawer.classList.remove('open');
  drawerOverlay.classList.remove('open');
}

/* ═══════════════════════════════════════════
   BOOT
   ═══════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', init);
